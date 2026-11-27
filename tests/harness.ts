import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { FailedTransactionMetadata, LiteSVM, TransactionMetadata } from 'litesvm';
import {
  appendTransactionMessageInstructions,
  createTransactionMessage,
  generateKeyPairSigner,
  lamports,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Address,
  type Instruction,
  type KeyPairSigner,
  type TransactionSigner,
} from '@solana/kit';
import {
  getCreateAssociatedTokenIdempotentInstruction,
  getMintEncoder,
  getMintToInstruction,
  getTokenDecoder,
} from '@solana-program/token';
import { getSetComputeUnitLimitInstruction } from './compute';
import { p256 } from '@noble/curves/nist.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { getWebAuthnPrefix, type SigningFn } from '@swig-wallet/lib';
import {
  associatedTokenAddress,
  CLAIM_PROGRAM,
  SWIG_PROGRAM,
  TOKEN_PROGRAM,
  USDC_DECIMALS,
  USDC_MINT,
} from '@tok/core';

const here = dirname(fileURLToPath(import.meta.url));
export const CLAIM_SO = join(here, '..', 'target', 'deploy', 'tok_claim.so');
export const SWIG_SO = join(here, 'fixtures', 'swig.so');
export const haveClaimSo = existsSync(CLAIM_SO);
export const haveSwigSo = existsSync(SWIG_SO);

export interface World {
  svm: LiteSVM;
  mintAuthority: KeyPairSigner;
  feePayer: KeyPairSigner;
}

export async function world(): Promise<World> {
  const svm = new LiteSVM().withPrecompiles();
  if (haveClaimSo) svm.addProgramFromFile(CLAIM_PROGRAM, CLAIM_SO);
  if (haveSwigSo) svm.addProgramFromFile(SWIG_PROGRAM, SWIG_SO);
  const mintAuthority = await generateKeyPairSigner();
  const feePayer = await generateKeyPairSigner();
  svm.airdrop(mintAuthority.address, lamports(10_000_000_000n));
  svm.airdrop(feePayer.address, lamports(10_000_000_000n));
  // The real devnet USDC address, with a test mint authority.
  const data = getMintEncoder().encode({
    mintAuthority: mintAuthority.address,
    supply: 0n,
    decimals: USDC_DECIMALS,
    isInitialized: true,
    freezeAuthority: null,
  });
  svm.setAccount({
    address: USDC_MINT,
    data: new Uint8Array(data),
    executable: false,
    lamports: lamports(svm.minimumBalanceForRentExemption(BigInt(data.length))),
    programAddress: TOKEN_PROGRAM,
    space: BigInt(data.length),
  });
  return { svm, mintAuthority, feePayer };
}

export type Result = TransactionMetadata | FailedTransactionMetadata;

export async function send(
  w: World,
  instructions: Instruction[],
  feePayer: TransactionSigner = w.feePayer,
  computeUnits?: number,
): Promise<Result> {
  w.svm.expireBlockhash();
  const ixs = computeUnits ? [getSetComputeUnitLimitInstruction(computeUnits), ...instructions] : instructions;
  const msg = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(feePayer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash({ blockhash: w.svm.latestBlockhash(), lastValidBlockHeight: 1_000_000n }, m),
    (m) => appendTransactionMessageInstructions(ixs, m),
  );
  const tx = await signTransactionMessageWithSigners(msg);
  return w.svm.sendTransaction(tx);
}

export function ok(r: Result): TransactionMetadata {
  if (r instanceof FailedTransactionMetadata) {
    throw new Error(`Transaction failed: ${String(r.err())}\n${r.meta().logs().join('\n')}`);
  }
  return r;
}

export function failed(r: Result): FailedTransactionMetadata {
  if (!(r instanceof FailedTransactionMetadata)) throw new Error('Expected the transaction to fail');
  return r;
}

export async function ata(owner: Address) {
  return associatedTokenAddress(owner, USDC_MINT, TOKEN_PROGRAM);
}

export async function fundUsdc(w: World, owner: Address, amount: bigint) {
  const tokenAccount = await ata(owner);
  ok(
    await send(w, [
      getCreateAssociatedTokenIdempotentInstruction({
        payer: w.feePayer,
        ata: tokenAccount,
        owner,
        mint: USDC_MINT,
      }),
      getMintToInstruction({ mint: USDC_MINT, token: tokenAccount, mintAuthority: w.mintAuthority, amount }),
    ]),
  );
  return tokenAccount;
}

export async function createAta(w: World, owner: Address) {
  const tokenAccount = await ata(owner);
  ok(
    await send(w, [
      getCreateAssociatedTokenIdempotentInstruction({ payer: w.feePayer, ata: tokenAccount, owner, mint: USDC_MINT }),
    ]),
  );
  return tokenAccount;
}

export function usdcBalance(w: World, tokenAccount: Address): bigint {
  const acc = w.svm.getAccount(tokenAccount);
  if (!acc.exists) return 0n;
  return getTokenDecoder().decode(acc.data).amount;
}

export function lamportsOf(w: World, a: Address): bigint {
  return w.svm.getBalance(a) ?? 0n;
}

export function exists(w: World, a: Address): boolean {
  return w.svm.getAccount(a).exists;
}

/** Move the chain clock forward by `seconds`. */
export function warp(w: World, seconds: bigint) {
  const c = w.svm.getClock();
  c.unixTimestamp = c.unixTimestamp + seconds;
  c.slot = c.slot + 1000n;
  w.svm.setClock(c);
}

/**
 * A software passkey: a P-256 key that answers exactly like a WebAuthn
 * authenticator (authenticatorData, clientDataJSON with the message as the
 * challenge, signature over authenticatorData || sha256(clientDataJSON)).
 */
export function softPasskey(origin = 'https://tok.test', rpId = 'tok.test') {
  const secret = p256.utils.randomSecretKey();
  const publicKey = p256.getPublicKey(secret, true); // 33-byte compressed
  let counter = 0;
  const signingFn: SigningFn = async (message: Uint8Array) => {
    counter += 1;
    const challenge = Buffer.from(message).toString('base64url');
    const clientDataJSON = new TextEncoder().encode(
      JSON.stringify({ type: 'webauthn.get', challenge, origin, crossOrigin: false }),
    );
    const authData = new Uint8Array(37);
    authData.set(sha256(new TextEncoder().encode(rpId)), 0);
    authData[32] = 0x05; // user present + user verified
    new DataView(authData.buffer).setUint32(33, counter, false);
    const signed = new Uint8Array(authData.length + 32);
    signed.set(authData, 0);
    signed.set(sha256(clientDataJSON), authData.length);
    const sig = p256.sign(signed, secret, { lowS: true, prehash: true, format: 'compact' });
    const prefix = await getWebAuthnPrefix(clientDataJSON, authData);
    return { signature: new Uint8Array(sig), prefix, message: signed };
  };
  return { publicKey, signingFn };
}

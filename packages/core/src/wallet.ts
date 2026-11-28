/**
 * Passkey wallets: a Swig smart wallet whose one authority is the person's
 * passkey (a P-256 key). Swig checks each passkey signature on chain with
 * the secp256r1 precompile. Tok writes no wallet program of its own.
 */
import type { Address, Instruction } from '@solana/kit';
import { sha256 } from '@noble/hashes/sha2.js';
import {
  Actions,
  createSecp256r1AuthorityInfo,
  findSwigPda,
  getCreateSwigInstruction,
  getSignInstructions,
  getSwigWalletAddress,
} from '@swig-wallet/kit';
import { findSwigSystemAddressPdaRaw, Swig, type SigningFn } from '@swig-wallet/lib';

export type { SigningFn };

/** Swig asks for this much compute when a P-256 owner signs. */
export const PASSKEY_COMPUTE_UNITS = 600_000;

/** One wallet per passkey: its Swig id comes from the passkey's public key. */
export function swigIdFor(passkeyPublicKey: Uint8Array): Uint8Array {
  const tag = new TextEncoder().encode('tok-wallet-v1');
  const buf = new Uint8Array(tag.length + passkeyPublicKey.length);
  buf.set(tag, 0);
  buf.set(passkeyPublicKey, tag.length);
  return sha256(buf);
}

export async function swigAccountFor(passkeyPublicKey: Uint8Array): Promise<Address> {
  return (await findSwigPda(swigIdFor(passkeyPublicKey))) as unknown as Address;
}

/** Instruction that creates the wallet. The makers' fee payer pays its rent. */
export async function createWalletInstruction(
  passkeyPublicKey: Uint8Array,
  payer: Address,
): Promise<Instruction> {
  const ix = await getCreateSwigInstruction({
    payer: payer as never,
    id: swigIdFor(passkeyPublicKey),
    actions: Actions.set().all().get(),
    authorityInfo: createSecp256r1AuthorityInfo(passkeyPublicKey),
  });
  return ix as unknown as Instruction;
}

export function swigFromAccount(swigAddress: Address, data: Uint8Array): Swig {
  return Swig.fromRawAccountData(swigAddress as never, data);
}

/** The address that holds the wallet's money and signs for it. */
export async function walletAddress(swig: Swig): Promise<Address> {
  return (await getSwigWalletAddress(swig)) as unknown as Address;
}

/** The wallet address, known before the wallet exists (Swig's system address). */
export async function walletAddressFor(swigAccount: Address): Promise<Address> {
  const [pda] = await findSwigSystemAddressPdaRaw(swigAccount as never);
  return pda.toBase58() as Address;
}

/**
 * Wrap instructions so the wallet signs them with the passkey. The passkey
 * signs inside `signingFn` (a WebAuthn prompt on the page).
 */
export async function passkeySign(
  swig: Swig,
  passkeyPublicKey: Uint8Array,
  instructions: Instruction[],
  opts: { payer: Address; currentSlot: bigint; signingFn: SigningFn; odometer?: number },
): Promise<Instruction[]> {
  const role = swig.findRolesByAuthoritySigner(passkeyPublicKey)[0];
  if (!role) throw new Error('This passkey does not own this wallet');
  const out = await getSignInstructions(swig, role.id, instructions as never, false, {
    payer: opts.payer as never,
    currentSlot: opts.currentSlot,
    signingFn: opts.signingFn,
    ...(opts.odometer ? { odometer: opts.odometer } : {}),
  });
  return out as unknown as Instruction[];
}

/**
 * Swig's raw WebAuthn form (authentication kind 2): the authenticator data
 * and the exact clientDataJSON the browser signed. Swig checks the challenge
 * and type inside it and hashes it as is, so it works whatever extra keys a
 * browser adds (Chrome sometimes adds a random one on purpose; Android apps
 * add androidPackageName). The rebuilt form (kind 1) fails on those.
 */
export function rawWebAuthnPrefix(authenticatorData: Uint8Array, clientDataJSON: Uint8Array): Uint8Array {
  const out = new Uint8Array(2 + 2 + authenticatorData.length + 2 + clientDataJSON.length);
  const v = new DataView(out.buffer);
  v.setUint16(0, 2, true);
  v.setUint16(2, authenticatorData.length, true);
  out.set(authenticatorData, 4);
  v.setUint16(4 + authenticatorData.length, clientDataJSON.length, true);
  out.set(clientDataJSON, 6 + authenticatorData.length);
  return out;
}

/** The counter the next passkey signature must carry (the role's counter + 1). */
export function nextOdometer(swig: Swig, passkeyPublicKey: Uint8Array): number {
  const role = swig.findRolesByAuthoritySigner(passkeyPublicKey)[0] as unknown as { odometer?: () => number } | undefined;
  return role?.odometer ? role.odometer() : 1;
}

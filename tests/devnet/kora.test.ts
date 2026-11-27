// Part 3 on devnet: through Tok's live server and Kora, a user with 0 SOL
// gets a passkey wallet; the makers' fee payer pays the fee and the rent.
// Runs when TOK_DEVNET=1 (CI job "devnet").
import { describe, expect, it } from 'vitest';
import {
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createSolanaRpc,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Instruction,
} from '@solana/kit';
import { createWalletInstruction, swigAccountFor, walletAddressFor } from '@tok/core';
import { softPasskey } from '../passkey';

const SERVER = process.env.TOK_SERVER ?? 'https://tok-server.onrender.com';
const rpc = createSolanaRpc(process.env.DEVNET_RPC ?? 'https://api.devnet.solana.com');
const on = process.env.TOK_DEVNET === '1';

async function feePayer(): Promise<Address> {
  for (let i = 0; i < 6; i++) {
    const r = await fetch(`${SERVER}/config`).catch(() => null);
    if (r?.ok) return ((await r.json()) as { feePayer: Address }).feePayer;
    await new Promise((s) => setTimeout(s, 10_000)); // free host waking up
  }
  throw new Error('server did not answer');
}

async function wire(payer: Address, ixs: Instruction[]) {
  const { value: bh } = await rpc.getLatestBlockhash({ commitment: 'confirmed' }).send();
  const msg = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(payer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(bh, m),
    (m) => appendTransactionMessageInstructions(ixs, m),
  );
  return getBase64EncodedWireTransaction(compileTransaction(msg));
}

async function relay(transaction: string) {
  const r = await fetch(`${SERVER}/relay`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ transaction }),
  });
  return { status: r.status, body: (await r.json()) as { signature?: string; error?: string } };
}

async function confirmed(sig: string) {
  for (let i = 0; i < 60; i++) {
    const s = (await rpc.getSignatureStatuses([sig as never]).send()).value[0];
    if (s?.err) throw new Error(JSON.stringify(s.err));
    if (s?.confirmationStatus === 'confirmed' || s?.confirmationStatus === 'finalized') return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('not confirmed');
}

describe.skipIf(!on)('fee payer through Kora on devnet (part 3)', () => {
  it('a user with 0 SOL gets a passkey wallet; the makers pay fee and rent', async () => {
    const payer = await feePayer();
    const key = softPasskey('https://drexthealpha.github.io', 'drexthealpha.github.io');
    const swig = await swigAccountFor(key.publicKey);
    const wallet = await walletAddressFor(swig);
    const before = (await rpc.getBalance(payer, { commitment: 'confirmed' }).send()).value;

    const r = await relay(await wire(payer, [await createWalletInstruction(key.publicKey, payer)]));
    expect(r.body.error).toBeUndefined();
    expect(r.status).toBe(200);
    await confirmed(r.body.signature!);

    const after = (await rpc.getBalance(payer, { commitment: 'confirmed' }).send()).value;
    const swigAcc = (await rpc.getAccountInfo(swig, { commitment: 'confirmed', encoding: 'base64' }).send()).value;
    expect(swigAcc).not.toBeNull();
    // The wallet address holds only its rent-exempt minimum, which the makers paid.
    const walletLamports = (await rpc.getBalance(wallet, { commitment: 'confirmed' }).send()).value;
    const minimum = await rpc.getMinimumBalanceForRentExemption(0n).send();
    expect(walletLamports).toBe(minimum);
    // The fee payer paid the fee and all rent: the Swig account and the wallet address.
    expect(before - after).toBeGreaterThan(swigAcc!.lamports + walletLamports);
    console.log(`devnet wallet ${swig} created, makers paid ${before - after} lamports, sig ${r.body.signature}`);
  }, 180_000);

  it('refuses a transaction that calls a program not on the allow list', async () => {
    const payer = await feePayer();
    const foreign: Instruction = { programAddress: address('BPFLoaderUpgradeab1e11111111111111111111111'), accounts: [], data: new Uint8Array([9]) };
    const r = await relay(await wire(payer, [foreign]));
    expect(r.status).toBe(403);
  }, 120_000);
});

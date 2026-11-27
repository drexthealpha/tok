// Part 3: the makers' server passes only allow-listed transactions to Kora.
import { describe, expect, it } from 'vitest';
import {
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createTransactionMessage,
  generateKeyPairSigner,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Blockhash,
  type Instruction,
} from '@solana/kit';
import { depositInstruction, TOKEN_PROGRAM, USDC_MINT } from '@tok/core';
import { createApp } from '../src/app';
import type { Kora } from '../src/kora';

function wire(feePayer: Address, ixs: Instruction[]) {
  const msg = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(feePayer, m),
    (m) =>
      setTransactionMessageLifetimeUsingBlockhash(
        { blockhash: '11111111111111111111111111111111' as Blockhash, lastValidBlockHeight: 1n },
        m,
      ),
    (m) => appendTransactionMessageInstructions(ixs, m),
  );
  return getBase64EncodedWireTransaction(compileTransaction(msg));
}

async function setup() {
  const payer = await generateKeyPairSigner();
  const sent: string[] = [];
  const kora: Kora = {
    payer: async () => payer.address,
    signAndSend: async (tx) => {
      sent.push(tx);
      return 'sig123';
    },
  };
  const app = createApp({ kora, origins: ['https://tok.test'] });
  const post = (transaction: string) =>
    app.request('/relay', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ transaction }),
    });
  return { payer, sent, post, app };
}

async function deposit(feePayer: Address) {
  const s = await generateKeyPairSigner();
  const k = await generateKeyPairSigner();
  return depositInstruction({
    rentPayer: feePayer,
    sender: s.address,
    mint: USDC_MINT,
    tokenProgram: TOKEN_PROGRAM,
    claimKey: k.address,
    amount: 1n,
  });
}

describe('relay (part 3)', () => {
  it('passes a deposit to Kora', async () => {
    const { payer, sent, post } = await setup();
    const r = await post(wire(payer.address, [await deposit(payer.address)]));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ signature: 'sig123' });
    expect(sent).toHaveLength(1);
  });

  it('refuses a transaction that calls a program not on the list', async () => {
    const { payer, sent, post } = await setup();
    const foreign: Instruction = {
      programAddress: address('BPFLoaderUpgradeab1e11111111111111111111111'),
      accounts: [],
      data: new Uint8Array([1]),
    };
    const r = await post(wire(payer.address, [await deposit(payer.address), foreign]));
    expect(r.status).toBe(403);
    expect(sent).toHaveLength(0);
  });

  it('refuses a transaction whose fee payer is someone else', async () => {
    const { sent, post } = await setup();
    const other = await generateKeyPairSigner();
    const r = await post(wire(other.address, [await deposit(other.address)]));
    expect(r.status).toBe(400);
    expect(sent).toHaveLength(0);
  });

  it('refuses junk', async () => {
    const { post } = await setup();
    expect((await post('not a transaction')).status).toBe(400);
    expect((await post('')).status).toBe(400);
  });

  it('serves the fee payer and the allow list', async () => {
    const { app, payer } = await setup();
    const j = (await (await app.request('/config')).json()) as { feePayer: string; allowedPrograms: string[] };
    expect(j.feePayer).toBe(payer.address);
    expect(j.allowedPrograms).toContain('2pZCUFv63kde6rkaAaZ3GGhUu4u4jzM8kBcyshZ9qauH');
  });
});

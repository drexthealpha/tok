// @vitest-environment happy-dom
// Part 4: the sender's page sends the return call when it opens after day 7.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSigner, getAddressEncoder, type Instruction } from '@solana/kit';
import { CLAIM_ACCOUNT_DISCRIMINATOR, CLAIM_ACCOUNT_SIZE, discriminator } from '@tok/core';

const sent: Instruction[][] = [];
let claimData: Uint8Array | null = null;

vi.mock('../src/chain', () => ({
  rpc: { getAccountInfo: () => ({ send: async () => ({ value: { owner: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' } }) }) },
  feePayer: async () => 'ByWbpvCjdgiUdamJ7t47toUMreqapqgPcBfjyTkEcNX2',
  accountData: async () => claimData,
  computeUnits: () => ({}),
  slot: async () => 1n,
  tokenBalance: async () => 0n,
  relay: async (ixs: Instruction[]) => {
    sent.push(ixs);
    return 'sig';
  },
}));

async function encodeClaim(sender: string, expiresAt: bigint) {
  const enc = getAddressEncoder();
  const d = new Uint8Array(CLAIM_ACCOUNT_SIZE);
  const v = new DataView(d.buffer);
  d.set(CLAIM_ACCOUNT_DISCRIMINATOR, 0);
  d.set(enc.encode(sender as never), 8); // sender
  d.set(enc.encode(sender as never), 40); // mint (unused here)
  v.setBigUint64(72, 1n, true);
  d.set(enc.encode(sender as never), 80); // claim key
  v.setBigInt64(112, expiresAt - 604800n, true);
  v.setBigInt64(120, expiresAt, true);
  d.set(enc.encode(sender as never), 128); // rent payer
  d[160] = 255;
  return d;
}

describe('return after day 7 (part 4)', () => {
  beforeEach(() => {
    sent.length = 0;
    localStorage.clear();
  });

  it('sends the return call for an expired open link, and nothing before day 7', async () => {
    const sender = await generateKeyPairSigner();
    const key = await generateKeyPairSigner();
    const now = Date.now();
    const link = { claimKey: key.address, amount: '1', link: 'x', at: now, sender: sender.address, state: 'open' };
    const { returnExpired } = await import('../src/tok');

    localStorage.setItem('tok.sent', JSON.stringify([{ ...link, expiresAt: now + 3600_000 }]));
    claimData = await encodeClaim(sender.address, BigInt(Math.floor(now / 1000) + 3600));
    expect(await returnExpired()).toHaveLength(0);
    expect(sent).toHaveLength(0);

    localStorage.setItem('tok.sent', JSON.stringify([{ ...link, expiresAt: now - 1000 }]));
    claimData = await encodeClaim(sender.address, BigInt(Math.floor(now / 1000) - 1));
    expect(await returnExpired()).toHaveLength(1);
    expect(sent).toHaveLength(1);
    const ix = sent[0]![0]!;
    expect([...ix.data!.slice(0, 8)]).toEqual([...discriminator('return_expired')]);
  });
});

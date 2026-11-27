// @vitest-environment happy-dom
// Part 17: inside the Android app the phone's wallet (Mobile Wallet Adapter)
// takes the place of the passkey wallet.
import { describe, expect, it, vi } from 'vitest';
import { generateKeyPairSigner, type Instruction } from '@solana/kit';

const relayed: { ixs: Instruction[]; walletSign: unknown }[] = [];
vi.mock('../src/chain', () => ({
  rpc: { getAccountInfo: () => ({ send: async () => ({ value: { owner: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' } }) }) },
  feePayer: async () => 'ByWbpvCjdgiUdamJ7t47toUMreqapqgPcBfjyTkEcNX2',
  accountData: async () => null,
  computeUnits: () => ({}),
  slot: async () => 1n,
  tokenBalance: async () => 0n,
  relay: async (ixs: Instruction[], _s: unknown, walletSign: unknown) => {
    relayed.push({ ixs, walletSign });
    return 'sig';
  },
}));
const signed: Uint8Array[] = [];
vi.mock('../src/mwa', () => ({
  inApp: () => true,
  savedWallet: () => localStorage.getItem('tok.mwa'),
  connectWallet: async () => localStorage.getItem('tok.mwa'),
  signWithWallet: async (w: Uint8Array) => {
    signed.push(w);
    return w;
  },
  signMessageWithWallet: async () => new Uint8Array(64),
}));
vi.mock('../src/passkey', async (o) => ({
  ...(await o<typeof import('../src/passkey')>()),
  signer: () => {
    throw new Error('no passkey in the Android app');
  },
}));

describe('Android app wallet (part 17)', () => {
  it('pays, cancels and moves with the phone wallet, never a passkey', async () => {
    const a = (await generateKeyPairSigner()).address;
    localStorage.setItem('tok.mwa', a);
    const { pay, walletFor, sendTo } = await import('../src/tok');
    const { MWA_MARK } = await import('../src/passkey');
    const w = await walletFor(MWA_MARK);
    expect(w).toMatchObject({ address: a, kind: 'mwa', exists: true });
    await pay(MWA_MARK, w, 1_000_000n);
    expect(relayed.at(-1)!.walletSign).toBeTypeOf('function');
    // The deposit's sender is the phone wallet itself, with no Swig wrapper.
    const dep = relayed.at(-1)!.ixs.at(-1)!;
    expect(dep.programAddress).toBe('2pZCUFv63kde6rkaAaZ3GGhUu4u4jzM8kBcyshZ9qauH');
    expect(dep.accounts![1]!.address).toBe(a);
    await sendTo(MWA_MARK, w, (await generateKeyPairSigner()).address, 1n);
    expect(relayed.at(-1)!.walletSign).toBeTypeOf('function');
  });
});

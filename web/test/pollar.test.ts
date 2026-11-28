// @vitest-environment happy-dom
// Pollar part: a receiver without a passkey signs in by email, gets a Pollar
// Solana wallet, receives a link into it, and sends from it.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSigner, type Instruction } from '@solana/kit';
import { discriminator, USDC_MINT } from '@tok/core';

const pollarWallet = { value: '' };
const sent: unknown[] = [];
let listener: ((s: { step: string }) => void) | null = null;
let state: { step: string } = { step: 'idle' };
const set = (s: { step: string }) => {
  state = s;
  listener?.(s);
};

vi.mock('@pollar/core', () => ({
  PollarClient: class {
    getAuthState = () => state;
    onAuthStateChange = (cb: (s: { step: string }) => void) => {
      listener = cb;
      return () => (listener = null);
    };
    beginEmailLogin = () => set({ step: 'entering_email' });
    sendEmailCode = () => setTimeout(() => set({ step: 'entering_code' }), 5);
    verifyEmailCode = (code: string) => setTimeout(() => set(code === '123456' ? ({ step: 'authenticated', verified: true } as never) : { step: 'error', message: 'Wrong code' } as never), 5);
    getWallets = () => [{ custody: 'internal', chain: 'SOLANA', address: pollarWallet.value, provider: 'email' }];
    sendPayment = async (p: unknown) => {
      sent.push(p);
      return { status: 'success', hash: 'pollarSig' };
    };
  },
}));

const relayed: Instruction[][] = [];
vi.mock('../src/chain', () => ({
  rpc: { getAccountInfo: () => ({ send: async () => ({ value: { owner: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' } }) }) },
  feePayer: async () => 'ByWbpvCjdgiUdamJ7t47toUMreqapqgPcBfjyTkEcNX2',
  accountData: async () => null,
  computeUnits: () => ({}),
  slot: async () => 1n,
  tokenBalance: async () => 0n,
  relay: async (ixs: Instruction[]) => {
    relayed.push(ixs);
    return 'claimSig';
  },
}));

beforeAll(async () => {
  vi.stubEnv('VITE_POLLAR_KEY', 'pub_testnet_example');
  pollarWallet.value = (await generateKeyPairSigner()).address;
});

describe('Pollar wallet by email (Pollar part)', () => {
  it('signs in by email code and returns the Pollar Solana wallet', async () => {
    const { sendCode, verifyCode } = await import('../src/pollar');
    await sendCode('someone@example.com');
    expect(await verifyCode('123456')).toBe(pollarWallet.value);
  });

  it('claims a link into the Pollar wallet: the claim key signs, no passkey', async () => {
    const { claimInto } = await import('../src/tok');
    const key = await generateKeyPairSigner();
    const sender = (await generateKeyPairSigner()).address;
    await claimInto(pollarWallet.value as never, {
      claimKey: key.address,
      seedSigner: key,
      record: { sender, mint: USDC_MINT, amount: 1n, claimKey: key.address, createdAt: 0n, expiresAt: 0n, rentPayer: sender, bump: 255 },
    }, performance.now());
    const ixs = relayed.at(-1)!;
    const claim = ixs.at(-1)!;
    expect([...claim.data!.slice(0, 8)]).toEqual([...discriminator('claim')]);
    // The receiver's USDC account is created for the Pollar wallet.
    expect(ixs[0]!.accounts![2]!.address).toBe(pollarWallet.value);
  });

  it('sends USDC on Solana from the Pollar wallet', async () => {
    const { sendFromPollar } = await import('../src/pollar');
    const to = (await generateKeyPairSigner()).address;
    expect(await sendFromPollar(to, 1_500_000n)).toBe('pollarSig');
    expect(sent.at(-1)).toEqual({ chain: 'SOLANA', destination: to, amount: '1500000', mint: USDC_MINT });
  });
});

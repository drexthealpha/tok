// Part 1: the claim program. Deposit, claim, cancel, return after 7 days.
import { beforeEach, describe, expect, it } from 'vitest';
import {
  AccountRole,
  generateKeyPairSigner,
  lamports,
  type Instruction,
  type KeyPairSigner,
} from '@solana/kit';
import { getTransferInstruction } from '@solana-program/token';
import {
  cancelInstruction,
  claimAddress,
  claimInstruction,
  decodeClaim,
  depositInstruction,
  EXPIRY_SECONDS,
  returnInstruction,
  TOKEN_PROGRAM,
  USDC_MINT,
} from '@tok/core';
import {
  ata,
  createAta,
  exists,
  failed,
  fundUsdc,
  haveClaimSo,
  lamportsOf,
  ok,
  send,
  usdcBalance,
  warp,
  world,
  type World,
} from './harness';

const base = { mint: USDC_MINT, tokenProgram: TOKEN_PROGRAM };

/** Attach a signer object to the first account so kit signs with it. */
function signedBy(ix: Instruction, signer: KeyPairSigner, index = 0): Instruction {
  const accounts = [...(ix.accounts ?? [])];
  accounts[index] = { ...accounts[index]!, signer } as never;
  return { ...ix, accounts };
}

describe.skipIf(!haveClaimSo)('claim program (part 1)', () => {
  let w: World;
  let sender: KeyPairSigner;
  let claimKey: KeyPairSigner;
  let receiver: KeyPairSigner;

  beforeEach(async () => {
    w = await world();
    sender = await generateKeyPairSigner();
    claimKey = await generateKeyPairSigner();
    receiver = await generateKeyPairSigner();
    await fundUsdc(w, sender.address, 10_000_000n);
  });

  async function deposit(amount = 4_000_000n) {
    const ix = await depositInstruction({
      ...base,
      rentPayer: w.feePayer.address,
      sender: sender.address,
      claimKey: claimKey.address,
      amount,
    });
    return send(w, [signedBy(ix, sender, 1)]);
  }

  async function claimIx(rentPayer = w.feePayer.address) {
    const to = await createAta(w, receiver.address);
    const ix = await claimInstruction({ ...base, claimKey: claimKey.address, rentPayer, receiverTokens: to });
    return { to, ix };
  }

  it('records sender, amount, claim key, expiry and rent payer', async () => {
    const t0 = w.svm.getClock().unixTimestamp;
    ok(await deposit());
    const acc = w.svm.getAccount(await claimAddress(claimKey.address));
    if (!acc.exists) throw new Error('no claim account');
    const c = decodeClaim(acc.data);
    expect(c.sender).toBe(sender.address);
    expect(c.amount).toBe(4_000_000n);
    expect(c.claimKey).toBe(claimKey.address);
    expect(c.rentPayer).toBe(w.feePayer.address);
    expect(c.expiresAt - c.createdAt).toBe(BigInt(EXPIRY_SECONDS));
    expect(c.createdAt).toBe(t0);
    expect(usdcBalance(w, await ata(sender.address))).toBe(6_000_000n);
  });

  it('claims with the claim key signature, and fails without it', async () => {
    ok(await deposit());
    const { to, ix } = await claimIx();

    // Someone else's key in the claim key's place.
    const impostor = await generateKeyPairSigner();
    const wrong = await claimInstruction({ ...base, claimKey: impostor.address, rentPayer: w.feePayer.address, receiverTokens: to });
    const forged = { ...ix, accounts: [wrong.accounts![0]!, ...ix.accounts!.slice(1)] };
    failed(await send(w, [signedBy(forged, impostor)]));

    // The claim key named, but not signing.
    const unsigned = { ...ix, accounts: [{ address: claimKey.address, role: AccountRole.READONLY }, ...ix.accounts!.slice(1)] };
    failed(await send(w, [unsigned]));

    const before = lamportsOf(w, w.feePayer.address);
    ok(await send(w, [signedBy(ix, claimKey)]));
    expect(usdcBalance(w, to)).toBe(4_000_000n);
    expect(exists(w, await claimAddress(claimKey.address))).toBe(false);
    // Rent for the claim account and its vault went back to the rent payer.
    expect(lamportsOf(w, w.feePayer.address)).toBeGreaterThan(before);

    // A second claim fails.
    failed(await send(w, [signedBy(ix, claimKey)]));
  });

  it('cancels by the sender before a claim, and not by anyone else', async () => {
    ok(await deposit());
    const other = await generateKeyPairSigner();
    await fundUsdc(w, other.address, 1n);
    const byOther = await cancelInstruction({ ...base, claimKey: claimKey.address, rentPayer: w.feePayer.address, sender: other.address });
    failed(await send(w, [signedBy(byOther, other)]));

    const ix = await cancelInstruction({ ...base, claimKey: claimKey.address, rentPayer: w.feePayer.address, sender: sender.address });
    ok(await send(w, [signedBy(ix, sender)]));
    expect(usdcBalance(w, await ata(sender.address))).toBe(10_000_000n);
    expect(exists(w, await claimAddress(claimKey.address))).toBe(false);
  });

  it('cancel after a claim fails (part 6)', async () => {
    ok(await deposit());
    const { ix: c } = await claimIx();
    ok(await send(w, [signedBy(c, claimKey)]));
    const ix = await cancelInstruction({ ...base, claimKey: claimKey.address, rentPayer: w.feePayer.address, sender: sender.address });
    failed(await send(w, [signedBy(ix, sender)]));
  });

  it('return before 7 days fails; after 7 days pays the sender only', async () => {
    ok(await deposit());
    const caller = await generateKeyPairSigner();
    w.svm.airdrop(caller.address, lamports(1_000_000_000n));
    const callerTokens = await createAta(w, caller.address);
    const ix = await returnInstruction({ ...base, claimKey: claimKey.address, rentPayer: w.feePayer.address, sender: sender.address });
    failed(await send(w, [ix], caller));

    warp(w, BigInt(EXPIRY_SECONDS) - 10n);
    failed(await send(w, [ix], caller));

    warp(w, 20n);
    const callerLamports = lamportsOf(w, caller.address);
    const payerLamports = lamportsOf(w, w.feePayer.address);
    ok(await send(w, [ix], caller));
    expect(usdcBalance(w, await ata(sender.address))).toBe(10_000_000n);
    expect(usdcBalance(w, callerTokens)).toBe(0n);
    // The caller only paid its fee; the rent went to the recorded rent payer.
    expect(lamportsOf(w, caller.address)).toBeLessThan(callerLamports);
    expect(lamportsOf(w, w.feePayer.address)).toBeGreaterThan(payerLamports);
  });

  it('sends rent only to the recorded rent payer', async () => {
    ok(await deposit());
    const thief = await generateKeyPairSigner();
    const { ix } = await claimIx(thief.address);
    failed(await send(w, [signedBy(ix, claimKey)]));
  });

  it('a transfer signed only by the fee payer cannot move user funds (part 3)', async () => {
    const from = await ata(sender.address);
    const to = await createAta(w, receiver.address);
    const ix = getTransferInstruction({ source: from, destination: to, authority: sender.address, amount: 1n });
    // Only the fee payer signs: the owner is listed without a signature.
    const accounts = ix.accounts.map((a, i) => (i === 2 ? { address: a.address, role: AccountRole.READONLY } : a));
    failed(await send(w, [{ ...ix, accounts }]));
    expect(usdcBalance(w, to)).toBe(0n);
  });
});

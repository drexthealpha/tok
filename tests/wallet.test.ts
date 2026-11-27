// Part 2: the passkey wallet (Swig, secp256r1 precompile).
// Also covers deposits from a passkey wallet (parts 4 and 6) and
// "Move to my wallet" (part 7).
import { beforeEach, describe, expect, it } from 'vitest';
import { AccountRole, generateKeyPairSigner, type Address, type Instruction } from '@solana/kit';
import { getTransferCheckedInstruction } from '@solana-program/token';
import {
  claimAddress,
  claimInstruction,
  createWalletInstruction,
  decodeClaim,
  depositInstruction,
  PASSKEY_COMPUTE_UNITS,
  passkeySign,
  swigAccountFor,
  swigFromAccount,
  TOKEN_PROGRAM,
  USDC_DECIMALS,
  USDC_MINT,
  walletAddress,
  walletAddressFor,
} from '@tok/core';
import {
  ata,
  createAta,
  exists,
  failed,
  fundUsdc,
  haveClaimSo,
  haveSwigSo,
  ok,
  send,
  softPasskey,
  usdcBalance,
  world,
  type World,
} from './harness';

async function newWallet(w: World) {
  const key = softPasskey();
  ok(await send(w, [await createWalletInstruction(key.publicKey, w.feePayer.address)]));
  const swigAddr = await swigAccountFor(key.publicKey);
  const load = () => {
    const acc = w.svm.getAccount(swigAddr);
    if (!acc.exists) throw new Error('no swig account');
    return swigFromAccount(swigAddr, acc.data);
  };
  const wallet = await walletAddress(load());
  return { key, swigAddr, wallet, load };
}

async function signed(w: World, x: Awaited<ReturnType<typeof newWallet>>, ixs: Instruction[], key = x.key) {
  return passkeySign(x.load(), x.key.publicKey, ixs, {
    payer: w.feePayer.address,
    currentSlot: w.svm.getClock().slot,
    signingFn: key.signingFn,
  });
}

function transfer(from: Address, to: Address, owner: Address, amount: bigint) {
  return getTransferCheckedInstruction({
    source: from,
    destination: to,
    mint: USDC_MINT,
    authority: owner,
    amount,
    decimals: USDC_DECIMALS,
  }) as Instruction;
}

describe.skipIf(!haveSwigSo)('passkey wallet (part 2)', () => {
  let w: World;
  beforeEach(async () => {
    w = await world();
  });

  it('is created with the makers paying, and a passkey-signed transfer succeeds', async () => {
    const a = await newWallet(w);
    expect(exists(w, a.swigAddr)).toBe(true);
    expect(await walletAddressFor(a.swigAddr)).toBe(a.wallet);
    const from = await fundUsdc(w, a.wallet, 5_000_000n);
    const bob = await generateKeyPairSigner();
    const to = await createAta(w, bob.address);
    ok(await send(w, await signed(w, a, [transfer(from, to, a.wallet, 2_000_000n)]), w.feePayer, PASSKEY_COMPUTE_UNITS));
    expect(usdcBalance(w, to)).toBe(2_000_000n);
    expect(usdcBalance(w, from)).toBe(3_000_000n);
  });

  it('fails when signed by a different passkey', async () => {
    const a = await newWallet(w);
    const from = await fundUsdc(w, a.wallet, 5_000_000n);
    const to = await createAta(w, (await generateKeyPairSigner()).address);
    const stranger = softPasskey();
    failed(await send(w, await signed(w, a, [transfer(from, to, a.wallet, 1n)], stranger), w.feePayer, PASSKEY_COMPUTE_UNITS));
    expect(usdcBalance(w, to)).toBe(0n);
  });

  it('fails without any passkey signature', async () => {
    const a = await newWallet(w);
    const from = await fundUsdc(w, a.wallet, 5_000_000n);
    const to = await createAta(w, (await generateKeyPairSigner()).address);
    // The wallet address is a program address: nobody can sign for it directly.
    const ix = transfer(from, to, a.wallet, 1n);
    const accounts = ix.accounts!.map((m) => (m.address === a.wallet ? { address: m.address, role: AccountRole.READONLY } : m));
    failed(await send(w, [{ ...ix, accounts }]));
    expect(usdcBalance(w, to)).toBe(0n);
  });

  it('"Move to my wallet" sends USDC to a typed Solana address (part 7)', async () => {
    const a = await newWallet(w);
    const from = await fundUsdc(w, a.wallet, 5_000_000n);
    const solflare = await generateKeyPairSigner();
    const to = await createAta(w, solflare.address);
    ok(await send(w, await signed(w, a, [transfer(from, to, a.wallet, 5_000_000n)]), w.feePayer, PASSKEY_COMPUTE_UNITS));
    expect(usdcBalance(w, to)).toBe(5_000_000n);
  });

  describe.skipIf(!haveClaimSo)('with the claim program', () => {
    it('a passkey wallet pays a link and another passkey wallet claims it', async () => {
      const alice = await newWallet(w);
      const bob = await newWallet(w);
      await fundUsdc(w, alice.wallet, 10_000_000n);
      const claimKey = await generateKeyPairSigner();
      const dep = await depositInstruction({
        rentPayer: w.feePayer.address,
        sender: alice.wallet,
        mint: USDC_MINT,
        tokenProgram: TOKEN_PROGRAM,
        claimKey: claimKey.address,
        amount: 3_000_000n,
      });
      ok(await send(w, await signed(w, alice, [dep]), w.feePayer, PASSKEY_COMPUTE_UNITS));
      const rec = w.svm.getAccount(await claimAddress(claimKey.address));
      if (!rec.exists) throw new Error('no claim');
      expect(decodeClaim(rec.data).sender).toBe(alice.wallet);

      const bobTokens = await createAta(w, bob.wallet);
      const c = await claimInstruction({
        claimKey: claimKey.address,
        rentPayer: w.feePayer.address,
        mint: USDC_MINT,
        tokenProgram: TOKEN_PROGRAM,
        receiverTokens: bobTokens,
      });
      const accounts = [...c.accounts!];
      accounts[0] = { ...accounts[0]!, signer: claimKey } as never;
      ok(await send(w, [{ ...c, accounts }]));
      expect(usdcBalance(w, bobTokens)).toBe(3_000_000n);
      expect(usdcBalance(w, await ata(alice.wallet))).toBe(7_000_000n);

      // "Send back" (part 6): the receiver sends the amount to the sender recorded in the claim.
      const back = transfer(bobTokens, await ata(alice.wallet), bob.wallet, 3_000_000n);
      ok(await send(w, await signed(w, bob, [back]), w.feePayer, PASSKEY_COMPUTE_UNITS));
      expect(usdcBalance(w, await ata(alice.wallet))).toBe(10_000_000n);
    });
  });
});

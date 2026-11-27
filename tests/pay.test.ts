// Part 15: a deposit built by Tok's Action endpoint is claimable.
// Part 16: a Solana Pay request paid from a passkey wallet, found by its
// reference, and refunded to the debited account's owner.
import { describe, expect, it } from 'vitest';
import {
  address,
  generateKeyPairSigner,
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  decompileTransactionMessage,
  type Address,
  type Instruction,
} from '@solana/kit';
import { getTransferCheckedInstruction } from '@solana-program/token';
import {
  claimInstruction,
  COMPUTE_BUDGET_PROGRAM,
  createWalletInstruction,
  debitedOwner,
  memoInstruction,
  PASSKEY_COMPUTE_UNITS,
  passkeySign,
  readLinkSecret,
  refundMemo,
  swigAccountFor,
  swigFromAccount,
  TOKEN_PROGRAM,
  transferRequestUrl,
  parseTransferRequest,
  USDC_DECIMALS,
  USDC_MINT,
  walletAddress,
  withReference,
} from '@tok/core';
import { createApp } from '../server/src/app';
import { createAta, fundUsdc, haveClaimSo, haveSwigSo, ok, send, softPasskey, usdcBalance, world, type World } from './harness';
import { createKeyPairSignerFromPrivateKeyBytes } from '@solana/kit';

async function wallet(w: World) {
  const key = softPasskey();
  ok(await send(w, [await createWalletInstruction(key.publicKey, w.feePayer.address)]));
  const swig = await swigAccountFor(key.publicKey);
  const load = () => {
    const a = w.svm.getAccount(swig);
    if (!a.exists) throw new Error('no swig');
    return swigFromAccount(swig, a.data);
  };
  return { key, address: await walletAddress(load()), load };
}

const transfer = (from: Address, to: Address, owner: Address, amount: bigint) =>
  getTransferCheckedInstruction({ source: from, destination: to, mint: USDC_MINT, authority: owner, amount, decimals: USDC_DECIMALS }) as Instruction;

describe.skipIf(!haveSwigSo)('Solana Pay and refunds (part 16)', () => {
  it('a passkey wallet pays a request with its reference; the refund goes to the payer, not the fee payer', async () => {
    const w = await world();
    const payer = await wallet(w);
    const merchant = await wallet(w);
    const payerTokens = await fundUsdc(w, payer.address, 5_000_000n);
    const merchantTokens = await createAta(w, merchant.address);
    const reference = (await generateKeyPairSigner()).address;
    const req = parseTransferRequest(
      transferRequestUrl({ recipient: merchant.address, amount: 2_000_000n, splToken: USDC_MINT, reference, label: 'Cafe' }),
    );

    const ix = withReference(transfer(payerTokens, merchantTokens, payer.address, req.amount), req.reference);
    const signed = await passkeySign(payer.load(), payer.key.publicKey, [ix], {
      payer: w.feePayer.address,
      currentSlot: w.svm.getClock().slot,
      signingFn: payer.key.signingFn,
    });
    const paid = ok(await send(w, signed, w.feePayer, PASSKEY_COMPUTE_UNITS));
    expect(usdcBalance(w, merchantTokens)).toBe(2_000_000n);
    // The merchant view finds the payment by its reference: it is one of the transaction's accounts.
    const swigIx = signed.find((i) => i.programAddress === 'swigypWHEksbC64pWKwah1WTeh9JXwx8H1rJHLdbQMB')!;
    expect(swigIx.accounts!.some((a) => a.address === reference)).toBe(true);

    // The refund target is read from the payment's token balances: the debited account's owner.
    const meta = {
      preTokenBalances: [
        { accountIndex: 1, mint: USDC_MINT, owner: payer.address, uiTokenAmount: { amount: '5000000' } },
        { accountIndex: 2, mint: USDC_MINT, owner: merchant.address, uiTokenAmount: { amount: '0' } },
      ],
      postTokenBalances: [
        { accountIndex: 1, mint: USDC_MINT, owner: payer.address, uiTokenAmount: { amount: String(usdcBalance(w, payerTokens)) } },
        { accountIndex: 2, mint: USDC_MINT, owner: merchant.address, uiTokenAmount: { amount: String(usdcBalance(w, merchantTokens)) } },
      ],
    };
    const debit = debitedOwner(meta, USDC_MINT);
    expect(debit.owner).toBe(payer.address);
    expect(debit.owner).not.toBe(w.feePayer.address);

    const feePayerTokens = await createAta(w, w.feePayer.address);
    const refund = await passkeySign(merchant.load(), merchant.key.publicKey, [transfer(merchantTokens, payerTokens, merchant.address, debit.amount)], {
      payer: w.feePayer.address,
      currentSlot: w.svm.getClock().slot,
      signingFn: merchant.key.signingFn,
    });
    ok(await send(w, [...refund, memoInstruction(refundMemo(String(paid.signature())))], w.feePayer, PASSKEY_COMPUTE_UNITS));
    expect(usdcBalance(w, payerTokens)).toBe(5_000_000n);
    expect(usdcBalance(w, feePayerTokens)).toBe(0n);
  });
});

describe.skipIf(!haveSwigSo || !haveClaimSo)('Tok as a Solana Action (part 15)', () => {
  it('a deposit built by the Action endpoint is claimable on the same claim page', async () => {
    const w = await world();
    const user = await generateKeyPairSigner();
    await fundUsdc(w, user.address, 3_000_000n);
    const app = createApp({
      kora: { payer: async () => w.feePayer.address, signAndSend: async () => 'unused' },
      origins: [],
      actions: {
        rpcUrl: 'http://unused',
        site: 'https://tok.test/tok',
        publicUrl: 'https://srv.test',
        tokenProgram: address(TOKEN_PROGRAM),
        blockhash: async () => ({ blockhash: w.svm.latestBlockhash(), lastValidBlockHeight: 1_000_000n }),
      },
    });
    const r = await app.request('/api/actions/pay?amount=1', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ account: user.address }),
    });
    const { transaction, message } = (await r.json()) as { transaction: string; message: string };
    const tx = getTransactionDecoder().decode(getBase64Encoder().encode(transaction));
    const ixs = decompileTransactionMessage(getCompiledTransactionMessageDecoder().decode(tx.messageBytes)).instructions.filter(
      (i) => i.programAddress !== COMPUTE_BUDGET_PROGRAM,
    ) as Instruction[];
    // The wallet signs as the sender; the makers' fee payer signs as fee and rent payer.
    const withSigner = ixs.map((i) => ({
      ...i,
      accounts: i.accounts!.map((a) => (a.address === user.address ? { ...a, signer: user } : a)),
    })) as Instruction[];
    ok(await send(w, withSigner));

    const secret = readLinkSecret(new URL(message.slice(message.indexOf('https://'))).hash);
    if (secret?.kind !== 'plain') throw new Error('no claim key in the link');
    const claimKey = await createKeyPairSignerFromPrivateKeyBytes(secret.seed);
    const bob = await generateKeyPairSigner();
    const to = await createAta(w, bob.address);
    const c = await claimInstruction({ claimKey: claimKey.address, rentPayer: w.feePayer.address, mint: USDC_MINT, tokenProgram: TOKEN_PROGRAM, receiverTokens: to });
    ok(await send(w, [{ ...c, accounts: [{ ...c.accounts![0]!, signer: claimKey } as never, ...c.accounts!.slice(1)] }]));
    expect(usdcBalance(w, to)).toBe(1_000_000n);
  });
});

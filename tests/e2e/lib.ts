/** Helpers for the live runs on devnet. */
import { readFileSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';
import {
  appendTransactionMessageInstructions,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Address,
} from '@solana/kit';
import { getCreateAssociatedTokenIdempotentInstruction, getTransferCheckedInstruction } from '@solana-program/token';
import { associatedTokenAddress, TOKEN_PROGRAM, USDC_MINT } from '@tok/core';

export const SITE = process.env.TOK_SITE ?? 'https://drexthealpha.github.io/tok/';
const KEYS = process.env.TOK_KEYS ?? 'C:/Users/zulab/.tok-secrets';
export const rpc = createSolanaRpc('https://api.devnet.solana.com');

export const key = (name: string) =>
  createKeyPairSignerFromBytes(new Uint8Array(JSON.parse(readFileSync(`${KEYS}/${name}.json`, 'utf8')) as number[]));

export async function phone(browser: Browser, label: string) {
  const ctx = await browser.newContext({ viewport: { width: 400, height: 860 }, userAgent: 'Mozilla/5.0 (Linux; Android 15) Chrome/131 Mobile Safari/537.36' });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
  page.on('console', (m) => {
    if (m.type() === 'error' || m.text().startsWith('[tok]')) console.log(`  [${label}] ${m.text()}`);
  });
  page.on('pageerror', (e) => console.log(`  [${label}] page error: ${e.message}`));
  return page;
}

export async function waitText(page: Page, text: string, ms = 120_000) {
  try {
    await page.getByText(text, { exact: false }).first().waitFor({ timeout: ms });
  } catch (e) {
    console.log(`  page text while waiting for "${text}":\n${(await page.locator('#app').innerText()).slice(0, 1500)}`);
    throw e;
  }
}

export async function fund(to: Address, units: bigint) {
  const payer = await key('fee-payer');
  const src = await key('test-usdc');
  const from = await associatedTokenAddress(src.address, USDC_MINT, TOKEN_PROGRAM);
  const dest = await associatedTokenAddress(to, USDC_MINT, TOKEN_PROGRAM);
  const { value: bh } = await rpc.getLatestBlockhash().send();
  const msg = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(payer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(bh, m),
    (m) =>
      appendTransactionMessageInstructions(
        [
          getCreateAssociatedTokenIdempotentInstruction({ payer, ata: dest, owner: to, mint: USDC_MINT }),
          getTransferCheckedInstruction({ source: from, destination: dest, mint: USDC_MINT, authority: src, amount: units, decimals: 6 }),
        ],
        m,
      ),
  );
  const tx = await signTransactionMessageWithSigners(msg);
  const sig = await rpc.sendTransaction(getBase64EncodedWireTransaction(tx), { encoding: 'base64' }).send();
  for (let i = 0; i < 60; i++) {
    const s = (await rpc.getSignatureStatuses([sig]).send()).value[0];
    if (s?.confirmationStatus === 'confirmed' || s?.confirmationStatus === 'finalized') return sig;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('funding not confirmed');
}


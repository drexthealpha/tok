/**
 * Live run on devnet: the real web page, the real server and Kora, two
 * browsers each with a WebAuthn virtual authenticator (a passkey that
 * answers like a phone's). Phone A makes a wallet, gets 2 test USDC from the
 * makers' test wallet, pays 1 USDC into a link; phone B opens the link and
 * receives it.
 *
 * Outside CI: it needs the makers' keys on this PC.
 * Run: npx tsx tests/e2e/live.ts
 */
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

const SITE = process.env.TOK_SITE ?? 'https://drexthealpha.github.io/tok/';
const KEYS = process.env.TOK_KEYS ?? '//wsl.localhost/Ubuntu-22.04/home/zulab/.tok-secrets';
const rpc = createSolanaRpc('https://api.devnet.solana.com');

const key = (name: string) =>
  createKeyPairSignerFromBytes(new Uint8Array(JSON.parse(readFileSync(`${KEYS}/${name}.json`, 'utf8')) as number[]));

async function phone(browser: Browser, label: string) {
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

async function waitText(page: Page, text: string, ms = 120_000) {
  try {
    await page.getByText(text, { exact: false }).first().waitFor({ timeout: ms });
  } catch (e) {
    console.log(`  page text while waiting for "${text}":\n${(await page.locator('#app').innerText()).slice(0, 1500)}`);
    throw e;
  }
}

async function fund(to: Address, units: bigint) {
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

const browser = await chromium.launch();
try {
  const a = await phone(browser, 'A');
  await a.goto(SITE + 'w');
  await a.getByRole('button', { name: 'Make my wallet' }).click();
  await a.locator('a.mono').first().waitFor({ timeout: 120_000 });
  const walletA = (await a.locator('a.mono').first().textContent())!.trim() as Address;
  console.log('A wallet', walletA);
  console.log('funded A', await fund(walletA, 2_000_000n));

  await a.goto(SITE + '?count');
  await a.getByLabel('Amount in USDC').fill('1');
  await waitText(a, 'in wallet', 60_000);
  const t0 = Date.now();
  await a.getByRole('button', { name: 'Pay' }).click();
  await waitText(a, 'Paid into a link');
  const link = (await a.locator('.card.mono').textContent())!.trim();
  console.log(`A paid in ${Date.now() - t0} ms, counter: ${await a.locator('.counter').textContent()}`);

  const b = await phone(browser, 'B');
  const t1 = Date.now();
  await b.goto(link.replace(SITE.replace(/\/$/, ''), SITE.replace(/\/$/, '')) + '');
  await waitText(b, '1 USDC', 60_000);
  await b.getByRole('button', { name: /Receive/ }).click();
  await waitText(b, 'Received');
  const sig = await b.locator('a.small').first().getAttribute('href');
  console.log(`B received in ${Date.now() - t1} ms: ${sig}`);
  console.log('PASS live pay and claim');

  // Part 6: "Send back" by the receiver.
  await b.getByRole('button', { name: 'Send back' }).click();
  await waitText(b, 'Sent back');
  console.log('PASS send back:', await b.getByText('Sent back').textContent());

  // Part 5: a link locked with a pass phrase.
  await a.goto(SITE);
  await a.getByLabel('Amount in USDC').fill('0.5');
  await waitText(a, 'in wallet', 60_000);
  await a.locator('label.toggle input').check();
  await a.getByRole('button', { name: 'Pay' }).click();
  await waitText(a, 'Paid into a link');
  const locked = (await a.locator('.card.mono').textContent())!.trim();
  const words = (await a.locator('.words').textContent())!.trim();
  await b.goto(locked);
  await waitText(b, '4 words');
  await b.locator('input[type=text]').fill('wrong words here please');
  await b.getByRole('button', { name: 'Unlock' }).click();
  await waitText(b, 'Wrong pass phrase');
  await b.locator('input[type=text]').fill(words);
  await b.getByRole('button', { name: 'Unlock' }).click();
  await waitText(b, '0.50 USDC', 60_000);
  await b.getByRole('button', { name: /Receive/ }).click();
  await waitText(b, 'Received');
  console.log('PASS pass phrase link: wrong words refused, right words claimed');

  // Part 6: cancel before a claim, and the link is then dead.
  await a.goto(SITE);
  await a.getByLabel('Amount in USDC').fill('0.25');
  await waitText(a, 'in wallet', 60_000);
  await a.getByRole('button', { name: 'Pay' }).click();
  await waitText(a, 'Paid into a link');
  const toCancel = (await a.locator('.card.mono').textContent())!.trim();
  await a.goto(SITE + 'w');
  await a.getByRole('button', { name: 'Cancel' }).first().click();
  await waitText(a, 'Cancelled');
  await b.goto(toCancel);
  await waitText(b, 'already claimed, cancelled or returned', 60_000);
  console.log('PASS cancel before claim');

  // Part 7: "Move to my wallet", and a malformed address is refused before signing.
  const solflare = (await import('@solana/kit')).generateKeyPairSigner;
  const target = (await solflare()).address;
  await b.goto(SITE + 'w');
  await b.locator('input[placeholder^="Solana address"]').fill('not-an-address');
  await b.getByRole('button', { name: 'Move' }).click();
  await waitText(b, 'not a Solana address');
  await b.locator('input[placeholder^="Solana address"]').fill(target);
  await b.locator('input[inputmode=decimal]').fill('0.5');
  await b.getByRole('button', { name: 'Move' }).click();
  await waitText(b, 'Moved 0.50 USDC');
  const dest = await associatedTokenAddress(target, USDC_MINT, TOKEN_PROGRAM);
  const bal = await rpc.getTokenAccountBalance(dest, { commitment: 'confirmed' }).send();
  if (bal.value.amount !== '500000') throw new Error(`moved amount ${bal.value.amount}`);
  console.log('PASS move to my wallet', target);
} finally {
  await browser.close();
}

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

import { chromium } from 'playwright';
import { associatedTokenAddress, TOKEN_PROGRAM, USDC_MINT } from '@tok/core';
import { fund, phone, rpc, SITE, waitText } from './lib';
import type { Address } from '@solana/kit';

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

  // Part 16: A charges as a merchant, B pays from Tok, A refunds once.
  await a.goto(SITE + 'shop');
  await a.getByLabel('Amount to charge').fill('0.2');
  await a.getByRole('button', { name: 'Charge' }).click();
  const tokPay = (await a.locator('.mono').first().textContent())!.trim();
  await b.goto(SITE + 'w');
  await b.locator('a.mono').first().waitFor();
  const walletB = (await b.locator('a.mono').first().textContent())!.trim() as Address;
  await fund(walletB, 300_000n);
  await b.goto(tokPay);
  await waitText(b, '0.20 USDC', 60_000);
  await b.getByRole('button', { name: 'Pay' }).click();
  await waitText(b, 'Paid ·', 120_000);
  await waitText(a, 'Paid', 120_000);
  await a.getByRole('button', { name: 'Refund' }).click();
  await waitText(a, 'Refunded 0.20 USDC', 120_000);
  await a.getByRole('button', { name: 'Refund' }).click();
  await waitText(a, 'already refunded', 120_000);
  console.log('PASS Solana Pay request found by reference, refunded to the payer once');
} finally {
  await browser.close();
}

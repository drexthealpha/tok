/**
 * Part 16 on the live page, alone: a merchant charges 0.01 USDC with a
 * Solana Pay request, a buyer pays it, the merchant finds it by its
 * reference and refunds it to the account that paid.
 * Run: npx tsx tests/e2e/shop.ts
 */
import { chromium, type Page } from 'playwright';
import { fund, phone, SITE, waitText } from './lib';

async function wallet(p: Page) {
  await p.goto(SITE + 'w');
  await p.getByRole('button', { name: 'Make my wallet' }).click();
  await p.locator('a.mono').first().waitFor({ timeout: 120_000 });
  return (await p.locator('a.mono').first().textContent())!.trim();
}

const browser = await chromium.launch();
const t0 = Date.now();
const s = () => `${((Date.now() - t0) / 1000).toFixed(1)} s`;
try {
  const a = await phone(browser, 'merchant');
  const b = await phone(browser, 'buyer');
  const wa = await wallet(a);
  const wb = await wallet(b);
  await fund(wb as never, 10_000n);
  console.log('wallets', s(), wa.slice(0, 4), wb.slice(0, 4));
  await a.goto(SITE + 'shop');
  await a.getByLabel('Amount to charge').fill('0.01');
  await a.getByRole('button', { name: 'Charge' }).click();
  const tokPay = (await a.locator('.mono').first().textContent())!.trim();
  console.log('charge', s(), tokPay.slice(0, 60));
  await b.goto(tokPay);
  await b.getByRole('button', { name: 'Pay', exact: true }).click();
  await waitText(b, 'Paid ·', 90_000).catch(async () => console.log('buyer screen:', (await b.locator('body').innerText()).slice(0, 600)));
  console.log('paid', s());
  await a.getByRole('button', { name: 'Refund' }).waitFor({ timeout: 90_000 }).catch(async () => console.log('merchant screen:', (await a.locator('body').innerText()).slice(0, 600)));
  console.log('found', s());
  await a.getByRole('button', { name: 'Refund' }).click();
  await waitText(a, 'Refunded', 90_000);
  console.log('refunded', s(), (await a.locator('body').innerText()).match(/Refunded[^\n]*/)?.[0]);
  // Hand the 0.01 back to the makers' test wallet.
  await b.goto(SITE + 'w');
  await b.locator('input[placeholder^="Solana address"]').fill('5MzwkLVBQSTyzJDRXivdGyMPFkHoe7P2PpLnPZnsHrTb');
  await b.getByRole('button', { name: 'Move', exact: true }).click();
  await waitText(b, 'Moved', 60_000).catch(() => console.log('hand-back did not finish'));
} finally {
  await browser.close();
}

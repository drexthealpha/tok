/**
 * Make one real pay link on devnet (a headless sender with a virtual
 * passkey pays it) and print it, for checks done by hand.
 * Run: npx tsx tests/e2e/make-link.ts [amount]
 */
import { chromium } from 'playwright';
import { fund, phone, SITE, waitText } from './lib';

const amount = process.argv[2] ?? '0.3';
const browser = await chromium.launch();
try {
  const a = await phone(browser, 'A');
  await a.goto(SITE + 'w');
  await a.getByRole('button', { name: 'Make my wallet' }).click();
  await a.locator('a.mono').first().waitFor({ timeout: 120_000 });
  const wa = (await a.locator('a.mono').first().textContent())!.trim();
  await fund(wa as never, 1_000_000n);
  await a.goto(SITE);
  await a.getByLabel('Amount in USDC').fill(amount);
  await waitText(a, 'in wallet', 60_000);
  await a.getByRole('button', { name: 'Pay', exact: true }).click();
  await waitText(a, 'Paid into a link');
  console.log('LINK ' + (await a.locator('.card.mono').textContent())!.trim());
} finally {
  await browser.close();
}

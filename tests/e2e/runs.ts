/**
 * Timed runs on devnet for the README: one sender pays N links on the live
 * page, and each link is received in a fresh browser with a new passkey.
 * Reads the two times the page logs for each run: Pay tap to confirmed
 * deposit, and link opened to confirmed claim. Prints the deposit and claim
 * signatures for the cost script.
 * Run: npx tsx tests/e2e/runs.ts [N] [USDC per link]
 */
import { chromium } from 'playwright';
import { fund, phone, SITE, waitText } from './lib';

const n = Number(process.argv[2] ?? 10);
const each = process.argv[3] ?? '0.1'; // USDC per link
const units = BigInt(Math.round(Number(each) * 1e6));
const browser = await chromium.launch();
const pay: number[] = [];
const claim: number[] = [];
const pairs: string[] = [];
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1]!;
try {
  const a = await phone(browser, 'A');
  await a.goto(SITE + 'w');
  await a.getByRole('button', { name: 'Make my wallet' }).click();
  await a.locator('a.mono').first().waitFor({ timeout: 120_000 });
  const wa = (await a.locator('a.mono').first().textContent())!.trim();
  await fund(wa as never, BigInt(n) * units);
  for (let i = 0; i < n; i++) {
    await a.goto(SITE);
    await a.getByLabel('Amount in USDC').fill(each);
    await waitText(a, 'in wallet', 60_000);
    await a.getByRole('button', { name: 'Pay', exact: true }).click();
    await waitText(a, 'Paid into a link');
    const link = (await a.locator('.card.mono').textContent())!.trim();
    const runsA = (await a.evaluate(() => JSON.parse(localStorage.getItem('tok.runs') ?? '[]'))) as { kind: string; ms: number; signature: string }[];
    const p = runsA.filter((r) => r.kind === 'pay').at(-1)!;

    const b = await phone(browser, `B${i}`);
    await b.goto(link);
    await waitText(b, `${Number(each).toFixed(2)} USDC`, 60_000);
    await b.getByRole('button', { name: /Receive/ }).click();
    await waitText(b, 'Received');
    const runsB = (await b.evaluate(() => JSON.parse(localStorage.getItem('tok.runs') ?? '[]'))) as { kind: string; ms: number; signature: string }[];
    const c = runsB.filter((r) => r.kind === 'claim').at(-1)!;
    await b.context().close();
    pay.push(p.ms);
    claim.push(c.ms);
    pairs.push(`${p.signature}:${c.signature}`);
    console.log(`run ${i + 1}: pay ${Math.round(p.ms)} ms ${p.signature}, claim ${Math.round(c.ms)} ms ${c.signature}`);
  }
  console.log(`pay to confirmed deposit: ${n} runs, median ${Math.round(median(pay))} ms, slowest ${Math.round(Math.max(...pay))} ms`);
  console.log(`link opened to confirmed claim: ${n} runs, median ${Math.round(median(claim))} ms, slowest ${Math.round(Math.max(...claim))} ms`);
  console.log('PAIRS ' + pairs.join(' '));
} finally {
  await browser.close();
}

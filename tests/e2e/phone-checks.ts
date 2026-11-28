/**
 * Phone checks that can run in an emulated phone browser (Chromium with a
 * phone screen, phone user agent and slowed CPU). Not a substitute for a
 * real device: printed results say "emulated".
 *  a. One Argon2id pass phrase try, on a low-end Android profile (CPU 6x slower).
 *  b. The claim page inside chat apps' own browsers (user agents of WhatsApp
 *     and Telegram on Android and iPhone): it must offer "Open in your browser".
 * Run: npx tsx tests/e2e/phone-checks.ts <a real pay link> <screenshot dir>
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { SITE } from './lib';

const [, , link, shots = 'docs/images/phone-checks'] = process.argv;
mkdirSync(shots, { recursive: true });
const browser = await chromium.launch();
try {
  // a. Argon2id on a slow Android phone profile.
  for (const rate of [1, 4, 6]) {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 760 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 11; moto g(30)) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36' });
    const p = await ctx.newPage();
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    await p.goto(SITE + 'w');
    await p.getByRole('button', { name: 'Measure one pass phrase try' }).tap({ timeout: 60_000 });
    const text = await p.getByText(/One try: \d+ ms/).textContent({ timeout: 120_000 });
    const ms = Number(text!.match(/One try: (\d+) ms/)![1]);
    console.log(`Argon2id one try (64 MiB, 3 passes), emulated Android, CPU ${rate}x slower: ${Math.round(ms)} ms`);
    await ctx.close();
  }

  // b. Chat apps' own browsers.
  const apps = [
    ['whatsapp-android', 'Mozilla/5.0 (Linux; Android 14; SM-A145F; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131 Mobile Safari/537.36 WhatsApp/2.24.25.78'],
    ['telegram-android', 'Mozilla/5.0 (Linux; Android 14; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131 Mobile Safari/537.36 Telegram-Android/11.4.2'],
    ['whatsapp-iphone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 WhatsApp/24.22.83'],
    ['telegram-iphone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Telegram-iOS'],
    ['chrome-android', 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131 Mobile Safari/537.36'],
  ] as const;
  for (const [name, ua] of apps) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true, userAgent: ua });
    const p = await ctx.newPage();
    await p.goto(link!);
    await p.getByText('USDC').first().waitFor({ timeout: 60_000 });
    await p.waitForTimeout(1500);
    const openIn = await p.getByRole('button', { name: 'Open in your browser' }).count();
    const email = await p.getByText(/receive with your email/i).count();
    const receive = await p.getByRole('button', { name: /^Receive/ }).count();
    await p.screenshot({ path: join(shots, `${name}.png`) });
    console.log(`${name}: ${openIn ? 'shows "Open in your browser"' : 'no "Open in your browser"'}${email ? ' and email receive' : ''}${receive ? ', passkey Receive button' : ''} (emulated user agent)`);
    await ctx.close();
  }
} finally {
  await browser.close();
}

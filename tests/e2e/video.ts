/**
 * Records the demo video on the live devnet build, following the design's
 * script: two phone-sized browsers side by side (virtual passkeys), the
 * on-screen action counter, and a caption line. Then joins the two
 * recordings with ffmpeg into one 1280x720 MP4 under 3 minutes.
 * Outside CI: needs the makers' keys on this PC.
 * Run: npx tsx tests/e2e/video.ts <spoken wav for the voice message> <out.mp4>
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import ffmpeg from 'ffmpeg-static';
import { fund, SITE } from './lib';

const [, , wav, out = 'tok-demo.mp4'] = process.argv;
const dir = join(process.cwd(), 'video-tmp');
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

const CAPTION = `
  window.__cap = (t) => {
    let el = document.getElementById('__cap');
    if (!el) {
      el = document.createElement('div');
      el.id = '__cap';
      el.style.cssText = 'position:fixed;left:8px;right:8px;top:52px;z-index:99;background:rgba(61,220,151,.95);color:#062016;font:600 15px system-ui;padding:8px 10px;border-radius:10px;text-align:center';
      document.documentElement.appendChild(el);
    }
    el.textContent = t;
    el.style.display = t ? 'block' : 'none';
  };`;

async function phone(browser: Browser, label: string, sub: string) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 720 },
    recordVideo: { dir: join(dir, sub), size: { width: 390, height: 720 } },
    userAgent: 'Mozilla/5.0 (Linux; Android 15) Chrome/131 Mobile Safari/537.36',
  });
  const page = await ctx.newPage();
  page.setDefaultNavigationTimeout(90_000);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
  await page.addInitScript(CAPTION);
  page.on('pageerror', (e) => console.log(`[${label}] ${e.message}`));
  return page;
}

const cap = (p: Page, t: string) => p.evaluate((x) => (window as unknown as { __cap: (t: string) => void }).__cap(x), t).catch(() => undefined);
const see = (p: Page, text: string | RegExp, ms = 120_000) => p.getByText(text).first().waitFor({ timeout: ms });
const pause = (p: Page, ms: number) => p.waitForTimeout(ms);
const mode = (p: Page, name: string) => p.locator('.composer .modes button', { hasText: name }).click();
async function submit(p: Page, text: string) {
  await p.locator('.composer form input[type=text]').fill(text);
  await p.locator('.composer form button[type=submit]').click();
}

const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', ...(wav ? [`--use-file-for-fake-audio-capture=${wav}`] : [])],
});
const t0 = Date.now();
const at = () => `${((Date.now() - t0) / 1000).toFixed(0)} s`;
try {
  const a = await phone(browser, 'A', 'a');
  const b = await phone(browser, 'B', 'b');

  // Before the cut: A's wallet exists and holds devnet USDC from the faucet.
  await a.goto(SITE + 'w');
  await a.getByRole('button', { name: 'Make my wallet' }).click();
  await a.locator('a.mono').first().waitFor({ timeout: 120_000 });
  const wa = (await a.locator('a.mono').first().textContent())!.trim();
  await fund(wa as never, 5_000_000n);
  const recStart = Date.now();

  // 0:00 to 0:15 the one line.
  await a.goto(SITE + '?count');
  await b.goto(SITE);
  await cap(a, 'Pay anyone with a link in the chat app they already use');
  await cap(b, 'They confirm with face or fingerprint. No app. Solana devnet.');
  await pause(a, 12000);

  // 0:15 to 1:00: A pays.
  await cap(a, 'Phone A: type an amount, tap Pay, confirm with the passkey');
  await cap(b, 'Phone B: waiting for the link');
  await a.getByLabel('Amount in USDC').fill('2');
  await pause(a, 2500);
  await a.getByRole('button', { name: 'Pay', exact: true }).click();
  await see(a, 'Paid into a link');
  const link = (await a.locator('.card.mono').textContent())!.trim();
  await cap(a, 'USDC is in the claim account. The link goes into any chat app (WhatsApp, SMS)');
  await pause(a, 8000);

  // 1:00 to 1:35: B receives.
  await b.goto(link + '');
  await cap(b, 'Phone B: tap the link, then Receive, and confirm');
  await see(b, '2 USDC', 60_000);
  await pause(b, 2500);
  await b.getByRole('button', { name: /Receive/ }).click();
  await cap(b, 'Claiming on devnet');
  await see(b, 'Received');
  await cap(b, 'Received: a new wallet, no app, no seed phrase, no SOL');
  await pause(b, 6000);
  const wbLink = await b.evaluate(() => localStorage.getItem('tok.passkey'));
  void wbLink;

  // 1:35 to 2:15: the chat.
  await b.getByRole('button', { name: 'Chat with the sender' }).click();
  await cap(b, 'Tok chat (Supabase): pay, request, split, voice, previews, Actions');
  await b.locator('.composer').waitFor({ timeout: 60_000 });
  await a.goto(SITE + 'chat');
  await cap(a, 'Same chat on phone A');
  await a.locator('.list > div').first().click();
  await a.locator('.composer').waitFor({ timeout: 60_000 });
  await submit(b, 'Thanks! https://solana.com');
  await see(a, 'Thanks!', 30_000);
  await mode(a, 'Request');
  await cap(a, 'Request 0.50');
  await submit(a, '0.5');
  await b.locator('.bubble button', { hasText: 'Pay' }).first().waitFor({ timeout: 30_000 });
  await cap(b, 'Pay the request from its bubble');
  await b.locator('.bubble button', { hasText: 'Pay' }).first().click();
  await see(a, 'Paid ·', 120_000).catch(() => undefined);
  await mode(a, 'Split');
  await cap(a, 'Split 1 USDC: one share per member');
  await submit(a, '1');
  if (wav) {
    await mode(b, 'Aa');
    const mic = b.locator('.composer button[aria-label="Voice message"]');
    await cap(b, 'Voice message: ElevenLabs writes its text');
    await mic.click();
    await mic.click();
    await pause(b, 4000);
    await mic.click();
    await a.locator('.bubble .small', { hasText: /lunch|dollars|\$5/i }).first().waitFor({ timeout: 90_000 }).catch(() => undefined);
  }
  await mode(a, 'Aa');
  await cap(a, 'A Solana Action becomes buttons in the chat');
  await submit(a, 'solana-action:https://tok-server.onrender.com/api/actions/pay');
  await b.locator('.card.action button', { hasText: '1 USDC' }).waitFor({ timeout: 90_000 }).catch(() => undefined);
  await pause(b, 3000);

  // 2:15 to 2:35: cancel, send back, merchant refund, move to wallet.
  await a.goto(SITE + '?count');
  await cap(a, 'Cancel a second link before it is claimed');
  await a.getByLabel('Amount in USDC').fill('0.25');
  await pause(a, 1500);
  await a.getByRole('button', { name: 'Pay', exact: true }).click();
  await see(a, 'Paid into a link');
  await a.goto(SITE + 'w');
  await a.getByRole('button', { name: 'Cancel' }).first().click();
  await see(a, 'Cancelled').catch(() => undefined);
  await b.goto(SITE + 'w');
  await cap(b, 'Move to my wallet: any Solana address, for example Solflare');
  await b.locator('input[placeholder^="Solana address"]').fill('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM');
  await b.locator('input[inputmode=decimal]').fill('0.1');
  await b.getByRole('button', { name: 'Move' }).click();
  await see(b, 'Moved', 120_000).catch(() => undefined);
  await cap(a, 'Merchant view: a Solana Pay request, found by its reference, refunded to the payer');
  await a.goto(SITE + 'shop');
  await a.getByLabel('Amount to charge').fill('0.2');
  await a.getByRole('button', { name: 'Charge' }).click();
  const tokPay = (await a.locator('.mono').first().textContent())!.trim();
  await b.goto(tokPay);
  await b.getByRole('button', { name: 'Pay' }).click();
  await see(a, 'Paid', 120_000).catch(() => undefined);
  await a.getByRole('button', { name: 'Refund' }).click().catch(() => undefined);
  await see(a, 'Refunded', 120_000).catch(() => undefined);

  // 2:35 to 2:50: closing.
  await cap(a, 'Open source (MIT). Claim program on devnet: 2pZCUF...qauH');
  await cap(b, 'github.com/drexthealpha/tok');
  await pause(a, 6000);
  console.log(`recorded ${((Date.now() - recStart) / 1000).toFixed(0)} s of demo (${at()} total)`);
  const skip = (recStart - t0) / 1000;
  await a.context().close();
  await b.context().close();
  const va = join(dir, 'a', readdirSync(join(dir, 'a'))[0]!);
  const vb = join(dir, 'b', readdirSync(join(dir, 'b'))[0]!);
  // Side by side on a 1280x720 canvas, from the start of the demo, cut at 2:50.
  execFileSync(ffmpeg as unknown as string, [
    '-y', '-ss', String(skip), '-i', va, '-ss', String(skip), '-i', vb,
    '-filter_complex', '[0:v][1:v]hstack=inputs=2[s];color=c=0x0b0d10:s=1280x720[bg];[bg][s]overlay=(W-w)/2:0:shortest=1[v]',
    '-map', '[v]', '-t', '170', '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', out,
  ], { stdio: 'inherit' });
  console.log(`wrote ${out}`);
} finally {
  await browser.close();
}

/**
 * Live run of the Tok chat on devnet with the hosted Supabase project:
 * two browsers with virtual passkeys sign in, chat, preview a link, pay with
 * an amount bubble, request and pay a request, split, send a voice message
 * (Chromium's fake microphone plays a spoken clip) and open Tok's Action as
 * buttons. Outside CI: needs the makers' keys on this PC.
 * Run: npx tsx tests/e2e/chat.ts <spoken wav file>
 */
import { chromium, type Page } from 'playwright';
import { fund, phone, SITE, waitText } from './lib';

const wav = process.argv[2];
const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', ...(wav ? [`--use-file-for-fake-audio-capture=${wav}`] : [])],
});

async function makeWallet(p: Page) {
  await p.goto(SITE + 'w');
  await p.getByRole('button', { name: 'Make my wallet' }).click();
  await p.locator('a.mono').first().waitFor({ timeout: 120_000 });
  return (await p.locator('a.mono').first().textContent())!.trim();
}
const mode = (p: Page, name: string) => p.locator('.composer .modes button', { hasText: name }).click();
async function submit(p: Page, text: string) {
  await p.locator('.composer form input[type=text]').fill(text);
  await p.locator('.composer form button[type=submit]').click();
}
const short = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;

try {
  const a = await phone(browser, 'A');
  const b = await phone(browser, 'B');
  const [wa, wb] = await Promise.all([makeWallet(a), makeWallet(b)]);
  console.log('A', wa, 'B', wb);
  console.log('funded A', await fund(wa as never, 3_000_000n));
  console.log('funded B', await fund(wb as never, 1_000_000n));

  // Sign in to chat and open a chat with B.
  await a.goto(SITE + 'chat');
  await a.locator('input[placeholder^="Wallet address"]').fill(wb);
  await a.getByRole('button', { name: 'New chat' }).click();
  await a.locator('.composer').waitFor({ timeout: 60_000 });
  console.log('PASS A signed in to chat with one passkey check and opened a chat');

  // Text with a link: B sees it in real time with its preview.
  await b.goto(SITE + 'chat');
  await waitText(b, short(wa), 60_000);
  await b.getByText(short(wa)).click();
  await b.locator('.composer').waitFor();
  await submit(a, 'Lunch was great https://solana.com');
  await waitText(b, 'Lunch was great', 30_000);
  await b.locator('.preview').first().waitFor({ timeout: 60_000 });
  console.log('PASS real-time message, preview:', await b.locator('.preview').first().textContent());

  // Amount bubble: A pays B 1 USDC.
  await mode(a, 'Pay');
  await submit(a, '1');
  await waitText(b, 'Paid ·', 120_000);
  console.log('PASS amount bubble: B sees the paid bubble with its signature');

  // Request: B asks A for 0.5; A pays from the bubble; both see Paid.
  await mode(b, 'Request');
  await submit(b, '0.5');
  await a.locator('.bubble button', { hasText: 'Pay' }).first().waitFor({ timeout: 30_000 });
  await a.locator('.bubble button', { hasText: 'Pay' }).first().click();
  await waitText(b, 'Paid', 120_000);
  await a.locator('.bubble .ok', { hasText: 'Paid' }).first().waitFor({ timeout: 60_000 });
  console.log('PASS request paid from its bubble, shown as Paid');

  // Split: A splits 1 USDC; B gets one share request.
  await mode(a, 'Split');
  await submit(a, '1');
  await waitText(b, 'Split share', 30_000);
  console.log('PASS split: one share request per member');

  // Voice message with its text.
  if (wav) {
    const mic = a.locator('.composer button[aria-label="Voice message"]');
    await mode(a, 'Aa');
    await mic.click(); // first tap shows the note that audio goes to ElevenLabs
    await waitText(a, 'ElevenLabs');
    await mic.click();
    await a.waitForTimeout(4000);
    await mic.click();
    await b.locator('.bubble audio, .bubble .small', { hasText: '' }).first().waitFor({ timeout: 30_000 });
    await b.locator('.bubble .small', { hasText: /lunch|dollars|\$5/i }).first().waitFor({ timeout: 90_000 });
    console.log('PASS voice message text:', await b.locator('.bubble .small', { hasText: /lunch|dollars|\$5/i }).first().textContent());
  }

  // Tok's Action shown as buttons (its programs are all on the allow list).
  await mode(a, 'Aa');
  await submit(a, 'solana-action:https://tok-server.onrender.com/api/actions/pay');
  await b.locator('.card.action button', { hasText: '0.01 USDC' }).waitFor({ timeout: 90_000 });
  await b.locator('.card.action button', { hasText: '0.01 USDC' }).click();
  await waitText(b, 'Paid into a link', 120_000);
  console.log('PASS Action as buttons, paid from the chat');
  console.log('PASS live chat');
} finally {
  await browser.close();
}

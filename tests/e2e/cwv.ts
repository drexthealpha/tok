/**
 * Core Web Vitals of the live page (part 18), measured outside CI with
 * Google's web-vitals library in Chromium: phone viewport, CPU slowed 4x,
 * slow 4G network (1.6 Mbps down, 150 ms RTT). INP comes from real taps and
 * typing on the first screen. Prints each run and the 75th percentile.
 * Run: npx tsx tests/e2e/cwv.ts [runs]
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { SITE } from './lib';

const runs = Number(process.argv[2] ?? 5);
const here = dirname(fileURLToPath(import.meta.url));
const vitals = readFileSync(join(here, '..', 'node_modules', 'web-vitals', 'dist', 'web-vitals.attribution.iife.js'), 'utf8');

const p75 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.ceil(xs.length * 0.75) - 1]!;
const browser = await chromium.launch();
const out: { lcp: number; cls: number; inp: number }[] = [];
try {
  for (let i = 0; i < runs; i++) {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 15) Chrome/131 Mobile Safari/537.36',
    });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await page.addInitScript(`${vitals};
      window.__v = {};
      webVitals.onLCP((m) => { window.__v.lcp = m.value; const a = m.attribution || {}; window.__v.lcpWhy = (a.target || '?') + ' ttfb ' + Math.round(a.timeToFirstByte || 0) + ' loadDelay ' + Math.round(a.resourceLoadDelay || 0) + ' loadTime ' + Math.round(a.resourceLoadDuration || 0) + ' renderDelay ' + Math.round(a.elementRenderDelay || 0); }, { reportAllChanges: true });
      webVitals.onCLS((m) => (window.__v.cls = m.value), { reportAllChanges: true });
      webVitals.onINP((m) => (window.__v.inp = m.value), { reportAllChanges: true });`);
    await page.goto(SITE, { waitUntil: 'load' });
    await page.locator('nav.tabs').waitFor();
    // Real interactions: tap the amount, type it, toggle the pass phrase, switch tabs.
    await page.getByLabel('Amount in USDC').tap();
    await page.keyboard.type('12.5', { delay: 80 });
    await page.locator('label.toggle input').tap();
    await page.locator('nav.tabs a', { hasText: 'Wallet' }).tap();
    await page.locator('nav.tabs a', { hasText: 'Pay' }).tap();
    await page.waitForTimeout(1000);
    // Hiding the page makes web-vitals report final values.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(300);
    const v = (await page.evaluate(() => (window as unknown as { __v: Record<string, number> }).__v)) as { lcp: number; cls: number; inp: number; lcpWhy?: string };
    out.push({ lcp: v.lcp ?? NaN, cls: v.cls ?? 0, inp: v.inp ?? NaN });
    console.log(`run ${i + 1}: LCP ${Math.round(v.lcp)} ms, INP ${Math.round(v.inp)} ms, CLS ${(v.cls ?? 0).toFixed(3)} | LCP ${v.lcpWhy}`);
    await ctx.close();
  }
  const lcp = p75(out.map((o) => o.lcp));
  const inp = p75(out.map((o) => o.inp));
  const cls = p75(out.map((o) => o.cls));
  console.log(`p75 of ${runs}: LCP ${Math.round(lcp)} ms (target 2500), INP ${Math.round(inp)} ms (target 200), CLS ${cls.toFixed(3)} (target 0.1)`);
  console.log(lcp <= 2500 && inp <= 200 && cls <= 0.1 ? 'PASS all three' : 'FAIL');
} finally {
  await browser.close();
}

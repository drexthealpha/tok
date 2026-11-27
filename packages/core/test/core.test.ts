import { describe, expect, it } from 'vitest';
import { address } from '@solana/kit';
import {
  ALLOWED_PROGRAMS,
  checkAllowed,
  debitedOwner,
  findLinks,
  formatAmount,
  inAppBrowser,
  isPayLink,
  makePayLink,
  newClaimSeed,
  newPassPhrase,
  openInBrowser,
  openSeed,
  parseAmount,
  previewTarget,
  readLinkSecret,
  sealSeed,
  splitExact,
  summarise,
  USDC_MINT,
} from '../src';

// Fast Argon2id settings for CI; the real settings are timed on a phone.
const FAST = { memorySizeKiB: 1024, iterations: 1, parallelism: 1 } as const;

describe('pay link (part 4)', () => {
  it('puts the claim key only after "#" and reads it back', () => {
    const seed = newClaimSeed();
    const link = makePayLink('https://tok.example', { kind: 'plain', seed });
    const u = new URL(link);
    expect(u.pathname).toBe('/c');
    expect(u.search).toBe('');
    const back = readLinkSecret(u.hash);
    expect(back?.kind).toBe('plain');
    expect(back && back.kind === 'plain' && Buffer.from(back.seed).equals(Buffer.from(seed))).toBe(true);
  });

  it('refuses a broken secret', () => {
    expect(readLinkSecret('#kabc')).toBeNull();
    expect(readLinkSecret('')).toBeNull();
    expect(readLinkSecret('#zzzz')).toBeNull();
  });
});

describe('pass phrase (part 5)', () => {
  it('encrypts and decrypts with the right phrase', async () => {
    const seed = newClaimSeed();
    const phrase = newPassPhrase();
    expect(phrase.split(' ')).toHaveLength(4);
    const sealed = await sealSeed(seed, phrase, FAST);
    const link = makePayLink('https://tok.example', { kind: 'locked', sealed });
    const back = readLinkSecret(new URL(link).hash);
    expect(back?.kind).toBe('locked');
    if (back?.kind !== 'locked') throw new Error('expected locked');
    const opened = await openSeed(back.sealed, `  ${phrase.toUpperCase()} `, FAST);
    expect(Buffer.from(opened).equals(Buffer.from(seed))).toBe(true);
  });

  it('fails with a wrong phrase', async () => {
    const sealed = await sealSeed(newClaimSeed(), 'apple river stone cloud', FAST);
    await expect(openSeed(sealed, 'apple river stone crowd', FAST)).rejects.toThrow('Wrong pass phrase');
  });

  it('the link alone does not hold the claim key', async () => {
    const seed = newClaimSeed();
    const sealed = await sealSeed(seed, 'apple river stone cloud', FAST);
    const hex = Buffer.from(sealed).toString('hex');
    expect(hex.includes(Buffer.from(seed).toString('hex'))).toBe(false);
  });
});

describe('amounts', () => {
  it('parses and formats USDC', () => {
    expect(parseAmount('12.5')).toBe(12_500_000n);
    expect(parseAmount('0,25')).toBe(250_000n);
    expect(() => parseAmount('0')).toThrow();
    expect(() => parseAmount('1.0000001')).toThrow();
    expect(() => parseAmount('abc')).toThrow();
    expect(formatAmount(12_500_000n)).toBe('12.50');
    expect(formatAmount(5_000_000n)).toBe('5');
  });
});

describe('split (part 11)', () => {
  it('adds up exactly to the total', () => {
    for (const [total, n] of [
      [10_000_000n, 3],
      [1n, 4],
      [7_777_777n, 7],
      [100n, 1],
    ] as const) {
      const parts = splitExact(total, n);
      expect(parts).toHaveLength(n);
      expect(parts.reduce((a, b) => a + b, 0n)).toBe(total);
      expect(Number(parts[0]! - parts[n - 1]!)).toBeLessThanOrEqual(1);
    }
    expect(() => splitExact(10n, 0)).toThrow();
  });
});

describe('allow list (part 3)', () => {
  it('refuses a program that is not on the list', () => {
    const other = address('BPFLoaderUpgradeab1e11111111111111111111111');
    expect(checkAllowed([ALLOWED_PROGRAMS[0]!]).ok).toBe(true);
    const r = checkAllowed([ALLOWED_PROGRAMS[0]!, other]);
    expect(r.ok).toBe(false);
    expect(r.refused).toEqual([other]);
  });
});

describe('refund address (part 16)', () => {
  it('is the owner of the debited token account, not the fee payer', () => {
    const payer = 'Payer1111111111111111111111111111111111111';
    const merchant = 'Merch111111111111111111111111111111111111';
    const feePayer = 'ByWbpvCjdgiUdamJ7t47toUMreqapqgPcBfjyTkEcNX2';
    const meta = {
      preTokenBalances: [
        { accountIndex: 1, mint: USDC_MINT, owner: payer, uiTokenAmount: { amount: '5000000' } },
        { accountIndex: 2, mint: USDC_MINT, owner: merchant, uiTokenAmount: { amount: '0' } },
      ],
      postTokenBalances: [
        { accountIndex: 1, mint: USDC_MINT, owner: payer, uiTokenAmount: { amount: '3000000' } },
        { accountIndex: 2, mint: USDC_MINT, owner: merchant, uiTokenAmount: { amount: '2000000' } },
      ],
    };
    const d = debitedOwner(meta, USDC_MINT);
    expect(d.owner).toBe(payer);
    expect(d.owner).not.toBe(feePayer);
    expect(d.amount).toBe(2_000_000n);
  });

  it('throws when nothing was debited', () => {
    expect(() => debitedOwner({ preTokenBalances: [], postTokenBalances: [] }, USDC_MINT)).toThrow();
  });
});

describe('link previews (part 13)', () => {
  const hosts = ['tok.example'];
  it('never sends a pay link', () => {
    const link = makePayLink('https://tok.example', { kind: 'plain', seed: newClaimSeed() });
    expect(isPayLink(link, hosts)).toBe(true);
    expect(previewTarget(link, hosts)).toBeNull();
  });
  it('removes the part after "#" from any other link', () => {
    expect(previewTarget('https://news.example/a?b=1#secret', hosts)).toBe('https://news.example/a?b=1');
    expect(previewTarget('javascript:alert(1)', hosts)).toBeNull();
  });
  it('finds links in a message', () => {
    expect(findLinks('see https://a.example/x, and http://b.example.')).toEqual([
      'https://a.example/x',
      'http://b.example',
    ]);
  });
});

describe('in-app browsers (part 4)', () => {
  it('detects chat apps', () => {
    expect(inAppBrowser('Mozilla/5.0 (Linux; Android 14; wv) WhatsApp/2.24')).toBe('WhatsApp');
    expect(inAppBrowser('Mozilla/5.0 (iPhone) Telegram-iOS')).toBe('Telegram');
    expect(inAppBrowser('Mozilla/5.0 (Linux; Android 14) Chrome/131 Mobile Safari/537.36')).toBeNull();
  });
  it('never puts the secret in the path or query on Android', () => {
    const href = 'https://tok.example/c#ksecret';
    const o = openInBrowser(href, 'Android');
    expect(o.needsPaste).toBe(true);
    expect(o.url.includes('ksecret')).toBe(false);
    const i = openInBrowser(href, 'iPhone');
    expect(i.url).toBe('x-safari-https://tok.example/c#ksecret');
  });
});

describe('run times (part 4)', () => {
  it('prints runs, median and slowest', () => {
    const s = summarise(
      [
        { kind: 'pay', ms: 900, signature: 'a', at: '' },
        { kind: 'pay', ms: 1500, signature: 'b', at: '' },
        { kind: 'pay', ms: 1100, signature: 'c', at: '' },
        { kind: 'claim', ms: 2000, signature: 'd', at: '' },
      ],
      'pay',
    );
    expect(s).toEqual({ runs: 3, median: 1100, slowest: 1500 });
  });
});

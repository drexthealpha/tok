// Property-based tests (fast-check): rules that must hold for any input.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { address } from '@solana/kit';
import {
  ALLOWED_PROGRAMS,
  checkAllowed,
  formatAmount,
  makePayLink,
  parseAmount,
  previewTarget,
  readLinkSecret,
  splitExact,
} from '../src';

describe('properties', () => {
  it('a split always adds up exactly to the total, with shares at most 1 unit apart', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10n ** 15n }), fc.integer({ min: 1, max: 50 }), (total, n) => {
        const parts = splitExact(total, n);
        expect(parts.reduce((a, b) => a + b, 0n)).toBe(total);
        expect(parts[0]! - parts[n - 1]!).toBeLessThanOrEqual(1n);
      }),
    );
  });

  it('formatting then parsing an amount gives the same base units', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: 10n ** 15n }), (units) => {
        expect(parseAmount(formatAmount(units))).toBe(units);
      }),
    );
  });

  it('any claim key survives the link round trip, and only after "#"', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 32, maxLength: 32 }), (seed) => {
        const link = new URL(makePayLink('https://tok.example/tok', { kind: 'plain', seed }));
        expect(link.search).toBe('');
        const back = readLinkSecret(link.hash);
        expect(back?.kind === 'plain' && Buffer.from(back.seed).equals(Buffer.from(seed))).toBe(true);
      }),
    );
  });

  it('a preview target never carries "#" and never points at a pay host', () => {
    fc.assert(
      fc.property(fc.webUrl({ withFragments: true, withQueryParameters: true }), (url) => {
        const t = previewTarget(url, ['tok.example']);
        if (t !== null) {
          expect(t.includes('#')).toBe(false);
          expect(new URL(t).host).not.toBe('tok.example');
        }
      }),
    );
  });

  it('a program outside the allow list is always refused', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 32, maxLength: 32 }), (bytes) => {
        const a = address(encode(bytes));
        const allowed = ALLOWED_PROGRAMS.includes(a);
        expect(checkAllowed([a]).ok).toBe(allowed);
      }),
    );
  });
});

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function encode(b: Uint8Array): string {
  let n = 0n;
  for (const x of b) n = n * 256n + BigInt(x);
  let s = '';
  while (n > 0n) {
    s = ALPHABET[Number(n % 58n)] + s;
    n /= 58n;
  }
  for (const x of b) {
    if (x) break;
    s = '1' + s;
  }
  return s;
}

import { USDC_DECIMALS } from './constants';

/** "12.5" -> 12500000n. Throws on bad input. */
export function parseAmount(text: string, decimals = USDC_DECIMALS): bigint {
  const t = text.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) throw new Error('Type an amount like 5 or 2.50');
  const [whole, frac = ''] = t.split('.');
  if (frac.length > decimals) throw new Error(`At most ${decimals} decimals`);
  const v = BigInt(whole!) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, '0') || '0');
  if (v <= 0n) throw new Error('Amount must be above zero');
  return v;
}

export function formatAmount(units: bigint, decimals = USDC_DECIMALS): string {
  const neg = units < 0n;
  const u = neg ? -units : units;
  const d = 10n ** BigInt(decimals);
  const whole = u / d;
  const frac = (u % d).toString().padStart(decimals, '0').replace(/0+$/, '');
  const s = frac.length ? `${whole}.${frac.length < 2 ? frac.padEnd(2, '0') : frac}` : `${whole}`;
  return neg ? `-${s}` : s;
}

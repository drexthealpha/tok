/**
 * Split a total (in token base units) across members so the parts add up
 * exactly to the total. The first members take the remainder, one unit each.
 */
export function splitExact(total: bigint, members: number): bigint[] {
  if (members < 1) throw new Error('Pick at least one member');
  if (total < 0n) throw new Error('Total must not be negative');
  const n = BigInt(members);
  const base = total / n;
  const rest = total % n;
  return Array.from({ length: members }, (_, i) => base + (BigInt(i) < rest ? 1n : 0n));
}

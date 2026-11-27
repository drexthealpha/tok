/** The two logged times of each run, kept on the device. */
export type RunKind = 'pay' | 'claim';
export interface RunTime {
  kind: RunKind;
  ms: number;
  signature: string;
  at: string;
}

export function median(xs: readonly number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function summarise(runs: readonly RunTime[], kind: RunKind) {
  const xs = runs.filter((r) => r.kind === kind).map((r) => r.ms);
  return { runs: xs.length, median: median(xs), slowest: xs.length ? Math.max(...xs) : NaN };
}

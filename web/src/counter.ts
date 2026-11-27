/**
 * The on-screen action counter for the demo video. Shown only with ?count
 * in the address. Each tap or prompt the person answers adds one.
 */
type Fn = (n: number) => void;
const subs = new Set<Fn>();
export const counter = {
  value: 0,
  visible: typeof location !== 'undefined' && new URLSearchParams(location.search).has('count'),
  add(n = 1) {
    counter.value += n;
    subs.forEach((f) => f(counter.value));
  },
  subscribe(f: Fn) {
    subs.add(f);
    return () => subs.delete(f);
  },
};

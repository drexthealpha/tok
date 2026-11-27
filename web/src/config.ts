export const SERVER = (import.meta.env.VITE_SERVER as string | undefined) ?? 'https://tok-server.onrender.com';
export const RPC_URL = (import.meta.env.VITE_RPC as string | undefined) ?? 'https://api.devnet.solana.com';
/** Base path of the site, e.g. "/tok/" on GitHub Pages. */
export const BASE = import.meta.env.BASE_URL;
export const ORIGIN = typeof location === 'undefined' ? 'https://drexthealpha.github.io' : location.origin;
export const SITE = ORIGIN + BASE.replace(/\/$/, '');
export const EXPLORER = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
export const EXPLORER_ADDR = (a: string) => `https://explorer.solana.com/address/${a}?cluster=devnet`;
export const FAUCET = 'https://faucet.circle.com';

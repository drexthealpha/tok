/**
 * Pollar: for a person whose browser cannot make a passkey (for example a
 * chat app's own browser), Tok offers sign-in by email through Pollar. Pollar
 * gives them a managed Solana wallet (devnet in Pollar's test mode); Tok
 * claims the link into it, and Pollar sends from it with fees paid by Pollar.
 */
import type { PollarClient, AuthState } from '@pollar/core';
import { USDC_MINT } from '@tok/core';

const KEY = import.meta.env.VITE_POLLAR_KEY as string | undefined;
export const pollarReady = !!KEY;

let client: PollarClient | null = null;
async function pc(): Promise<PollarClient> {
  if (!KEY) throw new Error('Pollar is not set up on this build');
  if (!client) {
    const { PollarClient } = await import('@pollar/core');
    client = new PollarClient({ apiKey: KEY });
  }
  return client;
}

function waitFor(c: PollarClient, ok: (s: AuthState) => boolean, ms = 60_000): Promise<AuthState> {
  return new Promise((resolve, reject) => {
    const now = c.getAuthState();
    if (ok(now)) return resolve(now);
    const t = setTimeout(() => {
      off();
      reject(new Error('Pollar did not answer in time'));
    }, ms);
    const off = c.onAuthStateChange((s) => {
      if (s.step === 'error') {
        clearTimeout(t);
        off();
        reject(new Error(s.message));
      } else if (ok(s)) {
        clearTimeout(t);
        off();
        resolve(s);
      }
    });
  });
}

/** Step 1: Pollar emails a code to this address. */
export async function sendCode(email: string): Promise<void> {
  const c = await pc();
  c.beginEmailLogin();
  await waitFor(c, (s) => s.step === 'entering_email' || s.step === 'entering_code', 30_000).catch(() => undefined);
  c.sendEmailCode(email.trim());
  await waitFor(c, (s) => s.step === 'entering_code');
}

/** Step 2: the person types the code; returns their Pollar Solana wallet. */
export async function verifyCode(code: string): Promise<string> {
  const c = await pc();
  c.verifyEmailCode(code.trim());
  await waitFor(c, (s) => s.step === 'authenticated');
  return solanaAddress();
}

export async function signedIn(): Promise<boolean> {
  if (!KEY) return false;
  const c = await pc();
  return c.getAuthState().step === 'authenticated';
}

/** The Pollar-managed Solana wallet of the signed-in person. */
export async function solanaAddress(): Promise<string> {
  const c = await pc();
  for (let i = 0; i < 20; i++) {
    const w = c.getWallets().find((x) => x.chain === 'SOLANA');
    if (w?.address) {
      localStorage.setItem('tok.pollar', w.address);
      return w.address;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('Pollar has not made the Solana wallet yet');
}

export function savedPollarWallet(): string | null {
  return localStorage.getItem('tok.pollar');
}

/** Send USDC (base units) from the Pollar wallet; Pollar pays the fee. */
export async function sendFromPollar(destination: string, units: bigint): Promise<string> {
  const c = await pc();
  const out = await c.sendPayment({ chain: 'SOLANA', destination, amount: units.toString(), mint: USDC_MINT });
  if (out.status === 'success' || out.status === 'pending') return out.hash;
  throw new Error(`Pollar did not send: ${out.status}`);
}

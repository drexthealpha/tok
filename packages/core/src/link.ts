import { getBase58Decoder, getBase58Encoder } from '@solana/kit';

/** A pay link holds the claim key's secret after "#", plain or locked. */
export type LinkSecret =
  | { kind: 'plain'; seed: Uint8Array }
  | { kind: 'locked'; sealed: Uint8Array };

const PLAIN_PREFIX = 'k';
const LOCKED_PREFIX = 'p';
export const CLAIM_PATH = '/c';

export function newClaimSeed(): Uint8Array {
  const seed = new Uint8Array(32);
  crypto.getRandomValues(seed);
  return seed;
}

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(text: string): Uint8Array {
  const s = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Build the link. Only the part after "#" carries the secret. */
export function makePayLink(origin: string, secret: LinkSecret): string {
  const base = origin.replace(/\/+$/, '') + CLAIM_PATH;
  if (secret.kind === 'plain') {
    return `${base}#${PLAIN_PREFIX}${getBase58Decoder().decode(secret.seed)}`;
  }
  return `${base}#${LOCKED_PREFIX}${b64url(secret.sealed)}`;
}

/** Read the secret from the part after "#". Returns null when there is none. */
export function readLinkSecret(hash: string): LinkSecret | null {
  const h = hash.startsWith('#') ? hash.slice(1) : hash;
  if (h.length < 2) return null;
  const body = h.slice(1);
  try {
    if (h[0] === PLAIN_PREFIX) {
      const seed = new Uint8Array(getBase58Encoder().encode(body));
      return seed.length === 32 ? { kind: 'plain', seed } : null;
    }
    if (h[0] === LOCKED_PREFIX) {
      const sealed = fromB64url(body);
      return sealed.length > 28 ? { kind: 'locked', sealed } : null;
    }
  } catch {
    return null;
  }
  return null;
}

export { b64url, fromB64url };

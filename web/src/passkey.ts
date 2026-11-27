/**
 * Passkeys (WebAuthn, P-256). The passkey never leaves the phone; Tok keeps
 * only its credential id and public key in this browser.
 */
import { p256 } from '@noble/curves/nist.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { getSecp256r1WebAuthnSigningFn, type SigningFn } from '@swig-wallet/lib';
import { swigAccountFor } from '@tok/core';
import { accountData } from './chain';

export interface Passkey {
  credentialId: string; // base64url
  publicKey: string; // hex, 33-byte compressed P-256 key
}

const STORE = 'tok.passkey';

/** Stands in for a passkey inside the Android app, where the phone's wallet signs. */
export const MWA_MARK: Passkey = { credentialId: 'mwa', publicKey: '' };

export function savedPasskey(): Passkey | null {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as Passkey) : null;
  } catch {
    return null;
  }
}

export function savePasskey(p: Passkey) {
  localStorage.setItem(STORE, JSON.stringify(p));
}

export const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
export const unhex = (h: string) => Uint8Array.from(h.match(/../g)!.map((x) => parseInt(x, 16)));
const b64u = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b as ArrayBuffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s: string) => {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(t + '='.repeat((4 - (t.length % 4)) % 4)), (c) => c.charCodeAt(0));
};

export function publicKeyBytes(p: Passkey): Uint8Array {
  return unhex(p.publicKey);
}

/** Can this browser create a passkey on this phone? */
export async function passkeysAvailable(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) return false;
  try {
    const pkc = PublicKeyCredential as unknown as {
      getClientCapabilities?: () => Promise<Record<string, boolean>>;
      isUserVerifyingPlatformAuthenticatorAvailable: () => Promise<boolean>;
    };
    if (pkc.getClientCapabilities) {
      const caps = await pkc.getClientCapabilities();
      if (caps.passkeyPlatformAuthenticator || caps.userVerifyingPlatformAuthenticator) return true;
    }
    return await pkc.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/** One face or fingerprint prompt. */
export async function createPasskey(): Promise<Passkey> {
  const userId = crypto.getRandomValues(new Uint8Array(16));
  const cred = (await navigator.credentials.create({
    publicKey: {
      rp: { name: 'Tok', id: location.hostname },
      user: { id: userId, name: `Tok wallet ${new Date().toISOString().slice(0, 10)}`, displayName: 'Tok wallet' },
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      timeout: 120_000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('No passkey was made');
  const res = cred.response as AuthenticatorAttestationResponse;
  const spki = res.getPublicKey?.();
  if (!spki) throw new Error('This browser does not give the passkey key');
  const uncompressed = new Uint8Array(spki).slice(-65);
  const compressed = p256.Point.fromBytes(uncompressed).toBytes(true);
  const p = { credentialId: b64u(cred.rawId), publicKey: hex(compressed) };
  savePasskey(p);
  return p;
}

/** Signs a Swig message with the passkey (one face or fingerprint prompt). */
export function signer(p: Passkey): SigningFn {
  return getSecp256r1WebAuthnSigningFn({
    rpId: location.hostname,
    allowCredentials: [{ type: 'public-key', id: unb64u(p.credentialId) }],
    userVerification: 'required',
    timeout: 120_000,
  });
}

/**
 * Use a passkey already on this phone (for example one synced from another
 * device): sign a random challenge, recover the two possible public keys,
 * and keep the one that owns a Tok wallet.
 */
export async function usePasskeyOnThisPhone(): Promise<Passkey> {
  const cred = (await navigator.credentials.get({
    publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), rpId: location.hostname, userVerification: 'required' },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('No passkey chosen');
  const r = cred.response as AuthenticatorAssertionResponse;
  const msg = new Uint8Array([...new Uint8Array(r.authenticatorData), ...sha256(new Uint8Array(r.clientDataJSON))]);
  const sig = p256.Signature.fromBytes(new Uint8Array(r.signature), 'der');
  for (const bit of [0, 1]) {
    let pk: Uint8Array;
    try {
      pk = sig.addRecoveryBit(bit).recoverPublicKey(sha256(msg)).toBytes(true);
    } catch {
      continue;
    }
    if (await accountData(await swigAccountFor(pk))) {
      const p = { credentialId: b64u(cred.rawId), publicKey: hex(pk) };
      savePasskey(p);
      return p;
    }
  }
  throw new Error('No Tok wallet belongs to this passkey');
}

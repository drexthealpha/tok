/**
 * Proof that a signed-in chat user owns a wallet.
 *  - passkey: a WebAuthn assertion over sha256("tok-chat:" + user id); the
 *    wallet is the Swig wallet of that passkey.
 *  - ed25519: a Mobile Wallet Adapter wallet signs "tok-chat:" + user id;
 *    the wallet is that address.
 */
import { p256 } from '@noble/curves/nist.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { getAddressEncoder, isAddress, type Address } from '@solana/kit';
import { swigAccountFor, walletAddressFor } from '@tok/core';

export type Proof =
  | {
      kind: 'passkey';
      publicKey: string; // hex, compressed P-256
      authenticatorData: string; // base64url
      clientDataJSON: string; // base64url
      signature: string; // base64url, DER
    }
  | { kind: 'ed25519'; wallet: string; signature: string /* base64url */ };

const fromB64u = (s: string) => new Uint8Array(Buffer.from(s, 'base64url'));
const unhex = (h: string) => new Uint8Array(Buffer.from(h, 'hex'));

export function challengeFor(userId: string): Uint8Array {
  return sha256(new TextEncoder().encode(`tok-chat:${userId}`));
}

export async function walletFromProof(proof: Proof, userId: string, origins: string[]): Promise<Address> {
  if (proof.kind === 'passkey') {
    const pub = unhex(proof.publicKey);
    if (pub.length !== 33) throw new Error('Bad passkey key');
    const authData = fromB64u(proof.authenticatorData);
    const clientJson = fromB64u(proof.clientDataJSON);
    const client = JSON.parse(new TextDecoder().decode(clientJson)) as { type: string; challenge: string; origin: string };
    if (client.type !== 'webauthn.get') throw new Error('Not an assertion');
    if (client.challenge !== Buffer.from(challengeFor(userId)).toString('base64url')) throw new Error('Wrong challenge');
    if (!origins.includes(client.origin)) throw new Error('Wrong origin');
    if (authData.length < 37 || (authData[32]! & 0x01) === 0) throw new Error('User not present');
    const signed = new Uint8Array(authData.length + 32);
    signed.set(authData, 0);
    signed.set(sha256(clientJson), authData.length);
    const ok = p256.verify(fromB64u(proof.signature), signed, pub, { format: 'der', prehash: true, lowS: false });
    if (!ok) throw new Error('Bad passkey signature');
    return walletAddressFor(await swigAccountFor(pub));
  }
  if (!isAddress(proof.wallet)) throw new Error('Bad wallet');
  const key = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(getAddressEncoder().encode(proof.wallet)),
    { name: 'Ed25519' },
    false,
    ['verify'],
  );
  const msg = new TextEncoder().encode(`tok-chat:${userId}`);
  const ok = await crypto.subtle.verify('Ed25519', key, fromB64u(proof.signature), msg);
  if (!ok) throw new Error('Bad wallet signature');
  return proof.wallet;
}

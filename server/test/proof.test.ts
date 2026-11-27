// Part 8: chat sign-in. The server links a Supabase user to a wallet only
// with a valid passkey assertion or wallet signature over that user's id.
import { describe, expect, it } from 'vitest';
import { generateKeyPairSigner, getAddressDecoder } from '@solana/kit';
import { p256 } from '@noble/curves/nist.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { swigAccountFor, walletAddressFor } from '@tok/core';
import { challengeFor, walletFromProof } from '../src/proof';

const ORIGIN = 'https://drexthealpha.github.io';
const b64u = (b: Uint8Array) => Buffer.from(b).toString('base64url');

function assertion(secret: Uint8Array, challenge: Uint8Array, origin = ORIGIN) {
  const clientDataJSON = new TextEncoder().encode(
    JSON.stringify({ type: 'webauthn.get', challenge: b64u(challenge), origin, crossOrigin: false }),
  );
  const authData = new Uint8Array(37);
  authData.set(sha256(new TextEncoder().encode('drexthealpha.github.io')), 0);
  authData[32] = 0x05;
  const msg = new Uint8Array([...authData, ...sha256(clientDataJSON)]);
  const sig = p256.sign(msg, secret, { prehash: true, format: 'der' });
  return { authenticatorData: b64u(authData), clientDataJSON: b64u(clientDataJSON), signature: b64u(sig) };
}

describe('wallet proof (part 8)', () => {
  const user = '6f9619ff-8b86-d011-b42d-00cf4fc964ff';
  const secret = p256.utils.randomSecretKey();
  const pub = p256.getPublicKey(secret, true);
  const publicKey = Buffer.from(pub).toString('hex');

  it('accepts a passkey assertion over the user id and returns its wallet', async () => {
    const w = await walletFromProof({ kind: 'passkey', publicKey, ...assertion(secret, challengeFor(user)) }, user, [ORIGIN]);
    expect(w).toBe(await walletAddressFor(await swigAccountFor(pub)));
  });

  it('refuses another user id, another origin, or another key', async () => {
    await expect(walletFromProof({ kind: 'passkey', publicKey, ...assertion(secret, challengeFor('someone-else')) }, user, [ORIGIN])).rejects.toThrow();
    await expect(walletFromProof({ kind: 'passkey', publicKey, ...assertion(secret, challengeFor(user), 'https://evil.example') }, user, [ORIGIN])).rejects.toThrow();
    const other = p256.utils.randomSecretKey();
    await expect(walletFromProof({ kind: 'passkey', publicKey, ...assertion(other, challengeFor(user)) }, user, [ORIGIN])).rejects.toThrow();
  });

  it('accepts a wallet signature (Mobile Wallet Adapter) and refuses a wrong one', async () => {
    const kp = await generateKeyPairSigner();
    const msg = new TextEncoder().encode(`tok-chat:${user}`);
    const [sigs] = await kp.signMessages([{ content: msg, signatures: {} }]);
    const sig = sigs![kp.address]!;
    expect(await walletFromProof({ kind: 'ed25519', wallet: kp.address, signature: b64u(sig) }, user, [ORIGIN])).toBe(kp.address);
    const other = getAddressDecoder().decode(new Uint8Array(32).fill(7));
    await expect(walletFromProof({ kind: 'ed25519', wallet: other, signature: b64u(sig) }, user, [ORIGIN])).rejects.toThrow();
  });
});

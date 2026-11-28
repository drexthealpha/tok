/**
 * Passkey signing for Swig in its raw WebAuthn form: the exact
 * clientDataJSON the browser signed goes on chain, so the signature checks
 * out whatever extra keys the browser puts in it.
 */
import { p256 } from '@noble/curves/nist.js';
import { sha256 } from '@noble/hashes/sha2.js';
import type { SigningFn } from '@swig-wallet/lib';
import { rawWebAuthnPrefix } from '@tok/core';

export function rawWebAuthnSigner(credentialId: Uint8Array, rpId: string): SigningFn {
  return async (message: Uint8Array) => {
    const cred = (await navigator.credentials.get({
      publicKey: {
        challenge: message as BufferSource,
        rpId,
        allowCredentials: [{ type: 'public-key', id: credentialId as BufferSource }],
        userVerification: 'required',
        timeout: 120_000,
      },
    })) as PublicKeyCredential | null;
    if (!cred) throw new Error('No passkey signature');
    const r = cred.response as AuthenticatorAssertionResponse;
    const authData = new Uint8Array(r.authenticatorData);
    const clientDataJSON = new Uint8Array(r.clientDataJSON);
    const signature = lowSCompact(new Uint8Array(r.signature));
    const signed = new Uint8Array(authData.length + 32);
    signed.set(authData, 0);
    signed.set(sha256(clientDataJSON), authData.length);
    return { signature, prefix: rawWebAuthnPrefix(authData, clientDataJSON), message: signed };
  };
}

/** DER signature to 64-byte r || s with low S, as the secp256r1 precompile wants. */
export function lowSCompact(der: Uint8Array): Uint8Array {
  const sig = p256.Signature.fromBytes(der, 'der');
  const n = p256.Point.Fn.ORDER;
  const s = sig.s > n >> 1n ? n - sig.s : sig.s;
  const out = new Uint8Array(64);
  const put = (x: bigint, at: number) => {
    for (let i = 31; i >= 0; i--) {
      out[at + i] = Number(x & 0xffn);
      x >>= 8n;
    }
  };
  put(sig.r, 0);
  put(s, 32);
  return out;
}

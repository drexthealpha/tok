import { p256 } from '@noble/curves/nist.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { getWebAuthnPrefix, type SigningFn } from '@swig-wallet/lib';

/**
 * A software passkey: a P-256 key that answers exactly like a WebAuthn
 * authenticator (authenticatorData, clientDataJSON with the message as the
 * challenge, signature over authenticatorData || sha256(clientDataJSON)).
 */
export function softPasskey(origin = 'https://tok.test', rpId = 'tok.test') {
  const secret = p256.utils.randomSecretKey();
  const publicKey = p256.getPublicKey(secret, true); // 33-byte compressed
  let counter = 0;
  const signingFn: SigningFn = async (message: Uint8Array) => {
    counter += 1;
    const challenge = Buffer.from(message).toString('base64url');
    const clientDataJSON = new TextEncoder().encode(
      JSON.stringify({ type: 'webauthn.get', challenge, origin, crossOrigin: false }),
    );
    const authData = new Uint8Array(37);
    authData.set(sha256(new TextEncoder().encode(rpId)), 0);
    authData[32] = 0x05; // user present + user verified
    new DataView(authData.buffer).setUint32(33, counter, false);
    const signed = new Uint8Array(authData.length + 32);
    signed.set(authData, 0);
    signed.set(sha256(clientDataJSON), authData.length);
    const sig = p256.sign(signed, secret, { lowS: true, prehash: true, format: 'compact' });
    const prefix = await getWebAuthnPrefix(clientDataJSON, authData);
    return { signature: new Uint8Array(sig), prefix, message: signed };
  };
  return { publicKey, signingFn };
}

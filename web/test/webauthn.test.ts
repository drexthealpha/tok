// Passkey signatures for Swig: DER to low-S compact, and the raw form.
import { describe, expect, it } from 'vitest';
import { p256 } from '@noble/curves/nist.js';
import { rawWebAuthnPrefix } from '@tok/core';
import { lowSCompact } from '../src/webauthn';

describe('passkey signature format (part 2)', () => {
  it('turns any DER signature into a low-S 64-byte signature that verifies', () => {
    const sk = p256.utils.randomSecretKey();
    const pk = p256.getPublicKey(sk);
    const n = p256.Point.Fn.ORDER;
    let sawHigh = false;
    for (let i = 0; i < 16; i++) {
      const msg = new TextEncoder().encode(`message ${i}`);
      const der = p256.sign(msg, sk, { lowS: false, format: 'der' });
      sawHigh ||= p256.Signature.fromBytes(der, 'der').s > n >> 1n;
      const compact = lowSCompact(der);
      expect(compact.length).toBe(64);
      expect(p256.verify(compact, msg, pk, { lowS: true })).toBe(true);
    }
    expect(sawHigh).toBe(true);
  });

  it('lays out the raw WebAuthn prefix as Swig expects (kind 2)', () => {
    const p = rawWebAuthnPrefix(new Uint8Array([1, 2, 3]), new TextEncoder().encode('{}'));
    expect([...p]).toEqual([2, 0, 3, 0, 1, 2, 3, 2, 0, 123, 125]);
  });
});

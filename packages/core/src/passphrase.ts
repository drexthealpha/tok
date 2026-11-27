import { argon2id } from 'hash-wasm';
import { wordlist } from '@scure/bip39/wordlists/english.js';

/**
 * Argon2id settings. Chosen so one try takes about one second on the
 * slowest test phone; the measured time is printed in the README.
 */
export interface Argon2Settings {
  memorySizeKiB: number;
  iterations: number;
  parallelism: number;
}

export const ARGON2_SETTINGS: Argon2Settings = {
  memorySizeKiB: 64 * 1024,
  iterations: 3,
  parallelism: 1,
};

export const PASS_WORDS = 4;

/** Four random words from the BIP39 English list (2,048 words). */
export function newPassPhrase(): string {
  const idx = new Uint16Array(PASS_WORDS);
  const out: string[] = [];
  // Rejection sampling keeps every word equally likely.
  while (out.length < PASS_WORDS) {
    crypto.getRandomValues(idx);
    for (const v of idx) {
      if (out.length < PASS_WORDS && v < 65536 - (65536 % wordlist.length)) {
        out.push(wordlist[v % wordlist.length]!);
      }
    }
  }
  return out.join(' ');
}

export function normalisePhrase(p: string): string {
  return p.trim().toLowerCase().split(/\s+/).join(' ');
}

async function deriveKey(
  phrase: string,
  salt: Uint8Array,
  settings: Argon2Settings = ARGON2_SETTINGS,
): Promise<CryptoKey> {
  const raw = await argon2id({
    password: normalisePhrase(phrase),
    salt,
    parallelism: settings.parallelism,
    iterations: settings.iterations,
    memorySize: settings.memorySizeKiB,
    hashLength: 32,
    outputType: 'binary',
  });
  return crypto.subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** sealed = salt(16) | iv(12) | AES-GCM(seed) */
export async function sealSeed(
  seed: Uint8Array,
  phrase: string,
  settings: Argon2Settings = ARGON2_SETTINGS,
): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(phrase, salt, settings);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, seed as BufferSource));
  const out = new Uint8Array(16 + 12 + ct.length);
  out.set(salt, 0);
  out.set(iv, 16);
  out.set(ct, 28);
  return out;
}

/** Throws when the phrase is wrong. */
export async function openSeed(
  sealed: Uint8Array,
  phrase: string,
  settings: Argon2Settings = ARGON2_SETTINGS,
): Promise<Uint8Array> {
  const salt = sealed.slice(0, 16);
  const iv = sealed.slice(16, 28);
  const ct = sealed.slice(28);
  const key = await deriveKey(phrase, salt, settings);
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct as BufferSource));
  } catch {
    throw new Error('Wrong pass phrase');
  }
}

/** Time one Argon2id try, in milliseconds. */
export async function timeOneTry(settings: Argon2Settings = ARGON2_SETTINGS): Promise<number> {
  const t0 = performance.now();
  await deriveKey('timing check words', new Uint8Array(16), settings);
  return performance.now() - t0;
}

import {
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  type Address,
} from '@solana/kit';
import { ALLOWED_PROGRAMS } from './constants';

/** Every program a wire transaction calls at the top level. */
export function programsCalled(wireBase64: string): Address[] {
  const bytes = getBase64Encoder().encode(wireBase64);
  const tx = getTransactionDecoder().decode(bytes);
  const msg = getCompiledTransactionMessageDecoder().decode(tx.messageBytes);
  const keys = msg.staticAccounts;
  const out = new Set<Address>();
  const indexes =
    'instructions' in msg
      ? msg.instructions.map((ix) => ix.programAddressIndex)
      : msg.instructionHeaders.map((h) => h.programAccountIndex);
  for (const i of indexes) {
    const k = keys[i];
    if (!k) throw new Error('Program index outside the static accounts');
    out.add(k);
  }
  return [...out];
}

export interface AllowResult {
  ok: boolean;
  refused: Address[];
}

export function checkAllowed(
  programs: readonly Address[],
  allowed: readonly Address[] = ALLOWED_PROGRAMS,
): AllowResult {
  const set = new Set(allowed);
  const refused = programs.filter((p) => !set.has(p));
  return { ok: refused.length === 0, refused };
}

/** Throws when the transaction calls a program outside the allow list. */
export function assertAllowed(wireBase64: string, allowed: readonly Address[] = ALLOWED_PROGRAMS) {
  const res = checkAllowed(programsCalled(wireBase64), allowed);
  if (!res.ok) throw new Error(`Program not allowed: ${res.refused.join(', ')}`);
}

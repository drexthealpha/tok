import {
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
} from '@solana/kit';
import { ALLOWED_PROGRAMS, checkAllowed, programsCalled } from '@tok/core';

export const MAX_TX_BYTES = 4096;

export class Refused extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/**
 * Check a transaction before the makers' fee payer signs it:
 * it must name that fee payer first, and call only allow-listed programs.
 */
export function vet(transactionBase64: string, feePayer: string, allowed = ALLOWED_PROGRAMS): void {
  if (typeof transactionBase64 !== 'string' || transactionBase64.length === 0) {
    throw new Refused('Send a base64 transaction');
  }
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(getBase64Encoder().encode(transactionBase64));
  } catch {
    throw new Refused('Not base64');
  }
  if (bytes.length > MAX_TX_BYTES) throw new Refused('Transaction too large');
  let first: string | undefined;
  try {
    const tx = getTransactionDecoder().decode(bytes);
    const msg = getCompiledTransactionMessageDecoder().decode(tx.messageBytes);
    first = msg.staticAccounts[0];
  } catch {
    throw new Refused('Not a Solana transaction');
  }
  if (first !== feePayer) throw new Refused('The fee payer must be the makers\' fee payer');
  const res = checkAllowed(programsCalled(transactionBase64), allowed);
  if (!res.ok) throw new Refused(`Program not on the allow list: ${res.refused.join(', ')}`, 403);
}

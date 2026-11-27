/**
 * Solana Pay transfer requests (solana:<recipient>?amount=..&spl-token=..&reference=..)
 * and merchant refunds. A passkey wallet pays from the Tok page, which puts
 * the reference on the transfer so the merchant view can find it.
 */
import { AccountRole, address, isAddress, type Address, type Instruction } from '@solana/kit';
import { formatAmount, parseAmount } from './amount';
import { MEMO_PROGRAM, USDC_MINT } from './constants';

export interface TransferRequest {
  recipient: Address;
  amount: bigint;
  splToken: Address;
  reference: Address;
  label?: string;
  message?: string;
}

export function transferRequestUrl(r: TransferRequest): string {
  const q = new URLSearchParams();
  q.set('amount', formatAmount(r.amount));
  q.set('spl-token', r.splToken);
  q.set('reference', r.reference);
  if (r.label) q.set('label', r.label);
  if (r.message) q.set('message', r.message);
  return `solana:${r.recipient}?${q.toString()}`;
}

export function parseTransferRequest(url: string): TransferRequest {
  if (!url.startsWith('solana:')) throw new Error('Not a Solana Pay link');
  const [rec, query = ''] = url.slice('solana:'.length).split('?');
  if (!rec || !isAddress(rec)) throw new Error('Bad recipient');
  const q = new URLSearchParams(query);
  const ref = q.get('reference');
  const token = q.get('spl-token') ?? USDC_MINT;
  if (!ref || !isAddress(ref)) throw new Error('This request has no reference');
  if (!isAddress(token)) throw new Error('Bad token');
  return {
    recipient: address(rec),
    amount: parseAmount(q.get('amount') ?? ''),
    splToken: address(token),
    reference: address(ref),
    label: q.get('label') ?? undefined,
    message: q.get('message') ?? undefined,
  };
}

/** Add the reference to an instruction as a read-only account, as the spec does. */
export function withReference(ix: Instruction, reference: Address): Instruction {
  return { ...ix, accounts: [...(ix.accounts ?? []), { address: reference, role: AccountRole.READONLY }] };
}

export function memoInstruction(text: string): Instruction {
  return { programAddress: MEMO_PROGRAM, accounts: [], data: new TextEncoder().encode(text) };
}

export const refundMemo = (paymentSignature: string) => `tok-refund:${paymentSignature}`;

/** True when a refund memo for this payment is already in the merchant's history. */
export function alreadyRefunded(history: readonly { memo?: string | null }[], paymentSignature: string): boolean {
  const tag = refundMemo(paymentSignature);
  return history.some((h) => (h.memo ?? '').includes(tag));
}

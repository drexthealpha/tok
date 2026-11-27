/**
 * Find who to refund for a payment: the owner of the token account that was
 * debited in that payment, read from the transaction's token balances.
 * Never the fee payer or any other signer, unless that signer owns the
 * debited token account.
 */
export interface TokenBalance {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount: { amount: string };
}

export interface PaymentMeta {
  preTokenBalances?: readonly TokenBalance[] | null;
  postTokenBalances?: readonly TokenBalance[] | null;
}

export interface Debit {
  owner: string;
  amount: bigint;
}

export function debitedOwner(meta: PaymentMeta, mint: string): Debit {
  const pre = meta.preTokenBalances ?? [];
  const post = meta.postTokenBalances ?? [];
  let best: Debit | null = null;
  for (const p of pre) {
    if (p.mint !== mint) continue;
    const after = post.find((q) => q.accountIndex === p.accountIndex);
    const before = BigInt(p.uiTokenAmount.amount);
    const now = after ? BigInt(after.uiTokenAmount.amount) : 0n;
    const delta = before - now;
    if (delta > 0n && p.owner && (!best || delta > best.amount)) {
      best = { owner: p.owner, amount: delta };
    }
  }
  if (!best) throw new Error('No token account of this mint was debited in that payment');
  return best;
}

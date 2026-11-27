import { useEffect, useState } from 'preact/hooks';
import { isAddress, type Address } from '@solana/kit';
import { formatAmount, parseAmount } from '@tok/core';
import { tokenBalance } from '../chain';
import { usdcAccount } from '../tok';
import { savedPollarWallet, sendFromPollar } from '../pollar';
import { EXPLORER_ADDR } from '../config';

/** The Pollar wallet made by email sign-in, if this browser has one. */
export function PollarWallet() {
  const addr = savedPollarWallet();
  const [bal, setBal] = useState<bigint | null>(null);
  const [to, setTo] = useState('');
  const [amt, setAmt] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (addr) usdcAccount(addr as Address).then(tokenBalance).then(setBal).catch(() => undefined);
  }, [addr, msg]);
  if (!addr) return null;
  return (
    <div class="card stack">
      <div class="small">Pollar wallet (email sign-in)</div>
      <div class="big">{bal === null ? '…' : formatAmount(bal)} USDC</div>
      <a class="mono" href={EXPLORER_ADDR(addr)} target="_blank" rel="noreferrer">{addr}</a>
      <input type="text" placeholder="Send to: Solana address" value={to} onInput={(e) => setTo((e.target as HTMLInputElement).value)} />
      <input type="text" inputMode="decimal" placeholder="USDC" value={amt} onInput={(e) => setAmt((e.target as HTMLInputElement).value)} />
      <button
        class="ghost"
        disabled={!to || !amt}
        onClick={async () => {
          try {
            if (!isAddress(to.trim())) throw new Error('That is not a Solana address');
            setMsg('Sending');
            const hash = await sendFromPollar(to.trim(), parseAmount(amt));
            setMsg(`Sent · ${hash.slice(0, 10)}… (fee paid by Pollar)`);
          } catch (e) {
            setMsg((e as Error).message);
          }
        }}
      >
        Send
      </button>
      {msg && <div class="small">{msg}</div>}
    </div>
  );
}

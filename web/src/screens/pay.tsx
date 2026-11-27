import { useState } from 'preact/hooks';
import { formatAmount, newPassPhrase, parseAmount } from '@tok/core';
import { useMe } from '../me';
import { pay, type PayResult } from '../tok';
import { counter } from '../counter';
import { EXPLORER, FAUCET } from '../config';

export const WARNING =
  'Anyone who can read this message can take the money before your contact does. For larger amounts, turn on a pass phrase and send it another way.';
export const WORDS_HINT = 'Send the 4 words by a different channel than the link: a phone call, or a different app.';

async function share(link: string): Promise<'shared' | 'needs-tap' | 'copied'> {
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
  if (nav.share) {
    try {
      await nav.share({ text: 'Tok: tap to receive USDC (devnet)', url: link });
      counter.add();
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'NotAllowedError') return 'needs-tap';
      if ((e as Error).name === 'AbortError') return 'needs-tap';
    }
  }
  await navigator.clipboard?.writeText(link).catch(() => undefined);
  return 'copied';
}

export function PayScreen() {
  const me = useMe();
  const [text, setText] = useState('');
  const [lock, setLock] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<PayResult | null>(null);
  const [shared, setShared] = useState<string | null>(null);

  let amount: bigint | null = null;
  let amountErr: string | null = null;
  if (text) {
    try {
      amount = parseAmount(text);
    } catch (e) {
      amountErr = (e as Error).message;
    }
  }
  const short = amount !== null && me.usdc !== null && me.wallet?.exists && amount > me.usdc;

  async function onPay() {
    if (!amount) return;
    counter.add();
    setErr(null);
    try {
      setBusy('Confirm with your face or fingerprint');
      const { passkey, wallet } = me.wallet?.exists && me.passkey ? { passkey: me.passkey, wallet: me.wallet } : await me.start();
      setBusy('Confirm with your face or fingerprint');
      const phrase = lock ? newPassPhrase() : undefined;
      const p = pay(passkey, wallet, amount, phrase);
      const r = await p.then((x) => {
        counter.add(); // the passkey prompt answered
        return x;
      });
      setBusy(null);
      setDone(r);
      setShared(await share(r.link));
      me.refresh();
    } catch (e) {
      setBusy(null);
      setErr((e as Error).message);
    }
  }

  if (done) {
    return (
      <div class="stack">
        <div class="state">
          <div class="ok">Paid into a link</div>
          <div class="big">{formatAmount(BigInt(amount ?? 0n))} USDC</div>
          <a class="small" href={EXPLORER(done.signature)} target="_blank" rel="noreferrer">
            {done.signature.slice(0, 16)}…
          </a>
        </div>
        <button class="primary" onClick={async () => setShared(await share(done.link))}>
          {shared === 'shared' ? 'Share again' : 'Share link'}
        </button>
        <div class="card mono">{done.link}</div>
        {shared === 'copied' && <div class="small ok">Link copied</div>}
        {done.phrase && (
          <div class="card stack">
            <div class="words">{done.phrase}</div>
            <div class="warn">{WORDS_HINT}</div>
          </div>
        )}
        <button
          class="ghost"
          onClick={() => {
            setDone(null);
            setText('');
            setShared(null);
          }}
        >
          New payment
        </button>
      </div>
    );
  }

  return (
    <div class="stack">
      <input
        class="amount"
        inputMode="decimal"
        placeholder="0"
        aria-label="Amount in USDC"
        value={text}
        onInput={(e) => setText((e.target as HTMLInputElement).value)}
      />
      <div class="unit">
        USDC
        {me.usdc !== null && me.wallet?.exists && <> · {formatAmount(me.usdc)} in wallet</>}
      </div>
      {amountErr && <div class="small bad">{amountErr}</div>}

      {me.wallet?.exists && me.usdc === 0n && (
        <div class="card stack">
          <div class="small">Add devnet USDC: pick Solana Devnet and paste this address</div>
          <div class="mono">{me.wallet.address}</div>
          <div class="row">
            <button class="ghost" onClick={() => navigator.clipboard?.writeText(me.wallet!.address)}>
              Copy
            </button>
            <a class="btn ghost" href={FAUCET} target="_blank" rel="noreferrer">
              faucet.circle.com
            </a>
          </div>
        </div>
      )}

      <label class="toggle">
        <span>Pass phrase</span>
        <input type="checkbox" checked={lock} onChange={(e) => setLock((e.target as HTMLInputElement).checked)} />
      </label>
      <div class="warn">{WARNING}</div>

      <button class="primary" disabled={!amount || !!busy || !!short} onClick={onPay}>
        {busy ?? (short ? 'Not enough USDC' : 'Pay')}
      </button>
      {err && (
        <div class="small bad" role="alert">
          {err}
        </div>
      )}
      {!me.passkey && (
        <button class="ghost" onClick={() => me.signIn().catch((e) => setErr((e as Error).message))}>
          I already have a Tok passkey
        </button>
      )}
    </div>
  );
}

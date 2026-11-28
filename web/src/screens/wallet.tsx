import { useEffect, useState } from 'preact/hooks';
import { isAddress } from '@solana/kit';
import { ARGON2_SETTINGS, formatAmount, parseAmount, summarise, timeOneTry } from '@tok/core';
import { useMe } from '../me';
import { balance, cancel, refreshSent, returnExpired, runs, sendTo, sentLinks, type SentLink } from '../tok';
import { EXPLORER_ADDR } from '../config';
import { LOSS } from './claim';
import { PollarWallet } from './pollar-wallet';

export function WalletScreen() {
  const me = useMe();
  const [to, setTo] = useState('');
  const [amt, setAmt] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [sent, setSent] = useState<SentLink[]>(sentLinks());

  useEffect(() => {
    // The sender's page sends the return call for links unclaimed after day 7.
    returnExpired()
      .then((sigs) => sigs.length && setMsg(`${sigs.length} unclaimed link(s) returned`))
      .catch(() => undefined)
      .finally(() => refreshSent().then(setSent).catch(() => undefined));
  }, []);

  if (!me.passkey || !me.wallet?.exists) {
    return (
      <div class="stack">
        <div class="state">No wallet on this phone yet.</div>
        <button class="primary" onClick={() => me.start().catch((e) => setMsg((e as Error).message))}>
          Make my wallet
        </button>
        <button class="ghost" onClick={() => me.signIn().catch((e) => setMsg((e as Error).message))}>
          I already have a Tok passkey
        </button>
        {msg && <div class="small bad">{msg}</div>}
        <PollarWallet />
        <ArgonTimer />
      </div>
    );
  }

  const w = me.wallet;
  const pay = summarise(runs(), 'pay');
  const clm = summarise(runs(), 'claim');

  async function move() {
    setMsg('Confirm with your face or fingerprint');
    try {
      if (!isAddress(to.trim())) throw new Error('That is not a Solana address');
      // A tap before the balance has loaded reads it now.
      const amount = amt ? parseAmount(amt) : (me.usdc ?? (w?.exists ? await balance(w) : 0n));
      if (amount <= 0n) throw new Error('Nothing to move');
      const sig = await sendTo(me.passkey!, w, to, amount);
      setMsg(`Moved ${formatAmount(amount)} USDC · ${sig.slice(0, 10)}…`);
      me.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  return (
    <div class="stack">
      <div class="state">
        <div class="big">{me.usdc === null ? '…' : formatAmount(me.usdc)} USDC</div>
        <a class="mono" href={EXPLORER_ADDR(w.address)} target="_blank" rel="noreferrer">
          {w.address}
        </a>
      </div>

      <div class="card stack">
        <div>Move to my wallet</div>
        <input type="text" placeholder="Solana address (Solflare or any wallet)" value={to} onInput={(e) => setTo((e.target as HTMLInputElement).value)} />
        <input type="text" inputMode="decimal" placeholder={`All (${me.usdc === null ? '' : formatAmount(me.usdc)})`} value={amt} onInput={(e) => setAmt((e.target as HTMLInputElement).value)} />
        <button class="primary" disabled={!to} onClick={move}>Move</button>
        <div class="small">Cash-out: in Solflare, with MoneyGram (170 countries and territories). Needs the Solflare app and MoneyGram's identity check.</div>
      </div>
      {msg && <div class="small">{msg}</div>}

      {sent.length > 0 && (
        <div class="card list">
          {[...sent].reverse().map((s) => (
            <div key={s.claimKey}>
              <span>{formatAmount(BigInt(s.amount))} USDC</span>
              <span class="small">{new Date(s.at).toLocaleDateString()}</span>
              {s.state === 'open' ? (
                <button
                  class="ghost"
                  style="width:auto;padding:8px 12px;font-size:14px"
                  onClick={async () => {
                    setMsg('Confirm with your face or fingerprint');
                    try {
                      const sig = await cancel(me.passkey!, w, s.claimKey);
                      setMsg(`Cancelled · ${sig.slice(0, 10)}…`);
                      setSent(sentLinks());
                      me.refresh();
                    } catch (e) {
                      setMsg((e as Error).message);
                    }
                  }}
                >
                  Cancel
                </button>
              ) : (
                <span class="small">{s.state}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {(pay.runs > 0 || clm.runs > 0) && (
        <div class="card small">
          Pay to confirmed: {pay.runs} runs, median {Math.round(pay.median)} ms, slowest {Math.round(pay.slowest)} ms
          <br />
          Link to confirmed claim: {clm.runs} runs, median {Math.round(clm.median)} ms, slowest {Math.round(clm.slowest)} ms
        </div>
      )}
      <PollarWallet />
      <ArgonTimer />
      <div class="small">{LOSS}</div>
      <div class="small">
        <a href={EXPLORER_ADDR(w.swig)} target="_blank" rel="noreferrer">Swig wallet account</a>
      </div>
    </div>
  );
}

/** One Argon2id try, timed on this phone (printed in the README per phone). */
function ArgonTimer() {
  const [ms, setMs] = useState<number | null>(null);
  return (
    <button
      class="ghost"
      style="font-size:14px;padding:10px"
      onClick={async () => {
        setMs(-1);
        setMs(await timeOneTry());
      }}
    >
      {ms === null
        ? 'Measure one pass phrase try'
        : ms < 0
          ? 'Measuring…'
          : `One try: ${Math.round(ms)} ms (Argon2id, ${ARGON2_SETTINGS.memorySizeKiB / 1024} MiB, ${ARGON2_SETTINGS.iterations} passes)`}
    </button>
  );
}

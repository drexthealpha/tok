import { useEffect, useState } from 'preact/hooks';
import { formatAmount, inAppBrowser, openInBrowser } from '@tok/core';
import { createPasskey, passkeysAvailable, savedPasskey } from '../passkey';
import { claim, readLink, sendTo, walletFor, type LinkState, type OpenedLink } from '../tok';
import { counter } from '../counter';
import { EXPLORER } from '../config';
import { go } from '../app';

export const LOSS =
  'If every device that holds this passkey is lost, this wallet and its USDC cannot be recovered. Tok offers no recovery. Your phone may sync the passkey to your other devices.';

type View =
  | { s: 'reading' }
  | { s: 'paste' }
  | { s: 'none' }
  | { s: 'locked' }
  | { s: 'gone' }
  | { s: 'ready'; opened: OpenedLink }
  | { s: 'claiming'; opened: OpenedLink }
  | { s: 'received'; opened: OpenedLink; signature: string }
  | { s: 'failed'; opened: OpenedLink; reason: string };

export function ClaimScreen() {
  const openedAt = useState(() => performance.now())[0];
  const [view, setView] = useState<View>({ s: 'reading' });
  const [words, setWords] = useState('');
  const [wordsErr, setWordsErr] = useState<string | null>(null);
  const [canPasskey, setCanPasskey] = useState<boolean | null>(null);
  const [backState, setBackState] = useState<string | null>(null);
  const app = typeof navigator !== 'undefined' ? inAppBrowser(navigator.userAgent) : null;

  async function load(hash: string, phrase?: string) {
    const st: LinkState = await readLink(hash, phrase);
    if (st.kind === 'none') {
      setView(new URLSearchParams(location.search).has('paste') ? { s: 'paste' } : { s: 'none' });
    } else if (st.kind === 'locked') setView({ s: 'locked' });
    else if (!st.opened.record) setView({ s: 'gone' });
    else setView({ s: 'ready', opened: st.opened });
  }

  useEffect(() => {
    load(location.hash).catch(() => setView({ s: 'none' }));
    passkeysAvailable().then(setCanPasskey);
  }, []);

  async function doClaim(opened: OpenedLink) {
    counter.add();
    setView({ s: 'claiming', opened });
    try {
      let p = savedPasskey();
      if (!p) {
        p = await createPasskey();
        counter.add(); // the face or fingerprint prompt answered
      }
      const signature = await claim(p, opened, openedAt);
      setView({ s: 'received', opened, signature });
    } catch (e) {
      setView({ s: 'failed', opened, reason: (e as Error).message });
    }
  }

  async function sendBack(opened: OpenedLink) {
    const p = savedPasskey();
    if (!p || !opened.record) return;
    setBackState('Confirm with your face or fingerprint');
    try {
      const w = await walletFor(p);
      const sig = await sendTo(p, w, opened.record.sender, opened.record.amount);
      setBackState(`Sent back · ${sig.slice(0, 10)}…`);
    } catch (e) {
      setBackState((e as Error).message);
    }
  }

  const blocked = app !== null || canPasskey === false;

  return (
    <div class="stack">
      {view.s === 'reading' && <div class="state"><div class="spinner" /></div>}

      {view.s === 'none' && (
        <div class="state">
          <div>No payment in this link.</div>
          <button class="ghost" onClick={() => go('pay')}>Open Tok</button>
        </div>
      )}

      {view.s === 'paste' && (
        <div class="stack">
          <button
            class="primary"
            onClick={async () => {
              counter.add();
              const t = await navigator.clipboard.readText().catch(() => '');
              const i = t.indexOf('#');
              if (i >= 0) {
                history.replaceState(null, '', location.pathname + t.slice(i));
                await load(t.slice(i));
              }
            }}
          >
            Paste the link
          </button>
          <div class="small">The link was copied in the chat app.</div>
        </div>
      )}

      {view.s === 'gone' && <div class="state">This link was already claimed, cancelled or returned.</div>}

      {view.s === 'locked' && (
        <form
          class="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setWordsErr(null);
            try {
              await load(location.hash, words);
            } catch (x) {
              setWordsErr((x as Error).message);
            }
          }}
        >
          <div>This link needs the 4 words the sender gave you.</div>
          <input type="text" autoCapitalize="none" autoComplete="off" value={words} onInput={(e) => setWords((e.target as HTMLInputElement).value)} />
          <button class="primary" type="submit">Unlock</button>
          {wordsErr && <div class="small bad">{wordsErr}</div>}
        </form>
      )}

      {(view.s === 'ready' || view.s === 'claiming' || view.s === 'received' || view.s === 'failed') && view.opened.record && (
        <div class="state">
          <div class="big">{formatAmount(view.opened.record.amount)} USDC</div>
          <div class="small">from {view.opened.record.sender.slice(0, 4)}…{view.opened.record.sender.slice(-4)}</div>
        </div>
      )}

      {view.s === 'ready' && blocked && (
        <div class="stack">
          <button
            class="primary"
            onClick={async () => {
              counter.add();
              const o = openInBrowser(location.href, navigator.userAgent);
              if (o.needsPaste) await navigator.clipboard?.writeText(location.href).catch(() => undefined);
              location.href = o.url;
            }}
          >
            Open in your browser
          </button>
          <div class="small">{app ? `${app}'s own browser` : 'This browser'} cannot make a passkey.</div>
        </div>
      )}

      {view.s === 'ready' && !blocked && (
        <button class="primary" onClick={() => doClaim(view.opened)}>
          {savedPasskey() ? 'Receive' : 'Receive with face or fingerprint'}
        </button>
      )}

      {view.s === 'claiming' && (
        <div class="state">
          <div class="spinner" />
          <div>Claiming</div>
        </div>
      )}

      {view.s === 'failed' && (
        <div class="stack">
          <div class="bad" role="alert">{view.reason}</div>
          <button class="primary" onClick={() => doClaim(view.opened)}>Try again</button>
        </div>
      )}

      {view.s === 'received' && (
        <div class="stack">
          <div class="state">
            <div class="ok big">Received</div>
            <a class="small" href={EXPLORER(view.signature)} target="_blank" rel="noreferrer">
              {view.signature.slice(0, 16)}…
            </a>
          </div>
          <div class="small">{LOSS}</div>
          <div class="row">
            <button class="ghost" onClick={() => sendBack(view.opened)}>Send back</button>
            <button class="ghost" onClick={() => go('wallet')}>Move to my wallet</button>
          </div>
          {backState && <div class="small">{backState}</div>}
          <button class="primary" onClick={() => go('chat')}>Chat</button>
        </div>
      )}
    </div>
  );
}

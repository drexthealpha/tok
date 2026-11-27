import { useEffect, useRef, useState } from 'preact/hooks';
import { isAddress } from '@solana/kit';
import { formatAmount, parseAmount } from '@tok/core';
import { useMe } from '../me';
import {
  addMember,
  chatReady,
  chatWith,
  members,
  messages,
  myChats,
  sendPayment,
  sendRequest,
  sendSplit,
  sendText,
  sendVoice,
  signInChat,
  subscribe,
  voiceUrl,
  type ChatSummary,
  type Message,
} from '../chat';
import { sendTo } from '../tok';
import { EXPLORER } from '../config';
import { counter } from '../counter';
import { ActionCard, actionLink } from './action';

const short = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;
export const VOICE_NOTE = 'Voice messages are sent to ElevenLabs to write their text.';

export function ChatScreen() {
  const me = useMe();
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [newWith, setNewWith] = useState('');

  const wallet = me.wallet?.exists ? me.wallet.address : null;

  useEffect(() => {
    if (!chatReady || !me.passkey || !wallet || ready) return;
    signInChat(me.passkey, wallet)
      .then(async () => {
        setReady(true);
        setChats(await myChats(wallet));
        const w = sessionStorage.getItem('tok.chatWith');
        if (w) {
          sessionStorage.removeItem('tok.chatWith');
          setOpen(await chatWith(wallet, [w]));
        }
      })
      .catch((e) => setErr((e as Error).message));
  }, [me.passkey, wallet, ready]);

  if (!chatReady) return <div class="state">Chat is not set up on this build.</div>;
  if (!me.passkey || !wallet) return <div class="state">Make your wallet first: Pay or Wallet tab.</div>;
  if (err) return <div class="state bad">{err}</div>;
  if (!ready) return <div class="state"><div class="spinner" />Confirm with your face or fingerprint</div>;
  if (open) return <Conversation chatId={open} me={wallet} onBack={() => setOpen(null)} />;

  return (
    <div class="stack">
      <div class="card list">
        {chats.length === 0 && <div class="small">No chats yet.</div>}
        {chats.map((c) => (
          <div key={c.id} onClick={() => setOpen(c.id)} style="cursor:pointer">
            <span>{c.others.map(short).join(', ') || 'Just me'}</span>
            <span class="small">›</span>
          </div>
        ))}
      </div>
      <input type="text" placeholder="Wallet address to chat with" value={newWith} onInput={(e) => setNewWith((e.target as HTMLInputElement).value)} />
      <button
        class="primary"
        disabled={!isAddress(newWith.trim())}
        onClick={async () => {
          try {
            setOpen(await chatWith(wallet, [newWith.trim()]));
          } catch (e) {
            setErr((e as Error).message);
          }
        }}
      >
        New chat
      </button>
    </div>
  );
}

type Mode = 'text' | 'pay' | 'request' | 'split';

function Conversation({ chatId, me, onBack }: { chatId: string; me: string; onBack: () => void }) {
  const self = useMe();
  const [list, setList] = useState<Message[]>([]);
  const [who, setWho] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [mode, setMode] = useState<Mode>('text');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [addWallet, setAddWallet] = useState('');
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messages(chatId).then(setList).catch((e) => setErr((e as Error).message));
    members(chatId).then((m) => {
      setWho(m);
      setPicked(m.filter((x) => x !== me));
    });
    const ch = subscribe(chatId, (m) =>
      setList((l) => (l.some((x) => x.id === m.id) ? l.map((x) => (x.id === m.id ? m : x)) : [...l, m])),
    );
    return () => {
      ch.unsubscribe();
    };
  }, [chatId]);

  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [list.length]);

  const others = who.filter((w) => w !== me);
  const paidRequests = new Set(list.filter((m) => m.kind === 'pay' && m.request_id).map((m) => m.request_id!));

  async function payTo(to: string, amount: bigint, requestId?: string) {
    if (!self.passkey || !self.wallet?.exists) return;
    counter.add();
    setBusy('Confirm with your face or fingerprint');
    try {
      const sig = await sendTo(self.passkey, self.wallet, to, amount);
      counter.add();
      await sendPayment(chatId, me, to, amount, sig, requestId);
      self.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    setErr(null);
    try {
      if (mode === 'text') {
        if (!text.trim()) return;
        await sendText(chatId, me, text.trim());
      } else {
        const amount = parseAmount(text);
        if (mode === 'pay') await payTo(others[0]!, amount);
        if (mode === 'request') await sendRequest(chatId, me, others[0]!, amount);
        if (mode === 'split') await sendSplit(chatId, me, amount, picked);
      }
      setText('');
      setMode('text');
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function toggleVoice() {
    if (rec) {
      rec.stop();
      setRec(null);
      return;
    }
    if (!localStorage.getItem('tok.voiceNoted')) {
      setErr(VOICE_NOTE);
      localStorage.setItem('tok.voiceNoted', '1');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      const parts: Blob[] = [];
      r.ondataavailable = (e) => parts.push(e.data);
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        await sendVoice(chatId, me, new Blob(parts, { type: r.mimeType || 'audio/webm' })).catch((e) => setErr((e as Error).message));
      };
      r.start();
      setRec(r);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <div class="stack">
      <div class="row" style="align-items:center">
        <button class="ghost" style="flex:0 0 auto;width:auto;padding:8px 14px" onClick={onBack}>‹</button>
        <div class="small" style="flex:1">{others.map(short).join(', ')}</div>
      </div>
      <div class="bubbles">
        {list.map((m) => (
          <Bubble key={m.id} m={m} me={me} paid={paidRequests.has(m.id)} onPay={(to, amount) => payTo(to, amount, m.id)} />
        ))}
        <div ref={end} />
      </div>
      {busy && <div class="small">{busy}</div>}
      {err && <div class="small bad" role="alert">{err}</div>}
      {mode === 'split' && (
        <div class="card small">
          {others.map((w) => (
            <label class="toggle" key={w}>
              <span>{short(w)}</span>
              <input
                type="checkbox"
                checked={picked.includes(w)}
                onChange={(e) => setPicked((p) => ((e.target as HTMLInputElement).checked ? [...p, w] : p.filter((x) => x !== w)))}
              />
            </label>
          ))}
          <div class="row">
            <input type="text" placeholder="Add a member: wallet address" value={addWallet} onInput={(e) => setAddWallet((e.target as HTMLInputElement).value)} />
            <button
              class="ghost"
              style="flex:0 0 auto;width:auto"
              disabled={!isAddress(addWallet.trim())}
              onClick={async () => {
                await addMember(chatId, addWallet.trim()).catch((e) => setErr((e as Error).message));
                setWho(await members(chatId));
                setPicked((p) => [...p, addWallet.trim()]);
                setAddWallet('');
              }}
            >
              Add
            </button>
          </div>
        </div>
      )}
      <div class="composer">
        <div class="row modes">
          {(['text', 'pay', 'request', 'split'] as Mode[]).map((k) => (
            <button key={k} class={mode === k ? 'primary' : 'ghost'} onClick={() => setMode(k)}>
              {k === 'text' ? 'Aa' : k === 'pay' ? 'Pay' : k === 'request' ? 'Request' : 'Split'}
            </button>
          ))}
        </div>
        <form
          class="row"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            type="text"
            inputMode={mode === 'text' ? 'text' : 'decimal'}
            placeholder={mode === 'text' ? 'Message' : 'USDC'}
            aria-label={mode === 'text' ? 'Message' : 'Amount'}
            value={text}
            onInput={(e) => setText((e.target as HTMLInputElement).value)}
          />
          {mode === 'text' && (
            <button type="button" class={rec ? 'primary' : 'ghost'} style="flex:0 0 auto;width:auto" aria-label="Voice message" onClick={toggleVoice}>
              {rec ? '■' : '🎤'}
            </button>
          )}
          <button type="submit" class="primary" style="flex:0 0 auto;width:auto">
            {mode === 'text' ? 'Send' : mode === 'pay' ? 'Pay' : mode === 'request' ? 'Ask' : 'Split'}
          </button>
        </form>
      </div>
    </div>
  );
}

function Bubble({ m, me, paid, onPay }: { m: Message; me: string; paid: boolean; onPay: (to: string, amount: bigint) => void }) {
  const mine = m.sender === me;
  const [audio, setAudio] = useState<string | null>(null);
  useEffect(() => {
    if (m.kind === 'voice' && m.audio_path) voiceUrl(m.audio_path).then(setAudio).catch(() => undefined);
  }, [m.audio_path]);
  const action = m.kind === 'text' && m.body ? actionLink(m.body) : null;
  return (
    <div class={`bubble ${mine ? 'mine' : ''}`}>
      {m.kind === 'text' && <div>{m.body}</div>}
      {m.kind === 'text' && m.preview && (
        <a class="preview" href={m.preview.url} target="_blank" rel="noreferrer">
          {m.preview.image && <img src={m.preview.image} alt="" loading="lazy" />}
          <span>{m.preview.title ?? m.preview.url}</span>
        </a>
      )}
      {action && <ActionCard url={action} />}
      {m.kind === 'pay' && (
        <div>
          <div class="big">{formatAmount(BigInt(m.amount!))} USDC</div>
          <a class="small" href={EXPLORER(m.signature!)} target="_blank" rel="noreferrer">
            Paid · {m.signature!.slice(0, 10)}…
          </a>
        </div>
      )}
      {m.kind === 'request' && (
        <div>
          <div class="big">{formatAmount(BigInt(m.amount!))} USDC</div>
          <div class="small">{m.split_id ? 'Split share' : 'Request'} for {short(m.to_wallet!)}</div>
          {paid ? (
            <div class="small ok">Paid</div>
          ) : m.to_wallet === me ? (
            <button class="primary" onClick={() => onPay(m.sender, BigInt(m.amount!))}>Pay</button>
          ) : null}
        </div>
      )}
      {m.kind === 'voice' && (
        <div>
          {audio ? <audio controls src={audio} preload="none" /> : <div class="small">Voice message</div>}
          {m.transcript && <div class="small">{m.transcript}</div>}
        </div>
      )}
    </div>
  );
}

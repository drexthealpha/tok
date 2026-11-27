import { useEffect, useState } from 'preact/hooks';
import {
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  decompileTransactionMessage,
  type Instruction,
} from '@solana/kit';
import { COMPUTE_BUDGET_PROGRAM, findLinks } from '@tok/core';
import { SERVER } from '../config';
import { useMe } from '../me';
import { sendFromWallet } from '../tok';
import { counter } from '../counter';

/** The first link in a message that looks like a Solana Action. */
export function actionLink(text: string): string | null {
  const raw = text.match(/solana-action:\S+/)?.[0];
  if (raw) return raw;
  return findLinks(text).find((l) => /\/api\/actions\/|[?&]action=solana-action/.test(l)) ?? null;
}

interface Meta {
  url: string;
  title: string;
  icon?: string;
  description?: string;
  actions: { label: string; href: string }[];
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${SERVER}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = (await r.json()) as T & { error?: string };
  if (!r.ok) throw new Error(j.error ?? `Server answered ${r.status}`);
  return j;
}

/** Instructions of an Action's transaction, without compute budget settings. */
export function instructionsOf(transactionBase64: string): Instruction[] {
  const tx = getTransactionDecoder().decode(getBase64Encoder().encode(transactionBase64));
  const msg = decompileTransactionMessage(getCompiledTransactionMessageDecoder().decode(tx.messageBytes));
  return msg.instructions.filter((ix) => ix.programAddress !== COMPUTE_BUDGET_PROGRAM) as Instruction[];
}

/**
 * Buttons only when every program the Action's transaction calls is on the
 * makers' allow list; otherwise the plain link.
 */
export function ActionCard({ url }: { url: string }) {
  const me = useMe();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const account = me.wallet?.exists ? me.wallet.address : null;

  useEffect(() => {
    if (!account) return;
    post<Meta>('/action/inspect', { url })
      .then(async (m) => {
        setMeta(m);
        const first = m.actions[0];
        if (!first) return setAllowed(false);
        const b = await post<{ allowed: boolean }>('/action/build', { href: first.href, account });
        setAllowed(b.allowed);
      })
      .catch(() => setAllowed(false));
  }, [url, account]);

  if (!meta || allowed === false) {
    return allowed === false ? (
      <a class="small" href={url.replace(/^solana-action:/, '')} target="_blank" rel="noreferrer">
        {url}
      </a>
    ) : null;
  }
  if (allowed === null) return <div class="small">…</div>;

  return (
    <div class="card action">
      <div style="font-weight:650">{meta.title}</div>
      {meta.description && <div class="small">{meta.description}</div>}
      <div class="row" style="flex-wrap:wrap">
        {meta.actions.map((a) => (
          <button
            key={a.href}
            class="ghost"
            onClick={async () => {
              if (!me.passkey || !me.wallet?.exists) return;
              counter.add();
              setMsg('Confirm with your face or fingerprint');
              try {
                const b = await post<{ transaction: string; allowed: boolean; message?: string }>('/action/build', { href: a.href, account });
                if (!b.allowed) throw new Error('This Action calls a program that is not on the allow list');
                const sig = await sendFromWallet(me.passkey, me.wallet, instructionsOf(b.transaction));
                counter.add();
                setMsg(`${b.message ?? 'Done'} · ${sig.slice(0, 10)}…`);
                me.refresh();
              } catch (e) {
                setMsg((e as Error).message);
              }
            }}
          >
            {a.label}
          </button>
        ))}
      </div>
      {msg && <div class="small mono">{msg}</div>}
    </div>
  );
}

import { useEffect, useState } from 'preact/hooks';
import { generateKeyPairSigner, type Address } from '@solana/kit';
import { renderSVG } from 'uqr';
import {
  alreadyRefunded,
  debitedOwner,
  formatAmount,
  memoInstruction,
  parseAmount,
  parseTransferRequest,
  refundMemo,
  transferRequestUrl,
  USDC_MINT,
  withReference,
  type TransferRequest,
} from '@tok/core';
import { useMe } from '../me';
import { rpc } from '../chain';
import { createAtaIdempotent, sendFromWallet, tokenProgram, transferChecked, usdcAccount } from '../tok';
import { EXPLORER, SITE } from '../config';
import { feePayer, relay } from '../chain';
import { counter } from '../counter';

interface Found {
  signature: string;
  payer: string;
  amount: bigint;
}

/** Pay a Solana Pay transfer request from the passkey wallet, with its reference. */
async function payRequest(me: ReturnType<typeof useMe>, r: TransferRequest): Promise<string> {
  if (!me.passkey || !me.wallet?.exists) throw new Error('Make your wallet first');
  const tp = await tokenProgram();
  const ix = withReference(transferChecked(await usdcAccount(me.wallet.address), await usdcAccount(r.recipient), me.wallet.address, r.amount, tp), r.reference);
  const ata = await createAtaIdempotent(await feePayer(), r.recipient);
  await relay([ata]);
  const extra = r.message ? [memoInstruction(r.message)] : [];
  return sendFromWallet(me.passkey, me.wallet, [ix, ...extra]);
}

/** The merchant view: find the payment by its reference and check the amount. */
async function findPayment(r: TransferRequest): Promise<Found | null> {
  const sigs = await rpc.getSignaturesForAddress(r.reference, { limit: 5, commitment: 'confirmed' }).send();
  for (const s of sigs) {
    if (s.err) continue;
    const tx = await rpc.getTransaction(s.signature, { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }).send();
    if (!tx?.meta) continue;
    const merchantAta = await usdcAccount(r.recipient);
    const keys = tx.transaction.message.accountKeys.map((k) => (typeof k === 'string' ? k : k.pubkey));
    const idx = keys.indexOf(merchantAta);
    const pre = tx.meta.preTokenBalances?.find((b) => b.accountIndex === idx)?.uiTokenAmount.amount ?? '0';
    const post = tx.meta.postTokenBalances?.find((b) => b.accountIndex === idx)?.uiTokenAmount.amount ?? '0';
    if (BigInt(post) - BigInt(pre) < r.amount) continue;
    const debit = debitedOwner(tx.meta as never, USDC_MINT);
    return { signature: s.signature, payer: debit.owner, amount: debit.amount };
  }
  return null;
}

export function ShopScreen() {
  const me = useMe();
  const params = new URLSearchParams(location.search);
  const incoming = params.get('pay');
  const [amt, setAmt] = useState('');
  const [label, setLabel] = useState('');
  const [req, setReq] = useState<TransferRequest | null>(null);
  const [found, setFound] = useState<Found | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!req || found) return;
    const t = setInterval(() => findPayment(req).then((f) => f && setFound(f)).catch(() => undefined), 2500);
    return () => clearInterval(t);
  }, [req, found]);

  // Payer side: a Solana Pay request opened in Tok.
  if (incoming) {
    let r: TransferRequest | null = null;
    try {
      r = parseTransferRequest(incoming);
    } catch (e) {
      return <div class="state bad">{(e as Error).message}</div>;
    }
    return (
      <div class="stack">
        <div class="state">
          <div class="big">{formatAmount(r.amount)} USDC</div>
          <div class="small">{r.label ?? 'Merchant'} · {r.recipient.slice(0, 4)}…{r.recipient.slice(-4)}</div>
        </div>
        <button
          class="primary"
          onClick={async () => {
            counter.add();
            setMsg('Confirm with your face or fingerprint');
            try {
              const sig = await payRequest(me, r!);
              counter.add();
              setMsg(`Paid · ${sig.slice(0, 10)}…`);
            } catch (e) {
              setMsg((e as Error).message);
            }
          }}
        >
          Pay
        </button>
        {msg && <div class="small">{msg}</div>}
      </div>
    );
  }

  if (!me.wallet?.exists) return <div class="state">Make your wallet first: Pay or Wallet tab.</div>;

  if (req) {
    const url = transferRequestUrl(req);
    const tokLink = `${SITE}/shop?pay=${encodeURIComponent(url)}`;
    return (
      <div class="stack">
        <div class="state">
          <div class="big">{formatAmount(req.amount)} USDC</div>
          <div class="small">{found ? 'Paid' : 'Waiting for payment'}</div>
        </div>
        {!found && <div class="card" style="background:#fff;padding:12px" dangerouslySetInnerHTML={{ __html: renderSVG(url) }} />}
        {!found && <div class="mono">{tokLink}</div>}
        {found && (
          <div class="stack">
            <a class="small" href={EXPLORER(found.signature)} target="_blank" rel="noreferrer">
              {found.signature.slice(0, 16)}…
            </a>
            <button
              class="ghost"
              onClick={async () => {
                setMsg('Checking');
                try {
                  const hist = await rpc.getSignaturesForAddress(await usdcAccount(me.wallet!.address), { limit: 100 }).send();
                  if (alreadyRefunded(hist, found.signature)) throw new Error('This payment was already refunded');
                  setMsg('Confirm with your face or fingerprint');
                  const tp = await tokenProgram();
                  const ix = transferChecked(await usdcAccount(me.wallet!.address), await usdcAccount(found.payer as Address), me.wallet!.address, found.amount, tp);
                  const sig = await sendFromWallet(me.passkey!, me.wallet!, [ix, memoInstruction(refundMemo(found.signature))]);
                  setMsg(`Refunded ${formatAmount(found.amount)} USDC to ${found.payer.slice(0, 4)}… · ${sig.slice(0, 10)}…`);
                } catch (e) {
                  setMsg((e as Error).message);
                }
              }}
            >
              Refund
            </button>
          </div>
        )}
        {msg && <div class="small">{msg}</div>}
        <button class="ghost" onClick={() => { setReq(null); setFound(null); setMsg(null); }}>New request</button>
      </div>
    );
  }

  return (
    <div class="stack">
      <input class="amount" inputMode="decimal" placeholder="0" aria-label="Amount to charge" value={amt} onInput={(e) => setAmt((e.target as HTMLInputElement).value)} />
      <div class="unit">USDC</div>
      <input type="text" placeholder="Label (shop name)" value={label} onInput={(e) => setLabel((e.target as HTMLInputElement).value)} />
      <button
        class="primary"
        onClick={async () => {
          try {
            const reference = (await generateKeyPairSigner()).address;
            setReq({ recipient: me.wallet!.address, amount: parseAmount(amt), splToken: USDC_MINT, reference, label: label || undefined });
          } catch (e) {
            setMsg((e as Error).message);
          }
        }}
      >
        Charge
      </button>
      {msg && <div class="small bad">{msg}</div>}
      <div class="small">Solana Pay request with a reference. Refunds go to the account that paid.</div>
    </div>
  );
}

/**
 * Solana Actions.
 *  - Tok's own Action: a deposit into a pay link, so any wallet that shows
 *    Actions can pay with the user's own wallet. In this path Tok's server
 *    makes the claim key (a wallet runs no Tok code), returns the link in the
 *    Action's message, and keeps no copy.
 *  - Inspect and build for the chat: fetch any Action, build its
 *    transaction for the user's wallet, and report the programs it calls.
 */
import type { Hono } from 'hono';
import {
  appendTransactionMessageInstructions,
  compileTransaction,
  createKeyPairSignerFromPrivateKeyBytes,
  createSolanaRpc,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  isAddress,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
} from '@solana/kit';
import {
  checkAllowed,
  depositInstruction,
  DEVNET_CHAIN_ID,
  makePayLink,
  newClaimSeed,
  parseAmount,
  programsCalled,
  USDC_MINT,
} from '@tok/core';
import type { Kora } from './kora';
import { Refused } from './relay';

export const ACTION_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Content-Encoding, Accept-Encoding, X-Accept-Action-Version, X-Accept-Blockchain-Ids',
  'Access-Control-Expose-Headers': 'X-Action-Version, X-Blockchain-Ids',
  'X-Action-Version': '2.4',
  'X-Blockchain-Ids': DEVNET_CHAIN_ID,
};

export interface ActionDeps {
  kora: Kora & { sign?(tx: string): Promise<string> };
  rpcUrl: string;
  site: string; // where pay links open, e.g. https://drexthealpha.github.io/tok
  publicUrl: string; // this server's public URL
  tokenProgram: Address;
  fetchFn?: typeof fetch;
  blockhash?: () => Promise<{ blockhash: string; lastValidBlockHeight: bigint }>;
}

function publicHost(u: URL): boolean {
  if (u.protocol !== 'https:') return false;
  const h = u.hostname;
  return !(h === 'localhost' || /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || h.endsWith('.internal') || h.includes(':'));
}

export function mountActions(app: Hono, d: ActionDeps) {
  const rpc = createSolanaRpc(d.rpcUrl);
  const f = d.fetchFn ?? fetch;

  app.options('/api/actions/*', (c) => c.body(null, 204, ACTION_HEADERS));
  app.get('/actions.json', (c) =>
    c.json({ rules: [{ pathPattern: '/pay', apiPath: '/api/actions/pay' }, { pathPattern: '/api/actions/**', apiPath: '/api/actions/**' }] }, 200, ACTION_HEADERS),
  );

  app.get('/api/actions/pay', (c) =>
    c.json(
      {
        type: 'action',
        icon: `${d.site}/icon.png`,
        title: 'Pay with a Tok link',
        description: 'Put devnet USDC into a link. Anyone you send the link to can receive it with a passkey. Devnet, test money.',
        label: 'Pay',
        links: {
          actions: [
            { type: 'transaction', label: '1 USDC', href: '/api/actions/pay?amount=1' },
            { type: 'transaction', label: '5 USDC', href: '/api/actions/pay?amount=5' },
            {
              type: 'transaction',
              label: 'Pay',
              href: '/api/actions/pay?amount={amount}',
              parameters: [{ name: 'amount', label: 'USDC amount', type: 'number', required: true, min: 0.01 }],
            },
          ],
        },
      },
      200,
      ACTION_HEADERS,
    ),
  );

  app.post('/api/actions/pay', async (c) => {
    const body = await c.req.json<{ account?: string }>().catch(() => ({}) as { account?: string });
    if (!body.account || !isAddress(body.account)) return c.json({ message: 'Send your wallet address as account' }, 400, ACTION_HEADERS);
    let amount: bigint;
    try {
      amount = parseAmount(c.req.query('amount') ?? '');
    } catch (e) {
      return c.json({ message: (e as Error).message }, 400, ACTION_HEADERS);
    }
    const payer = (await d.kora.payer()) as Address;
    const seed = newClaimSeed();
    const claimKey = await createKeyPairSignerFromPrivateKeyBytes(seed);
    const ix = await depositInstruction({
      rentPayer: payer,
      sender: body.account as Address,
      mint: USDC_MINT,
      tokenProgram: d.tokenProgram,
      claimKey: claimKey.address,
      amount,
    });
    const bh = d.blockhash ? await d.blockhash() : (await rpc.getLatestBlockhash({ commitment: 'confirmed' }).send()).value;
    const msg = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayer(payer, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(bh as never, m),
      (m) => appendTransactionMessageInstructions([ix], m),
    );
    let transaction: string = getBase64EncodedWireTransaction(compileTransaction(msg));
    // The makers' fee payer signs first, so a wallet with no SOL can send it.
    if (d.kora.sign) transaction = await d.kora.sign(transaction);
    const link = makePayLink(d.site, { kind: 'plain', seed });
    return c.json({ type: 'transaction', transaction, message: `Paid into a link. Send it: ${link}` }, 200, ACTION_HEADERS);
  });

  /** For the chat: read an Action's buttons. */
  app.post('/action/inspect', async (c) => {
    const { url } = await c.req.json<{ url?: string }>().catch(() => ({}) as { url?: string });
    const u = toActionUrl(url ?? '');
    if (!u || !publicHost(u)) throw new Refused('Not an Action link');
    const r = await f(u, { headers: { accept: 'application/json' } }).catch(() => null);
    if (!r?.ok) throw new Refused('Not an Action link');
    const j = (await r.json().catch(() => null)) as { title?: string; icon?: string; description?: string; label?: string; links?: { actions?: { label: string; href: string }[] } } | null;
    if (!j?.title) throw new Refused('Not an Action link');
    const actions = (j.links?.actions ?? [{ label: j.label ?? 'Go', href: u.pathname + u.search }]).filter((a) => !a.href.includes('{'));
    return c.json({ url: u.toString(), title: j.title, icon: j.icon, description: j.description, actions: actions.map((a) => ({ label: a.label, href: new URL(a.href, u).toString() })) });
  });

  /** For the chat: build an Action's transaction for the user's wallet and list its programs. */
  app.post('/action/build', async (c) => {
    const { href, account } = await c.req.json<{ href?: string; account?: string }>().catch(() => ({}) as { href?: string; account?: string });
    const u = href ? new URL(href) : null;
    if (!u || !publicHost(u) || !account || !isAddress(account)) throw new Refused('Bad request');
    const r = await f(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account }) }).catch(() => null);
    if (!r?.ok) throw new Refused('The Action did not answer');
    const j = (await r.json()) as { transaction?: string; message?: string };
    if (!j.transaction) throw new Refused('The Action returned no transaction');
    const programs = programsCalled(j.transaction);
    const res = checkAllowed(programs);
    return c.json({ transaction: j.transaction, message: j.message, programs, allowed: res.ok });
  });
}

export function toActionUrl(raw: string): URL | null {
  try {
    const s = raw.startsWith('solana-action:') ? decodeURIComponent(raw.slice('solana-action:'.length)) : raw;
    const u = new URL(s);
    // Blink links carry the Action in ?action=solana-action:<url>
    const inner = u.searchParams.get('action');
    if (inner) return toActionUrl(inner);
    return u;
  } catch {
    return null;
  }
}

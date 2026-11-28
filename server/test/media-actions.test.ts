// Parts 12, 13, 14 and 15 on the server.
import { describe, expect, it } from 'vitest';
import {
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createTransactionMessage,
  generateKeyPairSigner,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Blockhash,
} from '@solana/kit';
import { CLAIM_PROGRAM, makePayLink, newClaimSeed, programsCalled, readLinkSecret } from '@tok/core';
import { createApp } from '../src/app';
import type { Kora } from '../src/kora';
import type { VoiceStore } from '../src/media';

const SITE = 'https://tok.test/tok';
const bh = async () => ({ blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 1n });

function setup(fetchFn: typeof fetch, voice?: VoiceStore) {
  const kora: Kora = { payer: async () => 'ByWbpvCjdgiUdamJ7t47toUMreqapqgPcBfjyTkEcNX2', signAndSend: async () => 'sig' };
  return createApp({
    kora,
    origins: ['https://tok.test'],
    actions: { rpcUrl: 'http://unused', site: SITE, publicUrl: 'https://srv.test', tokenProgram: address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'), fetchFn, blockhash: bh },
    media: { payHosts: ['tok.test'], firecrawlKey: 'fc-test', elevenLabsKey: 'el-test', voice, fetchFn },
  });
}
const json = (app: ReturnType<typeof setup>, path: string, body: unknown) =>
  app.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('link previews (part 13)', () => {
  it('previews an ordinary page and never sends a pay link or the part after "#"', async () => {
    const sent: string[] = [];
    const f = (async (_u: string, init?: RequestInit) => {
      sent.push(String(init?.body));
      return new Response(JSON.stringify({ data: { metadata: { title: 'News', ogImage: 'https://img.test/a.png' } } }));
    }) as typeof fetch;
    const app = setup(f);
    const ok = await json(app, '/preview', { url: 'https://news.test/story?x=1#private' });
    expect(await ok.json()).toEqual({ url: 'https://news.test/story?x=1', title: 'News', image: 'https://img.test/a.png' });
    const pay = makePayLink(SITE, { kind: 'plain', seed: newClaimSeed() });
    expect((await json(app, '/preview', { url: pay })).status).toBe(400);
    expect(sent).toHaveLength(1);
    expect(sent[0]).not.toContain('#');
    expect(sent[0]).not.toContain('private');
  });
});

describe('voice text (part 12)', () => {
  const store = (transcripts: Map<string, string>): VoiceStore => ({
    userId: async (t) => (t === 'good' ? 'u1' : null),
    voiceOf: async (id, user) => (id === 'm1' && user === 'u1' ? { audio: new Blob(['x'], { type: 'audio/webm' }) } : null),
    setTranscript: async (id, text) => void transcripts.set(id, text),
  });

  it('puts the ElevenLabs text under the voice message', async () => {
    const t = new Map<string, string>();
    const f = (async (u: string) => {
      expect(String(u)).toBe('https://api.elevenlabs.io/v1/speech-to-text');
      return new Response(JSON.stringify({ text: ' hello there ' }));
    }) as typeof fetch;
    const r = await json(setup(f, store(t)), '/voice/transcribe', { messageId: 'm1', accessToken: 'good' });
    expect(r.status).toBe(200);
    expect(t.get('m1')).toBe('hello there');
  });

  it('keeps the voice message without text when ElevenLabs fails', async () => {
    const t = new Map<string, string>();
    const f = (async () => new Response('busy', { status: 503 })) as typeof fetch;
    const r = await json(setup(f, store(t)), '/voice/transcribe', { messageId: 'm1', accessToken: 'good' });
    expect(r.status).toBe(502);
    expect(t.has('m1')).toBe(false);
  });

  it('refuses another user and someone else\'s message', async () => {
    const f = (async () => new Response('{}')) as typeof fetch;
    expect((await json(setup(f, store(new Map())), '/voice/transcribe', { messageId: 'm1', accessToken: 'bad' })).status).toBe(401);
    expect((await json(setup(f, store(new Map())), '/voice/transcribe', { messageId: 'm2', accessToken: 'good' })).status).toBe(403);
  });
});

describe('Tok as a Solana Action (part 15)', () => {
  it('serves metadata with the Action headers and builds a deposit for the account', async () => {
    const app = setup(fetch);
    const g = await app.request('/api/actions/pay');
    expect(g.headers.get('x-blockchain-ids')).toBe('solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1');
    expect(g.headers.get('access-control-allow-origin')).toBe('*');
    const meta = (await g.json()) as { links: { actions: unknown[] } };
    expect(meta.links.actions.length).toBeGreaterThan(0);

    const user = await generateKeyPairSigner();
    const p = await json(app, '/api/actions/pay?amount=1', { account: user.address });
    expect(p.status).toBe(200);
    const body = (await p.json()) as { transaction: string; message: string };
    expect(programsCalled(body.transaction)).toEqual([CLAIM_PROGRAM]);
    const link = body.message.slice(body.message.indexOf('https://'));
    expect(readLinkSecret(new URL(link).hash)?.kind).toBe('plain');
    expect((await json(app, '/api/actions/pay?amount=0', { account: user.address })).status).toBe(400);
  });

  it('says the wallet may not hold enough when the fee payer refuses the deposit', async () => {
    const kora: Kora = {
      payer: async () => 'ByWbpvCjdgiUdamJ7t47toUMreqapqgPcBfjyTkEcNX2',
      signAndSend: async () => 'sig',
      sign: async () => {
        throw new Error('simulation failed: insufficient funds');
      },
    };
    const app = createApp({
      kora,
      origins: ['https://tok.test'],
      actions: { rpcUrl: 'http://unused', site: SITE, publicUrl: 'https://srv.test', tokenProgram: address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'), fetchFn: fetch, blockhash: bh },
    });
    const user = await generateKeyPairSigner();
    const p = await json(app as never, '/api/actions/pay?amount=1', { account: user.address });
    expect(p.status).toBe(422);
    expect(((await p.json()) as { message: string }).message).toBe('Not sent: this wallet may hold less than 1 USDC');
    // The chat's build passes that message on instead of a bare error.
    const f = (async (u: string | URL, init?: RequestInit) => app.request(String(u).replace('https://srv.test', ''), init)) as typeof fetch;
    const chat = setup(f);
    const b = await json(chat, '/action/build', { href: 'https://srv.test/api/actions/pay?amount=1', account: user.address });
    expect(b.status).toBe(400);
    expect(((await b.json()) as { error: string }).error).toBe('Not sent: this wallet may hold less than 1 USDC');
  });
});

describe('Actions in the chat (part 14)', () => {
  async function txCalling(programs: string[]) {
    const payer = await generateKeyPairSigner();
    const msg = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayer(payer.address, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash({ blockhash: '11111111111111111111111111111111' as Blockhash, lastValidBlockHeight: 1n }, m),
      (m) => appendTransactionMessageInstructions(programs.map((p) => ({ programAddress: address(p), accounts: [], data: new Uint8Array([0]) })), m),
    );
    return getBase64EncodedWireTransaction(compileTransaction(msg));
  }

  it('reports allowed only when every program is on the allow list', async () => {
    const good = await txCalling([CLAIM_PROGRAM]);
    const bad = await txCalling([CLAIM_PROGRAM, 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4']);
    const f = (async (u: string, init?: RequestInit) => {
      if (init?.method === 'POST') return new Response(JSON.stringify({ transaction: String(u).includes('bad') ? bad : good }));
      return new Response(JSON.stringify({ title: 'Some Action', links: { actions: [{ label: 'Go', href: '/api/actions/x' }] } }));
    }) as typeof fetch;
    const app = setup(f);
    const account = (await generateKeyPairSigner()).address;
    const i = (await (await json(app, '/action/inspect', { url: 'solana-action:https://act.test/api/actions/x' })).json()) as { actions: { href: string }[] };
    expect(i.actions[0]!.href).toBe('https://act.test/api/actions/x');
    const okb = (await (await json(app, '/action/build', { href: 'https://act.test/api/actions/good', account })).json()) as { allowed: boolean };
    const badb = (await (await json(app, '/action/build', { href: 'https://act.test/api/actions/bad', account })).json()) as { allowed: boolean };
    expect(okb.allowed).toBe(true);
    expect(badb.allowed).toBe(false);
  });

  it('refuses to fetch private addresses', async () => {
    const app = setup(fetch);
    expect((await json(app, '/action/inspect', { url: 'https://127.0.0.1/api/actions/x' })).status).toBe(400);
    expect((await json(app, '/action/inspect', { url: 'http://act.test/api/actions/x' })).status).toBe(400);
  });
});

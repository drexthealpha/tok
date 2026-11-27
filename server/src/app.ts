import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { ALLOWED_PROGRAMS } from '@tok/core';
import type { Kora } from './kora';
import { Refused, vet } from './relay';
import { walletFromProof, type Proof } from './proof';
import { mountActions, type ActionDeps } from './actions';
import { mountMedia, type MediaDeps } from './media';

export interface ChatAdmin {
  /** The Supabase user behind an access token, or null. */
  userId(accessToken: string): Promise<string | null>;
  bindWallet(userId: string, wallet: string): Promise<void>;
}

export interface Deps {
  kora: Kora;
  /** Origins allowed to call the server (the web page). */
  origins: string[];
  rateLimitPerMinute?: number;
  chat?: ChatAdmin;
  actions?: Omit<ActionDeps, 'kora'>;
  media?: MediaDeps;
}

/** Per-IP fixed-window rate limit, kept in memory. */
function limiter(perMinute: number) {
  const hits = new Map<string, { n: number; t: number }>();
  return (ip: string) => {
    const now = Date.now();
    const h = hits.get(ip);
    if (!h || now - h.t > 60_000) {
      hits.set(ip, { n: 1, t: now });
      return true;
    }
    h.n += 1;
    return h.n <= perMinute;
  };
}

export function createApp(deps: Deps) {
  const app = new Hono();
  const allow = limiter(deps.rateLimitPerMinute ?? 20);
  // Actions are called by any wallet; everything else only by Tok's page.
  app.use('*', async (c, next) => {
    if (c.req.path.startsWith('/api/actions') || c.req.path === '/actions.json') return next();
    return cors({ origin: deps.origins, allowMethods: ['GET', 'POST', 'OPTIONS'] })(c, next);
  });

  app.onError((err, c) => {
    if (err instanceof Refused) return c.json({ error: err.message }, err.status as 400);
    console.error(err);
    return c.json({ error: 'Server error' }, 500);
  });

  app.get('/health', (c) => c.json({ ok: true }));

  app.get('/config', async (c) =>
    c.json({ feePayer: await deps.kora.payer(), allowedPrograms: ALLOWED_PROGRAMS }),
  );

  app.post('/relay', async (c) => {
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
    if (!allow(ip)) return c.json({ error: 'Too many requests' }, 429);
    const body = await c.req.json<{ transaction?: string }>().catch(() => ({}) as { transaction?: string });
    vet(body.transaction ?? '', await deps.kora.payer());
    try {
      const signature = await deps.kora.signAndSend(body.transaction!);
      return c.json({ signature });
    } catch (e) {
      return c.json({ error: (e as Error).message.slice(0, 300) }, 502);
    }
  });

  app.post('/chat/bind', async (c) => {
    if (!deps.chat) return c.json({ error: 'Chat is not set up on this server' }, 503);
    const body = await c.req.json<{ accessToken?: string; proof?: Proof }>().catch(() => ({}) as { accessToken?: string; proof?: Proof });
    if (!body.accessToken || !body.proof) throw new Refused('Send accessToken and proof');
    const userId = await deps.chat.userId(body.accessToken);
    if (!userId) throw new Refused('Not signed in', 401);
    let wallet: string;
    try {
      wallet = await walletFromProof(body.proof, userId, deps.origins);
    } catch (e) {
      throw new Refused((e as Error).message, 401);
    }
    await deps.chat.bindWallet(userId, wallet);
    return c.json({ wallet });
  });

  if (deps.actions) mountActions(app, { ...deps.actions, kora: deps.kora });
  if (deps.media) mountMedia(app, deps.media);

  return app;
}

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { ALLOWED_PROGRAMS } from '@tok/core';
import type { Kora } from './kora';
import { Refused, vet } from './relay';

export interface Deps {
  kora: Kora;
  /** Origins allowed to call the server (the web page). */
  origins: string[];
  rateLimitPerMinute?: number;
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
  const allow = limiter(deps.rateLimitPerMinute ?? 60);
  app.use('*', cors({ origin: deps.origins, allowMethods: ['GET', 'POST', 'OPTIONS'] }));

  app.onError((err, c) => {
    if (err instanceof Refused) return c.json({ error: err.message }, err.status as 400);
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

  return app;
}

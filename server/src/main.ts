import { serve } from '@hono/node-server';
import { createApp } from './app';
import { koraClient } from './kora';

const port = Number(process.env.PORT ?? 8787);
const kora = koraClient(process.env.KORA_URL ?? 'http://127.0.0.1:8080');
const origins = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173').split(',');

serve({ fetch: createApp({ kora, origins }).fetch, port }, (info) => {
  console.log(`tok server on :${info.port}`);
});

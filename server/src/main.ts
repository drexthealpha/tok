import { serve } from '@hono/node-server';
import { createApp } from './app';
import { koraClient } from './kora';
import { supabaseAdmin } from './supabase';

const port = Number(process.env.PORT ?? 8787);
const kora = koraClient(process.env.KORA_URL ?? 'http://127.0.0.1:8080');
const origins = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173').split(',');

const chat =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? supabaseAdmin(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : undefined;

serve({ fetch: createApp({ kora, origins, chat }).fetch, port }, (info) => {
  console.log(`tok server on :${info.port}`);
});

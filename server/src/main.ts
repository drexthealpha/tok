import { serve } from '@hono/node-server';
import { address } from '@solana/kit';
import { createApp } from './app';
import { koraClient } from './kora';
import { supabaseAdmin } from './supabase';

const env = process.env;
const port = Number(env.PORT ?? 8787);
const kora = koraClient(env.KORA_URL ?? 'http://127.0.0.1:8080');
const origins = (env.ALLOWED_ORIGINS ?? 'http://localhost:5173').split(',');
const site = env.TOK_SITE ?? 'https://drexthealpha.github.io/tok';
const admin =
  env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY ? supabaseAdmin(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY) : undefined;

const app = createApp({
  kora,
  origins,
  chat: admin,
  actions: {
    rpcUrl: env.RPC_URL ?? 'https://api.devnet.solana.com',
    site,
    publicUrl: env.PUBLIC_URL ?? 'https://tok-server.onrender.com',
    // Devnet USDC is owned by the Token program (read on day 1, docs/CHECKS.md).
    tokenProgram: address(env.TOKEN_PROGRAM ?? 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
  },
  media: {
    payHosts: [new URL(site).host],
    firecrawlKey: env.FIRECRAWL_API_KEY,
    elevenLabsKey: env.ELEVENLABS_API_KEY,
    voice: admin,
  },
});

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`tok server on :${info.port}`);
});

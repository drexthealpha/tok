// Set up Tok's hosted Supabase project: apply the chat schema, turn on
// anonymous sign-in, and write the project's keys to the private env file.
// Prints only status codes, never a key.
// Usage: node scripts/setup-supabase.mjs <project ref> <path to partners.env>
import { readFileSync, appendFileSync } from 'node:fs';

const [, , ref, envPath] = process.argv;
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const token = env.SUPABASE_ACCESS_TOKEN;
if (!token) throw new Error('SUPABASE_ACCESS_TOKEN missing');
const api = (path, init = {}) =>
  fetch(`https://api.supabase.com/v1/projects/${ref}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
  });

// 1. Wait until the project is up.
for (let i = 0; i < 40; i++) {
  const r = await api('');
  const j = await r.json();
  console.log('project status', j.status);
  if (j.status === 'ACTIVE_HEALTHY') break;
  await new Promise((s) => setTimeout(s, 15000));
}

// 2. Keys.
if (!env.SUPABASE_URL) {
  const r = await api('/api-keys?reveal=true');
  const keys = await r.json();
  console.log('api-keys', r.status, keys.map?.((k) => k.name).join(','));
  const anon = keys.find((k) => k.name === 'anon')?.api_key;
  const service = keys.find((k) => k.name === 'service_role')?.api_key;
  if (!anon || !service) throw new Error('keys not found');
  appendFileSync(
    envPath,
    `SUPABASE_URL=https://${ref}.supabase.co\nSUPABASE_ANON_KEY=${anon}\nSUPABASE_SERVICE_ROLE_KEY=${service}\n`,
  );
  console.log('keys written');
}

// 3. Schema.
if (process.argv.includes('--schema')) {
  const sql = readFileSync(new URL('../supabase/migrations/20261127180000_chat.sql', import.meta.url), 'utf8');
  const r = await api('/database/query', { method: 'POST', body: JSON.stringify({ query: sql }) });
  console.log('schema', r.status, r.ok ? '' : (await r.text()).slice(0, 300));
}

// 4. Anonymous sign-in, and the site allowed to redirect.
const a = await api('/config/auth', {
  method: 'PATCH',
  body: JSON.stringify({
    external_anonymous_users_enabled: true,
    site_url: 'https://drexthealpha.github.io/tok/',
    uri_allow_list: 'https://drexthealpha.github.io/tok/**,http://localhost:5173/**',
    rate_limit_anonymous_users: 300,
  }),
});
console.log('auth config', a.status, a.ok ? '' : (await a.text()).slice(0, 300));

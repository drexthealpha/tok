// Run one SQL file on Tok's hosted Supabase project through the Management
// API. Prints the status and the result rows, never a key.
// Usage: node scripts/supabase-sql.mjs <project ref> <partners.env> <file.sql>
import { readFileSync } from 'node:fs';

const [, , ref, envPath, file] = process.argv;
const token = readFileSync(envPath, 'utf8')
  .split(/\r?\n/)
  .find((l) => l.startsWith('SUPABASE_ACCESS_TOKEN='))
  ?.split('=')[1]
  ?.trim();
if (!token) throw new Error('SUPABASE_ACCESS_TOKEN missing');
const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify({ query: readFileSync(file, 'utf8') }),
});
console.log(r.status, (await r.text()).slice(0, 600));

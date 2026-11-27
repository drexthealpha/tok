// Copy named keys from the private env file into Render's environment for
// Tok's server. Prints names only, never values.
// Usage: RENDER_API_KEY=... node scripts/load-secrets.mjs <partners.env> NAME [NAME...]
import { readFileSync } from 'node:fs';

const [, , envPath, ...names] = process.argv;
const SERVICE = process.env.RENDER_SERVICE ?? 'srv-dc4rqk6i0phs73bcp510';
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
for (const name of names) {
  const value = env[name];
  if (!value) {
    console.log(`${name}: missing in the env file`);
    continue;
  }
  const r = await fetch(`https://api.render.com/v1/services/${SERVICE}/env-vars/${name}`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${process.env.RENDER_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ value }),
  });
  console.log(`${name}: ${r.status}`);
}

// Fail when a secret is in the repo.
//  1. Exact keys: every long token in every tracked file is hashed and checked
//     against scripts/secret-hashes.json (SHA-256 of each partner key; the
//     repo holds only the hashes).
//  2. Patterns: private keys, keypair byte arrays, and the key formats of
//     Supabase, ElevenLabs, Firecrawl, Pollar, Render and GitHub.
// Usage: node scripts/secret-scan.mjs            scan tracked files
//        node scripts/secret-scan.mjs --hash F   write hashes of F's values
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const HASHES = new URL('./secret-hashes.json', import.meta.url);
const sha = (s) => createHash('sha256').update(s).digest('hex');

if (process.argv[2] === '--hash') {
  const lines = readFileSync(process.argv[3], 'utf8').split(/\r?\n/).filter((l) => l.includes('='));
  const out = lines
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])
    .filter(([, v]) => v.length >= 20)
    .map(([k, v]) => ({ name: k, sha256: sha(v) }));
  writeFileSync(HASHES, JSON.stringify(out, null, 2) + '\n');
  console.log(`hashed ${out.length} keys: ${out.map((o) => o.name).join(', ')}`);
  process.exit(0);
}

const PATTERNS = [
  ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['Solana keypair array', /\[\s*(\d{1,3}\s*,\s*){63}\d{1,3}\s*\]/],
  ['Supabase JWT key', /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.eyJpc3MiOiJzdXBhYmFzZSI[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/],
  ['Supabase secret or access token', /\b(sb_secret_[A-Za-z0-9_-]{20,}|sbp_[a-f0-9]{40})\b/],
  ['ElevenLabs key', /\bsk_[a-f0-9]{48}\b/],
  ['Firecrawl key', /\bfc-[a-f0-9]{32}\b/],
  ['Pollar key', /\b(pub|sec)_(testnet|mainnet|live|test)_[a-f0-9]{24,}\b/],
  ['Render key', /\brnd_[A-Za-z0-9]{20,}\b/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
];

const known = existsSync(HASHES) ? new Map(JSON.parse(readFileSync(HASHES, 'utf8')).map((h) => [h.sha256, h.name])) : new Map();
const files = execSync('git ls-files -z', { encoding: 'utf8' }).split('\0').filter(Boolean);
const skip = /\.(png|jpg|jpeg|gif|webp|mp4|so|apk|ico|woff2?)$|pnpm-lock\.yaml$|secret-hashes\.json$/;
let bad = 0;
for (const f of files) {
  if (skip.test(f) || !existsSync(f)) continue;
  const text = readFileSync(f, 'utf8');
  for (const [name, re] of PATTERNS) {
    if (re.test(text)) {
      console.log(`${f}: ${name}`);
      bad++;
    }
  }
  for (const tok of text.match(/[A-Za-z0-9_.-]{20,}/g) ?? []) {
    const hit = known.get(sha(tok));
    if (hit) {
      console.log(`${f}: the value of ${hit}`);
      bad++;
    }
  }
}
if (bad) {
  console.log(`secret scan: ${bad} finding(s)`);
  process.exit(1);
}
console.log(`secret scan: ${files.length} files clean, ${known.size} known keys checked`);

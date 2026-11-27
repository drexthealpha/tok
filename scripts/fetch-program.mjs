// Download a deployed program's bytes from devnet, for LiteSVM tests.
// Usage: node scripts/fetch-program.mjs <program address> <out.so>
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import bs58 from 'bs58';

const [, , programId, out] = process.argv;
const RPC = process.env.DEVNET_RPC ?? 'https://api.devnet.solana.com';

async function account(addr) {
  for (let i = 0; i < 5; i++) {
    const r = await fetch(RPC, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAccountInfo', params: [addr, { encoding: 'base64' }] }),
    });
    if (r.ok) {
      const j = await r.json();
      if (j.result?.value) return Buffer.from(j.result.value.data[0], 'base64');
    }
    await new Promise((s) => setTimeout(s, 1000 * (i + 1)));
  }
  throw new Error(`Could not read ${addr}`);
}

const program = await account(programId);
if (program.readUInt32LE(0) !== 2) throw new Error('Not an upgradeable program');
const programData = bs58.encode(program.subarray(4, 36));
const data = await account(programData);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, data.subarray(45));
console.log(`${programId}: ${data.length - 45} bytes -> ${out}`);

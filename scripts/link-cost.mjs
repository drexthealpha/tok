// The makers' cost of pay links, read from devnet transactions: the fee
// payer's balance change in each deposit and its claim (fees plus rent; the
// claim returns the claim account's and vault's rent).
// Usage: node scripts/link-cost.mjs <deposit sig>:<claim sig> [...]
const RPC = process.env.DEVNET_RPC ?? 'https://api.devnet.solana.com';
const FEE_PAYER = process.env.FEE_PAYER ?? 'ByWbpvCjdgiUdamJ7t47toUMreqapqgPcBfjyTkEcNX2';

async function delta(sig) {
  for (let i = 0; i < 5; i++) {
    const r = await fetch(RPC, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTransaction', params: [sig, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' }] }),
    });
    const j = await r.json();
    const tx = j.result;
    if (tx) {
      const keys = tx.transaction.message.accountKeys;
      const idx = keys.indexOf(FEE_PAYER);
      return { cost: tx.meta.preBalances[idx] - tx.meta.postBalances[idx], fee: tx.meta.fee };
    }
    await new Promise((s) => setTimeout(s, 1500));
  }
  throw new Error(`no transaction ${sig}`);
}

const rows = [];
for (const pair of process.argv.slice(2)) {
  const [d, c] = pair.split(':');
  const dep = await delta(d);
  const clm = await delta(c);
  rows.push(dep.cost + clm.cost);
  console.log(`deposit ${dep.cost} (fee ${dep.fee}) + claim ${clm.cost} (fee ${clm.fee}) = ${dep.cost + clm.cost} lamports`);
}
if (rows.length) {
  rows.sort((a, b) => a - b);
  console.log(`links ${rows.length}, median ${rows[rows.length >> 1]} lamports, highest ${rows.at(-1)} lamports`);
}

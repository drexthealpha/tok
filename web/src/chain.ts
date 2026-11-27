import {
  appendTransactionMessageInstructions,
  compileTransaction,
  createSolanaRpc,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getBase64Decoder,
  getBase64Encoder,
  getTransactionEncoder,
  partiallySignTransaction,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Instruction,
  type KeyPairSigner,
} from '@solana/kit';
import { COMPUTE_BUDGET_PROGRAM } from '@tok/core';
import { RPC_URL, SERVER } from './config';

export const rpc = createSolanaRpc(RPC_URL);

let feePayerCache: Promise<Address> | null = null;
/** The makers' fee payer, read from the server (which asks Kora). */
export function feePayer(): Promise<Address> {
  feePayerCache ??= fetch(`${SERVER}/config`)
    .then((r) => {
      if (!r.ok) throw new Error('Tok server is waking up. Try again in a minute.');
      return r.json() as Promise<{ feePayer: Address }>;
    })
    .then((j) => j.feePayer)
    .catch((e) => {
      feePayerCache = null;
      throw e;
    });
  return feePayerCache;
}

/** Wake the free server as soon as the page opens. */
export function wakeServer() {
  fetch(`${SERVER}/health`).catch(() => undefined);
  feePayer().catch(() => undefined);
}

export function computeUnits(units: number): Instruction {
  const data = new Uint8Array(5);
  data[0] = 2;
  new DataView(data.buffer).setUint32(1, units, true);
  return { programAddress: COMPUTE_BUDGET_PROGRAM, accounts: [], data };
}

/** Slot of our last confirmed transaction: reads are never older than our own writes. */
let lastSlot = BigInt((typeof localStorage !== 'undefined' && localStorage.getItem('tok.slot')) || 0);

export async function accountData(a: Address): Promise<Uint8Array | null> {
  const r = await rpc
    .getAccountInfo(a, { encoding: 'base64', commitment: 'confirmed', ...(lastSlot ? { minContextSlot: lastSlot } : {}) })
    .send()
    .catch(async () => rpc.getAccountInfo(a, { encoding: 'base64', commitment: 'confirmed' }).send());
  if (!r.value) return null;
  return new Uint8Array(getBase64Encoder().encode(r.value.data[0]));
}

export async function slot(): Promise<bigint> {
  return rpc.getSlot({ commitment: 'confirmed' }).send();
}

export async function tokenBalance(tokenAccount: Address): Promise<bigint> {
  try {
    const r = await rpc.getTokenAccountBalance(tokenAccount, { commitment: 'confirmed' }).send();
    return BigInt(r.value.amount);
  } catch {
    return 0n;
  }
}

/**
 * Build the transaction with the makers' fee payer, sign it with any extra
 * signers (a claim key), and send it to Tok's server, which hands it to Kora.
 */
export async function relay(
  instructions: Instruction[],
  signers: KeyPairSigner[] = [],
  walletSign?: (wire: Uint8Array) => Promise<Uint8Array>,
): Promise<string> {
  const payer = await feePayer();
  const { value: bh } = await rpc.getLatestBlockhash({ commitment: 'confirmed' }).send();
  const msg = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(payer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(bh, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );
  let tx = compileTransaction(msg);
  if (signers.length) tx = await partiallySignTransaction(signers.map((s) => s.keyPair), tx);
  let wire: string = getBase64EncodedWireTransaction(tx);
  if (walletSign) {
    // The Android app: the phone's wallet signs as sender after its own approval.
    const signed = await walletSign(new Uint8Array(getTransactionEncoder().encode(tx)));
    wire = getBase64Decoder().decode(signed);
  }
  const r = await fetch(`${SERVER}/relay`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ transaction: wire }),
  });
  const j = (await r.json().catch(() => ({}))) as { signature?: string; error?: string };
  if (!r.ok || !j.signature) throw new Error(readable(j.error ?? `Server answered ${r.status}`));
  await confirm(j.signature);
  return j.signature;
}

export async function confirm(signature: string, timeoutMs = 60_000): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const r = await rpc.getSignatureStatuses([signature as never]).send();
    const s = r.value[0];
    if (s?.err) throw new Error(`The network refused it: ${JSON.stringify(s.err)}`);
    if (s && (s.confirmationStatus === 'confirmed' || s.confirmationStatus === 'finalized')) {
      if (s.slot > lastSlot) {
        lastSlot = s.slot;
        localStorage.setItem('tok.slot', String(lastSlot));
      }
      return;
    }
    await new Promise((res) => setTimeout(res, 400));
  }
  throw new Error('Not confirmed after 60 s');
}

function readable(e: string): string {
  if (/AccountNotInitialized|0xbc4/.test(e)) return 'This link was already claimed, cancelled or returned.';
  if (/insufficient funds|0x1\b/.test(e)) return 'Not enough USDC in this wallet.';
  if (/already in use/.test(e)) return 'This link was already used.';
  if (/0xbd2b/.test(e)) return 'The wallet changed while signing. Try again.';
  return e;
}

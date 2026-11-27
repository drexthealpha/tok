import {
  AccountRole,
  address,
  createKeyPairSignerFromPrivateKeyBytes,
  isAddress,
  type Address,
  type Instruction,
} from '@solana/kit';
import {
  ATA_PROGRAM,
  associatedTokenAddress,
  cancelInstruction,
  claimAddress,
  claimInstruction,
  createWalletInstruction,
  decodeClaim,
  depositInstruction,
  makePayLink,
  newClaimSeed,
  openSeed,
  PASSKEY_COMPUTE_UNITS,
  passkeySign,
  readLinkSecret,
  returnInstruction,
  sealSeed,
  swigAccountFor,
  swigFromAccount,
  SYSTEM_PROGRAM,
  USDC_DECIMALS,
  USDC_MINT,
  walletAddress,
  walletAddressFor,
  type ClaimRecord,
  type RunTime,
} from '@tok/core';
import { accountData, computeUnits, feePayer, relay, rpc, slot, tokenBalance } from './chain';
import { SITE } from './config';
import { publicKeyBytes, signer, type Passkey } from './passkey';
import { connectWallet, inApp, savedWallet, signWithWallet } from './mwa';

/** The token program is read from the mint's owner (devnet USDC: Token). */
let tokenProgramCache: Promise<Address> | null = null;
export function tokenProgram(): Promise<Address> {
  tokenProgramCache ??= (async () => {
    const r = await rpc.getAccountInfo(USDC_MINT, { encoding: 'base64' }).send();
    if (!r.value) throw new Error('Cannot read the USDC mint');
    return r.value.owner;
  })();
  return tokenProgramCache;
}

export async function usdcAccount(owner: Address) {
  return associatedTokenAddress(owner, USDC_MINT, await tokenProgram());
}

/** Create the associated token account if it is missing; the makers pay rent. */
export async function createAtaIdempotent(payer: Address, owner: Address): Promise<Instruction> {
  const tp = await tokenProgram();
  const ata = await associatedTokenAddress(owner, USDC_MINT, tp);
  return {
    programAddress: ATA_PROGRAM,
    accounts: [
      { address: payer, role: AccountRole.WRITABLE_SIGNER },
      { address: ata, role: AccountRole.WRITABLE },
      { address: owner, role: AccountRole.READONLY },
      { address: USDC_MINT, role: AccountRole.READONLY },
      { address: SYSTEM_PROGRAM, role: AccountRole.READONLY },
      { address: tp, role: AccountRole.READONLY },
    ],
    data: new Uint8Array([1]),
  };
}

export function transferChecked(from: Address, to: Address, owner: Address, amount: bigint, tp: Address): Instruction {
  const data = new Uint8Array(10);
  data[0] = 12;
  new DataView(data.buffer).setBigUint64(1, amount, true);
  data[9] = USDC_DECIMALS;
  return {
    programAddress: tp,
    accounts: [
      { address: from, role: AccountRole.WRITABLE },
      { address: USDC_MINT, role: AccountRole.READONLY },
      { address: to, role: AccountRole.WRITABLE },
      { address: owner, role: AccountRole.READONLY_SIGNER },
    ],
    data,
  };
}

export interface Wallet {
  swig: Address;
  address: Address;
  exists: boolean;
  /** "mwa": the Android app, signing with the phone's wallet. */
  kind?: 'passkey' | 'mwa';
}

export async function walletFor(p: Passkey): Promise<Wallet> {
  if (inApp()) {
    const a = savedWallet();
    if (!a) throw new Error('Connect your wallet first');
    return { swig: a, address: a, exists: true, kind: 'mwa' };
  }
  const swig = await swigAccountFor(publicKeyBytes(p));
  const data = await accountData(swig);
  if (!data) return { swig, address: swig, exists: false };
  return { swig, address: await walletAddress(swigFromAccount(swig, data)), exists: true };
}

/** Instructions that create the wallet and its USDC account, if missing. */
async function setupInstructions(p: Passkey): Promise<{ ixs: Instruction[]; wallet: Wallet }> {
  const payer = await feePayer();
  if (inApp()) {
    const a = savedWallet() ?? (await connectWallet());
    return { ixs: [await createAtaIdempotent(payer, a)], wallet: { swig: a, address: a, exists: true, kind: 'mwa' } };
  }
  let w = await walletFor(p);
  const ixs: Instruction[] = [];
  if (!w.exists) {
    ixs.push(await createWalletInstruction(publicKeyBytes(p), payer));
    w = { swig: w.swig, address: await walletAddressFor(w.swig), exists: false };
  }
  ixs.push(await createAtaIdempotent(payer, w.address));
  return { ixs, wallet: w };
}

export async function ensureWallet(p: Passkey): Promise<Wallet> {
  if (inApp()) {
    const a = savedWallet() ?? (await connectWallet());
    return { swig: a, address: a, exists: true, kind: 'mwa' };
  }
  const w = await walletFor(p);
  if (w.exists) return w;
  const { ixs, wallet } = await setupInstructions(p);
  await relay(ixs);
  return { ...wallet, exists: true };
}

export async function balance(w: Wallet): Promise<bigint> {
  return tokenBalance(await usdcAccount(w.address));
}

async function signWithPasskey(p: Passkey, w: Wallet, ixs: Instruction[]): Promise<Instruction[]> {
  const data = await accountData(w.swig);
  if (!data) throw new Error('Wallet not found');
  return passkeySign(swigFromAccount(w.swig, data), publicKeyBytes(p), ixs, {
    payer: await feePayer(),
    currentSlot: await slot(),
    signingFn: signer(p),
  });
}

/** Sign instructions with the passkey wallet and send them, fees paid by the makers. */
export async function sendFromWallet(p: Passkey, w: Wallet, ixs: Instruction[], before: Instruction[] = []): Promise<string> {
  if (w.kind === 'mwa') return relay([...before, ...ixs], [], signWithWallet);
  const signed = await signWithPasskey(p, w, ixs);
  return relay([computeUnits(PASSKEY_COMPUTE_UNITS), ...before, ...signed]);
}

/* ---------- sent links, kept on this phone ---------- */

export interface SentLink {
  claimKey: Address;
  amount: string;
  link: string;
  at: number;
  expiresAt: number;
  sender: Address;
  state?: 'open' | 'cancelled' | 'returned' | 'claimed';
}
const SENT = 'tok.sent';
export function sentLinks(): SentLink[] {
  try {
    return JSON.parse(localStorage.getItem(SENT) ?? '[]') as SentLink[];
  } catch {
    return [];
  }
}
function saveSent(list: SentLink[]) {
  localStorage.setItem(SENT, JSON.stringify(list));
}
export function markSent(claimKey: Address, state: SentLink['state']) {
  saveSent(sentLinks().map((s) => (s.claimKey === claimKey ? { ...s, state } : s)));
}

/* ---------- run times ---------- */
const RUNS = 'tok.runs';
export function runs(): RunTime[] {
  try {
    return JSON.parse(localStorage.getItem(RUNS) ?? '[]') as RunTime[];
  } catch {
    return [];
  }
}
export function logRun(r: RunTime) {
  localStorage.setItem(RUNS, JSON.stringify([...runs(), r]));
  console.info(`[tok] ${r.kind} ${Math.round(r.ms)} ms ${r.signature}`);
}

/* ---------- pay ---------- */

export interface PayResult {
  link: string;
  signature: string;
  phrase?: string;
}

/** Pay tap -> confirmed deposit. Returns the link to share. */
export async function pay(p: Passkey, w: Wallet, amount: bigint, phrase?: string): Promise<PayResult> {
  const t0 = performance.now();
  const seed = newClaimSeed();
  const claimKey = await createKeyPairSignerFromPrivateKeyBytes(seed);
  const tp = await tokenProgram();
  const dep = await depositInstruction({
    rentPayer: await feePayer(),
    sender: w.address,
    mint: USDC_MINT,
    tokenProgram: tp,
    claimKey: claimKey.address,
    amount,
  });
  const signature = await sendFromWallet(p, w, [dep]);
  const link = phrase
    ? makePayLink(SITE, { kind: 'locked', sealed: await sealSeed(seed, phrase) })
    : makePayLink(SITE, { kind: 'plain', seed });
  logRun({ kind: 'pay', ms: performance.now() - t0, signature, at: new Date().toISOString() });
  const now = Date.now();
  saveSent([
    ...sentLinks(),
    {
      claimKey: claimKey.address,
      amount: amount.toString(),
      link,
      at: now,
      expiresAt: now + 7 * 24 * 3600 * 1000,
      sender: w.address,
      state: 'open',
    },
  ]);
  return { link, signature, phrase };
}

/* ---------- claim ---------- */

export interface OpenedLink {
  claimKey: Address;
  seedSigner: Awaited<ReturnType<typeof createKeyPairSignerFromPrivateKeyBytes>>;
  record: ClaimRecord | null;
}

export type LinkState =
  | { kind: 'none' }
  | { kind: 'locked'; sealed: Uint8Array }
  | { kind: 'ready'; opened: OpenedLink };

export async function readLink(hash: string, phrase?: string): Promise<LinkState> {
  const s = readLinkSecret(hash);
  if (!s) return { kind: 'none' };
  let seed: Uint8Array;
  if (s.kind === 'locked') {
    if (!phrase) return { kind: 'locked', sealed: s.sealed };
    seed = await openSeed(s.sealed, phrase);
  } else {
    seed = s.seed;
  }
  const seedSigner = await createKeyPairSignerFromPrivateKeyBytes(seed);
  const data = await accountData(await claimAddress(seedSigner.address));
  return { kind: 'ready', opened: { claimKey: seedSigner.address, seedSigner, record: data ? decodeClaim(data) : null } };
}

/**
 * Link opened -> confirmed claim. One transaction: create the receiver's
 * wallet and USDC account if needed, then claim with the claim key.
 * The receiver's passkey is not asked to sign: the claim key signs.
 */
export async function claim(p: Passkey, opened: OpenedLink, openedAt: number): Promise<string> {
  if (!opened.record) throw new Error('This link was already claimed, cancelled or returned.');
  const tp = await tokenProgram();
  const { ixs, wallet } = await setupInstructions(p);
  const c = await claimInstruction({
    claimKey: opened.claimKey,
    rentPayer: opened.record.rentPayer,
    mint: USDC_MINT,
    tokenProgram: tp,
    receiverTokens: await usdcAccount(wallet.address),
  });
  const signature = await relay([...ixs, c], [opened.seedSigner]);
  logRun({ kind: 'claim', ms: performance.now() - openedAt, signature, at: new Date().toISOString() });
  return signature;
}

/**
 * Claim into any wallet address, for example a Pollar wallet made by email
 * sign-in. The claim key signs; the makers pay for the USDC account.
 */
export async function claimInto(owner: Address, opened: OpenedLink, openedAt: number): Promise<string> {
  if (!opened.record) throw new Error('This link was already claimed, cancelled or returned.');
  const tp = await tokenProgram();
  const c = await claimInstruction({
    claimKey: opened.claimKey,
    rentPayer: opened.record.rentPayer,
    mint: USDC_MINT,
    tokenProgram: tp,
    receiverTokens: await usdcAccount(owner),
  });
  const signature = await relay([await createAtaIdempotent(await feePayer(), owner), c], [opened.seedSigner]);
  logRun({ kind: 'claim', ms: performance.now() - openedAt, signature, at: new Date().toISOString() });
  return signature;
}

/* ---------- after a claim, and the sender's controls ---------- */

export async function cancel(p: Passkey, w: Wallet, claimKey: Address): Promise<string> {
  const data = await accountData(await claimAddress(claimKey));
  if (!data) throw new Error('This link was already claimed, cancelled or returned.');
  const rec = decodeClaim(data);
  const ix = await cancelInstruction({
    claimKey,
    rentPayer: rec.rentPayer,
    mint: USDC_MINT,
    tokenProgram: await tokenProgram(),
    sender: w.address,
  });
  const sig = await sendFromWallet(p, w, [ix]);
  markSent(claimKey, 'cancelled');
  return sig;
}

/** Sent by the sender's page when it opens after day 7. Needs no passkey. */
export async function returnExpired(): Promise<string[]> {
  const out: string[] = [];
  const now = Date.now();
  for (const s of sentLinks()) {
    if (s.state !== 'open' || s.expiresAt > now) continue;
    const data = await accountData(await claimAddress(s.claimKey));
    if (!data) {
      markSent(s.claimKey, 'claimed');
      continue;
    }
    const rec = decodeClaim(data);
    if (BigInt(Math.floor(now / 1000)) < rec.expiresAt) continue;
    const ix = await returnInstruction({
      claimKey: s.claimKey,
      rentPayer: rec.rentPayer,
      mint: USDC_MINT,
      tokenProgram: await tokenProgram(),
      sender: rec.sender,
    });
    out.push(await relay([ix]));
    markSent(s.claimKey, 'returned');
  }
  return out;
}

/** Refresh the state of sent links from the chain. */
export async function refreshSent(): Promise<SentLink[]> {
  for (const s of sentLinks()) {
    if (s.state !== 'open') continue;
    if (!(await accountData(await claimAddress(s.claimKey)))) markSent(s.claimKey, 'claimed');
  }
  return sentLinks();
}

/** Send a USDC amount from the passkey wallet to any Solana address. */
export async function sendTo(p: Passkey, w: Wallet, to: string, amount: bigint): Promise<string> {
  const target = to.trim();
  if (!isAddress(target)) throw new Error('That is not a Solana address');
  const tp = await tokenProgram();
  const payer = await feePayer();
  const dest = address(target);
  const ixs = [
    await createAtaIdempotent(payer, dest),
    transferChecked(await usdcAccount(w.address), await usdcAccount(dest), w.address, amount, tp),
  ];
  return sendFromWallet(p, w, [ixs[1]!], [ixs[0]!]);
}

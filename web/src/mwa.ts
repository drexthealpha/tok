/**
 * The Android app (Seeker): the page signs with the phone's own wallet
 * through Mobile Wallet Adapter instead of a passkey. The makers' fee payer
 * still pays every fee.
 */
import {
  createDefaultAuthorizationCache,
  createDefaultChainSelector,
  createDefaultWalletNotFoundHandler,
  LocalSolanaMobileWalletAdapterWallet,
} from '@solana-mobile/wallet-standard-mobile';
import type { Address } from '@solana/kit';
import { SITE } from './config';

const APP = 'tok.app';

/** True inside the Android app (it opens the page with ?app=android). */
export function inApp(): boolean {
  if (typeof location === 'undefined') return false;
  if (new URLSearchParams(location.search).get('app') === 'android') sessionStorage.setItem(APP, '1');
  return sessionStorage.getItem(APP) === '1' || document.referrer.startsWith('android-app://io.github.drexthealpha.tok');
}

let wallet: LocalSolanaMobileWalletAdapterWallet | null = null;
function mwa(): LocalSolanaMobileWalletAdapterWallet {
  wallet ??= new LocalSolanaMobileWalletAdapterWallet({
    appIdentity: { name: 'Tok', uri: SITE, icon: 'icon.svg' },
    authorizationCache: createDefaultAuthorizationCache(),
    chains: ['solana:devnet'],
    chainSelector: createDefaultChainSelector(),
    onWalletNotFound: createDefaultWalletNotFoundHandler(),
  });
  return wallet;
}

type Features = Record<string, Record<string, (...a: unknown[]) => Promise<unknown>>>;

/** Connect (the wallet asks for approval) and return the account address. */
export async function connectWallet(): Promise<Address> {
  const w = mwa();
  const f = w.features as unknown as Features;
  const r = (await f['standard:connect']!.connect!()) as { accounts: { address: string }[] };
  const a = r.accounts[0]?.address ?? w.accounts[0]?.address;
  if (!a) throw new Error('The wallet gave no account');
  localStorage.setItem('tok.mwa', a);
  return a as Address;
}

export function savedWallet(): Address | null {
  return (localStorage.getItem('tok.mwa') as Address | null) ?? null;
}

function account() {
  const w = mwa();
  const a = w.accounts[0];
  if (!a) throw new Error('Connect your wallet first');
  return a;
}

/** The wallet signs the transaction after its own approval screen. */
export async function signWithWallet(wire: Uint8Array): Promise<Uint8Array> {
  if (!mwa().accounts.length) await connectWallet();
  const f = mwa().features as unknown as Features;
  const sign = f['solana:signTransaction'];
  if (!sign?.signTransaction) throw new Error('This wallet cannot sign without sending');
  const out = (await sign.signTransaction({ transaction: wire, account: account(), chain: 'solana:devnet' })) as { signedTransaction: Uint8Array }[];
  return out[0]!.signedTransaction;
}

export async function signMessageWithWallet(message: Uint8Array): Promise<Uint8Array> {
  if (!mwa().accounts.length) await connectWallet();
  const f = mwa().features as unknown as Features;
  const out = (await f['solana:signMessage']!.signMessage!({ message, account: account() })) as { signature: Uint8Array }[];
  return out[0]!.signature;
}

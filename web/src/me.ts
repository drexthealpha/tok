import { useCallback, useEffect, useState } from 'preact/hooks';
import { createPasskey, MWA_MARK, savedPasskey as savedPasskeyOnly, usePasskeyOnThisPhone, type Passkey } from './passkey';
import { connectWallet, inApp, savedWallet } from './mwa';

function savedPasskey(): Passkey | null {
  if (inApp()) return savedWallet() ? MWA_MARK : null;
  return savedPasskeyOnly();
}
import { balance, ensureWallet, walletFor, type Wallet } from './tok';
import { counter } from './counter';

export interface Me {
  passkey: Passkey | null;
  wallet: Wallet | null;
  usdc: bigint | null;
  refresh: () => Promise<void>;
  /** Create a passkey (one prompt) and the wallet, paid for by the makers. */
  start: () => Promise<{ passkey: Passkey; wallet: Wallet }>;
  /** Use a passkey already on this phone. */
  signIn: () => Promise<void>;
}

export function useMe(): Me {
  const [passkey, setPasskey] = useState<Passkey | null>(savedPasskey());
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [usdc, setUsdc] = useState<bigint | null>(null);

  const refresh = useCallback(async () => {
    const p = savedPasskey();
    setPasskey(p);
    if (!p) return;
    const w = await walletFor(p);
    setWallet(w);
    setUsdc(w.exists ? await balance(w) : 0n);
  }, []);

  useEffect(() => {
    refresh().catch(() => undefined);
    const t = setInterval(() => refresh().catch(() => undefined), 8000);
    return () => clearInterval(t);
  }, [refresh]);

  const start = useCallback(async () => {
    let p = savedPasskey();
    if (!p && inApp()) {
      await connectWallet();
      p = MWA_MARK;
      counter.add();
    }
    if (!p) {
      p = await createPasskey();
      counter.add();
    }
    setPasskey(p);
    const w = await ensureWallet(p);
    setWallet(w);
    setUsdc(await balance(w));
    return { passkey: p, wallet: w };
  }, []);

  const signIn = useCallback(async () => {
    await usePasskeyOnThisPhone();
    await refresh();
  }, [refresh]);

  return { passkey, wallet, usdc, refresh, start, signIn };
}

// @vitest-environment happy-dom
// Part 4: the pay and claim page.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { generateKeyPairSigner } from '@solana/kit';
import { makePayLink, newClaimSeed, type ClaimRecord } from '@tok/core';

const calls: { url: string; body: string }[] = [];
const record: { value: ClaimRecord | null } = { value: null };
const relayResult: { fail: string | null } = { fail: null };

vi.mock('../src/chain', async () => {
  return {
    rpc: {},
    feePayer: async () => 'ByWbpvCjdgiUdamJ7t47toUMreqapqgPcBfjyTkEcNX2',
    wakeServer: () => undefined,
    computeUnits: () => ({ programAddress: 'ComputeBudget111111111111111111111111111111', accounts: [], data: new Uint8Array() }),
    accountData: async () => null,
    slot: async () => 1n,
    tokenBalance: async () => 0n,
    confirm: async () => undefined,
    relay: async () => {
      if (relayResult.fail) throw new Error(relayResult.fail);
      return '5xSignatureForTest';
    },
  };
});

vi.mock('../src/tok', async (orig) => {
  const real = await orig<typeof import('../src/tok')>();
  return {
    ...real,
    readLink: async (hash: string) => {
      const st = await real.readLink.call(null, hash).catch(() => ({ kind: 'none' as const }));
      if (st.kind !== 'ready') return st;
      return { kind: 'ready', opened: { ...st.opened, record: record.value } };
    },
    claim: async (_p: unknown, opened: { record: ClaimRecord | null }, openedAt: number) => {
      if (relayResult.fail) throw new Error(relayResult.fail);
      real.logRun({ kind: 'claim', ms: performance.now() - openedAt, signature: '5xSignatureForTest', at: '' });
      void opened;
      return '5xSignatureForTest';
    },
  };
});

vi.mock('../src/passkey', async (orig) => {
  const real = await orig<typeof import('../src/passkey')>();
  return {
    ...real,
    passkeysAvailable: async () => (globalThis as { __passkeys?: boolean }).__passkeys ?? true,
    createPasskey: async () => ({ credentialId: 'AA', publicKey: '02' + '11'.repeat(32) }),
  };
});

const tick = () => act(() => new Promise((r) => setTimeout(r, 30)));

async function mount(hash: string, ua?: string) {
  history.replaceState(null, '', '/tok/c' + hash);
  if (ua) Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
  const root = document.createElement('div');
  document.body.appendChild(root);
  const { ClaimScreen } = await import('../src/screens/claim');
  await act(() => render(<ClaimScreen />, root));
  for (let i = 0; i < 10; i++) await tick();
  return root;
}

const click = async (root: HTMLElement, text: string) => {
  const b = [...root.querySelectorAll('button')].find((x) => x.textContent?.includes(text));
  if (!b) throw new Error(`no button ${text}: ${root.textContent}`);
  await act(() => b.click());
  for (let i = 0; i < 10; i++) await tick();
};

let secret = '';
beforeEach(async () => {
  calls.length = 0;
  relayResult.fail = null;
  localStorage.clear();
  const sender = await generateKeyPairSigner();
  record.value = {
    sender: sender.address,
    mint: sender.address,
    amount: 5_000_000n,
    claimKey: sender.address,
    createdAt: 0n,
    expiresAt: 0n,
    rentPayer: sender.address,
    bump: 255,
  };
  const link = makePayLink('https://tok.test/tok', { kind: 'plain', seed: newClaimSeed() });
  secret = new URL(link).hash;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: String(init?.body ?? '') });
    return new Response('{}');
  });
  Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (Linux; Android 15) Chrome/131 Mobile', configurable: true });
});
afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('claim page (part 4)', () => {
  it('reads the claim key after "#" and sends it to no server', async () => {
    const root = await mount(secret);
    expect(root.textContent).toContain('5 USDC');
    await click(root, 'Receive');
    const key = secret.slice(2);
    for (const c of calls) {
      expect(c.url.includes(key)).toBe(false);
      expect(c.body.includes(key)).toBe(false);
    }
  });

  it('shows Claiming, then Received with the signature', async () => {
    const root = await mount(secret);
    const b = [...root.querySelectorAll('button')].find((x) => x.textContent?.includes('Receive'))!;
    act(() => b.click());
    expect(root.textContent).toContain('Claiming');
    for (let i = 0; i < 10; i++) await tick();
    expect(root.textContent).toContain('Received');
    expect(root.textContent).toContain('5xSignatureF');
    expect(root.textContent).toContain('cannot be recovered');
  });

  it('shows the reason and Try again when the claim fails', async () => {
    relayResult.fail = 'This link was already claimed, cancelled or returned.';
    const root = await mount(secret);
    await click(root, 'Receive');
    expect(root.textContent).toContain('already claimed');
    relayResult.fail = null;
    await click(root, 'Try again');
    expect(root.textContent).toContain('Received');
  });

  it('shows "Open in your browser" inside a chat app, keeping the secret out of the URL on Android', async () => {
    const root = await mount(secret, 'Mozilla/5.0 (Linux; Android 14; wv) WhatsApp/2.24');
    expect(root.textContent).toContain('Open in your browser');
    expect(root.textContent).not.toContain('Receive');
  });

  it('shows "Open in your browser" when the browser cannot make passkeys', async () => {
    (globalThis as { __passkeys?: boolean }).__passkeys = false;
    const root = await mount(secret);
    expect(root.textContent).toContain('Open in your browser');
    (globalThis as { __passkeys?: boolean }).__passkeys = true;
  });

  it('logs the link-to-claim time of each run', async () => {
    const root = await mount(secret);
    await click(root, 'Receive');
    const { runs } = await import('../src/tok');
    expect(runs().filter((r) => r.kind === 'claim')).toHaveLength(1);
  });
});

describe('pay screen (part 4)', () => {
  it('shows the warning sentence', async () => {
    history.replaceState(null, '', '/tok/');
    const root = document.createElement('div');
    document.body.appendChild(root);
    const { PayScreen, WARNING } = await import('../src/screens/pay');
    await act(() => render(<PayScreen />, root));
    expect(root.textContent).toContain(WARNING);
    expect(WARNING).toBe(
      'Anyone who can read this message can take the money before your contact does. For larger amounts, turn on a pass phrase and send it another way.',
    );
    expect(root.querySelector('button.primary')?.textContent).toBe('Pay');
  });
});

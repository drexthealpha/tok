/** A small JSON-RPC client for Kora, the fee relayer. */
export interface Kora {
  payer(): Promise<string>;
  signAndSend(transactionBase64: string): Promise<string>;
}

export function koraClient(url: string, fetchFn: typeof fetch = fetch): Kora {
  let id = 0;
  async function call<T>(method: string, params: unknown): Promise<T> {
    const r = await fetchFn(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
    });
    const j = (await r.json()) as { result?: T; error?: { message?: string } };
    if (j.error || j.result === undefined) throw new Error(j.error?.message ?? `Kora ${method} failed`);
    return j.result;
  }
  let cached: string | null = null;
  return {
    async payer() {
      if (cached) return cached;
      const r = await call<{ signer_address?: string; signerAddress?: string }>('getPayerSigner', {});
      cached = r.signer_address ?? r.signerAddress ?? null;
      if (!cached) throw new Error('Kora returned no payer');
      return cached;
    },
    async signAndSend(transaction) {
      const r = await call<{ signature?: string; signed_transaction?: string }>('signAndSendTransaction', {
        transaction,
      });
      if (!r.signature) throw new Error('Kora returned no signature');
      return r.signature;
    },
  };
}

// Part 8: chat storage and real time (Supabase), and the database rule
// behind part 10 (a request is paid once). Runs against a real Supabase
// stack: `supabase start` in CI, given SUPABASE_URL and keys.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const on = !!(url && anon && service);

async function user(admin: SupabaseClient, wallet: string) {
  const c = createClient(url!, anon!, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInAnonymously();
  if (error || !data.user) throw error ?? new Error('no user');
  await c.realtime.setAuth(data.session!.access_token);
  const { error: e2 } = await admin.from('profiles').upsert({ user_id: data.user.id, wallet });
  if (e2) throw e2;
  return c;
}

describe.skipIf(!on)('chat on Supabase (part 8)', () => {
  let admin: SupabaseClient;
  let a: SupabaseClient;
  let b: SupabaseClient;
  let outsider: SupabaseClient;
  let chatId: string;
  const A = 'WalletA' + Date.now();
  const B = 'WalletB' + Date.now();

  beforeAll(async () => {
    admin = createClient(url!, service!, { auth: { persistSession: false } });
    a = await user(admin, A);
    b = await user(admin, B);
    outsider = await user(admin, 'WalletC' + Date.now());
    const { data, error } = await a.from('chats').insert({ created_by: A }).select('id').single();
    if (error) throw error;
    chatId = data.id as string;
    const m = await a.from('members').insert([
      { chat_id: chatId, wallet: A },
      { chat_id: chatId, wallet: B },
    ]);
    if (m.error) throw m.error;
  }, 60_000);

  afterAll(async () => {
    await Promise.all([a, b, outsider].map((c) => c?.removeAllChannels()));
  });

  it('a message sent by A appears for B in real time', async () => {
    const got = new Promise<string>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('no realtime message in 25 s')), 25_000);
      b.channel('t-' + chatId)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` }, (p) => {
          clearTimeout(t);
          resolve((p.new as { body: string }).body);
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            // Give the subscription a moment, then send.
            await new Promise((r) => setTimeout(r, 2000));
            const { error } = await a.from('messages').insert({ chat_id: chatId, sender: A, kind: 'text', body: 'hello B' });
            if (error) reject(error);
          }
        });
    });
    expect(await got).toBe('hello B');
  }, 40_000);

  it('a user who is not in the chat cannot read or write it', async () => {
    const r = await outsider.from('messages').select('*').eq('chat_id', chatId);
    expect(r.error).toBeNull();
    expect(r.data).toEqual([]);
    const w = await outsider.from('messages').insert({ chat_id: chatId, sender: 'WalletC', kind: 'text', body: 'x' });
    expect(w.error).not.toBeNull();
    const mine = await b.from('messages').select('body').eq('chat_id', chatId);
    expect(mine.data?.length).toBeGreaterThan(0);
  });

  it('a member cannot send as someone else', async () => {
    const w = await b.from('messages').insert({ chat_id: chatId, sender: A, kind: 'text', body: 'spoof' });
    expect(w.error).not.toBeNull();
  });

  it('a request can be paid once (part 10)', async () => {
    const req = await a.from('messages').insert({ chat_id: chatId, sender: A, kind: 'request', amount: 2_000_000 }).select('id').single();
    if (req.error) throw req.error;
    const pay = { chat_id: chatId, sender: B, kind: 'pay', amount: 2_000_000, to_wallet: A, request_id: req.data.id, signature: 'sig1' };
    expect((await b.from('messages').insert(pay)).error).toBeNull();
    expect((await b.from('messages').insert({ ...pay, signature: 'sig2' })).error).not.toBeNull();
  });
});

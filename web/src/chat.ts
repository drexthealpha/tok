/**
 * Tok chat on Supabase. Supabase stores the messages and sends them to the
 * other members in real time; row level security lets only members read.
 * Sign-in: an anonymous Supabase user, then Tok's server links it to the
 * wallet after one passkey check over that user's id.
 */
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { sha256 } from '@noble/hashes/sha2.js';
import { findLinks, previewTarget, splitExact } from '@tok/core';
import { SERVER } from './config';
import type { Passkey } from './passkey';
import { inApp, signMessageWithWallet } from './mwa';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const chatReady = !!(SUPABASE_URL && SUPABASE_KEY);
let client: SupabaseClient | null = null;
export function sb(): SupabaseClient {
  if (!chatReady) throw new Error('Chat is not set up on this build');
  client ??= createClient(SUPABASE_URL!, SUPABASE_KEY!, { auth: { persistSession: true, storageKey: 'tok.chat' } });
  return client;
}

export interface Message {
  id: string;
  chat_id: string;
  sender: string;
  kind: 'text' | 'pay' | 'request' | 'voice' | 'action';
  body: string | null;
  amount: number | null;
  to_wallet: string | null;
  request_id: string | null;
  split_id: string | null;
  signature: string | null;
  audio_path: string | null;
  transcript: string | null;
  preview: { title?: string; image?: string; url: string } | null;
  created_at: string;
}

export interface ChatSummary {
  id: string;
  others: string[];
}

const b64u = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b as ArrayBuffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s: string) => {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(t + '='.repeat((4 - (t.length % 4)) % 4)), (c) => c.charCodeAt(0));
};

/** Sign in to chat as the owner of this passkey's wallet. One passkey check, once per phone. */
export async function signInChat(p: Passkey, wallet: string): Promise<void> {
  const s = sb();
  let { data } = await s.auth.getSession();
  if (!data.session) {
    const r = await s.auth.signInAnonymously();
    if (r.error) throw new Error(r.error.message);
    data = { session: r.data.session! };
  }
  const session = data.session!;
  const mine = await s.from('profiles').select('wallet').eq('user_id', session.user.id).maybeSingle();
  if (mine.data?.wallet === wallet) return;
  if (inApp()) {
    // The Android app: the phone's wallet signs the sign-in message.
    const sig = await signMessageWithWallet(new TextEncoder().encode(`tok-chat:${session.user.id}`));
    return bind(session.access_token, { kind: 'ed25519', wallet, signature: b64u(sig) });
  }
  const challenge = sha256(new TextEncoder().encode(`tok-chat:${session.user.id}`));
  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge,
      rpId: location.hostname,
      allowCredentials: [{ type: 'public-key', id: unb64u(p.credentialId) }],
      userVerification: 'required',
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('No passkey check');
  const res = cred.response as AuthenticatorAssertionResponse;
  return bind(session.access_token, {
        kind: 'passkey',
        publicKey: p.publicKey,
        authenticatorData: b64u(res.authenticatorData),
        clientDataJSON: b64u(res.clientDataJSON),
    signature: b64u(res.signature),
  });
}

async function bind(accessToken: string, proof: Record<string, string>) {
  const r = await fetch(`${SERVER}/chat/bind`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accessToken, proof }),
  });
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'Chat sign-in failed');
}

export async function myChats(me: string): Promise<ChatSummary[]> {
  const { data, error } = await sb().from('members').select('chat_id, wallet');
  if (error) throw new Error(error.message);
  const by = new Map<string, string[]>();
  for (const m of data ?? []) {
    const list = by.get(m.chat_id as string) ?? [];
    if (m.wallet !== me) list.push(m.wallet as string);
    by.set(m.chat_id as string, list);
  }
  return [...by].map(([id, others]) => ({ id, others }));
}

/** The chat between me and these wallets, made if missing. */
export async function chatWith(me: string, others: string[]): Promise<string> {
  const want = [...new Set(others.filter((o) => o !== me))].sort();
  const existing = (await myChats(me)).find((c) => [...c.others].sort().join() === want.join());
  if (existing) return existing.id;
  const s = sb();
  const c = await s.from('chats').insert({ created_by: me }).select('id').single();
  if (c.error) throw new Error(c.error.message);
  const m = await s.from('members').insert([me, ...want].map((wallet) => ({ chat_id: c.data.id, wallet })));
  if (m.error) throw new Error(m.error.message);
  return c.data.id as string;
}

export async function addMember(chatId: string, wallet: string) {
  const { error } = await sb().from('members').insert({ chat_id: chatId, wallet });
  if (error) throw new Error(error.message);
}

export async function members(chatId: string): Promise<string[]> {
  const { data, error } = await sb().from('members').select('wallet').eq('chat_id', chatId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((m) => m.wallet as string);
}

export async function messages(chatId: string): Promise<Message[]> {
  const { data, error } = await sb().from('messages').select('*').eq('chat_id', chatId).order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []) as Message[];
}

export function subscribe(chatId: string, on: (m: Message, kind: 'INSERT' | 'UPDATE') => void): RealtimeChannel {
  return sb()
    .channel(`chat-${chatId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` }, (p) => {
      if (p.eventType === 'INSERT' || p.eventType === 'UPDATE') on(p.new as Message, p.eventType);
    })
    .subscribe();
}

async function insert(row: Partial<Message>): Promise<Message> {
  const { data, error } = await sb().from('messages').insert(row).select('*').single();
  if (error) throw new Error(error.message);
  return data as Message;
}

/** Hosts whose links are Tok pay links: never sent for a preview. */
export const PAY_HOSTS = typeof location === 'undefined' ? [] : [location.host];

/** Ask Tok's server for a preview of the first ordinary link in the text. */
export async function previewFor(text: string): Promise<Message['preview']> {
  for (const link of findLinks(text)) {
    const target = previewTarget(link, PAY_HOSTS);
    if (!target) continue;
    const r = await fetch(`${SERVER}/preview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: target }),
    }).catch(() => null);
    if (r?.ok) return (await r.json()) as Message['preview'];
    return null;
  }
  return null;
}

export async function sendText(chatId: string, me: string, body: string) {
  const preview = await previewFor(body).catch(() => null);
  return insert({ chat_id: chatId, sender: me, kind: 'text', body, preview });
}

export async function sendPayment(chatId: string, me: string, to: string, amount: bigint, signature: string, requestId?: string) {
  return insert({
    chat_id: chatId,
    sender: me,
    kind: 'pay',
    amount: Number(amount),
    to_wallet: to,
    signature,
    request_id: requestId ?? null,
  });
}

export async function sendRequest(chatId: string, me: string, from: string, amount: bigint, splitId?: string) {
  return insert({ chat_id: chatId, sender: me, kind: 'request', amount: Number(amount), to_wallet: from, split_id: splitId ?? null });
}

/** One request per member; the requests add up exactly to the total. */
export async function sendSplit(chatId: string, me: string, total: bigint, payers: string[]) {
  const parts = splitExact(total, payers.length);
  const splitId = crypto.randomUUID();
  const out: Message[] = [];
  for (let i = 0; i < payers.length; i++) out.push(await sendRequest(chatId, me, payers[i]!, parts[i]!, splitId));
  return out;
}

/** Store a voice message; Tok's server asks ElevenLabs for its text. */
export async function sendVoice(chatId: string, me: string, audio: Blob) {
  const path = `${chatId}/${crypto.randomUUID()}.webm`;
  const up = await sb().storage.from('voice').upload(path, audio, { contentType: audio.type || 'audio/webm' });
  if (up.error) throw new Error(up.error.message);
  const m = await insert({ chat_id: chatId, sender: me, kind: 'voice', audio_path: path });
  const { data } = await sb().auth.getSession();
  // Text under the message is best effort: the voice message stands without it.
  fetch(`${SERVER}/voice/transcribe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messageId: m.id, accessToken: data.session?.access_token }),
  }).catch(() => undefined);
  return m;
}

export async function voiceUrl(path: string): Promise<string> {
  const { data, error } = await sb().storage.from('voice').createSignedUrl(path, 3600);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

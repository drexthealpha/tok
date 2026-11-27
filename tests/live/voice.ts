/**
 * Live check of voice text (ElevenLabs) through Tok's server and the hosted
 * Supabase project. Outside CI: needs the keys in the private env file.
 * Run: npx tsx tests/live/voice.ts <partners.env> <audio file>
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const [, , envPath, audioPath] = process.argv;
const env = Object.fromEntries(
  readFileSync(envPath!, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
const SERVER = process.env.TOK_SERVER ?? 'https://tok-server.onrender.com';
const admin = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const user = createClient(env.SUPABASE_URL!, env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } });

const wallet = `LiveVoiceCheck${Date.now()}`;
const { data: s, error } = await user.auth.signInAnonymously();
if (error || !s.session) throw error;
await admin.from('profiles').upsert({ user_id: s.user!.id, wallet });
const chat = await user.from('chats').insert({ created_by: wallet }).select('id').single();
if (chat.error) throw chat.error;
await user.from('members').insert({ chat_id: chat.data.id, wallet });
const path = `${chat.data.id}/check.wav`;
const up = await user.storage.from('voice').upload(path, new Blob([readFileSync(audioPath!)], { type: 'audio/wav' }));
if (up.error) throw up.error;
const m = await user.from('messages').insert({ chat_id: chat.data.id, sender: wallet, kind: 'voice', audio_path: path }).select('id').single();
if (m.error) throw m.error;
const t0 = Date.now();
const r = await fetch(`${SERVER}/voice/transcribe`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ messageId: m.data.id, accessToken: s.session.access_token }),
});
console.log('transcribe', r.status, `${Date.now() - t0} ms`, JSON.stringify(await r.json()));
const back = await user.from('messages').select('transcript').eq('id', m.data.id).single();
console.log('stored transcript:', back.data?.transcript);
process.exit(back.data?.transcript ? 0 : 1);

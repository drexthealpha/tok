import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ChatAdmin } from './app';
import type { VoiceStore } from './media';

export function supabaseAdmin(url: string, serviceKey: string): ChatAdmin & VoiceStore & { client: SupabaseClient } {
  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    client,
    async userId(token) {
      const { data, error } = await client.auth.getUser(token);
      return error || !data.user ? null : data.user.id;
    },
    async voiceOf(messageId, userId) {
      const p = await client.from('profiles').select('wallet').eq('user_id', userId).maybeSingle();
      if (!p.data) return null;
      const m = await client.from('messages').select('sender, kind, audio_path').eq('id', messageId).maybeSingle();
      if (!m.data || m.data.kind !== 'voice' || m.data.sender !== p.data.wallet || !m.data.audio_path) return null;
      const f = await client.storage.from('voice').download(m.data.audio_path as string);
      if (f.error || !f.data) return null;
      return { audio: f.data };
    },
    async setTranscript(messageId, text) {
      const { error } = await client.from('messages').update({ transcript: text }).eq('id', messageId);
      if (error) throw new Error(error.message);
    },
    async bindWallet(userId, wallet) {
      const { error } = await client.from('profiles').upsert({ user_id: userId, wallet });
      if (error) throw new Error(error.message);
    },
  };
}

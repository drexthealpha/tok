import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ChatAdmin } from './app';

export function supabaseAdmin(url: string, serviceKey: string): ChatAdmin & { client: SupabaseClient } {
  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    client,
    async userId(token) {
      const { data, error } = await client.auth.getUser(token);
      return error || !data.user ? null : data.user.id;
    },
    async bindWallet(userId, wallet) {
      const { error } = await client.from('profiles').upsert({ user_id: userId, wallet });
      if (error) throw new Error(error.message);
    },
  };
}

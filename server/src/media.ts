/**
 * Link previews (Firecrawl) and voice message text (ElevenLabs speech to
 * text). Keys stay on the server.
 */
import type { Hono } from 'hono';
import { previewTarget } from '@tok/core';
import { Refused } from './relay';

export interface Preview {
  url: string;
  title?: string;
  image?: string;
}

/** Ask Firecrawl for a page's title and image. Pay links never get here. */
export async function firecrawlPreview(url: string, key: string, fetchFn: typeof fetch = fetch): Promise<Preview> {
  const r = await fetchFn('https://api.firecrawl.dev/v2/scrape', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true, timeout: 20000 }),
  });
  if (!r.ok) throw new Error(`Firecrawl answered ${r.status}`);
  const j = (await r.json()) as { data?: { metadata?: Record<string, unknown> } };
  const m = j.data?.metadata ?? {};
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = m[k];
      if (typeof v === 'string' && v) return v;
      if (Array.isArray(v) && typeof v[0] === 'string') return v[0] as string;
    }
    return undefined;
  };
  return { url, title: pick('ogTitle', 'og:title', 'title'), image: pick('ogImage', 'og:image', 'twitter:image') };
}

/** ElevenLabs speech to text for one audio file. */
export async function elevenLabsText(audio: Blob, key: string, fetchFn: typeof fetch = fetch): Promise<string> {
  const form = new FormData();
  form.append('model_id', 'scribe_v2');
  form.append('file', audio, 'voice.webm');
  const r = await fetchFn('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': key },
    body: form,
  });
  if (!r.ok) throw new Error(`ElevenLabs answered ${r.status}`);
  const j = (await r.json()) as { text?: string };
  return (j.text ?? '').trim();
}

export interface VoiceStore {
  userId(accessToken: string): Promise<string | null>;
  /** The voice message, if the user sent it. */
  voiceOf(messageId: string, userId: string): Promise<{ audio: Blob } | null>;
  setTranscript(messageId: string, text: string): Promise<void>;
}

export interface MediaDeps {
  payHosts: string[];
  firecrawlKey?: string;
  elevenLabsKey?: string;
  voice?: VoiceStore;
  fetchFn?: typeof fetch;
}

export function mountMedia(app: Hono, d: MediaDeps) {
  const cache = new Map<string, Preview>();

  app.post('/preview', async (c) => {
    const { url } = await c.req.json<{ url?: string }>().catch(() => ({}) as { url?: string });
    // The page filters too; the server checks again before anything leaves.
    const target = previewTarget(url ?? '', d.payHosts);
    if (!target) throw new Refused('No preview for this link');
    if (!d.firecrawlKey) return c.json({ error: 'Previews are not set up' }, 503);
    const hit = cache.get(target);
    if (hit) return c.json(hit);
    try {
      const p = await firecrawlPreview(target, d.firecrawlKey, d.fetchFn);
      cache.set(target, p);
      return c.json(p);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 502);
    }
  });

  app.post('/voice/transcribe', async (c) => {
    const { messageId, accessToken } = await c.req
      .json<{ messageId?: string; accessToken?: string }>()
      .catch(() => ({}) as { messageId?: string; accessToken?: string });
    if (!d.voice || !d.elevenLabsKey) return c.json({ error: 'Voice text is not set up' }, 503);
    if (!messageId || !accessToken) throw new Refused('Send messageId and accessToken');
    const userId = await d.voice.userId(accessToken);
    if (!userId) throw new Refused('Not signed in', 401);
    const v = await d.voice.voiceOf(messageId, userId);
    if (!v) throw new Refused('Not your voice message', 403);
    try {
      const text = await elevenLabsText(v.audio, d.elevenLabsKey, d.fetchFn);
      await d.voice.setTranscript(messageId, text);
      return c.json({ text });
    } catch (e) {
      // The voice message stays without text.
      return c.json({ error: (e as Error).message }, 502);
    }
  });
}

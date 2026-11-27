import { CLAIM_PATH } from './link';

/** True when the link is a Tok pay link on one of Tok's own hosts. */
export function isPayLink(link: string, payHosts: readonly string[]): boolean {
  try {
    const u = new URL(link);
    const path = u.pathname.replace(/\/+$/, '');
    return payHosts.includes(u.host) && (path.endsWith(CLAIM_PATH) || path === '');
  } catch {
    return false;
  }
}

/**
 * The link to send for a preview, or null when it must not be sent at all.
 * Pay links are never sent; the part after "#" is always removed.
 */
export function previewTarget(link: string, payHosts: readonly string[]): string | null {
  let u: URL;
  try {
    u = new URL(link);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (payHosts.includes(u.host)) return null;
  u.hash = '';
  return u.toString();
}

const URL_RE = /\bhttps?:\/\/[^\s<>"']+/gi;
export function findLinks(text: string): string[] {
  return [...text.matchAll(URL_RE)].map((m) => m[0].replace(/[),.;!?]+$/, ''));
}

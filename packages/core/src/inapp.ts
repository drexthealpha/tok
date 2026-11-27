/** Chat apps whose own browser often cannot create a passkey. */
const IN_APP = [
  { name: 'WhatsApp', re: /WhatsApp/i },
  { name: 'Telegram', re: /Telegram/i },
  { name: 'Instagram', re: /Instagram/i },
  { name: 'Facebook', re: /FBAN|FBAV|FB_IAB/i },
  { name: 'Messenger', re: /Messenger/i },
  { name: 'X', re: /Twitter/i },
  { name: 'Discord', re: /Discord/i },
  { name: 'Snapchat', re: /Snapchat/i },
  { name: 'LINE', re: /\bLine\//i },
  { name: 'WeChat', re: /MicroMessenger/i },
  { name: 'TikTok', re: /musical_ly|BytedanceWebview|TikTok/i },
  { name: 'Android WebView', re: /; wv\)/ },
];

export function inAppBrowser(userAgent: string): string | null {
  for (const a of IN_APP) if (a.re.test(userAgent)) return a.name;
  return null;
}

/**
 * How to reopen this page in the phone's main browser.
 * Android intents cannot carry the part after "#", and putting it in the
 * path or query would send it to the web server. So on Android the page
 * copies the link first and the main browser asks to paste it.
 */
export function openInBrowser(href: string, userAgent: string): { url: string; needsPaste: boolean } {
  const u = new URL(href);
  if (/Android/i.test(userAgent)) {
    const fallback = `${u.origin}${u.pathname}?paste=1`;
    return {
      url: `intent://${u.host}${u.pathname}?paste=1#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(fallback)};end`,
      needsPaste: true,
    };
  }
  // iOS: most in-app browsers hand x-safari-https links to Safari, with the hash.
  return { url: href.replace(/^https:/, 'x-safari-https:'), needsPaste: false };
}

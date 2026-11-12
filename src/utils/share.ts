export interface SharePayload {
  title: string;
  text: string;
  url?: string;
}

export function getCurrentShareUrl(): string {
  return window.location.href;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export async function triggerNativeShare(payload: SharePayload): Promise<'shared' | 'copied' | 'failed'> {
  const url = payload.url || getCurrentShareUrl();
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: payload.title,
        text: payload.text,
        url,
      });
      return 'shared';
    } catch (err) {
      // User cancelled share sheet
      if (err instanceof Error && err.name === 'AbortError') {
        return 'failed';
      }
    }
  }

  const copied = await copyToClipboard(url);
  return copied ? 'copied' : 'failed';
}

export function buildWhatsAppShareUrl(payload: SharePayload): string {
  const url = payload.url || getCurrentShareUrl();
  const message = `${payload.title} — ${payload.text}\n${url}`;
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function buildXShareUrl(payload: SharePayload): string {
  const url = payload.url || getCurrentShareUrl();
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    `${payload.title} — ${payload.text}`
  )}&url=${encodeURIComponent(url)}`;
}

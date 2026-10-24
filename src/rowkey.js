// #1585: the public, stable key of a top-list row. Rows are stored per private player id (today the local UUID
// 'lunden.playerId'; later perhaps an account id), but GET answers carry only this one-way key, so a client can
// tell rows apart and find its own without others' ids leaking. Shared by the Worker (cloudflare/) and the page.
const PREFIX = 'lunden-row:';
const hex = (buf) => [...new Uint8Array(buf, 0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** 16 hex characters of SHA-256('lunden-row:' + id), or '' where WebCrypto is missing (an insecure page). */
export async function rowKey(id) {
  if (typeof id !== 'string' || !id || !globalThis.crypto?.subtle) return '';
  try { return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(PREFIX + id))); } catch { return ''; }
}


import { SCREEN_SHARE as S, COMPUTER_MEDIA } from './config.js';

// #2241: the wire check of a computer game's picture for the onlookers, shared by the Worker (cloudflare/players.js → RoomCinema.relay)
// and the client (src/computerhub.js); the codecs themselves are in src/screenshare.js (the Worker never decodes a payload).
// Sent { t: 'scr', screen, app, n, f }; relayed with `i` (the sender's connection id) added.

const STATION = new Set(COMPUTER_MEDIA.stations.map((s) => s.id));
const PRINTABLE = /^[\x20-\x7e]*$/;
const fields = (m) => m && m.t === 'scr' && STATION.has(m.screen) && S.apps.includes(m.app) && Number.isSafeInteger(m.n) && m.n >= 0 &&
  typeof m.f === 'string' && m.f.length <= S.maxFrame && PRINTABLE.test(m.f);

/** The Worker's check of a sent frame (the raw text): bounded size, a known computer and shared app, a printable payload. */
export function cleanScreenFrame(text) {
  if (typeof text !== 'string' || text.length > S.maxBytes) return null;
  let m; try { m = JSON.parse(text); } catch { return null; }
  return fields(m) ? { screen: m.screen, app: m.app, n: m.n, f: m.f } : null;
}

/** The client's check of a relayed frame (parsed object; `i` = the sender). */
export function cleanScreenRelay(m) {
  return fields(m) && typeof m.i === 'string' && /^[\w-]{1,64}$/.test(m.i) ? { screen: m.screen, app: m.app, n: m.n, f: m.f, i: m.i } : null;
}


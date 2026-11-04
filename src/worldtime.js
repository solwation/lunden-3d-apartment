// #1865: timezone-neutral world calendar serial, not a visitor's local Date timestamp.
// Initial/explicit "Nu" uses Lund civil time; thereafter the world calendar advances continuously.
import { DAY } from './config.js';
export const WORLD_TIME = { version: 2, maxOffset: 10 * 365 * 864e5, every: 250, clientEvery: 300 };
const lund = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
export function worldNow(now = Date.now()) { const p = Object.fromEntries(lund.formatToParts(now).map(x => [x.type, x.value])); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) + ((now % 1000) + 1000) % 1000; }
export const worldStamp = d => Math.round(Date.UTC(d.year, d.month - 1, d.date) + d.hour * 36e5);
export function setWorldStamp(d, stamp) { const t = new Date(stamp); Object.assign(d, { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, date: t.getUTCDate(), hour: t.getUTCHours() + t.getUTCMinutes() / 60 + (t.getUTCSeconds() + t.getUTCMilliseconds() / 1000) / 3600 }); }
export const timeRate = s => s.s ? s.s * DAY.spool * 3600 : s.p ? 0 : 24 * 60 / DAY.minutes;
export function timelineAt(s, now) { const real = worldNow(now), stamp = s.stamp + Math.max(0, now - s.at) * timeRate(s); return Math.round(Math.max(real - WORLD_TIME.maxOffset, Math.min(real + WORLD_TIME.maxOffset, stamp))); }

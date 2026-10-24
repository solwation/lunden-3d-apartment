import { isPrivateCode } from './privatecodes.js';

// #514: one catalogue for console execution and the bike-room graffiti (#724: the graffiti is the only place that lists the
// public codes; AdminReports captures private codes first to open the shared visit-only admin/edit session.
// The console gives no hint that they exist, and ordinary chat commands live apart, in src/chat.js COMMANDS).
// #675: the console is a chat while the players' room is on. A line that is a code (exactly, any case / spacing) or starts
// with '/' (`/day`) is a command: run here, never sent and never kept; anything else is a chat message.
export const CHEATS = [
  { code: 'städa', text: 'Städa allt: disk, tvätt, sängar och golv' }, // #1564: `clean` plus laundry, beds and the hall
  { code: 'clean', text: 'Städa hemmet och uteplatsen' },
  { code: 'jetpack', text: 'Ta på jetpacken utomhus' },
  { code: 'spiderman', text: 'Ta på Spindelmannendräkten' },
  { code: 'day', text: 'Byt till dagsljus' },
  { code: 'night', text: 'Byt till natt' },
  { code: 'lights on', text: 'Tänd hemmets lampor' },
  { code: 'lights off', text: 'Släck hemmets lampor' },
  { code: 'handsfree', text: 'Ställ undan det du håller' },
];
const normal = (line) => line.normalize('NFC').trim().replace(/^\//, '').trim().toLowerCase().replace(/\s+/g, ' ');
export const publicCheats = () => CHEATS.filter(c => !c.secret);
/** The graffiti's lines (the single source for what is written on the wall). */
export const cheatList = () => publicCheats().map(c => `${c.code} — ${c.text}`).join('\n');
/** The same answer for every refused line, secret codes included (nothing to guess from). */
export const UNKNOWN = 'Okänt kommando.';
/** A command, not a chat line (#675): a code or anything starting with '/'. */
export const isCommand = (line) => line.trim().startsWith('/') || CHEATS.some(c => c.code === normal(line)) || isPrivateCode(normal(line));
export function runCheat(code, handlers) {
  const normalized = normal(code);
  if (isPrivateCode(normalized)) return handlers.unlock(normalized);
  const command = CHEATS.find(c => c.code === normalized);
  if (!command) return UNKNOWN;
  return handlers[command.code]();
}

// #514: one catalogue for console execution, public help and the bike-room graffiti.
// #675: the console is a chat while the players' room is on. A line that is a code (exactly, any case / spacing) or starts
// with '/' (`/day`) is a command: run here, never sent and never kept; anything else is a chat message.
export const CHEATS = [
  { code: 'clean', text: 'Städa hemmet och uteplatsen' },
  { code: 'jetpack', text: 'Ta på jetpacken utomhus' },
  { code: 'spiderman', text: 'Ta på Spindelmannendräkten' },
  { code: 'day', text: 'Byt till dagsljus' },
  { code: 'night', text: 'Byt till natt' },
  { code: 'lights on', text: 'Tänd hemmets lampor' },
  { code: 'lights off', text: 'Släck hemmets lampor' },
  { code: 'handsfree', text: 'Ställ undan det du håller' },
  { code: 'help', text: 'Visa alla publika fuskkoder' },
  { code: 'sarah is the goat', secret: true },
  { code: 'olof is the goat', secret: true },
];
const normal = (line) => line.trim().replace(/^\//, '').trim().toLowerCase().replace(/\s+/g, ' ');
export const publicCheats = () => CHEATS.filter(c => !c.secret);
export const cheatHelp = () => `${publicCheats().map(c => `${c.code} — ${c.text}`).join('\n')}\nI chatten: skriv /kod, t.ex. /day`;
/** A command, not a chat line (#675): a code or anything starting with '/'. */
export const isCommand = (line) => line.trim().startsWith('/') || CHEATS.some(c => c.code === normal(line));
export function runCheat(code, handlers) {
  const command = CHEATS.find(c => c.code === normal(code));
  if (!command) return 'Okänd kod. Skriv help för fuskkoder.';
  if (command.secret) return handlers.unlock(command.code);
  if (command.code === 'help') return cheatHelp();
  return handlers[command.code]();
}

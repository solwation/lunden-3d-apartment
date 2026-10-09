// #514: one catalogue for console execution, public help and the bike-room graffiti.
export const CHEATS = [
  { code: 'clean', text: 'Städa hemmet och uteplatsen' },
  { code: 'jetpack', text: 'Ta på jetpacken utomhus' },
  { code: 'day', text: 'Byt till dagsljus' },
  { code: 'night', text: 'Byt till natt' },
  { code: 'lights on', text: 'Tänd hemmets lampor' },
  { code: 'lights off', text: 'Släck hemmets lampor' },
  { code: 'handsfree', text: 'Ställ undan det du håller' },
  { code: 'help', text: 'Visa alla publika fuskkoder' },
  { code: 'sarah is the goat', secret: true },
  { code: 'olof is the goat', secret: true },
];
export const publicCheats = () => CHEATS.filter(c => !c.secret);
export const cheatHelp = () => publicCheats().map(c => `${c.code} — ${c.text}`).join('\n');
export function runCheat(code, handlers) {
  const command = CHEATS.find(c => c.code === code.trim().toLowerCase().replace(/\s+/g, ' '));
  if (!command) return 'Okänd kod. Skriv help för fuskkoder.';
  if (command.secret) return handlers.unlock(command.code);
  if (command.code === 'help') return cheatHelp();
  return handlers[command.code]();
}

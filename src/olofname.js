import { olofLook } from './olof.js';
import { decodeAvatarLook } from './config.js';

// #2218: a player whose name contains "Olof" starts every session looking like Olof in the car (olofLook, #1156/#2146).
//
// Name rule (the issue's *guess*, kept): a case-insensitive SUBSTRING match, so "Olof", "olof", "Olof W" and also
// "Olofsson" / "Wolof" count. Whitespace is irrelevant to a substring and diacritics are not folded ("Ólof" does not match).
const OLOF_NAME = /olof/i;
export const nameGetsOlofLook = (name) => typeof name === 'string' && OLOF_NAME.test(name);

/**
 * The look a session starts with. An Olof name wins over the saved look (the saved one is left in storage untouched, so
 * a name without "Olof" later, or never opening the mirror, loses nothing); anyone else gets the saved look, or the
 * seeded default. Called once at start; later name changes and mirror edits do not go through it, so a mirror edit
 * holds for the rest of the session (and is then saved as ever, replaced by Olof's look again at the next start).
 */
export function sessionStartLook(name, savedCode, seed = name) {
  return nameGetsOlofLook(name) ? olofLook() : decodeAvatarLook(savedCode, seed);
}

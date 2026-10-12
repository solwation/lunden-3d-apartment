// Coarse words in the chat (#719): the same short list as the room's (cloudflare/players.js ROUGH, kept equal by hand;
// cloudflare/chat.test.mjs checks it). The room filters every line for everybody; here our own line is shown as the
// others will see it, and lines from the room are filtered once more. Whole words in any case become ***.
export const ROUGH = ['fitta', 'fittan', 'fittor', 'kuk', 'kuken', 'kukar', 'hora', 'horan', 'horor', 'horunge', 'slyna', 'neger', 'negern', 'negrer',
  'fuck', 'fucking', 'fucker', 'motherfucker', 'cunt', 'bitch', 'nigger', 'nigga'];
const roughWords = new RegExp(`(?<![\\p{L}\\p{N}])(?:${ROUGH.join('|')})(?![\\p{L}\\p{N}])`, 'giu');
export const censor = (s) => s.replace(roughWords, '***');

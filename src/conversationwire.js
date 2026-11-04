// Fixed IDs only: neither peers nor the server invent speech/text or execute commands.
import { CONVERSATION as C } from './config.js';
export const CONVERSATION_KINDS = ['flirt', 'smalltalk', 'joke', 'bye'];
export const CONVERSATION_LABELS = { flirt: 'flörta', smalltalk: 'kallprata', joke: 'skämta', bye: 'säg hejdå' };
export const CONVERSATION_LINES = Object.freeze({
  flirt: 'Vad glad jag blir av att se dig!',
  smalltalk: 'Visst är det fint här i Lunden?',
  joke: 'Jag tänkte dra ett byggskämt, men det är inte färdigbyggt!',
  bye: 'Ha det så fint, vi ses!',
  'reply-flirt': 'Tack, vad fint sagt! Jag blir glad av att se dig också.',
  'reply-smalltalk': 'Ja, verkligen! Det är skönt med en liten promenad.',
  'reply-joke': 'Haha! Det var ett stadigt bygge till skämt!',
  'reply-bye': 'Detsamma! Vi ses snart igen.'
});
export const conversationNear = (a, b, range = C.range) => Array.isArray(a) && Array.isArray(b) && a.length === 3 && b.length === 3 && [...a, ...b].every(Number.isFinite) && Math.hypot(...a.map((x, i) => x - b[i])) <= range;
export function cleanConversation(text) {
  let m; try { m = JSON.parse(text); } catch { return null; }
  if (m?.t !== 'cv' || m.v !== C.version || typeof m.to !== 'string' || !m.to.length || m.to.length > 16 || !Number.isSafeInteger(m.q) || m.q <= 0) return null;
  if (CONVERSATION_KINDS.includes(m.k)) return { to: m.to, q: m.q, k: m.k };
  return m.k === 'reply' && typeof m.r === 'string' && m.r.length > 0 && m.r.length <= 80 ? { to: m.to, q: m.q, k: 'reply', r: m.r } : null;
}

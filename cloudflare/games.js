import { GAME_BOARDS as G, BLOCKS, METEORS } from '../src/config.js';

// #1577: global top lists for the computer games, one KV key per game ('game:<game>': all rows { id, name, score, updated },
// the best G.maxRows). One row per player id and game, holding that player's best round; names are cleaned exactly like
// /scores (#198/#677: '' = "Anonym", an anonymous post never strips an earlier name). Klossar and Meteoriter are posted by the
// client when a round ends, so their scores are only bounded by what the rules can give in the stated round time (*guess*
// limits in src/config.js GAME_BOARDS); Ormstriden rows are written by the players' room from the server arena (snake.js).
export const GAMES = Object.keys(G.games);
const ID = /^[A-Za-z0-9-]{6,64}$/;
export const cleanGameName = (name) => typeof name === 'string' ? name.replace(/[\u0000-\u001f<>&"]/g, '').trim().slice(0, 20) : '';
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

/** The highest score the rules allow for a single-player round, or -1 when the stated round is impossible. */
export function maxScore(game, b) {
  if (!int(b.ms, G.minMs, G.maxMs)) return -1;
  const seconds = b.ms / 1000;
  if (game === 'klossar') {
    if (!int(b.lines, 0, Math.floor(seconds * G.blocks.linesPerSecond))) return -1;
    const pieces = Math.ceil(seconds * G.blocks.piecesPerSecond) + 1, level = 1 + Math.floor(b.lines / BLOCKS.linesPerLevel);
    return Math.floor(b.lines * BLOCKS.lineScores[4] / 4 * level + pieces * BLOCKS.rows * BLOCKS.hardDrop);
  }
  if (game === 'meteoriter') {
    if (b.wave !== undefined && !int(b.wave, 0, 10_000)) return -1;
    // Every point needs a hit: a bullet (at most one per fireMs) or a lost life.
    return (Math.ceil(b.ms / METEORS.fireMs) + 1 + METEORS.lives) * Math.max(...METEORS.points);
  }
  return -1;
}

const byScore = (a, b) => b.score - a.score || (b.name ? 1 : 0) - (a.name ? 1 : 0) || a.updated - b.updated;
export const topRows = (list) => list.slice().sort(byScore).slice(0, G.top).map(({ name, score, updated }) => ({ name, score, updated }));
export const readBoard = async (kv, game) => (await kv.get(`game:${game}`, 'json')) ?? [];

/** Keep one best row per id. Writes KV only when the row improves or gains a name; returns the sorted rows. */
export async function recordGame(kv, game, { id, name, score }, now = Date.now()) {
  let list = await readBoard(kv, game);
  const old = list.find((r) => r.id === id), clean = cleanGameName(name);
  const best = Math.max(score, old?.score ?? 0), newName = clean || old?.name || '';
  if (old && old.score >= score && old.name === newName) return list;
  list = [...list.filter((r) => r.id !== id), { id, name: newName, score: best, updated: old && old.score >= score ? old.updated : now }].sort(byScore).slice(0, G.maxRows);
  await kv.put(`game:${game}`, JSON.stringify(list));
  return list;
}

/** GET/POST /games/:game for the Worker (the generic per-IP write limiter already ran for POST). */
export async function gamesFetch(env, method, game, body, json, fail, h) {
  if (!GAMES.includes(game)) return fail(404, 'not found', h);
  if (method === 'GET') return json(topRows(await readBoard(env.LUNDEN, game)), 200, h);
  if (method !== 'POST' || game === 'ormstriden') return fail(405, 'not allowed', h); // Ormstriden is scored by the server
  if (!ID.test(body.id ?? '') || !int(body.score, 0, G.maxScore)) return fail(400, 'bad score', h);
  const cap = maxScore(game, body);
  if (cap < 0 || body.score > cap) return fail(400, 'implausible score', h);
  return json(topRows(await recordGame(env.LUNDEN, game, { id: body.id, name: body.name, score: body.score })), 200, h);
}

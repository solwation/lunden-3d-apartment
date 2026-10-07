// Shared furniture arrangement (#465). One atomic, revision-checked batch per confirmed move.
// The public cheat is a game mechanic, not authentication; bound all input and retain server authority.
const CODES = new Set(['olof is the goat', 'sarah is the goat']);
const idOK = (id) => typeof id === 'string' && /^f-[a-zA-Z0-9.-]{1,100}$/.test(id);
const vec = (v, n, lo, hi) => Array.isArray(v) && v.length === n && v.every((x) => typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi);
export async function layoutFetch(request, storage, headers = {}) {
  const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  const state = await storage.get('furniture-layout') ?? { revision: 0, pieces: {} };
  if (request.method === 'GET') return reply(state);
  if (request.method !== 'PUT') return reply({ error: 'method' }, 405);
  const raw = await request.text();
  if (raw.length > 128000) return reply({ error: 'too big' }, 413);
  let b; try { b = JSON.parse(raw); } catch { return reply({ error: 'bad json' }, 400); }
  if (!CODES.has(b?.code)) return reply({ error: 'code' }, 403);
  if (b.resetAll !== undefined && b.resetAll !== true) return reply({ error: 'reset' }, 400);
  if (b.resetAll && (!Number.isInteger(b.expectedRevision) || b.expectedRevision < 0)) return reply({ error: 'revision' }, 400);
  if (b.resetAll && b.expectedRevision !== state.revision) return reply({ error: 'conflict', state }, 409);
  if (!Array.isArray(b.moves) || !b.moves.length || b.moves.length > (b.resetAll ? 500 : 100) || new Set(b.moves.map((m) => m?.id)).size !== b.moves.length) return reply({ error: 'moves' }, 400);
  for (const m of b.moves) {
    if (!m || !idOK(m.id) || !Number.isInteger(m.base) || m.base < 0 || !vec(m.pos, 3, -100, 100) || !vec(m.quat, 4, -1, 1)
      || Math.abs(m.quat.reduce((s, x) => s + x*x, 0) - 1) > 0.001) return reply({ error: 'pose' }, 400);
    if ((state.pieces[m.id]?.revision ?? 0) !== m.base) return reply({ error: 'conflict', state }, 409);
  }
  if (new Set([...Object.keys(state.pieces), ...b.moves.map((m) => m.id)]).size > 1000) return reply({ error: 'full' }, 409);
  state.revision++;
  for (const m of b.moves) state.pieces[m.id] = { pos: m.pos, quat: m.quat, revision: state.revision };
  await storage.put('furniture-layout', state);
  return reply(state);
}

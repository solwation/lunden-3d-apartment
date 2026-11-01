import { RIVER_FISH as C } from './config.js';
import { fishTime } from './riverfishswim.js';

// #1752: the fish in Höje å shared between the players. No three.js, so a node test can drive it.
// Nothing is simulated per client in a way that could drift: the fish are pure functions of (seed, id, born, time) (src/riverfishswim.js), so the
// room (cloudflare/riverfish.js) only supplies three things, in memory only (no KV, no Durable Object storage):
//   - its clock, so every client evaluates the swim functions at the same time (`offset` = room ms - local ms when 'L' arrived),
//   - the seed (RIVER_FISH.seed; the room repeats it, so a later seed change is the room's to make),
//   - the fish that were caught (#1753): [id, born, until ms] - fish `id` is gone until `until` and then comes back as a new fish (born).
// Messages { t: 'rf', k, … }: client -> room 'on' / 'off' (within RIVER_FISH.sync.enter m of the river / beyond `leave`), 'c' { f, b } (catch fish f
// in its b-th life, #1753); room -> client 'L' { now, s, g } (the clock, the seed, the gone list), 'g' { f, b, u } (fish f was caught: it
// returns as life b at room time u), 'ok' / 'no' { f, b } (your catch was accepted / refused). Without a room (solo, offline) the local clock
// and the config seed are used, which already agree with everybody whose clock is right to about a second.

export class RiverFishSync {
  /** send(m): false when not connected; hooks: { caught(id, ok) }; now(): local ms. */
  constructor({ send = () => false, hooks = {}, now = () => Date.now() } = {}) {
    Object.assign(this, { send, hooks, now, near: false, offset: 0, seed: C.seed, gone: new Map(), synced: false, pending: new Map() });
  }
  /** The room's clock in ms. */
  get roomMs() { return this.now() + this.offset; }
  /** Seconds since RIVER_FISH.epoch on the room's clock: the time every swim function is evaluated at. */
  get t() { return fishTime(this.roomMs); }
  say(m) { return this.send({ t: 'rf', ...m }); }
  setNear(v) {
    if (v === this.near) return;
    this.near = v;
    if (!this.say({ k: v ? 'on' : 'off' }) && v) this.near = false; // (not connected: ask again next frame)
  }
  /** Fish `id`'s current life (0 until the room says it was caught). */
  born(id) { return this.gone.get(id)?.b ?? 0; }
  /** Fish `id` is away (caught, not back yet, or our catch request is pending). */
  isGone(id) { const g = this.gone.get(id); return this.pending.has(id) || (!!g && this.roomMs < g.u); }
  receive(m) {
    switch (m.k) {
      case 'L':
        if (Number.isFinite(m.now)) this.offset = m.now - this.now();
        if (Number.isInteger(m.s)) this.seed = m.s;
        this.gone = new Map((m.g ?? []).filter((e) => Array.isArray(e) && e.length === 3).map(([f, b, u]) => [f, { b, u }]));
        this.synced = true;
        break;
      case 'g': if (Number.isInteger(m.f)) this.gone.set(m.f, { b: m.b, u: m.u }); break;
      case 'ok': case 'no': if (this.pending.has(m.f)) { this.pending.delete(m.f); this.hooks.caught?.(m.f, m.k === 'ok'); } break;
    }
  }
  /** #1753: ask the room for fish `id` (optimistic: it is hidden here at once). Solo/offline the catch is local: it is gone for `respawn` s. */
  catch(id) {
    const b = this.born(id);
    if (this.near && this.say({ k: 'c', f: id, b })) { this.pending.set(id, b); return true; }
    this.gone.set(id, { b: b + 1, u: this.roomMs + C.sync.respawn[0] * 1000 }); this.hooks.caught?.(id, true);
    return true;
  }
  /** The connection dropped: join again when it is back. */
  reset() { this.near = false; this.pending.clear(); }
}

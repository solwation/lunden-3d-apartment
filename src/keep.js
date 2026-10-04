import * as THREE from 'three';
import { SONOS, MOCCAMASTER } from './config.js';

// The world's state across a reload made by the page (#277): the automatic update (#192) and "Ladda om" put a
// `world` part into the resume record (resume.js) next to the place; the new page reads it back once everything is
// built. Not for F5 (the tab's running record keeps only the place, #203) and never for a new visit.
// Plain JSON, small, versioned (`v`); every part is optional and read tolerantly, so a newer build never breaks on an
// older record (an unknown key is ignored, a missing one starts fresh as before). What is kept, in order of
// restoring: the clock and the date (a mid-visit update keeps the game's time, spooled or paused — a new visit still
// starts at the real time, #143), the car, doors / lids / fronts, lamps, the TV / PC / hob / hood / grill, the coffee
// in the jug, the music, the parasol, things put down and the one in the hand (cups with what is in them), sitting /
// lying, the cat, the jetpack (#359) (a thing's own state: `keepState()` / `loadKeep(s)`, e.g. the toaster plugged in, #401). Not kept (fresh as before): cooking (the chicken, fish fingers, the fries, #301), taps, the drawing in the hand.
// `a` is the app: main.js hands over what the parts need.

export const KEEP_VERSION = 1;

const r3 = (v) => Math.round(v * 1000) / 1000;
const vec = (v) => [r3(v.x), r3(v.y), r3(v.z)];
const isVec = (p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);

/** Stable names for a list: `base(o)`, with "#n" for the n-th repeat of the same base. */
function keys(list, base) {
  const seen = new Map();
  return list.map((o) => {
    const b = base(o), n = seen.get(b) ?? 0;
    seen.set(b, n + 1);
    return n ? `${b}#${n}` : b;
  });
}
/** key → object, for a list keyed by `keys`. */
const byKey = (list, base) => new Map(keys(list, base).map((k, i) => [k, list[i]]));

// --- what opens and shuts -------------------------------------------------
const NOT_OPENABLE = new Set(['coffee', 'hob', 'hood', 'flush', 'grill']); // on/off things in world.lids: their own parts
function openables(a) {
  return [...a.world.doors, ...a.world.lids.filter((l) => !NOT_OPENABLE.has(l.kind)),
    ...a.world.furnitureTargets.filter((t) => t.kind === 'cabinet' || t.kind === 'appliance')];
}
const openKey = (o) => `${o.kind ?? ''}|${o.name ?? ''}`;

// --- things you hold ------------------------------------------------------
function holdKey(h) {
  const p = h.local?.pos ?? h.home?.pos;
  return `${h.name}|${p ? vec(p).join(',') : ''}`;
}
const keepable = (a, h) => h !== a.chicken && !h.broken && !h.flying && !h.isMiele; // the chicken cooks: fresh (and a ball in the air); Miele in your arms is the cat's (#328)

const PARTS = {
  clock: {
    save: ({ day }) => ({ h: r3(day.hour), y: day.year, m: day.month, d: day.date, p: day.paused ? 1 : 0 }),
    load({ day }, s) {
      if (!(Number.isFinite(s.h) && s.m >= 1 && s.m <= 12 && s.d >= 1 && s.d <= 31)) return;
      Object.assign(day, { hour: ((s.h % 24) + 24) % 24, month: s.m, date: s.d, year: Number.isFinite(s.y) ? s.y : day.year, paused: !!s.p, spool: 0 });
      day.update(0);
    },
  },

  car: {
    save: ({ car }) => car.saveState(),
    load: ({ car }, s) => car.loadState(s),
  },

  open: {
    save(a) {
      const list = openables(a), k = keys(list, openKey);
      return k.filter((_, i) => list[i].isOpen);
    },
    load(a, s) {
      if (!Array.isArray(s)) return;
      const map = byKey(openables(a), openKey);
      for (const k of s) {
        const o = map.get(k);
        if (!o || o.isOpen) continue;
        o.toggle();
        for (let i = 0; i < 30; i++) o.update(0.1); // open at once, no swing
      }
    },
  },

  lamps: {
    // room switches: which rooms are lit; small lamps (#234): on / off and the dusk state they were switched in, so
    // a lamp put out by hand stays out until the next dusk / dawn (lights.js keeps the pool to itself, #276)
    save({ lights }) {
      return {
        rooms: [...lights.rooms.entries()].filter(([, R]) => R.on).map(([k]) => k),
        small: Object.fromEntries(keys(lights.floorLamps, (f) => f.name).map((k, i) => [k, lights.floorLamps[i].room.on ? 1 : 0])),
        dark: lights.dark === undefined ? null : lights.dark ? 1 : 0,
      };
    },
    load({ lights }, s) {
      if (Array.isArray(s.rooms)) {
        const on = new Set(s.rooms);
        for (const [k, R] of lights.rooms) if (R.on !== on.has(k)) R.toggle();
        for (const sw of lights.switches) sw.update();
      }
      if (s.dark === 0 || s.dark === 1) lights.dark = !!s.dark;
      if (s.small && typeof s.small === 'object') {
        const map = byKey(lights.floorLamps, (f) => f.name);
        for (const [k, on] of Object.entries(s.small)) map.get(k)?.set(!!on);
      }
    },
  },

  on: { // the TVs and the PC; the hob and the hood
    save(a) {
      const screens = a.world.furnitureTargets.filter((t) => t.kind === 'tv' || t.kind === 'pc');
      return { screens: keys(screens, openKey).filter((_, i) => screens[i].isOpen), hob: a.world.hob?.on ? 1 : 0, hood: a.world.hood?.on ? 1 : 0 };
    },
    load(a, s) {
      if (Array.isArray(s.screens)) {
        const map = byKey(a.world.furnitureTargets.filter((t) => t.kind === 'tv' || t.kind === 'pc'), openKey);
        for (const k of s.screens) { const t = map.get(k); if (t && !t.isOpen) t.toggle(); }
      }
      if (s.hob) a.world.hob?.set(true);
      if (s.hood) a.world.hood?.set(true);
    },
  },

  grill: {
    save: ({ grill }) => (grill?.on ? { burn: Math.round(grill.burn) } : null),
    load({ grill }, s) { if (!grill || !(s.burn > 0)) return; grill.set(true); grill.burn = s.burn; },
  },

  coffee: { // the coffee in the jug (a brew going on holds the update back, main.js); #334: the tank, the filter, the jug's
    // water, the scoop's coffee (where the scoop is: `things`). An old record is the jug's level alone.
    save(a) {
      const m = a.world.lids.find((l) => l.kind === 'coffee');
      if (!m) return null;
      const e = { f: r3(m.fill), w: r3(m.water), g: m.grounds, s: m.spent ? 1 : 0, j: r3(m.jugWater), sc: m.scoop?.full ? 1 : 0 };
      return Object.values(e).some((v) => v > 0) ? e : null;
    },
    load(a, s) {
      const m = a.world.lids.find((l) => l.kind === 'coffee');
      if (!m) return;
      const n = (v, max = 1) => (Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : 0);
      if (typeof s === 'number') { if (s > 0) m.setFill(n(s)); return; }
      if (!s || typeof s !== 'object') return;
      m.setFill(n(s.f));
      Object.assign(m, { water: n(s.w), grounds: Math.round(n(s.g, MOCCAMASTER.maxScoops)), spent: !!s.s, jugWater: n(s.j) });
      m.snap?.();
      if (m.scoop) m.scoop.full = !!s.sc; // (`things` puts it in the hand / down: taking does not fill it)
    },
  },

  sonos: {
    save: ({ sonos }) => ({ p: sonos.playing ? 1 : 0, ch: sonos.channel, vol: sonos.volume }),
    load({ sonos }, s) {
      if (Number.isInteger(s.ch) && s.ch >= 0 && s.ch < SONOS.channels.length) sonos.channel = s.ch;
      if (Number.isFinite(s.vol)) sonos.setVolume(s.vol);
      if (s.p && !sonos.playing) { const f = sonos.onPlay; sonos.onPlay = null; sonos.play(); sonos.onPlay = f; } // (no points again)
    },
  },

  parasol: {
    save: ({ patio }) => patio.saveState?.(),
    load: ({ patio }, s) => patio.loadState?.(s),
  },

  // things put down (where, how they lie) and what is in them; cups (cups.js) with their pattern and contents;
  // the beer served on the lounge table; last the thing in the hand
  things: {
    save(a) {
      const list = a.holdables.filter((h) => keepable(a, h)), k = keys(list, holdKey), out = {};
      let held = null;
      list.forEach((h, i) => {
        const e = {};
        if (h.held) held = k[i];
        else if (h.placed) {
          e.p = vec(h.model.getWorldPosition(new THREE.Vector3()));
          const q = h.model.getWorldQuaternion(new THREE.Quaternion());
          e.q = [r3(q.x), r3(q.y), r3(q.z), r3(q.w)];
          if (h.onHob) e.hob = 1;
        }
        if (h.contents?.total > 0) e.a = h.contents.a;
        if (h === a.beer && h.out) { e.out = 1; e.lv = r3(h.level); }
        const x = h.keepState?.(); // a thing's own state (the toaster plugged in, #401)
        if (x) e.x = x;
        if (Object.keys(e).length) out[k[i]] = e;
      });
      const cups = a.cups.cups.map((c) => {
        const e = { s: c.state, d: c.design };
        if (c.state === 'cabinet') e.slot = c.slot;
        if (c.state === 'placed') { e.p = vec(c.model.position); e.ry = r3(c.model.rotation.y); }
        if (c.fill > 0) { e.a = c.contents.a; e.heat = r3(c.heat); }
        return e;
      });
      return { items: out, held, cups };
    },
    load(a, s) {
      const map = byKey(a.holdables.filter((h) => keepable(a, h)), holdKey);
      const items = s.items && typeof s.items === 'object' ? s.items : {};
      for (const [k, e] of Object.entries(items)) {
        const h = map.get(k);
        if (!h) continue;
        if (isVec(e.p) && Array.isArray(e.q) && e.q.length === 4 && e.q.every(Number.isFinite)) {
          h.take(); // (out of its home first: a pot leaves its merged window board, a trinket its drawer)
          h.placeAt(new THREE.Vector3(...e.p));
          h.model.position.set(...e.p);
          h.model.quaternion.set(...e.q);
          if (h.onHob !== undefined) h.onHob = !!e.hob;
          h.model.visible = true; // (a surprise from the secret drawer)
        }
        if (h === a.beer && e.out) { h.show(true); if (Number.isFinite(e.lv)) h.setLevel(Math.max(0, Math.min(1, e.lv))); }
        if (h.contents && e.a && typeof e.a === 'object') { h.contents.a = { ...e.a }; h.liquid?.show(h.contents); }
        if (e.x && typeof e.x === 'object') h.loadKeep?.(e.x);
      }
      // cups: first the ones on their shelf (their slots), then the rest
      const cups = Array.isArray(s.cups) ? s.cups : [];
      let heldCup = null;
      const order = cups.map((e, i) => [e, a.cups.cups[i]]).filter(([e, c]) => c && e && typeof e === 'object');
      order.sort(([x], [y]) => (x.s === 'cabinet' ? 0 : 1) - (y.s === 'cabinet' ? 0 : 1));
      for (const [e, c] of order) {
        if (typeof e.d === 'string') c.setDesign(e.d);
        if (e.s === 'cabinet' && Number.isInteger(e.slot) && e.slot >= 0 && e.slot < a.cups.slots.length) c.goHome(e.slot);
        else if (e.s === 'spare') { c.held = false; c.state = 'spare'; c.slot = null; c.model.removeFromParent(); }
        else if (e.s === 'placed' && isVec(e.p)) {
          c.held = false; c.state = 'placed'; c.slot = null; c.placedAt = performance.now();
          a.scene.add(c.model);
          c.model.position.set(...e.p);
          c.model.rotation.set(0, Number(e.ry) || 0, 0);
        } else if (e.s === 'held') heldCup = c;
        c.contents.clear();
        if (e.a && typeof e.a === 'object') c.contents.a = { ...e.a };
        c.heat = Number(e.heat) || 0; c.coffeeWas = c.contents.a.coffee ?? 0; c.milkWas = c.contents.a.milk ?? 0;
        c.show();
      }
      // the hand last (taking puts back anything else held)
      const held = s.held ? map.get(s.held) : null;
      if (heldCup) heldCup.take();
      else if (held && !held.held) held.take();
      if (held?.contents && items[s.held]?.a) { held.contents.a = { ...items[s.held].a }; held.liquid?.show(held.contents); }
    },
  },

  jetpack: { // the jetpack (#359): stood down somewhere (the spot), or on your back
    save: ({ jetpack }) => jetpack?.saveState() ?? null,
    load: ({ jetpack }, s) => jetpack?.loadState(s),
  },

  rest: { // sitting / lying (rest.js): which seat or bed, which spot on it, where you stood before
    save({ rest, world, car }) {
      if (!rest.active) return null;
      const st = rest.standing;
      const stand = st && [st.x, st.y, st.z, st.yaw].every(Number.isFinite) ? [r3(st.x), r3(st.y), r3(st.z), r3(st.yaw)] : null;
      const seat = car.seats.indexOf(rest.target);
      if (seat >= 0) return { car: seat, stand };
      const list = world.furnitureTargets.filter((t) => t.kind === 'rest');
      const i = list.indexOf(rest.target);
      if (i < 0) return null;
      return { t: keys(list, restKey)[i], spot: rest.target.spots.indexOf(rest.spot), stand };
    },
    load(a, s) {
      if (!Array.isArray(s.stand) || s.stand.length !== 4 || !s.stand.every(Number.isFinite)) return;
      let target = null;
      if (Number.isInteger(s.car)) { target = a.car.seats[s.car]; if (!target || !a.car.parked) return; }
      else target = byKey(a.world.furnitureTargets.filter((t) => t.kind === 'rest'), restKey).get(s.t);
      const spot = target?.spots[Number.isInteger(s.car) ? 0 : s.spot];
      if (!spot) return;
      const [x, y, z, yaw] = s.stand;
      a.sitAt(target, spot, { x, y, z, yaw });
    },
  },

  life: { // the life simulator's things (#371): every instance, the one in the hand too (life.js / items.js, versioned)
    save: ({ life }) => (life && life.items.all().length ? life.serialize() : null),
    load: ({ life }, s) => { life?.load(s, { hand: true }); },
  },

  cat: {
    save({ cat, world, BREEDS, VARIANTS }) {
      if (!cat.visible || cat.leaving || cat.released || cat.held) return null; // (Miele held or just put down: not kept, #328)
      const o = cat.object, b = BREEDS.indexOf(cat.breed), coats = cat.breed.name === 'huskatt' ? VARIANTS : cat.breed.coats;
      const doorKeys = keys(world.doors, openKey), di = world.doors.indexOf(cat.door);
      return { p: vec(o.position), ry: r3(o.rotation.y), b, c: coats.indexOf(cat.variant), n: cat.catName, on: cat.on ?? null,
        door: di >= 0 ? doorKeys[di] : null, shut: cat.closedSince ? 1 : 0, seen: cat.seen ? 1 : 0, ...(cat.kitten ? { k: 1 } : {}) }; // k: a kitten (#363)
    },
    load({ cat, world, BREEDS, VARIANTS }, s) {
      const breed = BREEDS[s.b];
      if (!breed || !isVec(s.p)) return;
      const coats = breed.name === 'huskatt' ? VARIANTS : breed.coats, coat = coats[s.c];
      if (!coat) return;
      cat.setCat(breed, coat, !!s.k);
      if (typeof s.n === 'string') cat.catName = s.n;
      cat.object.position.set(...s.p);
      cat.object.rotation.y = Number(s.ry) || 0;
      cat.on = s.on ?? null;
      cat.door = s.door ? byKey(world.doors, openKey).get(s.door) ?? null : null;
      cat.closedSince = !!s.shut;
      cat.seen = !!s.seen; cat.photoDone = cat.seen; // Miele (#328): found already, not again
      cat.leaving = null;
      cat.setOpacity(1);
      cat.nextMeow = 2 + Math.random() * 3;
      cat.object.visible = true;
      cat.update(0);
    },
  },
};
const restKey = (t) => `${t.name}|${t.spots[0] ? vec(t.spots[0].pos).join(',') : ''}`;

// the order things come back in: the clock before the lamps (dusk), the car before its seat, fronts before what
// lies in them, the TV before sitting in front of it
const ORDER = ['clock', 'car', 'open', 'lamps', 'on', 'grill', 'coffee', 'sonos', 'parasol', 'things', 'jetpack', 'life', 'rest', 'cat'];

/** The world part of a reload record. */
export function saveWorld(a) {
  const w = { v: KEEP_VERSION };
  for (const k of ORDER) {
    try { const s = PARTS[k].save(a); if (s !== null && s !== undefined) w[k] = s; } catch (e) { console.warn(`keep: ${k} not saved`, e); }
  }
  return w;
}

/** Put the world back as `w` says; anything missing, unknown or broken starts fresh. */
export function loadWorld(a, w) {
  if (!w || typeof w !== 'object' || !Number.isFinite(w.v)) return;
  for (const k of ORDER) {
    if (w[k] === null || w[k] === undefined) continue;
    try { PARTS[k].load(a, w[k]); } catch (e) { console.warn(`keep: ${k} not restored`, e); }
  }
}

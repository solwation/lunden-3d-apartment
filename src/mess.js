import * as THREE from 'three';
import { LIFE, LIFE_MESS as M, LEVELS } from './config.js';

// Crumbs and dust (#388, LIFE-024, epic #364 M3): mess on the surfaces you can reach. A spot is plain data —
// { kind: 'crumb' | 'dust' | 'smear', level, x, y, z, surf: 'worktop' | 'table' | 'floor', room, amt 0…1, rot } — and is
// drawn as one instance of its kind's InstancedMesh (a flat decal just over the surface; a fuller spot is bigger). Where it
// comes from:
//   crumbs  eating (the life sim's 'crumbs' event of a bite: on the table / worktop under the food, else the floor at the
//           eater's feet), cutting on the board (on the worktop beside it), a slice out of the bread bag;
//   dust    slowly, on the floors of the flat (near a wall, where the visitor could reach: player.js isFree);
//   smears  butter spread on a slice lying on a worktop / table (#391 wipes them).
// A spot near another of its kind on the same surface grows instead (LIFE_MESS.merge); past LIFE_MESS.max of a kind the
// nearest one grows instead of a new one, so the mess never grows without bound and the draw calls stay one per kind.
// Saved by amount with the life sim's things (life.keepPart 'mess': lunden.life + keep.js). LIFE.rules.mess = false (or
// `&mess=0`) switches the automatic mess off. Vacuuming (#390) and the cloth (#391) take it away (`take`).

const canvas = (n, draw) => {
  const c = document.createElement('canvas'); c.width = c.height = n;
  draw(c.getContext('2d'), n);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647); // (the textures look the same every time)

const TEXTURES = {
  // crumbs: small crust-brown and pale crumb bits, a few bigger ones in the middle
  crumb: () => canvas(128, (g, n) => {
    for (let i = 0; i < 70; i++) {
      const a = rnd() * Math.PI * 2, d = Math.pow(rnd(), 1.3) * n * 0.44, r = n * (0.01 + rnd() * (d < n * 0.18 ? 0.03 : 0.016));
      g.fillStyle = ['#b07842', '#f0dfb6', '#d8b47a', '#8a5528', '#f6ead0'][i % 5];
      g.beginPath(); g.ellipse(n / 2 + Math.cos(a) * d, n / 2 + Math.sin(a) * d, r, r * (0.6 + rnd() * 0.4), rnd() * 3, 0, Math.PI * 2); g.fill();
    }
  }),
  // dust: a soft grey bunny with a few fluffy threads
  dust: () => canvas(128, (g, n) => {
    for (let i = 0; i < 18; i++) {
      const a = rnd() * Math.PI * 2, d = rnd() * n * 0.16, x = n / 2 + Math.cos(a) * d, y = n / 2 + Math.sin(a) * d, r = n * (0.08 + rnd() * 0.12);
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, 'rgba(128,124,118,0.32)'); rg.addColorStop(1, 'rgba(140,136,130,0)');
      g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    g.strokeStyle = 'rgba(110,106,100,0.55)'; g.lineWidth = 1.2;
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2, d = rnd() * n * 0.3;
      g.beginPath(); g.moveTo(n / 2 + Math.cos(a) * d * 0.3, n / 2 + Math.sin(a) * d * 0.3);
      g.quadraticCurveTo(n / 2 + Math.cos(a + 0.6) * d, n / 2 + Math.sin(a + 0.6) * d, n / 2 + Math.cos(a) * d, n / 2 + Math.sin(a) * d); g.stroke();
    }
  }),
  // a greasy smear: a pale yellow streak with a glossier middle
  smear: () => canvas(64, (g, n) => {
    for (let i = 0; i < 6; i++) {
      const x = n * (0.25 + i * 0.1), y = n * (0.5 + (rnd() - 0.5) * 0.1), r = n * (0.14 + rnd() * 0.06);
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, 'rgba(236,214,140,0.5)'); rg.addColorStop(1, 'rgba(236,214,140,0)');
      g.fillStyle = rg; g.beginPath(); g.ellipse(x, y, r * 1.3, r * 0.7, 0, 0, Math.PI * 2); g.fill();
    }
  }),
};

const KINDS = Object.keys(M.max);
const DUMMY = new THREE.Object3D();

export class Mess {
  /**
   * opts: { group (where the meshes go: the life sim's group — F hides it), surfaces (world.cupSurfaces), roomAt(level, x, z),
   * isFree(x, z, level, margin), nearestFree(x, z, level), box (the flat's plan box { x0, x1, z0, z1 } to throw dust
   * in), walls (level → segments) }
   */
  constructor(opts) {
    Object.assign(this, { surfaces: [], roomAt: () => null, isFree: () => true, nearestFree: () => null, box: { x0: 0, x1: 5.75, z0: 0, z1: 12.7 }, walls: () => [], ...opts });
    this.spots = [];
    this.dustT = 0;
    this.listeners = [];
    this.ray = new THREE.Raycaster();
    this.meshes = {};
    for (const k of KINDS) {
      const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
      const mat = new THREE.MeshStandardMaterial({ map: TEXTURES[k](), transparent: true, depthWrite: false, roughness: k === 'smear' ? 0.35 : 0.9,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const m = new THREE.InstancedMesh(geo, mat, M.max[k]);
      m.name = `mess-${k}`;
      m.count = 0;
      m.frustumCulled = false; // (spread over the flat: one bounding sphere would be wrong)
      m.raycast = () => {}; // (never an E target, never in the way of one)
      m.receiveShadow = true;
      this.meshes[k] = m;
      this.group?.add(m);
    }
  }

  /** fn(kind, data): 'add' | 'take' (data: { spot, amount }) — the vacuum's "Rent i köket!" (#390). */
  on(fn) { this.listeners.push(fn); }
  emit(kind, data) { for (const f of this.listeners) f(kind, data); }

  get auto() { return LIFE.rules.mess !== false; }
  count(kind) { return this.spots.filter((s) => !kind || s.kind === kind).length; }
  /** The mess's amount in a room (on a level), or all of it. */
  total({ room, level, kind } = {}) { return this.spots.filter((s) => (room === undefined || s.room === room) && (level === undefined || s.level === level) && (!kind || s.kind === kind)).reduce((n, s) => n + s.amt, 0); }

  /**
   * Mess of `kind` at (x, y, z) on a surface ('worktop' | 'table' | 'floor'), `amt` of it. Grows a spot near it, else a new
   * one, else (the kind full) the nearest one. Returns the spot.
   */
  add(kind, x, y, z, { surf = 'floor', amt = 0.25, level = levelOf(y), room } = {}) {
    if (!M.max[kind] || !(amt > 0)) return null;
    const same = this.spots.filter((s) => s.kind === kind && s.level === level && Math.abs(s.y - y) < 0.03);
    let near = null, d = Infinity;
    for (const s of same) { const e = Math.hypot(s.x - x, s.z - z); if (e < d) { d = e; near = s; } }
    let spot = near && d < M.merge ? near : null;
    if (!spot && this.count(kind) >= M.max[kind]) spot = near ?? this.spots.find((s) => s.kind === kind); // (the cap: the nearest grows)
    if (spot) spot.amt = Math.min(1, spot.amt + amt);
    else {
      spot = { kind, level, x: round(x), y: round(y), z: round(z), surf, room: room ?? this.roomAt(level, x, z) ?? null, amt: Math.min(1, amt), rot: Math.random() * Math.PI * 2 };
      this.spots.push(spot);
    }
    this.dirty = true;
    this.redraw();
    this.emit('add', { spot, amount: amt });
    return spot;
  }

  /**
   * Take mess away within `r` m of (x, z) on `level` (and, given `y`, only on that surface's height ± 3 cm): at most `rate`
   * of each spot's amount (all of it without). `kinds` = which. Returns { amount, spots: [the spots touched], gone: [the
   * spots now empty] }. `ok(spot)` = an extra test (the vacuum: not through a wall).
   */
  take(x, z, r, { level, y, rate = Infinity, kinds = KINDS, ok = () => true } = {}) {
    let amount = 0;
    const spots = [], gone = [];
    for (const s of this.spots) {
      if (!kinds.includes(s.kind) || (level !== undefined && s.level !== level) || (y !== undefined && Math.abs(s.y - y) > 0.03)) continue;
      if (Math.hypot(s.x - x, s.z - z) > r || !ok(s)) continue;
      const got = Math.min(s.amt, rate);
      s.amt -= got; amount += got;
      spots.push(s);
      if (s.amt <= 1e-3) gone.push(s);
    }
    if (!spots.length) return { amount: 0, spots, gone };
    this.spots = this.spots.filter((s) => !gone.includes(s));
    this.dirty = true;
    this.redraw();
    this.emit('take', { amount, spots, gone });
    return { amount, spots, gone };
  }

  clear() { this.spots = []; this.dirty = true; this.redraw(); }

  /** Draw every spot: its kind's mesh, a fuller one bigger. */
  redraw() {
    const n = {};
    for (const k of KINDS) n[k] = 0;
    for (const s of this.spots) {
      const m = this.meshes[s.kind], i = n[s.kind]++;
      if (i >= M.max[s.kind]) continue;
      const w = M.size[s.kind] * (0.45 + 0.55 * Math.sqrt(s.amt));
      DUMMY.position.set(s.x, s.y + 0.0015, s.z);
      DUMMY.rotation.set(0, s.rot, 0);
      DUMMY.scale.set(w, 1, s.kind === 'smear' ? w * 0.6 : w);
      DUMMY.updateMatrix();
      m.setMatrixAt(i, DUMMY.matrix);
    }
    for (const k of KINDS) { const m = this.meshes[k]; m.count = Math.min(n[k], M.max[k]); m.instanceMatrix.needsUpdate = true; }
  }

  // --- where mess comes from -------------------------------------------------------------------------------------
  /** The surface under world point `p` (a table top / a worktop within `down` m below, not a bed or a sofa), or null. */
  surfaceUnder(p, down = 1.2) {
    this.ray.set(new THREE.Vector3(p[0], p[1] + 0.05, p[2]), new THREE.Vector3(0, -1, 0));
    this.ray.far = down + 0.05;
    const hit = this.ray.intersectObjects(this.surfaces, false).find((h) => !h.object.userData.soft && shown(h.object) && Math.abs(h.point.y - (h.object.userData.surface ?? h.point.y)) < 0.03);
    return hit ? { y: hit.object.userData.surface ?? hit.point.y, surf: hit.object.userData.worktop || hit.object.userData.counter ? 'worktop' : 'table' } : null;
  }

  /** Crumbs on the floor near (x, z) of `level`, where the visitor could reach (else the nearest such spot), or null. */
  floorSpot(x, z, level) {
    const B = this.box;
    if (level < 0 || !LEVELS[level] || x < B.x0 || x > B.x1 || z < B.z0 || z > B.z1) return null; // (the flat's floors only)
    if (this.isFree(x, z, level, M.margin)) return { x, z };
    return this.nearestFree(x, z, level);
  }

  /**
   * The life sim's 'crumbs' event (#380): `from` 'bite' (pos = the food at the mouth, `feet` = where the eater stands, `level`),
   * 'cut' / 'bag' (pos = the board / the bag: beside it on the worktop). Nothing while the automatic mess is off.
   */
  fromEvent(d) {
    if (!this.auto || !d?.pos) return null;
    const amt = M.per[d.from] ?? M.per.bite;
    if (d.from === 'cut' || d.from === 'bag' || d.from === 'spread') { // beside the thing, on the surface it lies on
      for (let k = 0; k < 6; k++) {
        const a = Math.random() * Math.PI * 2, r = (d.from === 'spread' ? 0.12 : 0.2) + Math.random() * 0.08;
        const p = [d.pos[0] + Math.cos(a) * r, d.pos[1] + 0.2, d.pos[2] + Math.sin(a) * r];
        const s = this.surfaceUnder(p, 0.4);
        if (s && Math.abs(s.y - d.pos[1]) < 0.08) return this.add(d.from === 'spread' ? 'smear' : 'crumb', p[0], s.y, p[2], { surf: s.surf, amt });
      }
      return null;
    }
    const s = this.surfaceUnder(d.pos, 0.75); // a bite over a table / a worktop: there
    if (s) return this.add('crumb', d.pos[0], s.y, d.pos[2], { surf: s.surf, amt });
    const f = d.feet ?? d.pos, lv = d.level ?? levelOf(f[1]);
    const at = this.floorSpot(f[0], f[2], lv); // else on the floor at the eater's feet
    return at ? this.add('crumb', at.x, LEVELS[lv].floor, at.z, { surf: 'floor', amt, level: lv }) : null;
  }

  /** Dust now and then (game time `dt`): a bit more near a wall in a random room, while the automatic mess is on. */
  update(dt) {
    if (!this.auto) return;
    this.dustT += dt;
    if (this.dustT < M.dust.every) return;
    this.dustT = 0;
    this.dust();
  }

  /** One bit of dust in a random room of the flat (near a wall, reachable). Returns the spot or null. */
  dust(rng = Math.random) {
    const D = M.dust;
    for (let tries = 0; tries < 40; tries++) {
      const level = rng() < 0.5 ? 0 : 1, B = this.box;
      const x = B.x0 + rng() * (B.x1 - B.x0), z = B.z0 + rng() * (B.z1 - B.z0), room = this.roomAt(level, x, z);
      if (!room || !this.isFree(x, z, level, M.margin)) continue;
      if (!this.walls(level).some((sg) => segDist(x, z, sg) < D.wall)) continue; // (in the corners and along the walls)
      const here = this.spots.filter((s) => s.kind === 'dust' && s.room === room && s.level === level);
      if (here.length >= D.perRoom) { const s = here[Math.floor(rng() * here.length)]; return this.add('dust', s.x, s.y, s.z, { level, amt: D.amount * 0.5 }); }
      return this.add('dust', x, LEVELS[level].floor, z, { level, room, amt: D.amount });
    }
    return null;
  }

  // --- saving (life.keepPart 'mess') --------------------------------------------------------------------------------
  save() { return this.spots.length ? { v: 1, s: this.spots.map((s) => [s.kind, s.level, s.x, s.y, s.z, s.surf, s.room, round(s.amt), round(s.rot)]) } : null; }
  load(v) {
    this.spots = [];
    for (const e of Array.isArray(v?.s) ? v.s : []) {
      if (!Array.isArray(e)) continue;
      const [kind, level, x, y, z, surf, room, amt, rot] = e;
      if (!M.max[kind] || ![x, y, z, amt].every(Number.isFinite) || !(amt > 0)) continue;
      if (this.count(kind) >= M.max[kind]) continue;
      this.spots.push({ kind, level: level === 1 ? 1 : 0, x, y, z, surf: surf ?? 'floor', room: room ?? null, amt: Math.min(1, amt), rot: Number.isFinite(rot) ? rot : 0 });
    }
    this.redraw();
  }
}

/** Not under something hidden (F hides the furniture: no crumbs on a table that is not there). */
function shown(o) { for (let p = o.parent; p; p = p.parent) if (!p.visible) return false; return true; }
const round = (v) => Math.round(v * 1000) / 1000;
/** The level a height is on (the floor's y, or a surface's). */
const levelOf = (y) => (y > LEVELS[1].floor - 0.4 ? 1 : 0);
function segDist(x, z, [ax, az, bx, bz]) {
  const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz;
  const t = l ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l)) : 0;
  return Math.hypot(x - ax - t * dx, z - az - t * dz);
}

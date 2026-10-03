import * as THREE from 'three';
import { WEATHER as W, HUS_L } from './config.js';
import { groundY } from './surroundings.js';
import { occluders } from './greet.js';
import { sfx, audioParts } from './audio.js';

// Weather (#248, #249): rain in spring and autumn (a little in summer), thunderstorms in late summer, snow in the
// winter, short hail showers in spring and at the start of some thunderstorms. Every date gets a
// seeded draw of showers (WEATHER), so the weather follows the clock and the calendar — spooling the wall clock or
// picking another date changes it. While it rains: streaks fall around the visitor (one LineSegments; drops end on
// the ground or on a house's roof, so none fall inside the houses), the sky turns grey and the fog closes in
// (DayCycle.overcast), a rain hiss plays (muffled indoors). A storm adds lightning (DayCycle.flash) and thunder after
// the light, later the farther away. `&weather=rain|storm|clear` forces it.

/** A small seeded random (mulberry32: neighbouring seeds — neighbouring dates — give unrelated sequences). */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const between = (r, [a, b]) => a + (b - a) * r();
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/** The showers of one date: [{ start, end, strength, storm, kind: 'rain' | 'snow' | 'hail' }] in hours of that day
 * (end may pass 24). Snow in the snow months, hail now and then in spring and at the start of a thunderstorm (#249). */
export function showersOn(year, month, date) {
  const r = rng(year * 3719 + month * 131 + date * 7 + 11), list = [];
  const T = W.thunder, md = month * 100 + date;
  if (md >= T.from[0] * 100 + T.from[1] && md <= T.to[0] * 100 + T.to[1] && r() < T.chance) {
    const start = between(r, T.hours);
    list.push({ start, end: start + between(r, T.len), strength: 1, storm: true, kind: 'rain' });
    if (r() < W.hail.storm) list.push({ start: start - 0.1, end: start + between(r, W.hail.len), strength: 1, storm: true, kind: 'hail' });
  }
  if (r() < W.rain[month - 1]) {
    const n = r() < W.second ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const len = between(r, W.showers.len), start = r() * (24 - len * 0.5);
      list.push({ start, end: start + len, strength: between(r, W.showers.strength), storm: false, kind: 'rain' });
    }
  }
  if (W.hail.months.includes(month) && r() < W.hail.chance) {
    const len = between(r, W.hail.len), start = between(r, [8, 20]);
    list.push({ start, end: start + len, strength: between(r, [0.6, 1]), storm: false, kind: 'hail' });
  }
  if (r() < W.snow.chance[month - 1]) {
    const n = r() < W.second ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const len = between(r, W.snow.len), start = r() * (24 - len * 0.5);
      list.push({ start, end: start + len, strength: between(r, W.showers.strength), storm: false, kind: 'snow' });
    }
  }
  return list.map((x) => ({ ...x, id: `${year}-${month}-${date}-${x.kind}-${x.start.toFixed(2)}` }));
}

/** How much falls (0…1), what (the strongest shower's kind), whether it is a thunderstorm and which shower (`id`) at
 * `hour` of the date; `early` h of grey sky before / after. */
export function rainAt(year, month, date, hour, early = 0) {
  const prev = new Date(year, month - 1, date - 1);
  const all = [...showersOn(year, month, date),
    ...showersOn(prev.getFullYear(), prev.getMonth() + 1, prev.getDate()).map((s) => ({ ...s, start: s.start - 24, end: s.end - 24 }))];
  let rain = 0, storm = false, kind = null, id = null;
  const ramp = W.showers.ramp + early;
  for (const s of all) {
    const k = smooth(s.start - ramp, s.start + W.showers.ramp, hour) * (1 - smooth(s.end - W.showers.ramp, s.end + ramp, hour));
    if (k * s.strength > rain) { rain = k * s.strength; kind = s.kind; id = s.id; }
    if (s.storm && k > 0.3) storm = true;
  }
  return { rain, storm, kind, id };
}

let flakeTex = null;
/** A soft round snowflake for the Points. */
function flakeTexture() {
  if (flakeTex) return flakeTex;
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  flakeTex = new THREE.CanvasTexture(c);
  return flakeTex;
}

const KINDS = { rain: '🌧', snow: '❄️', hail: '🧊' };

export class Weather {
  /** `force`: 'rain' | 'storm' | 'snow' | 'hail' | 'clear' | null (the &weather parameter). */
  constructor(scene, camera, day, force = null) {
    Object.assign(this, { scene, camera, day, force, rain: 0, overcast: 0, storm: false, kind: null, id: null, flashT: 9, flash: 0, flashK: 0,
      strikes: 0, sound: null, walked: {}, done: {} });
    // the houses (greet.js) and our own unit, which greet.js leaves to the flat's walls: nothing falls inside them
    this.boxes = [...occluders(), { x0: 0, x1: 5.75, z0: 0.05, z1: 12.65, y0: 0, y1: 2 * HUS_L.storeyHeight }];
    // rain: streaks (one LineSegments)
    const n = W.drops;
    this.pos = new Float32Array(n * 6);
    this.floor = new Float32Array(n);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.LineBasicMaterial({ color: 0xc8d4e0, transparent: true, opacity: 0.4, depthWrite: false });
    this.lines = new THREE.LineSegments(this.geo, this.mat);
    // snow and hail: drifting flakes / bouncing pellets (one Points)
    const m = W.snow.flakes;
    this.fpos = new Float32Array(m * 3);
    this.ffloor = new Float32Array(m);
    this.fphase = Float32Array.from({ length: m }, () => Math.random() * 6.3);
    this.fvel = new Float32Array(m); // hail: falling speed (bounces once off the ground)
    this.frest = new Float32Array(m); // hail: s left lying where it landed
    this.fgeo = new THREE.BufferGeometry();
    this.fgeo.setAttribute('position', new THREE.BufferAttribute(this.fpos, 3).setUsage(THREE.DynamicDrawUsage));
    this.flakes = new THREE.Points(this.fgeo, new THREE.PointsMaterial({ size: W.snow.size, map: flakeTexture(), transparent: true, depthWrite: false, color: 0xffffff }));
    for (const o of [this.lines, this.flakes]) { o.frustumCulled = false; o.raycast = () => {}; o.visible = false; scene.add(o); }
    this.seeded = null;
    this.clock = 0;
    this.next = between(Math.random, W.flash.every);
  }

  /** The highest roof over (x, z) among the houses, or −∞. */
  roofAt(x, z) {
    let top = -Infinity;
    for (const b of this.boxes) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && b.y1 > top) top = b.y1;
    return top;
  }

  /** A point in the column around the eye above the ground and any roof there: [x, y, z, floor]; y −1000 if none. */
  place(fresh, len) {
    const c = this.camera.position;
    let x, y, z, floor, tries = 0;
    do {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * W.radius;
      x = c.x + Math.cos(a) * r; z = c.z + Math.sin(a) * r;
      y = c.y + (fresh ? W.height * (0.7 + 0.3 * Math.random()) : (Math.random() * 2 - 0.4) * W.height);
      floor = Math.max(groundY(x, z), this.roofAt(x, z));
    } while (y - len < floor && ++tries < 6);
    return [x, y - len < floor ? -1000 : y, z, floor];
  }

  /** Rain streak `i` at a fresh place. */
  spawn(i, fresh) {
    const len = W.len, [x, y, z, floor] = this.place(fresh, len), p = this.pos, o = i * 6;
    this.floor[i] = floor;
    p[o] = x; p[o + 1] = y; p[o + 2] = z;
    p[o + 3] = x - W.wind * len; p[o + 4] = y - len; p[o + 5] = z;
  }

  /** Snowflake / hailstone `i` at a fresh place. */
  spawnFlake(i, fresh) {
    const [x, y, z, floor] = this.place(fresh, 0), p = this.fpos, o = i * 3;
    this.ffloor[i] = floor;
    this.fvel[i] = -W.hail.speed * (0.8 + 0.4 * Math.random());
    this.frest[i] = 0;
    p[o] = x; p[o + 1] = y; p[o + 2] = z;
  }

  /** The weather now (forced or from the date and hour). */
  state() {
    const f = this.force;
    if (f === 'clear') return { rain: 0, storm: false, overcast: 0, kind: null, id: null };
    if (f === 'rain' || f === 'snow' || f === 'hail') return { rain: 0.8, storm: false, overcast: 1, kind: f, id: `forced-${f}` };
    if (f === 'storm') return { rain: 1, storm: true, overcast: 1, kind: 'rain', id: 'forced-storm' };
    const d = this.day, now = rainAt(d.year, d.month, d.date, d.hour), sky = rainAt(d.year, d.month, d.date, d.hour, 0.5);
    return { ...now, overcast: Math.min(1, sky.rain * 1.3) };
  }

  /** `inside`: the visitor is in the flat (muffled); `moved`: metres walked this frame (#249: out in it, it counts). */
  update(dt, inside = false, moved = 0) {
    const s = this.state();
    if (s.kind !== this.kind) this.seeded = null; // another kind: start the particles afresh
    Object.assign(this, { rain: s.rain, storm: s.storm, overcast: s.overcast, kind: s.kind, id: s.id });
    this.day.overcast = this.overcast * (this.kind === 'snow' ? 0.7 : 1); // snow clouds are lighter
    this.clock += dt;
    const streaks = this.kind === 'rain', hail = this.kind === 'hail', active = Math.round((streaks ? W.drops : hail ? W.hail.stones : W.snow.flakes) * this.rain);
    this.lines.visible = streaks && active > 0;
    this.flakes.visible = (this.kind === 'snow' || hail) && active > 0;
    const c = this.camera.position, R2 = (W.radius * 1.3) ** 2;
    if (this.lines.visible) {
      if (this.seeded !== 'streaks') { for (let i = 0; i < W.drops; i++) this.spawn(i, false); this.seeded = 'streaks'; }
      const p = this.pos, fall = W.speed * dt;
      for (let i = 0; i < active; i++) {
        const o = i * 6;
        p[o + 1] -= fall; p[o + 4] -= fall; p[o] -= W.wind * fall; p[o + 3] -= W.wind * fall;
        const dx = p[o] - c.x, dz = p[o + 2] - c.z;
        if (p[o + 4] < this.floor[i] || p[o + 1] < c.y - 4 || dx * dx + dz * dz > R2 || p[o + 4] < this.roofAt(p[o + 3], p[o + 5])) this.spawn(i, true); // (blown against a house: gone)
      }
      this.geo.setDrawRange(0, active * 2);
      this.geo.attributes.position.needsUpdate = true;
      const light = 0.25 + 0.75 * this.day.daylight;
      this.mat.color.setRGB(0.55 + 0.25 * light, 0.62 + 0.24 * light, 0.7 + 0.2 * light);
      this.mat.opacity = 0.18 + 0.3 * this.rain;
    }
    if (this.flakes.visible) {
      if (this.seeded !== this.kind) { for (let i = 0; i < W.snow.flakes; i++) this.spawnFlake(i, false); this.seeded = this.kind; }
      const p = this.fpos, t = this.clock, sway = W.snow.sway * dt, v = this.fvel;
      for (let i = 0; i < active; i++) {
        const o = i * 3, ph = this.fphase[i];
        if (hail) { // pellets: straight down, one small bounce off the ground or a roof
          if (this.frest[i] > 0) { if ((this.frest[i] -= dt) <= 0) this.spawnFlake(i, true); continue; } // lying a moment
          v[i] -= 9.81 * dt; p[o + 1] += v[i] * dt;
          if (p[o + 1] < this.ffloor[i] && v[i] < -2) { p[o + 1] = this.ffloor[i] + 0.01; v[i] = -v[i] * 0.22; p[o] += (Math.random() - 0.5) * 0.05; continue; }
          if (p[o + 1] < this.ffloor[i] && this.ffloor[i] > -100) { p[o + 1] = this.ffloor[i] + 0.012; this.frest[i] = W.hail.lie * Math.random(); continue; }
        } else { // flakes: slow, swaying
          p[o + 1] -= W.snow.speed * dt * (0.75 + 0.5 * Math.sin(ph * 3.1));
          p[o] += Math.sin(t * 1.3 + ph) * sway; p[o + 2] += Math.cos(t * 0.9 + ph * 1.7) * sway * 0.7;
        }
        const dx = p[o] - c.x, dz = p[o + 2] - c.z;
        if (p[o + 1] < this.ffloor[i] || p[o + 1] < c.y - 4 || dx * dx + dz * dz > R2 || p[o + 1] < this.roofAt(p[o], p[o + 2])) this.spawnFlake(i, true);
      }
      this.fgeo.setDrawRange(0, active);
      this.fgeo.attributes.position.needsUpdate = true;
      const m = this.flakes.material;
      m.size = hail ? W.hail.size : W.snow.size;
      m.opacity = hail ? 0.95 : 0.55 + 0.4 * this.rain;
      m.color.setScalar(0.55 + 0.45 * this.day.daylight);
    }
    // the sound, once there is audio: rain hisses, hail rattles louder and brighter, snow is silent
    if (!this.sound && audioParts()) this.sound = sfx.rain();
    const loud = this.kind === 'snow' ? 0 : this.kind === 'hail' ? 1.6 : 1;
    this.sound?.set(this.rain * W.sound * loud * (inside ? 0.3 : 1), inside ? 900 : this.kind === 'hail' ? 9000 : 6500);
    // out in it (#249): walking about outdoors while it falls counts once per shower
    if (!inside && moved > 0 && this.id && this.rain > W.experience.min && !this.done[this.id]) {
      this.walked[this.id] = (this.walked[this.id] ?? 0) + moved;
      if (this.walked[this.id] >= W.experience.metres) {
        this.done[this.id] = true;
        this.onExperience?.(this.storm ? 'storm' : this.kind, this.id);
      }
    }
    // lightning and thunder
    this.flashT += dt;
    if (this.storm && this.rain > 0.5) {
      this.next -= dt;
      if (this.next <= 0) this.strike(inside);
    }
    const ft = this.flashT;
    this.flash = ft < 0.07 ? this.flashK : ft < 0.14 ? 0.25 * this.flashK : ft < 0.22 ? 0.8 * this.flashK : this.flashK * Math.exp(-(ft - 0.22) * 9) * 0.8;
    if (ft > 1.5) this.flash = 0;
    this.day.flash = this.flash;
  }

  /** A lightning strike: the flash now, the thunder after the light (distance / 343 m/s). */
  strike(inside) {
    const dist = between(Math.random, W.flash.dist);
    const near = 1 - (dist - W.flash.dist[0]) / (W.flash.dist[1] - W.flash.dist[0]);
    this.flashT = 0;
    this.flashK = 0.35 + 0.65 * near;
    this.strikes++;
    this.next = between(Math.random, W.flash.every);
    sfx.thunder(dist / 343, near, inside);
  }

  /** For the HUD: 🌧 / ❄️ / 🧊 while it falls, ⛈ in a thunderstorm. */
  get icon() { return this.rain > 0.15 && this.kind ? ` · ${this.storm ? '⛈' : KINDS[this.kind]}` : ''; }
}

import * as THREE from 'three';
import { WEATHER as W, HUS_L } from './config.js';
import { groundY } from './surroundings.js';
import { occluders } from './greet.js';
import { sfx, audioParts } from './audio.js';

// Weather (#248): rain in spring and autumn (a little in summer), thunderstorms in late summer. Every date gets a
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

/** The showers of one date: [{ start, end, strength, storm }] in hours of that day (end may pass 24). */
export function showersOn(year, month, date) {
  const r = rng(year * 3719 + month * 131 + date * 7 + 11), list = [];
  const T = W.thunder, md = month * 100 + date;
  if (md >= T.from[0] * 100 + T.from[1] && md <= T.to[0] * 100 + T.to[1] && r() < T.chance) {
    const start = between(r, T.hours);
    list.push({ start, end: start + between(r, T.len), strength: 1, storm: true });
  }
  if (r() < W.rain[month - 1]) {
    const n = r() < W.second ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const len = between(r, W.showers.len), start = r() * (24 - len * 0.5);
      list.push({ start, end: start + len, strength: between(r, W.showers.strength), storm: false });
    }
  }
  return list;
}

/** How much it rains (0…1) and whether it is a thunderstorm at `hour` of the date; `early` h of grey sky before/after. */
export function rainAt(year, month, date, hour, early = 0) {
  const prev = new Date(year, month - 1, date - 1);
  const all = [...showersOn(year, month, date).map((s) => ({ ...s })),
    ...showersOn(prev.getFullYear(), prev.getMonth() + 1, prev.getDate()).map((s) => ({ ...s, start: s.start - 24, end: s.end - 24 }))];
  let rain = 0, storm = false;
  const ramp = W.showers.ramp + early;
  for (const s of all) {
    const k = smooth(s.start - ramp, s.start + W.showers.ramp, hour) * (1 - smooth(s.end - W.showers.ramp, s.end + ramp, hour));
    if (k * s.strength > rain) rain = k * s.strength;
    if (s.storm && k > 0.3) storm = true;
  }
  return { rain, storm };
}

export class Weather {
  /** `force`: 'rain' | 'storm' | 'clear' | null (the &weather parameter). */
  constructor(scene, camera, day, force = null) {
    Object.assign(this, { scene, camera, day, force, rain: 0, overcast: 0, storm: false, flashT: 9, flash: 0, strikes: 0, sound: null });
    // the houses (greet.js) and our own unit, which greet.js leaves to the flat's walls: no rain falls inside them
    this.boxes = [...occluders(), { x0: 0, x1: 5.75, z0: 0.05, z1: 12.65, y0: 0, y1: 2 * HUS_L.storeyHeight }];
    const n = W.drops;
    this.pos = new Float32Array(n * 6);
    this.floor = new Float32Array(n);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.LineBasicMaterial({ color: 0xc8d4e0, transparent: true, opacity: 0.4, depthWrite: false });
    this.lines = new THREE.LineSegments(this.geo, this.mat);
    this.lines.frustumCulled = false;
    this.lines.raycast = () => {};
    this.lines.visible = false;
    scene.add(this.lines);
    this.seeded = false;
    this.next = between(Math.random, W.flash.every);
    this.flashK = 0;
  }

  /** The highest roof over (x, z) among the houses, or −∞. */
  roofAt(x, z) {
    let top = -Infinity;
    for (const b of this.boxes) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && b.y1 > top) top = b.y1;
    return top;
  }

  /** A drop `i` anywhere in the column around the eye (`fresh`: at the top). */
  spawn(i, fresh) {
    const c = this.camera.position;
    let x, y, z, tries = 0;
    do { // above the ground and any roof there (else it is parked far below, out of sight)
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * W.radius;
      x = c.x + Math.cos(a) * r; z = c.z + Math.sin(a) * r;
      y = c.y + (fresh ? W.height * (0.7 + 0.3 * Math.random()) : (Math.random() * 2 - 0.4) * W.height);
      this.floor[i] = Math.max(groundY(x, z), this.roofAt(x, z));
    } while (y - W.len < this.floor[i] && ++tries < 6);
    if (y - W.len < this.floor[i]) y = -1000;
    const p = this.pos, o = i * 6;
    p[o] = x; p[o + 1] = y; p[o + 2] = z;
    p[o + 3] = x - W.wind * W.len; p[o + 4] = y - W.len; p[o + 5] = z;
  }

  /** The weather now (forced or from the date and hour). */
  state() {
    if (this.force === 'clear') return { rain: 0, storm: false, overcast: 0 };
    if (this.force === 'rain') return { rain: 0.8, storm: false, overcast: 1 };
    if (this.force === 'storm') return { rain: 1, storm: true, overcast: 1 };
    const d = this.day, now = rainAt(d.year, d.month, d.date, d.hour), sky = rainAt(d.year, d.month, d.date, d.hour, 0.5);
    return { rain: now.rain, storm: now.storm, overcast: Math.min(1, sky.rain * 1.3) };
  }

  /** `inside`: the visitor is in the flat (the rain is muffled, the thunder too). */
  update(dt, inside = false) {
    const s = this.state();
    this.rain = s.rain; this.storm = s.storm; this.overcast = s.overcast;
    this.day.overcast = this.overcast;
    // the drops
    const active = Math.round(W.drops * this.rain);
    this.lines.visible = active > 0;
    if (active > 0) {
      if (!this.seeded) { for (let i = 0; i < W.drops; i++) this.spawn(i, false); this.seeded = true; }
      const p = this.pos, fall = W.speed * dt, c = this.camera.position, R2 = (W.radius * 1.3) ** 2;
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
    } else this.seeded = false;
    // the sound, once there is audio
    if (!this.sound && audioParts()) this.sound = sfx.rain();
    this.sound?.set(this.rain * W.sound * (inside ? 0.3 : 1), inside ? 900 : 6500);
    // lightning and thunder
    this.flashT += dt;
    if (this.storm && this.rain > 0.5) {
      this.next -= dt;
      if (this.next <= 0) this.strike(inside);
    }
    const t = this.flashT;
    this.flash = t < 0.07 ? this.flashK : t < 0.14 ? 0.25 * this.flashK : t < 0.22 ? 0.8 * this.flashK : this.flashK * Math.exp(-(t - 0.22) * 9) * 0.8;
    if (t > 1.5) this.flash = 0;
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

  /** For the HUD: 🌧 while it rains, ⛈ in a thunderstorm. */
  get icon() { return this.rain > 0.15 ? (this.storm ? ' · ⛈' : ' · 🌧') : ''; }
}

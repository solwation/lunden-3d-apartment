import * as THREE from 'three';
import { GREET as G, SITE, HUS_L, UNIT_TOP } from './config.js';
import { isMuted } from './audio.js';
import { husLLayout } from './exterior.js';

// Greeting the people outside (#247): look at one within `G.reach` m (not through a house) and the action is
// "Hälsa på grannen / barnet / cyklisten". The visitor says a random greeting, the person answers a moment later
// with a random reply in a voice of its own and waves; a walker stops and turns to you. Speech is the browser's own
// (Web Speech API, sv-SE; pitch and rate per person, children higher); the lines always show as speech bubbles —
// yours at the bottom, theirs over the head — so it works without speech or with the sound off.

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const tmp = new THREE.Vector3(), dir = new THREE.Vector3();

/** Boxes that hide people (plan x/z, height y): the Å-husen and the blocks around, and Hus L — its two lower storeys
 * without our own unit (from inside it the flat's walls decide, main.js `behindWall`), the upper storeys set back
 * behind the loftgång, våning 4 also behind the courtyard terraces. */
export function occluders() {
  const boxes = SITE.blocks.map((b) => ({ x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, y0: b.base, y1: b.base + b.storeys * (b.style === 'old' ? SITE.old.storey : SITE.storey) + 1 }));
  const w = 5.75, { xw: west, xe: east } = husLLayout(w), low = UNIT_TOP, up = low + HUS_L.storeyHeight; // våning 3's / 4's floor (VERTICAL, #344)
  boxes.push({ x0: west, x1: 0, z0: 0.05, z1: 12.65, y0: 0, y1: low }, { x0: w, x1: east, z0: 0.05, z1: 12.65, y0: 0, y1: low },
    { x0: west, x1: east, z0: HUS_L.loftgangDepth, z1: 12.65, y0: low, y1: up },
    // våning 4 set back behind the roof terraces (#337): rain falls on the terraces
    { x0: west, x1: east, z0: HUS_L.loftgangDepth, z1: 12.7 - HUS_L.court.setback, y0: up, y1: low + HUS_L.upperStoreys * HUS_L.storeyHeight });
  // L1205's brick loft (#349): out to the courtyard face and over the roof
  const L = HUS_L.court.core.loft, loftX0 = husLLayout(w).core[0] - HUS_L.wall;
  boxes.push({ x0: loftX0, x1: loftX0 + L.w, z0: 12.7 - HUS_L.court.setback - L.back, z1: 12.7 - L.face,
    y0: up, y1: low + HUS_L.upperStoreys * HUS_L.storeyHeight + L.rise });
  return boxes;
}

/** Does the segment a → b pass through the box? (slab test) */
function crosses(a, b, box) {
  let t0 = 0, t1 = 1;
  for (const [p, q, lo, hi] of [[a.x, b.x, box.x0, box.x1], [a.y, b.y, box.y0, box.y1], [a.z, b.z, box.z0, box.z1]]) {
    const d = q - p;
    if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return false; continue; }
    let u0 = (lo - p) / d, u1 = (hi - p) / d;
    if (u0 > u1) [u0, u1] = [u1, u0];
    t0 = Math.max(t0, u0); t1 = Math.min(t1, u1);
    if (t0 > t1) return false;
  }
  return true;
}

export class Greetings {
  /** `people`: People (people.js); `layer`: the element the bubbles go in; `behindWall(p)`: the flat's walls (main.js). */
  constructor(people, camera, layer, behindWall) {
    Object.assign(this, { people, camera, layer, behindWall, boxes: occluders(), queue: [], bubbles: [], said: 0, answered: 0 });
    this.voices = [];
    const load = () => { this.voices = window.speechSynthesis?.getVoices().filter((v) => /^sv/i.test(v.lang)) ?? []; };
    if ('speechSynthesis' in window) { load(); window.speechSynthesis.addEventListener?.('voiceschanged', load); }
    this.mine = document.createElement('div');
    this.mine.className = 'say mine';
    this.mine.hidden = true;
    layer.append(this.mine);
  }

  /** What a figure is called in the prompt. */
  static nameOf(f) { return f.role === 'cycle' ? 'cyklisten' : f.kid ? 'barnet' : 'grannen'; }

  /** The person the look ray points at, within reach and in sight, as an E target — or null. */
  target(ray) {
    let best = null, bestD = G.reach;
    for (const f of this.people.greetable) {
      const r = f.kid ? 0.28 : 0.36;
      tmp.copy(f.head).sub(f.foot).multiplyScalar(0.15).add(f.foot); // from just above the feet …
      const d2 = ray.distanceSqToSegment(tmp, f.head, null, dir); // … to the head
      if (d2 > r * r) continue;
      const d = dir.distanceTo(ray.origin);
      if (d > bestD) continue;
      best = f; bestD = d;
    }
    if (!best) return null;
    const eye = ray.origin, head = best.head;
    if (this.behindWall(head) || this.boxes.some((b) => crosses(eye, head, b))) return null;
    return { name: Greetings.nameOf(best), kind: 'greet', verb: 'hälsa på', fig: best, outlineRoot: this.people.object, outlineInstances: Object.values(this.people.parts).map(object=>({object,index:this.people.figs.indexOf(best)})), point: best.head.clone() };
  }

  /** The same from a point `o` looking at `p` (tests). */
  targetFrom(o, p) { return this.target(new THREE.Ray(o.clone(), p.clone().sub(o).normalize())); }

  /** E: say hello to figure `f`; it answers after a moment. Returns true the first time per figure (for the stats). */
  greet(f) {
    const line = pick(G.say);
    this.show(this.mine, line);
    this.mineT = G.bubble;
    this.speak(line, { pitch: 1, rate: 1.05, voice: 0 });
    this.said++;
    const eye = this.camera.position;
    this.people.answer(f, eye.x, eye.z, G.bubble + 1.5);
    this.queue.push({ f, in: Math.min(2.2, 0.5 + line.length * 0.06) }); // after your line
    const first = !f.greeted;
    f.greeted = true;
    return first;
  }

  /** A line in the figure's own voice: children higher, adults spread out, a voice of their own where there are several. */
  voiceOf(f) {
    if (!f.voice) {
      const i = this.people.figs.indexOf(f);
      f.voice = f.kid ? { pitch: 1.55 + Math.random() * 0.3, rate: 1.1 + Math.random() * 0.15 }
        : { pitch: 0.55 + Math.random() * 0.75, rate: 0.88 + Math.random() * 0.25 };
      f.voice.voice = i + 1;
    }
    return f.voice;
  }

  /** Your own line at the bottom (Olof, #586: "Hej Olof!"). */
  sayMine(line) {
    this.show(this.mine, line);
    this.mineT = G.bubble;
    this.speak(line, { pitch: 1, rate: 1.05, voice: 0 });
  }

  /** Someone else's line in a bubble over `f.head` (a world point; `f.s` its size) in `voice` — Olof (#586, #599). */
  say(f, line, voice) {
    const el = document.createElement('div');
    el.className = 'say theirs';
    this.layer.append(el);
    this.show(el, line);
    this.bubbles.push({ el, f, t: G.bubble });
    this.speak(line, voice);
  }

  speak(text, { pitch, rate, voice, volume = 1 }) {
    const S = window.speechSynthesis;
    if (!S || isMuted() || typeof SpeechSynthesisUtterance === 'undefined') return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'sv-SE';
    if (this.voices.length) u.voice = this.voices[voice % this.voices.length];
    u.pitch = pitch; u.rate = rate; u.volume = volume;
    try { S.speak(u); } catch { /* no speech here: the bubbles say it */ }
  }

  show(el, text) { el.textContent = text; el.hidden = false; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }

  update(dt) {
    for (const q of this.queue) q.in -= dt;
    for (const q of this.queue.filter((x) => x.in <= 0)) {
      const f = q.f, line = pick(f.kid ? G.kids : f.role === 'cycle' ? G.cyclists : G.answer);
      const el = document.createElement('div');
      el.className = 'say theirs';
      this.layer.append(el);
      this.show(el, line);
      this.bubbles.push({ el, f, t: G.bubble });
      const d = this.camera.position.distanceTo(f.head);
      this.speak(line, { ...this.voiceOf(f), volume: THREE.MathUtils.clamp(1.2 - d / G.reach, 0.3, 1) });
      this.answered++;
    }
    this.queue = this.queue.filter((x) => x.in > 0);
    if (this.mineT !== undefined && (this.mineT -= dt) <= 0) { this.mine.hidden = true; this.mineT = undefined; }
    // their bubbles over their heads, on screen
    const w = window.innerWidth, h = window.innerHeight;
    for (const b of this.bubbles) {
      b.t -= dt;
      tmp.copy(b.f.head).add(dir.set(0, 0.42 * b.f.s, 0)).project(this.camera);
      const off = tmp.z > 1 || Math.abs(tmp.x) > 1.2 || Math.abs(tmp.y) > 1.2;
      b.el.style.visibility = off ? 'hidden' : 'visible';
      b.el.style.transform = `translate(${((tmp.x + 1) / 2) * w}px, ${((1 - tmp.y) / 2) * h}px) translate(-50%, -100%)`;
      b.el.style.opacity = Math.min(1, b.t / 0.4);
      if (b.t <= 0) b.el.remove();
    }
    this.bubbles = this.bubbles.filter((b) => b.t > 0);
  }

  /** Anything being said now (tests). */
  get talking() { return !this.mine.hidden || this.bubbles.length > 0 || this.queue.length > 0; }
}


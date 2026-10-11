import * as THREE from 'three';
import { GREET as G, SITE, HUS_L, UNIT_TOP } from './config.js';
import { isMuted } from './audio.js';
import { gameView } from './viewport.js';
import { husLLayout } from './exterior.js';

// Speech bubbles (#247; the neighbours were removed in #670): Olof's lines over his head (#586, #599) and your own
// line at the bottom ("Hej Olof!"). Speech is the browser's own (Web Speech API, sv-SE; pitch and rate per speaker);
// the lines always show as bubbles too, so it works without speech or with the sound off. `occluders` (the houses as
// boxes) is shared with weather.js.

const tmp = new THREE.Vector3(), dir = new THREE.Vector3();

/** Boxes that hide things outside (plan x/z, height y): the Å-husen and the blocks around, and Hus L — its two lower storeys
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

export class Greetings {
  /** `layer`: the element the bubbles go in; `camera`: places the bubbles over the speakers' heads. */
  constructor(camera, layer) {
    Object.assign(this, { camera, layer, bubbles: [] });
    this.voices = [];
    const load = () => { this.voices = window.speechSynthesis?.getVoices().filter((v) => /^sv/i.test(v.lang)) ?? []; };
    if ('speechSynthesis' in window) { load(); window.speechSynthesis.addEventListener?.('voiceschanged', load); }
    this.mine = document.createElement('div');
    this.mine.className = 'say mine';
    this.mine.hidden = true;
    layer.append(this.mine);
  }

  /** Your own line at the bottom (Olof, #586: "Hej Olof!"). */
  sayMine(line) {
    this.show(this.mine, line);
    this.mineT = G.bubble;
    this.speak(line, { pitch: 1, rate: 1.05, voice: 0 });
  }

  /** Someone else's line in a bubble over `f.head` (a world point; `f.s` its size) in `voice` — Olof (#586, #599). */
  say(f, line, voice, secs = G.bubble) {
    const el = document.createElement('div');
    el.className = line.length > 32 ? 'say theirs long' : 'say theirs'; // (a dad joke wraps)
    this.layer.append(el);
    this.show(el, line);
    this.bubbles.push({ el, f, t: secs });
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
    if (this.mineT !== undefined && (this.mineT -= dt) <= 0) { this.mine.hidden = true; this.mineT = undefined; }
    // their bubbles over their heads, on screen
    const w = gameView.w, h = gameView.h;
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
  get talking() { return !this.mine.hidden || this.bubbles.length > 0; }
}


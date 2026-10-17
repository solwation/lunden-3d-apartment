import { setIcon } from './hudicons.js';
import * as THREE from 'three';
import { WALL_CLOCK as C } from './config.js';
import { formatHour, sunTimes } from './daycycle.js';

// Analog wall clock in the kitchen showing the day cycle's time. E on it opens a small control
// strip at the bottom of the screen (the view stays visible): spool the time backwards/forwards
// (held), pause/play, and pick the month — so you can watch how the light falls in the morning
// in June or in December.

const MONTHS = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];

// The face of the user's own clock (#1205, docs/ingame-reports/3ad70257-7a01-4ec9-a4a0-855d8db12de8-2.jpg): plain white,
// a ring of minute dots with bigger dots at the hours, thin sans-serif numerals inside it. The canvas spans the
// face disc inside the frame; a faint shade at the edge is the frame's recess (no glass or reflections).
function faceTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d'), R = 256;
  g.translate(R, R);
  g.fillStyle = '#f7f6f2';
  g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
  const shade = g.createRadialGradient(0, 0, R * 0.9, 0, 0, R);
  shade.addColorStop(0, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.16)');
  g.fillStyle = shade;
  g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#1b1c1e';
  for (let i = 0; i < 60; i++) {
    const a = (i * Math.PI) / 30, big = i % 5 === 0;
    g.beginPath(); g.arc(Math.sin(a) * R * 0.9, -Math.cos(a) * R * 0.9, big ? 5.5 : 3, 0, Math.PI * 2); g.fill();
  }
  // thin numerals: regular glyphs eroded by a face-coloured outline (light font weights are rarely installed)
  g.font = '400 72px "Helvetica Neue", "Nimbus Sans", "Liberation Sans", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.strokeStyle = '#f7f6f2';
  g.lineWidth = 1.3;
  for (let h = 1; h <= 12; h++) {
    const a = (h * Math.PI) / 6, x = Math.sin(a) * R * 0.75, y = -Math.cos(a) * R * 0.75 + 3;
    g.fillText(String(h), x, y);
    g.strokeText(String(h), x, y);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** A flat tapered hand pointing up (+y) from the pivot: `tail` behind it, base width `w`, a point at `len`. */
function handGeometry(len, w, tail) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, -tail);
  s.lineTo(w / 2, -tail);
  s.lineTo(w * 0.32, len - w * 1.2);
  s.lineTo(0, len);
  s.lineTo(-w * 0.32, len - w * 1.2);
  s.closePath();
  return new THREE.ShapeGeometry(s);
}

export class WallClock {
  constructor() {
    Object.assign(this, { name: 'klockan', kind: 'clock', verb: 'ställa', isOpen: false });
    const r = C.d / 2, D = C.depth, inner = r * (1 - C.lip), faceZ = D * 0.35;
    const g = new THREE.Group();
    // Deep round black frame (one lathe): the outer side from the wall, a rounded front lip and the inner
    // wall down to the recessed face. Lathe y becomes the clock's z (out from the wall).
    const profile = [
      [r * 0.97, 0], [r, 0.004], [r, D - 0.005], [r * 0.99, D - 0.0015], [r * 0.975, D],
      [inner * 1.01, D], [inner, D - 0.002], [inner, faceZ],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const frameGeo = new THREE.LatheGeometry(profile, 64);
    frameGeo.rotateX(Math.PI / 2);
    const frame = new THREE.Mesh(frameGeo, new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 0.45, side: THREE.DoubleSide }));
    const face = new THREE.Mesh(new THREE.CircleGeometry(inner, 64), new THREE.MeshStandardMaterial({ map: faceTexture(), roughness: 0.7 }));
    face.position.z = faceZ + 0.0005;
    const black = new THREE.MeshStandardMaterial({ color: 0x0e0f10, roughness: 0.6, side: THREE.DoubleSide });
    const hand = (geo, z, mat = black) => { const m = new THREE.Mesh(geo, mat); m.position.z = z; return m; };
    // hands pivot at the centre, shaped after the photo: long black spears with short tails, a thin red second hand
    this.hourHand = hand(handGeometry(inner * 0.56, 0.016, inner * 0.1), faceZ + 0.004);
    this.minuteHand = hand(handGeometry(inner * 0.82, 0.012, inner * 0.12), faceZ + 0.007);
    this.secondHand = hand(handGeometry(inner * 0.86, 0.0028, inner * 0.22),
      faceZ + 0.01, new THREE.MeshStandardMaterial({ color: 0xb8231c, roughness: 0.5, side: THREE.DoubleSide }));
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.005, 16), new THREE.MeshStandardMaterial({ color: 0xc9cacc, roughness: 0.3 }));
    cap.rotation.x = Math.PI / 2;
    cap.position.z = faceZ + 0.0125;
    g.add(frame, face, this.hourHand, this.minuteHand, this.secondHand, cap);
    g.position.set(C.x, C.y, C.z);
    g.rotation.y = C.rotY;
    g.traverse((m) => { m.userData.door = this; });
    this.object = g;
    this.pickable = g;
  }

  /** Point the hands at `hour` (0–24). The second hand shows game seconds (it spins when spooling). */
  update(hour) {
    const h = hour % 12, min = (hour * 60) % 60, sec = (hour * 3600) % 60;
    this.hourHand.rotation.z = -(h / 12) * Math.PI * 2;
    this.minuteHand.rotation.z = -(min / 60) * Math.PI * 2;
    this.secondHand.rotation.z = -(sec / 60) * Math.PI * 2;
  }
}

/**
 * The control strip (#clock-panel). Buttons work by click/touch; with the mouse locked the keys
 * do the same: A D / ← → spool (held), Space pause/play. The date is picked on the calendar (#95). `day` is the DayCycle.
 */
export class ClockPanel {
  constructor(day, el) {
    Object.assign(this, { day, el, held: new Map() }); // what is spooling: key/button → ±1
    this.timeEl = el.querySelector('.time');
    this.infoEl = el.querySelector('.info');
    this.playBtn = el.querySelector('[data-act=play]');
    for (const [act, dir] of [['back', -1], ['fwd', 1]]) {
      const b = el.querySelector(`[data-act=${act}]`);
      const stop = () => this.hold(act, 0);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); this.hold(act, dir); });
      b.addEventListener('pointerup', stop);
      b.addEventListener('pointercancel', stop);
      b.addEventListener('lostpointercapture', stop);
    }
    this.playBtn.addEventListener('click', () => this.togglePause());
    el.querySelector('[data-act=now]')?.addEventListener('click', () => this.toNow()); // back to the real time (#1145)
    this.render();
  }

  get open() { return !this.el.hidden; }

  show(show) {
    this.el.hidden = !show;
    if (!show) { this.held.clear(); this.day.spool = 0; }
    this.render();
  }

  /** Start (dir ±1) or stop (0) spooling from button `key`. */
  hold(key, dir) {
    if (dir) this.held.set(key, dir); else this.held.delete(key);
    this.day.spool = this.held.size ? [...this.held.values()].at(-1) : 0;
    this.render();
  }

  togglePause() { this.day.paused = !this.day.paused; this.render(); }

  /** The visitor's own time and date again, running (#1145). */
  toNow() { this.held.clear(); this.day.toNow(); this.render(); }

  /** Keyboard while the strip is open; returns true when the key was used. */
  key(code, down, repeat) {
    code = { KeyA: 'ArrowLeft', KeyD: 'ArrowRight' }[code] ?? code; // A D spool too, like the calendar (#120)
    if (code === 'ArrowLeft' || code === 'ArrowRight') { this.hold(code, down ? (code === 'ArrowLeft' ? -1 : 1) : 0); return true; }
    if (!down || repeat) return code === 'Space';
    if (code === 'Space') this.togglePause();
    else if (code === 'KeyN') this.toNow();
    else return false;
    return true;
  }

  render() {
    const d = this.day;
    this.timeEl.textContent = formatHour(d.hour);
    const sun = sunTimes(d.doy);
    const state = d.spool < 0 ? 'spolar bakåt' : d.spool > 0 ? 'spolar framåt' : d.paused ? 'pausad' : '';
    this.infoEl.textContent = [`${d.date} ${MONTHS[d.month - 1]}`, sun && `sol upp ${formatHour(sun[0])}, ner ${formatHour(sun[1])}`, state].filter(Boolean).join(' · ');
    setIcon(this.playBtn,d.paused?'play':'pause',d.paused?'Starta tiden':'Pausa tiden');
    this.playBtn.setAttribute('aria-label', d.paused ? 'Starta tiden' : 'Pausa tiden');
  }
}

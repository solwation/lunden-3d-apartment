import * as THREE from 'three';
import { WALL_CLOCK as C } from './config.js';
import { formatHour, sunTimes } from './daycycle.js';

// Analog wall clock in the kitchen showing the day cycle's time. E on it opens a small control
// strip at the bottom of the screen (the view stays visible): spool the time backwards/forwards
// (held), pause/play, and pick the month — so you can watch how the light falls in the morning
// in June or in December.

const MONTHS = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];

function faceTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.translate(256, 256);
  g.fillStyle = '#fbfaf6';
  g.beginPath(); g.arc(0, 0, 250, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#1d1f21';
  for (let i = 0; i < 60; i++) {
    g.save();
    g.rotate((i * Math.PI) / 30);
    if (i % 5 === 0) g.fillRect(-7, -236, 14, 40); else g.fillRect(-2.5, -236, 5, 16);
    g.restore();
  }
  g.font = '600 64px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let h = 1; h <= 12; h++) {
    const a = (h * Math.PI) / 6;
    g.fillText(String(h), Math.sin(a) * 160, -Math.cos(a) * 160);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export class WallClock {
  constructor() {
    Object.assign(this, { name: 'klockan', kind: 'clock', verb: 'ställa', isOpen: false });
    const r = C.d / 2;
    const g = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.04, 48), new THREE.MeshStandardMaterial({ color: 0x1d1f21, roughness: 0.5 }));
    rim.rotation.x = Math.PI / 2;
    rim.position.z = 0.02;
    const face = new THREE.Mesh(new THREE.CircleGeometry(r * 0.93, 48), new THREE.MeshStandardMaterial({ map: faceTexture(), roughness: 0.6 }));
    face.position.z = 0.0405;
    const black = new THREE.MeshStandardMaterial({ color: 0x1d1f21, roughness: 0.5 });
    // hands pivot at the centre; geometry points up (+y) from the pivot
    const hand = (len, w, z, mat = black) => {
      const geo = new THREE.BoxGeometry(w, len, 0.003);
      geo.translate(0, len / 2 - len * 0.15, 0);
      const m = new THREE.Mesh(geo, mat);
      m.position.z = z;
      return m;
    };
    this.hourHand = hand(r * 0.55, 0.012, 0.044);
    this.minuteHand = hand(r * 0.8, 0.008, 0.047);
    this.secondHand = hand(r * 0.85, 0.003, 0.05, new THREE.MeshStandardMaterial({ color: 0xc62f22, roughness: 0.5 }));
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.006, 16), black);
    cap.rotation.x = Math.PI / 2;
    cap.position.z = 0.052;
    g.add(rim, face, this.hourHand, this.minuteHand, this.secondHand, cap);
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
 * do the same: ← → spool (held), Space pause/play, ↑ ↓ month. `day` is the DayCycle.
 */
export class ClockPanel {
  constructor(day, el) {
    Object.assign(this, { day, el, held: new Map() }); // what is spooling: key/button → ±1
    this.timeEl = el.querySelector('.time');
    this.infoEl = el.querySelector('.info');
    this.dateEl = el.querySelector('.date');
    this.prevBtn = el.querySelector('[data-act=prev]');
    this.nextBtn = el.querySelector('[data-act=next]');
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
    this.prevBtn.addEventListener('click', () => this.month(-1));
    this.nextBtn.addEventListener('click', () => this.month(1));
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

  month(d) { this.day.month = ((this.day.month - 1 + d + 12) % 12) + 1; this.render(); }

  /** Keyboard while the strip is open; returns true when the key was used. */
  key(code, down, repeat) {
    if (code === 'ArrowLeft' || code === 'ArrowRight') { this.hold(code, down ? (code === 'ArrowLeft' ? -1 : 1) : 0); return true; }
    if (!down || repeat) return code === 'Space' || code === 'ArrowUp' || code === 'ArrowDown';
    if (code === 'Space') this.togglePause();
    else if (code === 'ArrowUp') this.month(1);
    else if (code === 'ArrowDown') this.month(-1);
    else return false;
    return true;
  }

  render() {
    const d = this.day;
    this.timeEl.textContent = formatHour(d.hour);
    const sun = sunTimes(d.doy);
    const state = d.spool < 0 ? '⏪ spolar bakåt' : d.spool > 0 ? '⏩ spolar framåt' : d.paused ? '⏸ pausad' : '';
    this.dateEl.textContent = `15 ${MONTHS[d.month - 1]}`;
    // the neighbouring months by name ("‹ sep", "nov ›"), so nothing reads as "mån" = måndag
    this.prevBtn.textContent = `‹ ${MONTHS[(d.month + 10) % 12].slice(0, 3)}`;
    this.nextBtn.textContent = `${MONTHS[d.month % 12].slice(0, 3)} ›`;
    this.infoEl.textContent = [sun && `sol upp ${formatHour(sun[0])}, ner ${formatHour(sun[1])}`, state].filter(Boolean).join(' · ');
    this.playBtn.textContent = d.paused ? '▶' : '⏸';
    this.playBtn.setAttribute('aria-label', d.paused ? 'Starta tiden' : 'Pausa tiden');
  }
}

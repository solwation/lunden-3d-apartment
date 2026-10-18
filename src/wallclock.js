import { setIcon } from './hudicons.js';
import * as THREE from 'three';
import { WALL_CLOCK as C } from './config.js';
import { formatHour, sunTimes } from './daycycle.js';
import { parseClockInput, previewDigits } from './clockinput.js';

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
 * An exact time is typed (#1242): with the mouse locked the digit keys fill a HH:MM preview, Enter sets it, Backspace deletes;
 * on touch (or any free pointer) "Skriv tid" opens a numeric field (OK / Enter sets, Avbryt / Esc cancels).
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
    this.digits = ''; // digits typed with the keys (mouse locked), shown as a preview until Enter
    this.error = '';
    this.form = el.querySelector('.set'); this.input = el.querySelector('.set input');
    this.typeBtn = el.querySelector('[data-act=type]');
    if (this.form) {
      this.typeBtn.addEventListener('click', () => this.openForm(this.form.hidden));
      el.querySelector('[data-act=cancel]').addEventListener('click', () => this.openForm(false));
      this.input.addEventListener('input', () => { // digits only, shown as H:MM / HH:MM
        const d = this.input.value.replace(/\D/g, '').slice(0, 4);
        this.input.value = d.length > 2 ? `${d.slice(0, -2)}:${d.slice(-2)}` : d;
        this.input.removeAttribute('aria-invalid'); this.error = '';
        this.render();
      });
      for (const t of ['keydown', 'keyup']) this.form.addEventListener(t, (e) => { // typing never walks / spools (#1242)
        e.stopPropagation();
        if (t === 'keydown' && e.code === 'Escape') { e.preventDefault(); this.openForm(false); }
      });
      this.form.addEventListener('submit', (e) => { e.preventDefault(); this.setTyped(this.input.value); });
    }
    this.render();
  }

  /** Open / close the numeric field (touch, free pointer). */
  openForm(open) {
    if (!this.form) return;
    this.form.hidden = !open; this.error = '';
    this.input.removeAttribute('aria-invalid');
    this.typeBtn.setAttribute('aria-expanded', String(open));
    if (open) { this.input.value = ''; this.input.focus(); } else this.input.blur();
    this.render();
  }

  /** Set the time of day from typed text (the date stays); false and a message when it is not 00:00–23:59. */
  setTyped(text) {
    const h = parseClockInput(text);
    if (h === null) {
      this.error = 'Ogiltig tid – skriv 00:00–23:59';
      this.input?.setAttribute('aria-invalid', 'true');
      this.render();
      return false;
    }
    this.held.clear(); this.digits = ''; this.error = '';
    Object.assign(this.day, { hour: h + 1e-6, spool: 0, realAt: Date.now() }); // (a hair over: formatHour floors, 9.6667 must not read 09:39)
    this.day.update(0);
    this.openForm(false);
    return true;
  }

  get open() { return !this.el.hidden; }

  show(show) {
    this.el.hidden = !show;
    this.digits = ''; this.error = ''; if (this.form) this.form.hidden = true;
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
    if (down && !repeat && (/^(Digit|Numpad)\d$/.test(code) || code === 'Backspace' || code === 'Enter' || code === 'NumpadEnter' || code === 'Escape')) { // typed time (#1242)
      if (code === 'Backspace') this.digits = this.digits.slice(0, -1);
      else if (code === 'Escape') { if (!this.digits) return false; this.digits = ''; }
      else if (code.endsWith('Enter')) { if (!this.digits) return false; this.setTyped(this.digits); return true; }
      else if (this.digits.length < 4) this.digits += code.slice(-1);
      this.error = ''; this.render();
      return true;
    }
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
    const typing = this.digits ? previewDigits(this.digits) : this.form && !this.form.hidden && this.input.value ? this.input.value : '';
    this.timeEl.textContent = typing || formatHour(d.hour);
    this.timeEl.classList.toggle('typing', !!typing);
    const sun = sunTimes(d.doy);
    const state = d.spool < 0 ? 'spolar bakåt' : d.spool > 0 ? 'spolar framåt' : d.paused ? 'pausad' : '';
    this.infoEl.textContent = [`${d.date} ${MONTHS[d.month - 1]}`, sun && `sol upp ${formatHour(sun[0])}, ner ${formatHour(sun[1])}`, state].filter(Boolean).join(' · ');
    if (this.error) this.infoEl.textContent = this.error;
    setIcon(this.playBtn,d.paused?'play':'pause',d.paused?'Starta tiden':'Pausa tiden');
    this.playBtn.setAttribute('aria-label', d.paused ? 'Starta tiden' : 'Pausa tiden');
  }
}

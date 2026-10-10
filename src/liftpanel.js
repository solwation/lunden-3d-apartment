import * as THREE from 'three';
import { LIFT_PANEL as P } from './config.js';
import { sfx } from './audio.js';

// The lift's passenger experience (#640), independent of any one house: the car's button panel, the call plates and the
// floor indicators at each landing, the mirror, and the lift's sounds. A lift passes its own configuration (the floors
// with their names, the car's size, the landing wall) so every house's lift (Hus L #415; A/B/C #637-#639) gets the same
// behaviour. Each plate is ONE textured plane (a canvas redrawn only when a button changes), the indicators share one
// texture and the mirror is a baked gradient (no reflection pass, no cube map): ~10 draw calls for the whole lift.

/** A plate of round buttons drawn on one canvas: buttons[i] = { x, y (metres from the plate centre, +x right, +y up), label | arrow: 'up' | 'down' }. */
class Plate {
  constructor(pw, ph, buttons) {
    this.buttons = buttons; this.st = buttons.map(() => ({ lit: false, press: false }));
    this.c = document.createElement('canvas'); this.c.width = Math.round(pw * P.pxPerM); this.c.height = Math.round(ph * P.pxPerM);
    this.tex = new THREE.CanvasTexture(this.c); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 4;
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), this.mat);
    this.mesh.raycast = () => {};
    this.draw();
  }
  /** Set button i's look; true when it changed (the plate needs a redraw). */
  set(i, lit, press) {
    const o = this.st[i];
    if (o.lit === lit && o.press === press) return false;
    o.lit = lit; o.press = press; return true;
  }
  draw() {
    const g = this.c.getContext('2d'), W = this.c.width, H = this.c.height, s = P.pxPerM;
    const bg = g.createLinearGradient(0, 0, W, 0); bg.addColorStop(0, '#d9dcde'); bg.addColorStop(0.5, '#eceeef'); bg.addColorStop(1, '#c4c8cb');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#8d9296'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, W - 3, H - 3);
    this.buttons.forEach((b, i) => {
      const cx = W / 2 + b.x * s, cy = H / 2 - b.y * s, r = P.radius * s, { lit, press } = this.st[i], dy = press ? 1.5 : 0;
      g.beginPath(); g.arc(cx, cy, r * 1.32, 0, 7); g.fillStyle = lit ? '#ffbe4d' : '#5b6064'; g.fill(); // the ring lights up
      if (lit) { g.lineWidth = 3; g.strokeStyle = '#fff3c9'; g.stroke(); }
      g.beginPath(); g.arc(cx, cy + dy, r, 0, 7);
      g.fillStyle = press ? '#9fa4a8' : lit ? '#fff6dc' : '#eef0f1'; g.fill();
      g.lineWidth = 2; g.strokeStyle = press ? '#55595c' : '#8b9094'; g.stroke();
      g.fillStyle = '#1d2023';
      if (b.arrow) {
        const u = r * 0.5, d = b.arrow === 'up' ? -1 : 1, y0 = cy + dy;
        g.beginPath(); g.moveTo(cx, y0 + d * u * 0.9); g.lineTo(cx - u, y0 - d * u * 0.7); g.lineTo(cx + u, y0 - d * u * 0.7); g.closePath(); g.fill();
      } else {
        g.font = `bold ${Math.round(r * 1.15)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(b.label, cx, cy + dy + 1);
      }
    });
    this.tex.needsUpdate = true;
  }
}

/** The floor indicator: the floor's name large, a triangle for the direction (`dir` -1 down / 0 / 1 up). */
function drawIndicator(c, tex, label, dir) {
  const g = c.getContext('2d'), W = c.width, H = c.height;
  g.fillStyle = '#0b0b0c'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#2a2b2d'; g.lineWidth = 4; g.strokeRect(2, 2, W - 4, H - 4);
  g.fillStyle = P.digit;
  if (dir) {
    const a = H * 0.26, cx = W * 0.2, cy = H / 2, d = -dir;
    g.beginPath(); g.moveTo(cx, cy + d * a); g.lineTo(cx - a * 0.9, cy - d * a * 0.8); g.lineTo(cx + a * 0.9, cy - d * a * 0.8); g.closePath(); g.fill();
  }
  g.font = `bold ${Math.round(H * 0.78)}px monospace`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(label, W * (dir ? 0.58 : 0.5), H * 0.54);
  tex.needsUpdate = true;
}

/** The mirror's picture: a cool silver-blue gradient with soft diagonal sheens (baked; nothing is rendered twice). */
function mirrorTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256; const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, 256, 256); bg.addColorStop(0, '#dfe8ee'); bg.addColorStop(0.5, '#b9c7d0'); bg.addColorStop(1, '#8fa0ab');
  g.fillStyle = bg; g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(255,255,255,0.35)';
  for (const [x, w] of [[40, 34], [105, 12], [180, 22]]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + w, 0); g.lineTo(x + w - 120, 256); g.lineTo(x - 120, 256); g.closePath(); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/**
 * Builds the panel for one lift.
 *  o.car, o.group        the car's Group (moves with it) and the house group (landings)
 *  o.box                 { x0, x1, z0, z1, door: [d0, d1] } the car's footprint in the house frame (door in the z0 wall)
 *  o.floors              [{ y, label }] each stop's floor height and name, bottom first
 *  o.landingZ            z of the wall face the call plates / indicators sit on (they face -z)
 *  o.callX               x of the call plate beside the landing door
 *  o.press(k, inCar)     called when a button is pressed (the lift decides what to do)
 *  o.doorTime, o.mirror  door duration (s) for the door sound; false = no mirror
 * Returns { targets, pressed(k, inCar), sync(lift), mains(on) }; the lift calls `pressed` from its button handler, `sync` after
 * each update (also in a power cut) and `mains` when the power changes.
 */
export function buildLiftPanel(o) {
  const { car, group, box: B, floors, landingZ } = o, n = floors.length, [d0, d1] = B.door, cx = (B.x0 + B.x1) / 2;
  const self = { targets: [], plates: [], callPlates: [], shown: null };
  const add = (parent, m) => { m.raycast = () => {}; parent.add(m); return m; };
  const pickMat = new THREE.MeshBasicMaterial({ visible: false });

  // the car's button panel on the east wall, one big round button per stop, the lowest at the bottom
  const pw = P.carPlateW, ph = n * P.pitch + 0.1, py = P.firstY - 0.05 + ph / 2, pzc = B.z0 + P.carZ;
  const cp = new Plate(pw, ph, floors.map((f, k) => ({ x: 0, y: (k - (n - 1) / 2) * P.pitch, label: f.label })));
  cp.mesh.rotation.y = -Math.PI / 2; cp.mesh.position.set(B.x1 - 0.072, py, pzc); add(car, cp.mesh);
  self.plates.push(cp);
  floors.forEach((f, k) => {
    const pick = new THREE.Mesh(new THREE.BoxGeometry(0.04, P.pitch * 0.92, P.pitch * 0.92), pickMat);
    pick.position.set(B.x1 - 0.075, py + cp.buttons[k].y, pzc); pick.userData.noArchitectureEdges = true; car.add(pick);
    const t = { kind: 'liftbtn', name: `våning ${f.label}`, verb: 'åka till', pickable: pick, stop: k, press: () => o.press(k, true) };
    pick.userData.door = t; self.targets.push(t);
  });

  // the call plates beside each landing door (▲ / ▼ as the stop has floors above / below), a pick area per arrow
  floors.forEach((f, k) => {
    const bs = [];
    if (k < n - 1) bs.push({ arrow: 'up' });
    if (k > 0) bs.push({ arrow: 'down' });
    bs.forEach((b, i) => { b.x = 0; b.y = (bs.length - 1) / 2 * P.callPitch - i * P.callPitch; });
    const p = new Plate(P.callPlateW, bs.length * P.callPitch + 0.04, bs);
    p.mesh.rotation.y = Math.PI; p.mesh.position.set(o.callX, f.y + P.callY, landingZ - 0.012); add(group, p.mesh);
    self.callPlates[k] = p; self.plates.push(p);
    bs.forEach((b) => {
      const pick = new THREE.Mesh(new THREE.BoxGeometry(P.callPitch * 0.9, P.callPitch * 0.9, 0.04), pickMat);
      pick.position.set(o.callX, f.y + P.callY + b.y, landingZ - 0.015); pick.userData.noArchitectureEdges = true; group.add(pick);
      const t = { kind: 'liftcall', name: 'hissen', verb: 'kalla på', pickable: pick, stop: k, press: () => o.press(k, false) };
      pick.userData.door = t; self.targets.push(t);
    });
  });

  // floor indicators: one over the car's door (inside) and one over each landing door, all sharing one canvas texture
  const ic = document.createElement('canvas'); ic.width = 256; ic.height = 96;
  const itex = new THREE.CanvasTexture(ic); itex.colorSpace = THREE.SRGBColorSpace; itex.anisotropy = 4;
  const imat = new THREE.MeshBasicMaterial({ map: itex }), indGeo = new THREE.PlaneGeometry(P.indW, P.indW * 96 / 256);
  const inside = new THREE.Mesh(indGeo, imat); inside.position.set((d0 + d1) / 2, P.indCarY, B.z0 + 0.105); add(car, inside);
  floors.forEach((f) => {
    const m = new THREE.Mesh(indGeo, imat);
    m.rotation.y = Math.PI; m.position.set((d0 + d1) / 2, f.y + P.indLandingY, landingZ - 0.012); add(group, m);
  });

  // the mirror on the car's back wall above the handrail: a frame and a baked picture, nothing rendered twice
  if (o.mirror !== false) {
    const mw = (B.x1 - B.x0) - P.mirrorInset * 2, mh = P.mirrorTop - P.mirrorBottom, my = (P.mirrorTop + P.mirrorBottom) / 2, mz = B.z1 - 0.066;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(mw + 0.04, mh + 0.04, 0.008), new THREE.MeshBasicMaterial({ color: 0x9a9fa3 }));
    frame.position.set(cx, my, mz + 0.002); add(car, frame);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(mw, mh), new THREE.MeshBasicMaterial({ map: mirrorTexture() }));
    glass.rotation.y = Math.PI; glass.position.set(cx, my, mz - 0.003); add(car, glass);
  }

  // ---- behaviour: lit buttons, the pressed look, the indicator, the sounds ----
  const state = { carLit: -1, callLit: -1, press: [], prevOpen: false, prevAt: 0, near: -1, dir: 0 };
  const posAt = (lift, k) => ({ x: cx, y: (k == null ? lift.y : floors[k].y) + 1.1, z: B.z0 });
  const nearest = (y) => floors.reduce((b, f, k) => (Math.abs(f.y - y) < Math.abs(floors[b].y - y) ? k : b), 0);
  const refresh = () => {
    const now = performance.now(), dirty = new Set();
    floors.forEach((f, k) => {
      const pr = (state.press[k]?.t ?? 0) > now;
      if (cp.set(k, state.carLit === k, pr && state.press[k].inCar)) dirty.add(cp);
      const p = self.callPlates[k];
      p.buttons.forEach((_, i) => { if (p.set(i, state.callLit === k, pr && !state.press[k].inCar)) dirty.add(p); });
    });
    dirty.forEach((p) => p.draw());
  };

  /** A button was pressed: its pressed look, the ring lit until the car is there, and a click. */
  self.pressed = (k, inCar) => {
    state.press[k] = { t: performance.now() + P.pressMs, inCar };
    state.carLit = inCar ? k : -1; state.callLit = inCar ? -1 : k;
    refresh();
    sfx.click(posAt(null, k));
    setTimeout(refresh, P.pressMs + 20); // (the pressed look ends even when the frame loop is throttled)
  };

  /** Each frame after the lift has moved (also in a power cut): lights, indicator, sounds. */
  self.sync = (lift) => {
    if ((lift.target === null || !lift.powered) && (state.carLit >= 0 || state.callLit >= 0)) state.carLit = state.callLit = -1;
    refresh();
    // the indicator: the nearest stop, the direction while it moves
    const nr = nearest(lift.y), dir = lift.at === null ? Math.sign(lift.v) : 0, key = `${nr}${dir}`;
    if (lift.powered && key !== self.shown) { self.shown = key; drawIndicator(ic, itex, floors[nr].label, dir); }
    if (lift.v) state.dir = Math.sign(lift.v);
    if (lift.powered) { // (sfx is silent under the game's sound setting)
      if (lift.at === null && state.near >= 0 && nr !== state.near && nr !== lift.target) sfx.liftChime(posAt(lift), state.dir, true); // passing a floor
      if (state.prevAt === null && lift.at !== null) sfx.liftChime(posAt(lift), state.dir, false); // arrived
    }
    if (lift.open !== state.prevOpen && (lift.open ? lift.doors < 1 : lift.doors > 0)) sfx.slide(posAt(lift, lift.at ?? nr), { dur: o.doorTime ?? 1.4 }); // the doors start to open / close
    state.prevOpen = lift.open; state.prevAt = lift.at; state.near = nr;
  };

  /** The mains: the indicator and the plates go dark, a lit button goes out. */
  self.mains = (on) => {
    imat.color.setScalar(on ? 1 : 0);
    self.plates.forEach((p) => p.mat.color.setScalar(on ? 1 : P.darkPlate));
    if (!on) { state.carLit = state.callLit = -1; refresh(); }
    self.shown = null; // (redrawn when the power is back)
  };
  drawIndicator(ic, itex, floors[0].label, 0);
  return self;
}

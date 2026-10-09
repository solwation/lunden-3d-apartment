import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { HALL_WALL as H, SKOGSGRANSEN as SK } from './config.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sfx } from './audio.js';
import { glowMaterial } from './groundglow.js';
import { mirrorMaterial } from './mirror.js';
import { addReflector } from './reflections.js';

// The hall wall on the left as you come in: a round mirror, and a Solstickan key cabinet (white
// metal box with the matchbox boy, hinged on the left) that opens with E. Inside on a hook hangs
// the Renault Megane E-Tech key: E on it presses the lock button and the car answers beep beep.
// Built in a local frame with the wall at z = 0 and the front towards +z, then turned to face the hall.

const white = new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 0.45, metalness: 0.2 });
const inside = new THREE.MeshStandardMaterial({ color: 0xe6e6e3, roughness: 0.6 });
const hookMat = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.3, metalness: 0.8 });
const fobMat = new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.35 });
const chrome = new THREE.MeshStandardMaterial({ color: 0xd9dde0, roughness: 0.2, metalness: 0.9 });
const brass = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.5, metalness: 0.4 });
const frameMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.45, side: THREE.DoubleSide }); // LINDBYN frame
const keyMat = new THREE.MeshStandardMaterial({ color: 0xc9a64a, roughness: 0.35, metalness: 0.3 });


const mesh = (geo, mat, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  return m;
};

/** The Solstickan boy as a grey silhouette on white (the cabinet's front). */
function frontTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#f4f4f2';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#a9adb0';
  g.strokeStyle = '#a9adb0';
  g.lineCap = 'round';
  const ell = (x, y, rx, ry, a = 0) => { g.beginPath(); g.ellipse(x, y, rx, ry, a, 0, Math.PI * 2); g.fill(); };
  ell(132, 78, 15, 17);          // head
  ell(140, 64, 14, 9, -0.3);     // tousled hair
  ell(126, 118, 16, 26, 0.15);   // body
  g.lineWidth = 10;
  const line = (pts) => { g.beginPath(); g.moveTo(...pts[0]); pts.slice(1).forEach((p) => g.lineTo(...p)); g.stroke(); };
  line([[120, 140], [104, 170], [86, 182]]);  // back leg
  line([[132, 140], [146, 168], [160, 182]]); // front leg
  g.lineWidth = 7;
  line([[118, 106], [104, 124]]);             // arms, walking
  line([[134, 106], [114, 130]]);
  g.lineWidth = 4;
  line([[142, 96], [166, 92]]);               // the scarf flying behind
  return new THREE.CanvasTexture(c);
}

export class CarKey {
  constructor(parent) {
    Object.assign(this, { name: 'bilnyckeln', kind: 'carkey', verb: 'trycka på', presses: 0, blink: 0 });
    const g = new THREE.Group();
    g.add(mesh(new THREE.TorusGeometry(0.009, 0.0015, 6, 16), hookMat, 0, -0.008, 0)); // key ring
    const fob = mesh(new RoundedBoxGeometry(0.034, 0.058, 0.012, 2, 0.006), fobMat, 0, -0.048, 0.002);
    g.add(fob);
    const logo = mesh(new THREE.PlaneGeometry(0.009, 0.009), chrome, 0, -0.034, 0.0085); // Renault diamond
    logo.rotation.z = Math.PI / 4;
    g.add(logo);
    for (const y of [-0.05, -0.064]) g.add(mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.002, 12).rotateX(Math.PI / 2), brass, 0, y, 0.009));
    this.led = mesh(new THREE.SphereGeometry(0.0018, 8, 6), new THREE.MeshBasicMaterial({ color: 0x401010 }), 0.011, -0.025, 0.008);
    g.add(this.led);
    g.traverse((m) => { m.userData.door = this; });
    parent.add(g);
    this.object = g;
    this.pickable = g;
  }

  press() {
    this.presses++;
    this.blink = 0.5;
    sfx.carBeep(this.object.getWorldPosition(new THREE.Vector3()));
  }

  update(dt) {
    this.blink = Math.max(0, this.blink - dt);
    this.led.material.color.setHex(this.blink > 0 ? 0xff3030 : 0x401010);
    this.object.rotation.z = Math.sin(this.swing = (this.swing ?? 0) + dt * 3) * 0.05 * this.blink; // jiggles when pressed
  }
}

export class KeyCabinet {
  constructor() {
    Object.assign(this, { name: 'nyckelskåpet', kind: 'keybox', isOpen: false, t: 0 });
    const { w, h, d } = H.cabinet, t = 0.004;
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(w, h, t), inside, 0, 0, t / 2));                        // back
    g.add(mesh(new THREE.BoxGeometry(t, h, d), white, -w / 2 + t / 2, 0, d / 2),
      mesh(new THREE.BoxGeometry(t, h, d), white, w / 2 - t / 2, 0, d / 2),
      mesh(new THREE.BoxGeometry(w, t, d), white, 0, h / 2 - t / 2, d / 2),
      mesh(new THREE.BoxGeometry(w, t, d), white, 0, -h / 2 + t / 2, d / 2));
    // a rail of six hooks; the house keys on two, the car key on the right one
    const hooks = [-0.06, -0.036, -0.012, 0.012, 0.036, 0.06];
    for (const x of hooks) g.add(mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.02, 6).rotateX(Math.PI / 2), hookMat, x, 0.045, t + 0.01));
    for (const x of [hooks[0], hooks[2]]) {
      const k = mesh(new THREE.BoxGeometry(0.012, 0.045, 0.002), keyMat, x, 0.012, t + 0.016);
      g.add(k, mesh(new THREE.TorusGeometry(0.008, 0.0015, 6, 14), keyMat, x, 0.04, t + 0.016));
    }
    const keyHolder = new THREE.Group();
    keyHolder.position.set(hooks[4], 0.045, t + 0.018);
    g.add(keyHolder);
    this.key = new CarKey(keyHolder);
    // door: pivot on the left edge, white front with the boy
    this.door = new THREE.Group();
    this.door.position.set(-w / 2, 0, d);
    const faces = [white, white, white, white, new THREE.MeshStandardMaterial({ map: frontTexture(), roughness: 0.45, metalness: 0.2 }), white];
    const panel = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.006), faces);
    panel.position.set(w / 2, 0, 0.003);
    panel.castShadow = panel.receiveShadow = true; // like the carcass: no sun through the walls (#602)
    this.door.add(panel, mesh(new THREE.BoxGeometry(0.004, 0.02, 0.006), white, w - 0.006, 0, 0.008)); // catch
    this.door.traverse((m) => { m.userData.door = this; });
    g.add(this.door);
    this.pickable = this.door;
    this.object = g;
  }

  /** The key can be used once the door is (nearly) open. */
  get keyReachable() { return this.t > 0.8; }

  toggle() {
    this.isOpen = !this.isOpen;
    sfx.lid(this.door.getWorldPosition(new THREE.Vector3()), this.isOpen);
  }

  update(dt) {
    const target = this.isOpen ? 1 : 0;
    this.t += Math.sign(target - this.t) * Math.min(Math.abs(target - this.t), dt * 2.5);
    const e = this.t * this.t * (3 - 2 * this.t);
    this.door.rotation.y = -e * THREE.MathUtils.degToRad(110);
    this.key.update(dt);
  }
}

/** IKEA SKOGSGRÄNSEN (#265, SKOGSGRANSEN): a round tinted glass over the horizon on a copper back, below it thin copper
 * bars with the wall between them. Local: the wall at z = 0, the glass facing +z. The copper (back + bars) is one mesh,
 * the glass one (the shared mirror material), the tint one (transparent, over the glass and its mirror image). */
function skogsgransen() {
  const R = SK.d / 2, r = R - SK.rim, yh = -R + SK.wave * SK.d; // the horizon
  const segment = (rad) => { // the circle above the horizon
    const a = Math.asin(yh / rad), sh = new THREE.Shape();
    sh.absarc(0, 0, rad, a, Math.PI - a, false);
    sh.closePath();
    return sh;
  };
  const copper = new THREE.MeshStandardMaterial({ color: SK.copper, roughness: 0.32, metalness: 0.6 });
  const parts = [new THREE.ExtrudeGeometry(segment(R), { depth: SK.panel, bevelEnabled: false, curveSegments: 48 }).translate(0, 0, SK.depth - SK.panel)];
  const pitch = (yh + R) / SK.bars;
  for (let i = 0; i < SK.bars; i++) {
    const y = -R + (i + 0.5) * pitch, w = 2 * Math.sqrt(R * R - y * y);
    parts.push(new THREE.BoxGeometry(w, SK.bar, SK.panel).translate(0, y, SK.depth - SK.panel / 2));
  }
  for (const sx of [-1, 1]) { // two thin strips behind the bars that carry them
    const x = sx * 0.6 * R, y0 = -Math.sqrt(R * R - x * x) + pitch / 2; // down to the lowest bar that reaches it
    parts.push(new THREE.BoxGeometry(0.004, yh - y0, SK.panel).translate(x, (yh + y0) / 2, SK.depth - SK.panel * 1.5));
  }
  for (const p of parts) { p.deleteAttribute('uv'); }
  const group = new THREE.Group();
  const metal = mesh(mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p))), copper);
  // the glass: the segment of radius r, UVs across it (the tint's gradient runs top → horizon)
  const glassGeo = () => {
    const geo = new THREE.ShapeGeometry(segment(r), 48), p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) / r + 1) / 2, (p.getY(i) - yh) / (r - yh));
    return geo;
  };
  const glass = mesh(glassGeo(), mirrorMaterial, 0, 0, SK.depth + 0.0005);
  const c = document.createElement('canvas');
  c.width = 4; c.height = 128;
  const ctx = c.getContext('2d'), grad = ctx.createLinearGradient(0, 0, 0, 128);
  for (const [t, col] of SK.tint) grad.addColorStop(t, col);
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 4, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const tint = mesh(glassGeo(), new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.15 }), 0, 0, 0.003);
  tint.castShadow = tint.receiveShadow = false;
  glass.add(tint);
  group.add(metal, glass);
  addReflector(glass, glassGeo(), { level: 0, color: SK.reflect, name: 'skogsgransen' }); // its mirror image (#50)
  group.position.set(SK.x, SK.y, SK.z);
  group.rotation.y = SK.rotY;
  return group;
}

/** Mirrors (IKEA LINDBYN, black, in the living room since #205; IKEA NISSEDAL in the hall, #226) + the key cabinet. */
export function buildHallWall() {
  const group = new THREE.Group();
  const m = H.mirror;
  // LINDBYN: round glass in a slim black frame, standing m.depth off the wall
  const disc = mesh(new THREE.CircleGeometry(m.d / 2 - m.frame, 64), mirrorMaterial, 0, 0, m.depth);
  const rim = mesh(new THREE.CylinderGeometry(m.d / 2, m.d / 2, m.depth, 64, 1, true).rotateX(Math.PI / 2), frameMat, 0, 0, m.depth / 2);
  const face = mesh(new THREE.RingGeometry(m.d / 2 - m.frame, m.d / 2, 64), frameMat, 0, 0, m.depth + 0.0005);
  const mirror = new THREE.Group();
  mirror.add(disc, rim, face);
  mirror.position.set(m.x, m.y, m.z); // on the living-room wall behind the armchair (#205), local +z out of the wall
  mirror.rotation.y = m.rotY;
  addReflector(disc, new THREE.CircleGeometry(m.d / 2 - m.frame, 64), { level: 0, name: 'lindbyn' }); // mirror image (#50)
  // IKEA NISSEDAL in the hall (#226; Rusta "Staffan" before, #218) and in the upstairs hall (#332): upright glass in a flat
  // black frame, local +z out of the wall
  const nissedal = (T) => {
    const tall = new THREE.Group(), gw = T.w - 2 * T.frame, gh = T.h - 2 * T.frame;
    const glass = mesh(new THREE.PlaneGeometry(gw, gh), mirrorMaterial, 0, 0, T.depth - 0.002);
    tall.add(glass);
    for (const [w, h, x, y] of [[T.w, T.frame, 0, (T.h - T.frame) / 2], [T.w, T.frame, 0, -(T.h - T.frame) / 2], [T.frame, gh, (T.w - T.frame) / 2, 0], [T.frame, gh, -(T.w - T.frame) / 2, 0]]) {
      tall.add(mesh(new THREE.BoxGeometry(w, h, T.depth), frameMat, x, y, T.depth / 2));
    }
    tall.position.set(T.x, T.y, T.z);
    tall.rotation.y = T.rotY;
    addReflector(glass, new THREE.PlaneGeometry(gw, gh), { level: T.level ?? 0, name: T.level ? 'nissedal-uppe' : 'nissedal' }); // its mirror image (#50)
    if (T.nightLight) lamps.push(nightLight(tall, T));
    return tall;
  };
  const lamps = [];
  // the key cabinet on its own wall (#123), local +z out of the wall
  const cabinet = new KeyCabinet();
  cabinet.object.position.set(H.cabinet.x, H.cabinet.y, H.cabinet.z);
  cabinet.object.rotation.y = H.cabinet.rotY;
  const secretaryMirror = skogsgransen();
  const mirrors = [
    { object: mirror, key: 'lindbyn', level: 0, name: 'den runda spegeln' },
    { object: nissedal(H.tall), key: 'nissedal', level: 0, name: 'entréspegeln' },
    { object: nissedal(H.tallUp), key: 'nissedal', level: 1, name: 'spegeln i övre hallen' },
    { object: secretaryMirror, key: 'skogsgransen', level: 0, name: 'spegeln' },
  ];
  group.add(...mirrors.map(m => m.object), cabinet.object); // (+ SKOGSGRÄNSEN over the secretary, #265)
  return { object: group, cabinet, key: cabinet.key, secretaryMirror, mirrors, lamps };
}

/** The halo's fall-off (#572): white over the frame, fading to black `halo` m out from its edge (a rounded rectangle,
 * so the light runs evenly round the corners). Linear data, `w` × `h` m in all. */
function haloTexture(w, h, halo) {
  const c = document.createElement('canvas'), px = 200; // pixels per metre (the halo is soft: no need for more)
  c.width = Math.ceil(w * px); c.height = Math.ceil(h * px);
  const g = c.getContext('2d'), img = g.createImageData(c.width, c.height), hw = w / 2 - halo, hh = h / 2 - halo;
  for (let j = 0; j < c.height; j++) {
    for (let i = 0; i < c.width; i++) {
      const dx = Math.max(Math.abs((i + 0.5) / px - w / 2) - hw, 0), dy = Math.max(Math.abs((j + 0.5) / px - h / 2) - hh, 0);
      const v = Math.round(255 * Math.max(0, 1 - Math.hypot(dx, dy) / halo) ** 2), k = (j * c.width + i) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = v; img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}

/** The entrance NISSEDAL's night light (#572, HALL_WALL.tall.nightLight): a warm LED strip round the frame's outer
 * edge (one merged mesh), a soft additive halo on the wall behind it, and an invisible pick box over the mirror (E). A
 * small lamp spec for lights.js (world.lamps): it comes on at dusk with the others; its pool anchor sits `out` m in
 * front of the glass. Everything hangs in the mirror's group, so it follows the mirror in Möblera om (rearrange.js
 * moves the anchor, main.js re-bakes its wash). Local frame: the wall at z = 0, +z out of it. */
function nightLight(tall, T) {
  const N = T.nightLight, s = N.strip, ow = T.w + 2 * s, oh = T.h + 2 * s, d = 0.006; // the strip: 6 mm deep, on the back edge
  const led = new THREE.MeshStandardMaterial({ color: 0xf4efe6, emissive: N.color, emissiveIntensity: 0.04, roughness: 0.4 });
  const parts = [[ow, s, 0, (T.h + s) / 2], [ow, s, 0, -(T.h + s) / 2], [s, T.h, (T.w + s) / 2, 0], [s, T.h, -(T.w + s) / 2, 0]]
    .map(([w, h, x, y]) => new THREE.BoxGeometry(w, h, d).translate(x, y, 0.002 + d / 2));
  const strip = new THREE.Mesh(mergeGeometries(parts), led);
  strip.name = 'nattlampa-slinga';
  const hw = T.w + 2 * N.halo, hh = T.h + 2 * N.halo;
  const haloMat = glowMaterial(N.color);
  haloMat.map = haloTexture(hw, hh, N.halo);
  haloMat.userData.on = N.glow; // FloorLamp.show: opacity = k × this
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(hw, hh), haloMat);
  halo.position.z = 0.001; // on the wall, behind the frame (the frame hides its middle)
  halo.renderOrder = 1;
  const pick = new THREE.Mesh(new THREE.BoxGeometry(T.w, T.h, 0.01), new THREE.MeshBasicMaterial());
  pick.position.z = T.depth + 0.006;
  pick.visible = false; // raycasts ignore visibility: the E target for the night light
  tall.add(strip, halo, pick);
  for (const m of [strip, halo]) m.castShadow = m.receiveShadow = false;
  // the pool anchor: `out` m in front of the glass, at the mirror's middle (world offset at the default pose, before any
  // saved move: rearrange.js carries it with the mirror from there)
  return { object: pick, shade: led, glows: [haloMat], height: 0, level: T.level ?? 0, name: 'spegelns nattlampa',
    offset: [Math.sin(T.rotY) * N.out, Math.cos(T.rotY) * N.out], light: N.light };
}

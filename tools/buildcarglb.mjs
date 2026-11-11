import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import fs from 'node:fs';
import path from 'node:path';

// Node polyfill for FileReader
class NodeFileReader {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = buf;
      if (this.onloadend) this.onloadend();
    });
  }
}
globalThis.FileReader = NodeFileReader;

// Canvas mock for Node environment
if (typeof document === 'undefined') {
  globalThis.document = {
    createElement: (tag) => {
      if (tag === 'canvas') {
        return {
          width: 512,
          height: 512,
          getContext: () => new Proxy({
            width: 512,
            height: 512,
            createLinearGradient: () => ({ addColorStop: () => {} }),
            createRadialGradient: () => ({ addColorStop: () => {} }),
            getImageData: () => ({ data: new Uint8ClampedArray(512 * 512 * 4) })
          }, {
            get(target, prop) {
              if (prop in target) return target[prop];
              return () => {};
            },
            set(target, prop, value) {
              target[prop] = value;
              return true;
            }
          })
        };
      }
      return {};
    }
  };
}

export const MEGANE = {
  L: 4.2, W: 1.78, wheelbase: 2.69, wheelR: 0.355, arch: 0.43,
  top: [[2.1, 0.56], [2.08, 0.7], [1.97, 0.8], [1.5, 0.9], [1.05, 0.97], [0.65, 1.22], [0.22, 1.45], [-0.1, 1.5], [-0.8, 1.48],
    [-1.3, 1.39], [-1.62, 1.25], [-1.8, 1.2], [-1.95, 1.08], [-2.08, 0.98], [-2.11, 0.72], [-2.09, 0.5]],
  belt: [[1.05, 0.97], [0.0, 1.0], [-1.6, 1.08], [-1.95, 1.08]],
  bot: [[2.08, 0.32], [1.85, 0.26], [1.0, 0.21], [-1.0, 0.21], [-1.85, 0.27], [-2.08, 0.34]],
  doors: [0.9, 0.0, -0.87],
  lean: 0.16,
};

function lerpTable(t, x) {
  if (x >= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) if (x >= t[i][0]) { const [x0, y0] = t[i - 1], [x1, y1] = t[i]; return y1 + (y0 - y1) * (x - x1) / (x0 - x1); }
  return t.at(-1)[1];
}

const HIGH = { step: 0.05, segs: 3, box: 2, round: 28, arch: 22 }, LOW = { step: 0.16, segs: 1, box: 1, round: 12, arch: 10 };
let Q = HIGH;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function lines(S) {
  const wx = S.wheelbase / 2;
  const top = (x) => lerpTable(S.top, x), belt = (x) => lerpTable(S.belt, x);
  const arch = (x) => { const d = Math.min(Math.abs(x - wx), Math.abs(x + wx)); return d < S.arch ? S.wheelR + Math.sqrt(S.arch * S.arch - d * d) : -1; };
  const bot = (x) => Math.max(lerpTable(S.bot, x), arch(x));
  const lowerTop = (x) => (x >= S.belt[0][0] || x <= S.belt.at(-1)[0] ? top(x) : belt(x));
  return { top, belt, bot, lowerTop, wx };
}

const planK = (S, x) => 1 - 0.2 * Math.pow(smooth(S.L / 2 - 0.6, S.L / 2 + 0.02, Math.abs(x)), 1.6);

function shape(pts, holes = []) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  s.holes = holes.map((h) => new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  return s;
}

function extrude(sh, width, { bevel = 0.04, segs = 3, z0 = null, fz = null } = {}) {
  segs = Math.min(segs, Q.segs);
  const depth = Math.max(0.002, width - 2 * bevel);
  let g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: segs, curveSegments: 4 });
  g.translate(0, 0, z0 ?? -depth / 2);
  g.deleteAttribute('uv'); g.deleteAttribute('normal'); g.clearGroups();
  g = mergeVertices(g, 1e-5);
  if (fz) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, fz(p.getX(i), p.getY(i), p.getZ(i))); }
  g.computeVertexNormals();
  return g;
}

function along(f, x0, x1, step = 0.05) {
  step = Math.max(step, Q.step);
  const n = Math.max(2, Math.ceil(Math.abs(x1 - x0) / step)), out = [];
  for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * (i / n); out.push([x, f(x)]); }
  return out;
}

const rbox = (sx, sy, sz, x, y, z, r = 0.02) => new RoundedBoxGeometry(sx, sy, sz, Q.box, Math.min(r, sx / 2.01, sy / 2.01, sz / 2.01)).translate(x, y, z);
const clean = (g) => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); return g; };

class Parts {
  constructor() { this.by = {}; }
  add(name, ...geos) { (this.by[name] ??= []).push(...geos); return this; }
  merged(name) { const l = this.by[name]; return l?.length ? mergeGeometries(l.map(clean)) : null; }
  names() { return Object.keys(this.by); }
}

function flip(g) {
  if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } g.index.needsUpdate = true; }
  else for (const k of Object.keys(g.attributes)) { const at = g.attributes[k], n = at.itemSize; for (let i = 0; i < at.count; i += 3) for (let c = 0; c < n; c++) { const t = at.getComponent(i + 1, c); at.setComponent(i + 1, c, at.getComponent(i + 2, c)); at.setComponent(i + 2, c, t); } at.needsUpdate = true; }
  g.computeVertexNormals();
}

export function buildMeganeDrivableModel(S = MEGANE) {
  Q = HIGH;
  const P = new Parts(), { top, belt, bot, lowerTop, wx } = lines(S), W = S.W, hw = W / 2, [xA, xB, xC] = S.doors;
  const shoulder = (y) => 0.055 * smooth(0.78, 1.06, y) + 0.035 * smooth(0.45, 0.22, y);
  const fzPlan = (x, y, z) => z * planK(S, x) * (1 - shoulder(y));

  const lower = (x0, x1) => shape([...along(lowerTop, x0, x1), ...along(bot, x1, x0)]);
  P.add('paint', extrude(lower(S.L / 2, xA), W, { bevel: 0.05, fz: fzPlan }), extrude(lower(xC, -S.L / 2), W, { bevel: 0.05, fz: fzPlan }));
  P.add('paint', rbox(xA - xC, 0.08, W - 0.04, (xA + xC) / 2, 0.255, 0, 0.03));

  for (const x of [wx, -wx]) for (const s of [-1, 1]) {
    P.add('black', new THREE.TorusGeometry(S.arch + 0.015, 0.035, 6, Q.arch, Math.PI).translate(x, S.wheelR, s * (hw * planK(S, x) - 0.005)));
  }
  for (const s of [-1, 1]) P.add('black', rbox(2 * (wx - S.arch) - 0.02, 0.07, 0.04, 0, 0.25, s * (hw - 0.005), 0.02));
  P.add('black', rbox(0.06, 0.12, W * 0.66, S.L / 2 + 0.03, 0.34, 0, 0.03), rbox(0.06, 0.14, W * 0.7, -S.L / 2 - 0.03, 0.36, 0, 0.03));
  P.add('black', rbox(0.04, 0.1, W * 0.42, S.L / 2 + 0.045, 0.45, 0, 0.02));

  const lean = S.lean, rise = 0.48, roofHW = hw - 0.03 - Math.sin(lean) * rise;
  const band = (x0, x1, t) => shape([...along(top, x0, x1), ...along((x) => top(x) - t, x1, x0)]);
  const xW0 = S.top.find(([x]) => x <= 1.06)[0], xW1 = 0.22, xR = -0.95, xG = -1.62;
  P.add('glass', extrude(band(xW0, xW1, 0.02), 2 * hw - 0.08, { bevel: 0.01, segs: 1, fz: (x, y, z) => z * (1 - 0.1 * smooth(1.0, 1.45, y)) }));
  P.add('roof', extrude(band(xW1 + 0.02, xR, 0.05), 2 * roofHW + 0.02, { bevel: 0.025 }));
  P.add('glass', extrude(band(xR, xG, 0.03), 2 * roofHW - 0.02, { bevel: 0.01, segs: 1 }));
  P.add('paint', extrude(band(xG, -1.83, 0.06), 2 * roofHW, { bevel: 0.025 }));
  P.add('black', extrude(band(xW0 + 0.03, xW0 - 0.06, 0.03), W * 0.86, { bevel: 0.01, segs: 1 }));

  const sides = (pts, name, inset = 0) => { for (const s of [-1, 1]) {
    const g = extrude(shape(pts), 0.035, { bevel: 0.008, segs: 1, z0: 0 });
    g.translate(0, -1.0, 0).rotateX(s * -lean).translate(0, 1.0, s > 0 ? hw - 0.035 - inset : -hw + inset);
    P.add(name, g);
  } };
  sides([...along(belt, xC, -1.9, 0.1), ...along((x) => top(x) - 0.04, -1.9, xC, 0.1)], 'black');
  P.add('black', extrude(shape([...along(top, xG, -1.95), ...along(belt, -1.95, xG)]), 2 * roofHW, { bevel: 0.01, segs: 1 }));
  P.add('roof', rbox(xC + 1.9, 0.02, 2 * roofHW - 0.06, (xC - 1.9) / 2, belt(-1.3) + 0.01, 0, 0.01));

  for (const s of [-1, 1]) {
    const z = s * hw * planK(S, 1.98) * 0.72;
    P.add('lens', rbox(0.22, 0.07, 0.36, 1.98, 0.8, z, 0.025).rotateY(0));
    P.add('led', rbox(0.04, 0.018, 0.3, 2.05, 0.83, z, 0.008), rbox(0.03, 0.2, 0.025, 2.065, 0.62, s * hw * 0.78, 0.01));
    P.add('blink', rbox(0.03, 0.02, 0.1, 2.06, 0.77, s * hw * 0.8, 0.008));
    P.add('tail', rbox(0.06, 0.06, 0.32, -2.06, 0.94, s * hw * 0.74, 0.02));
  }
  P.add('tail', rbox(0.03, 0.03, W * 0.76, -S.L / 2 - 0.012, 0.94, 0, 0.012));
  P.add('chrome', rbox(0.02, 0.02, W * 0.4, -2.08, 0.82, 0, 0.008));

  // Materials
  const mats = {
    paint: new THREE.MeshStandardMaterial({ name: 'Mat_Paint', color: 0x4a7c59, roughness: 0.22, metalness: 0.35 }),
    black: new THREE.MeshStandardMaterial({ name: 'Mat_Black', color: 0x0c0d0f, roughness: 0.25, metalness: 0.2 }),
    roof: new THREE.MeshStandardMaterial({ name: 'Mat_Roof', color: 0x0b0c0e, roughness: 0.15, metalness: 0.4 }),
    glass: new THREE.MeshStandardMaterial({ name: 'Mat_Glass', color: 0x1a2430, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.55 }),
    chrome: new THREE.MeshStandardMaterial({ name: 'Mat_Chrome', color: 0xd9dde0, roughness: 0.18, metalness: 0.9 }),
    lens: new THREE.MeshStandardMaterial({ name: 'Mat_Lens', color: 0x111418, roughness: 0.1, metalness: 0.6 }),
    led: new THREE.MeshStandardMaterial({ name: 'Mat_LED', color: 0xf4f6ff, emissive: 0xeaf0ff, emissiveIntensity: 0.3 }),
    tail: new THREE.MeshStandardMaterial({ name: 'Mat_Tail', color: 0x8a0f12, emissive: 0xff2020, emissiveIntensity: 0.2 }),
    blink: new THREE.MeshStandardMaterial({ name: 'Mat_Blink', color: 0xc87a10, emissive: 0xffa020, emissiveIntensity: 0 }),
    tyre: new THREE.MeshStandardMaterial({ name: 'Mat_Tyre', color: 0x141517, roughness: 0.85 }),
    rim: new THREE.MeshStandardMaterial({ name: 'Mat_Rim', color: 0x9aa0a6, roughness: 0.3, metalness: 0.8 }),
    fabric: new THREE.MeshStandardMaterial({ name: 'Mat_Fabric', color: 0x2b2e33, roughness: 0.95 }),
    plastic: new THREE.MeshStandardMaterial({ name: 'Mat_Plastic', color: 0x17181b, roughness: 0.6 }),
    screen: new THREE.MeshStandardMaterial({ name: 'Mat_Screen', color: 0x000000, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.2 }),
    logo: new THREE.MeshStandardMaterial({ name: 'Mat_Logo', color: 0xd9dde0, roughness: 0.2, metalness: 0.8 }),
  };

  const rootGroup = new THREE.Group();
  rootGroup.name = 'Car_Megane';

  // Body group
  const bodyGroup = new THREE.Group();
  bodyGroup.name = 'Body';
  for (const n of P.names()) {
    const geo = P.merged(n);
    if (geo) {
      const mesh = new THREE.Mesh(geo, mats[n]);
      mesh.name = `Body_${n}`;
      bodyGroup.add(mesh);
    }
  }
  rootGroup.add(bodyGroup);

  // Doors
  const doorsGroup = new THREE.Group();
  doorsGroup.name = 'Doors';
  const gap = 0.006;
  const spec = [
    { x0: xA - gap, x1: xB + gap, front: true, code: 'F' },
    { x0: xB - gap, x1: xC + gap, front: false, code: 'R' }
  ];

  for (const d of spec) {
    for (const s of [-1, 1]) {
      const sideCode = s < 0 ? 'L' : 'R';
      const doorName = `Door_${d.code}${sideCode}`;
      const pivot = new THREE.Group();
      pivot.name = doorName;
      pivot.position.set(d.x0, 0, s * (hw - 0.002));

      const dp = new Parts();
      const lowerPts = [...along(belt, d.x0, d.x1), [d.x1, 0.31], [d.x0, 0.31]];
      const panel = extrude(shape(lowerPts), 0.06, { bevel: 0.015, segs: 2, z0: -0.045, fz: (x, y, z) => z - hw * shoulder(y) });
      dp.add('paint', panel);
      dp.add('black', rbox(0.2, 0.025, 0.012, d.x0 - 0.22, belt(d.x0) - 0.12, 0.003, 0.006));
      dp.add('plastic', rbox(Math.abs(d.x1 - d.x0) - 0.08, belt(d.x0) - 0.4, 0.03, (d.x0 + d.x1) / 2, (belt(d.x0) + 0.36) / 2, -0.075, 0.02));

      const outer = d.front
        ? [[d.x0, belt(d.x0)], ...along((x) => top(x) - 0.03, xW0 - 0.1, xW1 - 0.02, 0.08).filter(([x]) => x < d.x0 - 0.02), ...along((x) => top(x) - 0.04, xW1 - 0.06, d.x1, 0.1), [d.x1, belt(d.x1)]]
        : [[d.x0, belt(d.x0)], ...along((x) => top(x) - 0.04, d.x0, d.x1 + 0.12, 0.1), [d.x1, belt(d.x1) + 0.12], [d.x1, belt(d.x1)]];
      const cx = outer.reduce((a, p) => a + p[0], 0) / outer.length, cy = outer.reduce((a, p) => a + p[1], 0) / outer.length;
      const inner = outer.map(([x, y]) => { const dx = x - cx, dy = y - cy, l = Math.hypot(dx, dy); return [x - dx / l * 0.04, y - dy / l * 0.04]; });
      const frame = extrude(shape(outer, [inner.slice().reverse()]), 0.03, { bevel: 0.006, segs: 1, z0: -0.03 });
      const pane = extrude(shape(inner), 0.008, { bevel: 0, z0: -0.026 });
      const leanM = new THREE.Matrix4().makeTranslation(0, 1.0, 0).multiply(new THREE.Matrix4().makeRotationX(-lean)).multiply(new THREE.Matrix4().makeTranslation(0, -1.0, 0));
      dp.add('black', frame.applyMatrix4(leanM));
      dp.add('glass', pane.applyMatrix4(leanM));

      if (d.front) dp.add('black', rbox(0.16, 0.1, 0.2, d.x0 - 0.12, belt(d.x0) + 0.05, 0.12, 0.04), rbox(0.03, 0.015, 0.12, d.x0 - 0.05, belt(d.x0) + 0.03, 0.18, 0.006));

      for (const name of dp.names()) {
        const g = dp.merged(name).translate(-d.x0, 0, 0);
        if (s < 0) { g.scale(1, 1, -1); flip(g); }
        const m = new THREE.Mesh(g, mats[name]);
        m.name = `${doorName}_${name}`;
        pivot.add(m);
      }
      doorsGroup.add(pivot);
    }
  }
  rootGroup.add(doorsGroup);

  // Wheels
  const wheelsGroup = new THREE.Group();
  wheelsGroup.name = 'Wheels';
  const tyre = new THREE.LatheGeometry([[0.25, -0.11], [0.31, -0.115], [S.wheelR - 0.01, -0.1], [S.wheelR, -0.05], [S.wheelR, 0.05], [S.wheelR - 0.01, 0.1], [0.31, 0.115], [0.25, 0.11]].map(([r, y]) => new THREE.Vector2(r, y)), Q.round).rotateX(Math.PI / 2);
  const rimParts = [new THREE.CylinderGeometry(0.255, 0.255, 0.04, Q.round).rotateX(Math.PI / 2).translate(0, 0, 0.085)];
  for (let k = 0; k < 5; k++) for (const o of [-0.09, 0.09]) rimParts.push(new THREE.BoxGeometry(0.035, 0.22, 0.03).translate(0, 0.13, 0.11).rotateZ(k / 5 * Math.PI * 2 + o));
  const rim = mergeGeometries(rimParts.map(clean));
  const hub = new THREE.CylinderGeometry(0.05, 0.05, 0.03, 12).rotateX(Math.PI / 2).translate(0, 0, 0.125);
  const fullRim = mergeGeometries([clean(rim.clone()), clean(hub.clone())]);

  const wheelDefs = [
    { name: 'Wheel_FL', x: wx, s: -1 },
    { name: 'Wheel_FR', x: wx, s: 1 },
    { name: 'Wheel_RL', x: -wx, s: -1 },
    { name: 'Wheel_RR', x: -wx, s: 1 }
  ];

  for (const w of wheelDefs) {
    const o = new THREE.Group();
    o.name = w.name;
    const z = w.s * (hw * planK(S, w.x) - 0.12);
    o.position.set(w.x, S.wheelR, z);

    const t = new THREE.Mesh(tyre.clone(), mats.tyre);
    t.name = `${w.name}_Tyre`;
    const rGeom = clean(fullRim.clone());
    if (w.s < 0) rGeom.scale(1, 1, -1);
    const r = new THREE.Mesh(rGeom, mats.rim);
    r.name = `${w.name}_Rim`;
    o.add(t, r);
    wheelsGroup.add(o);
  }
  rootGroup.add(wheelsGroup);

  // Interior
  const interiorGroup = new THREE.Group();
  interiorGroup.name = 'Interior';
  const I = new Parts();
  I.add('plastic', rbox(xA - xC - 0.05, 0.05, W - 0.2, (xA + xC) / 2, 0.29, 0, 0.01));
  I.add('plastic', rbox(0.38, 0.26, W - 0.14, 0.73, 0.84, 0, 0.06), rbox(0.3, 0.05, W - 0.16, 0.9, 0.96, 0, 0.02));
  I.add('plastic', rbox(0.75, 0.28, 0.22, 0.12, 0.45, 0, 0.05));
  I.add('plastic', new THREE.TorusGeometry(0.17, 0.022, 8, 28).rotateY(Math.PI / 2).rotateZ(0.42).translate(0.42, 0.93, -0.37), rbox(0.06, 0.08, 0.08, 0.45, 0.92, -0.37, 0.02));
  I.add('plastic', new THREE.CylinderGeometry(0.025, 0.025, 0.3, 8).rotateZ(Math.PI / 2 - 0.42).translate(0.55, 0.88, -0.37));

  for (const z of [-0.37, 0.37]) {
    I.add('fabric', rbox(0.5, 0.12, 0.5, -0.04, 0.48, z, 0.05));
    I.add('fabric', rbox(0.11, 0.62, 0.5, 0, 0.31, 0, 0.05).applyMatrix4(new THREE.Matrix4().makeRotationZ(0.22)).translate(-0.33, 0.56, z));
    I.add('fabric', rbox(0.09, 0.17, 0.27, -0.47, 1.18, z, 0.04));
  }
  I.add('fabric', rbox(0.46, 0.13, W - 0.36, -0.6, 0.5, 0, 0.05), rbox(0.11, 0.55, W - 0.36, -0.86, 0.82, 0, 0.05));

  for (const [name, g] of I.names().map((n) => [n, I.merged(n)])) {
    const m = new THREE.Mesh(g, mats[name]);
    m.name = `Interior_${name}`;
    interiorGroup.add(m);
  }

  // OpenR screen
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.19), mats.screen);
  scr.name = 'Screen_OpenR';
  scr.position.set(0.64, 1.02, -0.13);
  scr.rotation.set(0, -Math.PI / 2, 0);
  scr.rotateX(-0.25);
  interiorGroup.add(scr);
  rootGroup.add(interiorGroup);

  // Logos
  for (const [x, ry, sideName] of [[S.L / 2 + 0.052, Math.PI / 2, 'Front'], [-S.L / 2 - 0.058, -Math.PI / 2, 'Rear']]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), mats.logo);
    m.name = `Logo_${sideName}`;
    m.position.set(x, x > 0 ? 0.6 : 0.82, 0);
    m.rotation.y = ry;
    rootGroup.add(m);
  }

  return { rootGroup, mats };
}

export function exportMeganeGLB() {
  return new Promise((resolve, reject) => {
    const { rootGroup } = buildMeganeDrivableModel();
    rootGroup.traverse((o) => {
      if (o.isMesh && o.geometry) {
        o.geometry = mergeVertices(o.geometry, 1e-4);
      }
    });
    const exporter = new GLTFExporter();
    exporter.parse(
      rootGroup,
      (glb) => resolve(glb),
      (err) => reject(err),
      { binary: true, embedImages: false }
    );
  });
}

export function buildParkedCarModel(S = MEGANE) {
  Q = LOW;
  const P = new Parts(), { top, belt, bot, lowerTop, wx } = lines(S), W = S.W, hw = W / 2, [xA, xB, xC] = S.doors;
  const shoulder = (y) => 0.055 * smooth(0.78, 1.06, y) + 0.035 * smooth(0.45, 0.22, y);
  const fzPlan = (x, y, z) => z * planK(S, x) * (1 - shoulder(y));

  const lower = (x0, x1) => shape([...along(lowerTop, x0, x1), ...along(bot, x1, x0)]);
  P.add('paint', extrude(lower(S.L / 2, -S.L / 2), W, { bevel: 0.05, fz: fzPlan }));

  for (const x of [wx, -wx]) for (const s of [-1, 1]) {
    P.add('black', new THREE.TorusGeometry(S.arch + 0.015, 0.035, 3, Q.arch, Math.PI).translate(x, S.wheelR, s * (hw * planK(S, x) - 0.005)));
  }
  for (const s of [-1, 1]) P.add('black', rbox(2 * (wx - S.arch) - 0.02, 0.07, 0.04, 0, 0.25, s * (hw - 0.005), 0.02));
  P.add('black', rbox(0.06, 0.12, W * 0.66, S.L / 2 + 0.03, 0.34, 0, 0.03), rbox(0.06, 0.14, W * 0.7, -S.L / 2 - 0.03, 0.36, 0, 0.03));
  P.add('black', rbox(0.04, 0.1, W * 0.42, S.L / 2 + 0.045, 0.45, 0, 0.02));

  const lean = S.lean, rise = 0.48, roofHW = hw - 0.03 - Math.sin(lean) * rise;
  const band = (x0, x1, t) => shape([...along(top, x0, x1), ...along((x) => top(x) - t, x1, x0)]);
  const xW0 = S.top.find(([x]) => x <= 1.06)[0], xW1 = 0.22, xR = -0.95, xG = -1.62;
  P.add('glass', extrude(band(xW0, xW1, 0.02), 2 * hw - 0.08, { bevel: 0.01, segs: 1, fz: (x, y, z) => z * (1 - 0.1 * smooth(1.0, 1.45, y)) }));
  P.add('roof', extrude(band(xW1 + 0.02, xR, 0.05), 2 * roofHW + 0.02, { bevel: 0.025 }));
  P.add('glass', extrude(band(xR, xG, 0.03), 2 * roofHW - 0.02, { bevel: 0.01, segs: 1 }));
  P.add('paint', extrude(band(xG, -1.83, 0.06), 2 * roofHW, { bevel: 0.025 }));
  P.add('black', extrude(band(xW0 + 0.03, xW0 - 0.06, 0.03), W * 0.86, { bevel: 0.01, segs: 1 }));

  const sides = (pts, name, inset = 0) => { for (const s of [-1, 1]) {
    const g = extrude(shape(pts), 0.035, { bevel: 0.008, segs: 1, z0: 0 });
    g.translate(0, -1.0, 0).rotateX(s * -lean).translate(0, 1.0, s > 0 ? hw - 0.035 - inset : -hw + inset);
    P.add(name, g);
  } };
  sides([...along(belt, xC, -1.9, 0.1), ...along((x) => top(x) - 0.04, -1.9, xC, 0.1)], 'black');
  P.add('black', extrude(shape([...along(top, xG, -1.95), ...along(belt, -1.95, xG)]), 2 * roofHW, { bevel: 0.01, segs: 1 }));

  sides([...along(belt, xA, xC, 0.1), ...along((x) => top(x) - 0.04, xC, xA - 0.02, 0.1)], 'glass', 0.005);
  for (const s of [-1, 1]) P.add('black', rbox(0.06, 0.45, 0.04, xB, 1.22, s * (hw - 0.07), 0.01).applyMatrix4(new THREE.Matrix4().makeRotationX(s * -lean * 0.5)));

  for (const s of [-1, 1]) {
    const z = s * hw * planK(S, 1.98) * 0.72;
    P.add('lens', rbox(0.22, 0.07, 0.36, 1.98, 0.8, z, 0.025).rotateY(0));
    P.add('led', rbox(0.04, 0.018, 0.3, 2.05, 0.83, z, 0.008), rbox(0.03, 0.2, 0.025, 2.065, 0.62, s * hw * 0.78, 0.01));
    P.add('blink', rbox(0.03, 0.02, 0.1, 2.06, 0.77, s * hw * 0.8, 0.008));
    P.add('tail', rbox(0.06, 0.06, 0.32, -2.06, 0.94, s * hw * 0.74, 0.02));
  }
  P.add('tail', rbox(0.03, 0.03, W * 0.76, -S.L / 2 - 0.012, 0.94, 0, 0.012));
  P.add('chrome', rbox(0.02, 0.02, W * 0.4, -2.08, 0.82, 0, 0.008));

  const tyre = new THREE.LatheGeometry([[0.25, -0.11], [0.31, -0.115], [S.wheelR - 0.01, -0.1], [S.wheelR, -0.05], [S.wheelR, 0.05], [S.wheelR - 0.01, 0.1], [0.31, 0.115], [0.25, 0.11]].map(([r, y]) => new THREE.Vector2(r, y)), Q.round).rotateX(Math.PI / 2);
  const rimParts = [new THREE.CylinderGeometry(0.255, 0.255, 0.04, Q.round).rotateX(Math.PI / 2).translate(0, 0, 0.085)];
  for (let k = 0; k < 5; k++) rimParts.push(new THREE.BoxGeometry(0.035, 0.22, 0.03).translate(0, 0.13, 0.11).rotateZ(k / 5 * Math.PI * 2));
  const rim = mergeGeometries(rimParts.map(clean)), hub = new THREE.CylinderGeometry(0.05, 0.05, 0.03, 12).rotateX(Math.PI / 2).translate(0, 0, 0.125);

  const wheels = [];
  for (const x of [wx, -wx]) for (const s of [-1, 1]) wheels.push({ x, s, z: s * (hw * planK(S, x) - 0.12) });

  function sideM(w) { return new THREE.Matrix4().makeTranslation(w.x, S.wheelR, w.z).multiply(new THREE.Matrix4().makeScale(1, 1, w.s)); }
  P.add('tyre', ...wheels.map((w) => tyre.clone().translate(w.x, S.wheelR, w.z)));
  P.add('rim', ...wheels.flatMap((w) => [rim.clone().applyMatrix4(sideM(w)), hub.clone().applyMatrix4(sideM(w))]));

  const rootGroup = new THREE.Group();
  rootGroup.name = 'Car_Parked';

  const mats = {
    paint: new THREE.MeshStandardMaterial({ name: 'Mat_Paint', color: 0xffffff, roughness: 0.25 }),
    black: new THREE.MeshStandardMaterial({ name: 'Mat_Black', color: 0x0c0d0f }),
    roof: new THREE.MeshStandardMaterial({ name: 'Mat_Roof', color: 0x0b0c0e }),
    glass: new THREE.MeshStandardMaterial({ name: 'Mat_Glass', color: 0x1a2430 }),
    chrome: new THREE.MeshStandardMaterial({ name: 'Mat_Chrome', color: 0xd9dde0 }),
    lens: new THREE.MeshStandardMaterial({ name: 'Mat_Lens', color: 0x111418 }),
    led: new THREE.MeshStandardMaterial({ name: 'Mat_LED', color: 0xf4f6ff }),
    tail: new THREE.MeshStandardMaterial({ name: 'Mat_Tail', color: 0x8a0f12 }),
    blink: new THREE.MeshStandardMaterial({ name: 'Mat_Blink', color: 0xc87a10 }),
    tyre: new THREE.MeshStandardMaterial({ name: 'Mat_Tyre', color: 0x141517 }),
    rim: new THREE.MeshStandardMaterial({ name: 'Mat_Rim', color: 0x9aa0a6 }),
  };

  for (const n of P.names()) {
    const geo = P.merged(n);
    if (geo) {
      const mesh = new THREE.Mesh(geo, mats[n] || mats.black);
      mesh.name = `Parked_${n}`;
      rootGroup.add(mesh);
    }
  }

  return { rootGroup, parts: P };
}

export function exportParkedCarGLB() {
  return new Promise((resolve, reject) => {
    const { rootGroup } = buildParkedCarModel();
    rootGroup.traverse((o) => {
      if (o.isMesh && o.geometry) {
        o.geometry = mergeVertices(o.geometry, 1e-4);
      }
    });
    const exporter = new GLTFExporter();
    exporter.parse(
      rootGroup,
      (glb) => resolve(glb),
      (err) => reject(err),
      { binary: true, embedImages: false }
    );
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Building Mégane and Parked car GLBs...');
  Promise.all([exportMeganeGLB(), exportParkedCarGLB()]).then(([meganeGlb, parkedGlb]) => {
    const outMegane = path.resolve(process.cwd(), 'models/car-megane.glb');
    const outParked = path.resolve(process.cwd(), 'models/car-parked.glb');
    fs.mkdirSync(path.dirname(outMegane), { recursive: true });
    fs.writeFileSync(outMegane, Buffer.from(meganeGlb));
    fs.writeFileSync(outParked, Buffer.from(parkedGlb));
    console.log(`Exported car-megane.glb: ${meganeGlb.byteLength} bytes`);
    console.log(`Exported car-parked.glb: ${parkedGlb.byteLength} bytes`);
  }).catch((err) => {
    console.error('Failed to export car GLBs:', err);
    process.exit(1);
  });
}

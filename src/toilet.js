import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TOILET as T } from './config.js';
import { sfx } from './audio.js';

// Floor-standing toilet (Ifö Spira 6260) with a seat and a lid that opens/closes with E, and a flush button on
// the tank (its own E target, `flush`, #155): the button dips, it flushes, and it can't flush again until the
// tank has refilled (FLUSH.refill s).
// Local frame: back against the wall at z = 0, bowl towards +z, y up from the floor.

const porcelain = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.12 });
const chrome = new THREE.MeshStandardMaterial({ color: 0xd7dadc, roughness: 0.15, metalness: 0.6 });

const ellipse = (rx, rz) => {
  const s = new THREE.Shape();
  s.absellipse(0, 0, rx, rz, 0, Math.PI * 2, false);
  return s;
};

const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };

function mesh(geo, material) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = m.receiveShadow = true;
  return m;
}

/** Elliptic disc/ring geometry (`hole` = inner ellipse scale) of thickness h, lying flat at y. */
function flatGeo(rx, rz, h, y, hole = 0) {
  const s = ellipse(rx, rz);
  if (hole) s.holes.push(ellipse(rx * hole, rz * hole * 0.95));
  const geo = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelThickness: h * 0.3, bevelSize: h * 0.3, bevelSegments: 2, curveSegments: 32 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y, 0);
  return geo;
}
const flat = (rx, rz, h, y, material, hole = 0) => mesh(flatGeo(rx, rz, h, y, hole), material);

/** Sample the bowl profile (rings [dy, scale, dz], top down) at height dy below the rim: { s, dz }. */
function profileAt(dy) {
  const P = T.bowl.profile;
  for (let i = 1; i < P.length; i++) {
    if (dy >= P[i][0]) {
      const [y0, s0, z0] = P[i - 1], [y1, s1, z1] = P[i];
      const k = (dy - y0) / (y1 - y0);
      return { s: s0 + (s1 - s0) * k, dz: z0 + (z1 - z0) * k };
    }
  }
  const l = P[P.length - 1];
  return { s: l[1], dz: l[2] };
}

/** The inside of the bowl (#321): elliptic rings (a, b = the rim hole's half axes) down the profile, faces pointing in.
 *  `inset` pulls every ring that much towards the axis (the flush's sheet of water); rings below `toDy` are left out. */
function bowlGeo(a, b, inset = 0, toDy = -Infinity) {
  const P = T.bowl.profile.filter((r) => r[0] >= toDy - 1e-6), seg = 48;
  const pos = [], uv = [], idx = [];
  P.forEach(([dy, s, dz], i) => {
    for (let j = 0; j <= seg; j++) {
      const th = (j / seg) * Math.PI * 2;
      const rx = Math.max(0, a * s - inset), rz = Math.max(0, b * s - inset);
      pos.push(Math.cos(th) * rx, dy, dz + Math.sin(th) * rz);
      uv.push(j / seg, 1 - i / (P.length - 1));
    }
  });
  for (let i = 0; i < P.length - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const p = i * (seg + 1) + j, q = p + seg + 1;
      idx.push(p, q, p + 1, p + 1, q, q + 1); // wound so the faces look inwards (towards the axis)
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A canvas texture: `draw(ctx, w, h)` on black, repeating. */
function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
// the swirl on the water while it flushes: bright spiral arms (an emissive map, dark = nothing)
let swirlTex, runTex;
const swirl = () => swirlTex ??= canvasTexture(256, 256, (ctx, w) => {
  ctx.translate(w / 2, w / 2);
  ctx.lineCap = 'round';
  for (let arm = 0; arm < 5; arm++) {
    for (let k = 0; k < 60; k++) {
      const r = 8 + k * 2, th = arm * (Math.PI * 2 / 5) + k * 0.075;
      ctx.strokeStyle = `rgba(255,255,255,${(0.75 * (1 - k / 60)).toFixed(3)})`;
      ctx.lineWidth = 2 + k * 0.12;
      ctx.beginPath();
      ctx.arc(0, 0, r, th, th + 0.12);
      ctx.stroke();
    }
  }
});
// the water running down from under the rim: uneven vertical streaks (an alpha map)
const runlets = () => runTex ??= canvasTexture(128, 128, (ctx, w, h) => {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 40; i++) {
    const x = rnd() * w, len = h * (0.4 + rnd() * 0.6), y = rnd() * h, lw = 2 + rnd() * 4;
    const g = ctx.createLinearGradient(0, y, 0, y + len);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.3, `rgba(255,255,255,${0.7 + rnd() * 0.3})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    for (const dy of [0, -h]) ctx.fillRect(x, y + dy, lw, len); // wraps
  }
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(0, 0, w, h); // a thin film everywhere
});

export class Toilet {
  /** side = the wall the tank stands against; (x, z) = middle of the back on that wall. */
  constructor(side, x, z, y0) {
    this.name = 'toalettlocket';
    this.kind = 'lid';
    this.isOpen = false;
    this.t = 0; // 0 = lid down, 1 = up
    const g = new THREE.Group();
    const bowlZ = T.tankDepth + (T.depth - T.tankDepth) / 2 - 0.02; // centre of the bowl
    const rx = T.width / 2, rz = (T.depth - T.tankDepth) / 2 + 0.01;
    const seat = T.seatHeight;
    // All the white porcelain is one mesh (#321): tank, pedestal (open at the top), neck, rim, seat and the bowl inside.
    const parts = [];
    const put = (geo, x, y, z, sx = 1, sy = 1, sz = 1) => {
      geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz)));
      parts.push(geo.index ? geo.toNonIndexed() : geo);
    };
    put(new RoundedBoxGeometry(T.width, T.tankHeight - 0.4, T.tankDepth, 3, 0.03), 0, (T.tankHeight + 0.4) / 2, T.tankDepth / 2);
    // pedestal (tapering towards the floor), open at the top so the bowl shows; a short neck to the tank behind the bowl
    put(new THREE.CylinderGeometry(1, 0.62, seat - 0.05, 32, 1, true), 0, (seat - 0.05) / 2, bowlZ - 0.03, rx * 0.95, 1, rz * 0.95);
    put(new RoundedBoxGeometry(T.width * 0.75, seat - 0.02, 0.08, 2, 0.03), 0, (seat - 0.02) / 2, T.tankDepth + 0.02);
    // rim and seat
    const rimY = seat - 0.06;
    put(flatGeo(rx, rz, 0.03, rimY, 0.72), 0, 0, bowlZ);
    put(flatGeo(rx * 0.98, rz * 0.98, 0.016, seat - 0.025, 0.66), 0, 0, bowlZ);
    // the bowl: from inside the rim's hole down past the water to the outlet towards the back
    const ha = rx * 0.72, hb = rz * 0.72 * 0.95; // the rim hole's half axes
    put(bowlGeo(ha, hb), 0, rimY, bowlZ);
    g.add(mesh(mergeGeometries(parts), porcelain));
    const button = at(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 20), chrome), 0, T.tankHeight + 0.004, T.tankDepth / 2);
    g.add(button);
    // blue water at the bottom (its own material: a swirl lights up in it while it flushes)
    const water = new THREE.MeshStandardMaterial({ color: T.bowl.water, roughness: 0.04, metalness: 0.1, transparent: true,
      opacity: 0.88, emissive: 0xffffff, emissiveIntensity: 0, emissiveMap: swirl().clone() });
    water.emissiveMap.center.set(0.5, 0.5);
    water.emissiveMap.needsUpdate = true;
    const pool = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), water);
    pool.receiveShadow = true;
    pool.renderOrder = 1;
    g.add(pool);
    // the water running down the bowl while it flushes: a slightly inset copy of the bowl above the water, streaks scrolling down
    const run = new THREE.MeshStandardMaterial({ color: 0x6fc0e4, emissive: 0x2a6f90, roughness: 0.03, transparent: true, opacity: 0, depthWrite: false,
      alphaMap: runlets().clone(), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    run.alphaMap.repeat.set(4, 1);
    run.alphaMap.needsUpdate = true;
    const sheet = at(new THREE.Mesh(bowlGeo(ha, hb, 0.003, T.bowl.waterDy - 0.02), run), 0, rimY, bowlZ);
    sheet.renderOrder = 2;
    sheet.visible = false;
    g.add(sheet);
    const bowl = { a: ha, b: hb, y: rimY, z: bowlZ };
    // lid: hinged at the back of the seat
    this.hinge = new THREE.Group();
    this.hinge.position.set(0, seat + 0.002, T.tankDepth + 0.03);
    const lid = flat(rx * 0.98, rz * 0.98, 0.014, 0, porcelain);
    lid.position.z = bowlZ - T.tankDepth - 0.03;
    this.hinge.add(lid);
    g.add(this.hinge);
    g.rotation.y = { west: Math.PI / 2, east: -Math.PI / 2, north: 0, south: Math.PI }[side];
    g.position.set(x, y0, z);
    this.object = g;
    // the whole toilet is the pick target (looking at the bowl is enough)
    this.pickable = g;
    g.traverse((o) => { o.userData.door = this; });
    // the flush button: an invisible box over the top of the tank is its E target (the button itself is small)
    const pick = at(new THREE.Mesh(new THREE.BoxGeometry(T.width * 0.8, 0.06, T.tankDepth + 0.02), new THREE.MeshBasicMaterial()), 0, T.tankHeight + 0.03, T.tankDepth / 2);
    pick.visible = false;
    g.add(pick);
    this.flush = new Flush(button, pool, pick, sheet, bowl);
  }

  toggle() { this.isOpen = !this.isOpen; }

  update(dt) {
    const target = this.isOpen ? 1 : 0;
    this.t += Math.sign(target - this.t) * Math.min(Math.abs(target - this.t), dt * 2.5);
    const e = this.t * this.t * (3 - 2 * this.t);
    this.hinge.rotation.x = -e * THREE.MathUtils.degToRad(93); // rests just short of the tank
  }
}

/** Flushing (#155): E on the button. `count` flushes so far; `ready` once the tank is full again.
 *  #321: water runs down the bowl from under the rim, the surface swirls, drains and rises again as the tank refills;
 *  nothing is touched while idle. */
class Flush {
  constructor(button, pool, pick, sheet, bowl) {
    Object.assign(this, { button, pool, pick, sheet, bowl, kind: 'flush', verb: 'spola', object: pick, pickable: pick, refill: 0, count: 0, t: 1 });
    this.buttonY = button.position.y;
    pick.userData.door = this;
    this.setLevel(0);
    this.poolY = pool.position.y;
  }

  get ready() { return this.refill <= 0; }
  get name() { return this.ready ? 'toaletten' : 'toaletten (cisternen fylls)'; }

  /** The water surface `drop` m below its rest level, sized to the bowl there. */
  setLevel(drop) {
    const dy = T.bowl.waterDy - drop, { s, dz } = profileAt(dy), { a, b, y, z } = this.bowl;
    this.pool.position.set(0, y + dy, z + dz);
    this.pool.scale.set(a * s * 1.02, 1, b * s * 1.02); // a hair wider than the bowl: its edge tucks into the wall
  }

  /** Flush if the tank is full; returns whether it did. */
  toggle() {
    if (!this.ready) return false;
    this.refill = T.refill;
    this.t = 0;
    this.count++;
    this.sheet.visible = true;
    sfx.flush(this.button.getWorldPosition(new THREE.Vector3()), T.refill);
    return true;
  }

  update(dt) {
    if (this.refill > 0) this.refill = Math.max(0, this.refill - dt);
    if (this.t >= 1) return;
    this.t = Math.min(1, this.t + dt / T.refill);
    const secs = this.t * T.refill, F = T.bowl.flush;
    this.button.position.y = this.buttonY - (secs < 0.35 ? 0.004 : 0); // the button stays down a moment
    // the water drains away and comes back as the tank refills
    const k = this.t < 0.15 ? this.t / 0.15 : 1 - (this.t - 0.15) / 0.85;
    this.setLevel(F.drop * Math.max(0, k));
    // running down from under the rim: in fast, a while, then thinning out
    const run = secs < 0.25 ? secs / 0.25 : Math.max(0, 1 - (secs - F.run) / 1.2);
    const rm = this.sheet.material;
    rm.opacity = 0.85 * Math.min(1, run);
    rm.alphaMap.offset.y += dt * F.runSpeed * (0.4 + 0.6 * run);
    this.sheet.visible = run > 0 && this.t < 1;
    // the swirl: bright arms turning, slowing as the bowl fills again
    const wm = this.pool.material, sw = Math.max(0, 1 - secs / F.swirl);
    wm.emissiveMap.rotation -= dt * F.spin * (0.3 + 0.7 * sw);
    wm.emissiveIntensity = this.t < 1 ? 0.55 * Math.min(1, secs / 0.2) * sw : 0;
  }
}

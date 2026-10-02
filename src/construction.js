import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONSTRUCTION as C, HUS_L, SITE } from './config.js';
import { groundY } from './surroundings.js';
import { registerTrees } from './seasons.js';

// The building site as it is now (#131): an optional mode (world.setConstruction, the start screen button,
// `&bygge`). Hus L (all but our own unit) and Å-husen A, B, C stand in system scaffolding — standards, ledgers,
// guard rails, diagonals and timber decks every lift, all instanced (two draw calls) — some runs netted in white,
// blue weatherboard where the brick is not up yet, mobile fence panels on concrete feet round the site, red and
// yellow barriers on the pavement and a wheel loader and an excavator. Everything merged per material; collision
// segments for the parts the visitor can walk into. The courtyard (#132) is a wet concrete deck then (world.js hides the
// finished courtyard): puddles, red-brown gravel and grey concrete walls at the east edge, a site hut, a portable
// toilet, a skip, pallets with big bags, tarps, a hose, a wheelbarrow and young maples.

const box = (sx, sy, sz, x, y, z) => new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z);
const cyl = (r, h, x, y, z, seg = 12) => new THREE.CylinderGeometry(r, r, h, seg).translate(x, y, z);
const wheel = (r, w, x, y, z) => new THREE.CylinderGeometry(r, r, w, 16).rotateZ(Math.PI / 2).translate(x, y, z);
const rectSegs = (pts) => pts.map((p, i) => [...p, ...pts[(i + 1) % pts.length]]);

function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Fine white netting: a faint mesh, 1 m per tile. */
const netTexture = () => canvasTex(64, 64, (g, w, h) => {
  g.fillStyle = 'rgba(240,243,245,0.5)'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 1;
  for (let i = 0; i < w; i += 3) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); }
});

/** Blue weatherboard sheets (1.2 × 2.4 m, printed "Weatherboard 365") with a strip of yellow insulation, per 2.4 × 3 m tile. */
const boardTexture = () => canvasTex(256, 320, (g, w, h) => {
  g.fillStyle = '#2f55b8'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#24439a'; g.lineWidth = 3;
  for (const x of [0, w / 2]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h * 0.8); g.stroke(); }
  g.beginPath(); g.moveTo(0, h * 0.8); g.lineTo(w, h * 0.8); g.stroke();
  g.fillStyle = 'rgba(230,236,255,0.75)'; g.font = 'bold 15px sans-serif';
  for (const [x, y] of [[14, 60], [142, 150], [14, 230]]) g.fillText('Weatherboard 365', x, y);
  g.fillStyle = '#e8c23a'; g.fillRect(0, h * 0.8 + 2, w, h * 0.2 - 2); // the insulation band at the slab edge
  g.fillStyle = 'rgba(160,120,20,0.35)';
  for (let i = 0; i < 90; i++) g.fillRect(Math.random() * w, h * 0.8 + 4 + Math.random() * (h * 0.2 - 8), 6, 2);
});

/** A mobile fence panel (3.5 × 2 m): galvanised tube frame, welded mesh; alpha-tested. */
const fenceTexture = () => canvasTex(256, 148, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.strokeStyle = 'rgba(190,195,198,1)'; g.lineWidth = 1.2;
  for (let x = 6; x < w - 4; x += 7) { g.beginPath(); g.moveTo(x, 6); g.lineTo(x, h - 4); g.stroke(); }
  for (let y = 8; y < h - 4; y += 15) { g.beginPath(); g.moveTo(4, y); g.lineTo(w - 4, y); g.stroke(); }
  g.strokeStyle = 'rgba(200,204,206,1)'; g.lineWidth = 6; g.lineJoin = 'round';
  g.strokeRect(4, 4, w - 8, h - 6);
}, false);

/** Red and yellow chevron boards of a barrier. */
const stripeTexture = () => canvasTex(64, 256, (g, w, h) => {
  g.fillStyle = '#f2c21b'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#d42a1e';
  for (let y = -64; y < h + 64; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + 32); g.lineTo(w, y + 56); g.lineTo(0, y + 24); g.fill(); }
}, false);

// --- scaffolding ----------------------------------------------------------------------------------------------
const UP = new THREE.Vector3(0, 1, 0), mtx = new THREE.Matrix4(), qq = new THREE.Quaternion(), dir = new THREE.Vector3(), mid = new THREE.Vector3(), scl = new THREE.Vector3();

/** Scaffold pieces for one run along a façade from a to b (plan), outward normal n, up to `top`. */
function scaffoldRun(out, a, b, n, top, net) {
  const S = C.scaffold, len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 1) return;
  const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len, bays = Math.max(1, Math.ceil(len / S.bay)), bl = len / bays;
  const at = (s, d, y) => new THREE.Vector3(a[0] + ux * s + n[0] * d, y, a[1] + uz * s + n[1] * d);
  const d0 = S.off, d1 = S.off + S.depth, yTop = top + S.over;
  const gAt = (s) => Math.min(groundY(at(s, d0, 0).x, at(s, d0, 0).z), groundY(at(s, d1, 0).x, at(s, d1, 0).z));
  let base = Infinity;
  for (let k = 0; k <= bays; k++) base = Math.min(base, gAt(k * bl));
  const tube = (p, q) => out.tubes.push([p, q]);
  for (let k = 0; k <= bays; k++) { // standards, inner and outer, from the ground at each spot
    const s = k * bl, g = gAt(s);
    tube(at(s, d0, g), at(s, d0, yTop)); tube(at(s, d1, g), at(s, d1, yTop));
  }
  for (let y = base + S.lift; y <= top + 0.01; y += S.lift) {
    for (let k = 0; k < bays; k++) {
      const s0 = k * bl, s1 = s0 + bl;
      if (y < gAt(s0 + bl / 2) + 0.6) continue; // below the ground here (the box edge, the slope)
      tube(at(s0, d0, y), at(s1, d0, y)); tube(at(s0, d1, y), at(s1, d1, y));            // ledgers
      tube(at(s0, d1, y + 0.5), at(s1, d1, y + 0.5)); tube(at(s0, d1, y + 1), at(s1, d1, y + 1)); // guard rails
      tube(at(s0, d0, y), at(s0, d1, y));                                                 // transom
      if (k % 3 === 0) tube(at(s0, d1, y - S.lift), at(s1, d1, y));                        // a diagonal brace
      const c = at(s0 + bl / 2, (d0 + d1) / 2, y);
      out.decks.push({ pos: c, yaw: Math.atan2(-uz, ux), len: bl - 0.02 });
    }
  }
  if (net) { // white netting over the outer face, from the first lift up
    const h = yTop - (base + S.lift), p = at(len / 2, d1 + 0.04, base + S.lift + h / 2);
    const g = new THREE.PlaneGeometry(len, h);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len, uv.getY(i) * h);
    g.rotateY(Math.atan2(n[0], n[1])).translate(p.x, p.y, p.z);
    out.nets.push(g);
  }
  // collision along the outer standards (only matters where the visitor can get to: the street, the courtyard)
  const e0 = at(0, d1 + 0.05, 0), e1 = at(len, d1 + 0.05, 0), f0 = at(0, 0, 0), f1 = at(len, 0, 0);
  out.segments.push([f0.x, f0.z, e0.x, e0.z], [e0.x, e0.z, e1.x, e1.z], [e1.x, e1.z, f1.x, f1.z]);
}

/** A façade line from p to q, minus the plan ranges in `skip` (along x or z, whichever the line runs along). */
function pieces(p, q, skip = []) {
  const alongX = Math.abs(q[0] - p[0]) > Math.abs(q[1] - p[1]), i = alongX ? 0 : 1;
  const lo = Math.min(p[i], q[i]), hi = Math.max(p[i], q[i]);
  let spans = [[lo, hi]];
  for (const [s0, s1] of skip) spans = spans.flatMap(([a, b]) => (s1 <= a || s0 >= b ? [[a, b]] : [[a, Math.min(b, s0)], [Math.max(a, s1), b]].filter(([x, y]) => y - x > 1)));
  return spans.map(([a, b]) => (alongX ? [[a, p[1]], [b, p[1]]] : [[p[0], a], [p[0], b]]));
}

function buildScaffolding(out) {
  const W = 5.75, D = SITE.terrain.north, H = HUS_L;
  const x1 = W * (1 + H.after), x0 = -(H.before * W + H.core.w + H.west * W);
  const topL = (2 + H.upperStoreys) * H.storeyHeight + 0.35;
  const sk = C.skipL, net = new Set(C.netted);
  const sides = (id, rect, top, extra = {}) => {
    const { x0: a, x1: b, z0: c, z1: d } = rect;
    const lines = { n: [[a, c], [b, c], [0, -1]], s: [[a, d], [b, d], [0, 1]], w: [[a, c], [a, d], [-1, 0]], e: [[b, c], [b, d], [1, 0]] };
    for (const [side, [p, q, nrm]] of Object.entries(lines)) {
      if (extra[side] === false) continue;
      const list = pieces(p, q, extra[side] ?? []);
      list.forEach(([pp, qq2], i) => scaffoldRun(out, pp, qq2, nrm, top, net.has(`${id}-${side}-${i}`)));
    }
  };
  // Hus L: not our unit (both sides), not the east spiral stair (north), the west gable beside its stair drum
  sides('L', { x0, x1, z0: 0, z1: D }, topL, { n: [...sk.both, ...sk.north], s: sk.both, w: [[-1, 3.0]], e: [[-1, 0.3]] });
  for (const name of ['A', 'B', 'C']) {
    const b = SITE.blocks.find((x) => x.name === `Hus ${name}`);
    if (b) sides(name, b, b.base + b.storeys * SITE.storey);
  }
}

/** Instanced tubes (unit cylinder along y) and decks (unit box). */
function instanceScaffold(out, group) {
  const tubeMat = new THREE.MeshStandardMaterial({ color: 0xb4b9bc, roughness: 0.45, metalness: 0.55 });
  const tubes = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.026, 0.026, 1, 4, 1, true), tubeMat, out.tubes.length);
  out.tubes.forEach(([p, q], i) => {
    dir.subVectors(q, p); const l = dir.length();
    qq.setFromUnitVectors(UP, dir.normalize());
    tubes.setMatrixAt(i, mtx.compose(mid.addVectors(p, q).multiplyScalar(0.5), qq, scl.set(1, l, 1)));
  });
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x7d6a55, roughness: 0.9 });
  const decks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), deckMat, out.decks.length);
  out.decks.forEach((d, i) => {
    qq.setFromAxisAngle(UP, d.yaw);
    decks.setMatrixAt(i, mtx.compose(d.pos, qq, scl.set(d.len, 0.05, C.scaffold.depth - 0.04)));
  });
  decks.castShadow = decks.receiveShadow = true;
  group.add(tubes, decks);
  if (out.nets.length) {
    const tex = netTexture();
    const nets = new THREE.Mesh(mergeGeometries(out.nets), new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.9 }));
    nets.renderOrder = 1;
    group.add(nets);
  }
}

/** Blue weatherboard over the façades (C.boards), a few cm proud of them. */
function boards(group) {
  const geos = C.boards.map(([ax, az, bx, bz, y0, y1, n]) => {
    const alongX = Math.abs(bx - ax) > Math.abs(bz - az), len = Math.hypot(bx - ax, bz - az), h = y1 - y0;
    const g = new THREE.PlaneGeometry(len, h);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / 2.4, uv.getY(i) * h / 3);
    const nx = alongX ? 0 : n, nz = alongX ? n : 0;
    g.rotateY(Math.atan2(nx, nz)).translate((ax + bx) / 2 + nx * 0.06, (y0 + y1) / 2, (az + bz) / 2 + nz * 0.06);
    return g;
  });
  const m = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ map: boardTexture(), roughness: 0.6 }));
  m.receiveShadow = true;
  group.add(m);
}

/** Mobile fencing along C.fence: panels (instanced, alpha-tested) on concrete feet. */
function fencing(group) {
  const panels = [];
  for (const line of C.fence) for (let i = 0; i < line.length - 1; i++) {
    const [ax, az] = line[i], [bx, bz] = line[i + 1], len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 3.5));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      panels.push({ x, z, yaw: Math.atan2(-(bz - az), bx - ax), w: len / n, y: groundY(x, z) });
    }
  }
  const mat = new THREE.MeshStandardMaterial({ map: fenceTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.4 });
  const fence = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 2).translate(0, 1.12, 0), mat, panels.length);
  const feet = new THREE.InstancedMesh(new THREE.BoxGeometry(0.62, 0.14, 0.2).translate(0, 0.07, 0), new THREE.MeshStandardMaterial({ color: 0x9a9893, roughness: 0.9 }), panels.length);
  panels.forEach((p, i) => {
    qq.setFromAxisAngle(UP, p.yaw);
    fence.setMatrixAt(i, mtx.compose(mid.set(p.x, p.y, p.z), qq, scl.set(p.w, 1, 1)));
    const ux = Math.cos(p.yaw), uz = -Math.sin(p.yaw);
    feet.setMatrixAt(i, mtx.compose(mid.set(p.x - ux * p.w / 2, p.y, p.z - uz * p.w / 2), qq, scl.set(1, 1, 1)));
  });
  fence.castShadow = true;
  group.add(fence, feet);
  return C.fence.flatMap((line) => line.slice(1).map((q, i) => [...line[i], ...q]));
}

/** Concrete-footed barriers with red/yellow boards and yellow rails (C.barriers: x, z, yaw°). */
function barriers(group) {
  const conc = [], rails = [], boardsG = [], segs = [];
  for (const [x, z, deg] of C.barriers) {
    const t = new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(deg)).setPosition(x, groundY(x, z), z);
    conc.push(box(2.2, 0.22, 0.4, 0, 0.11, 0).applyMatrix4(t));
    for (const s of [-1, 1]) boardsG.push(box(0.2, 1.0, 0.03, s * 0.95, 0.72, 0).applyMatrix4(t));
    for (const y of [0.5, 0.8, 1.05]) rails.push(cyl(0.022, 1.7, 0, y, 0, 8).rotateZ(Math.PI / 2).applyMatrix4(t));
    const corners = [[-1.1, -0.2], [1.1, -0.2], [1.1, 0.2], [-1.1, 0.2]].map(([u, v]) => { const p = new THREE.Vector3(u, 0, v).applyMatrix4(t); return [p.x, p.z]; });
    segs.push(...rectSegs(corners));
  }
  // the board geometry's UVs: one stripe tile over each board
  group.add(new THREE.Mesh(mergeGeometries(conc), new THREE.MeshStandardMaterial({ color: 0xa5a29b, roughness: 0.95 })),
    new THREE.Mesh(mergeGeometries(rails), new THREE.MeshStandardMaterial({ color: 0xf0c020, roughness: 0.5 })),
    new THREE.Mesh(mergeGeometries(boardsG), new THREE.MeshStandardMaterial({ map: stripeTexture(), roughness: 0.6 })));
  return segs;
}

/** A wheel loader and a tracked excavator, yellow with black tyres/tracks (merged per material). */
function machines(group) {
  const yellow = [], black = [], glass = [], steel = [], segs = [];
  const place = ([x, z, yaw], parts, half) => {
    const t = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, groundY(x, z), z);
    for (const [list, g] of parts) list.push(g.applyMatrix4(t));
    segs.push(...rectSegs(half.map(([u, v]) => { const p = new THREE.Vector3(u, 0, v).applyMatrix4(t); return [p.x, p.z]; })));
  };
  // wheel loader, ~6.5 m long incl. the bucket (front = +z)
  place(C.machines.loader, [
    [yellow, box(1.9, 0.9, 2.2, 0, 1.15, -1.3)], [yellow, box(1.7, 0.7, 1.8, 0, 1.0, 0.9)],          // rear body, front frame
    [yellow, box(1.5, 1.4, 1.4, 0, 2.2, -0.4)], [glass, box(1.52, 0.9, 1.2, 0, 2.35, -0.4)],          // cab
    [black, box(1.6, 0.08, 1.5, 0, 2.94, -0.4)], [black, box(0.4, 0.5, 0.4, 0.5, 1.85, -2.1)],         // roof, exhaust stack
    [steel, box(2.4, 0.9, 0.9, 0, 0.55, 3.0)], [yellow, box(0.18, 0.25, 1.6, 0.6, 1.0, 2.2)], [yellow, box(0.18, 0.25, 1.6, -0.6, 1.0, 2.2)], // bucket + lift arms
    ...[[-1.3], [1.3]].flatMap(([zz]) => [-1, 1].map((s) => [black, wheel(0.75, 0.55, s * 1.05, 0.75, zz)])),
  ], [[-1.35, -2.5], [1.35, -2.5], [1.35, 3.5], [-1.35, 3.5]]);
  // excavator on tracks: undercarriage, slewing upper body, boom, stick and bucket
  place(C.machines.excavator, [
    [black, box(0.6, 0.75, 3.6, -1.1, 0.38, 0)], [black, box(0.6, 0.75, 3.6, 1.1, 0.38, 0)], [steel, box(1.6, 0.4, 2.4, 0, 0.75, 0)],
    [yellow, box(2.4, 1.0, 2.6, 0, 1.45, -0.3)], [yellow, box(1.0, 1.5, 1.1, -0.65, 2.7, 0.55)], [glass, box(1.02, 1.0, 0.9, -0.65, 2.85, 0.6)],
    [black, box(2.4, 0.5, 0.5, 0, 1.2, -1.75)],                                                              // counterweight
    [yellow, box(0.4, 0.45, 3.4, 0.45, 2.7, 2.0).rotateX(-0.45)], [yellow, box(0.35, 0.4, 2.2, 0.45, 2.55, 3.9).rotateX(0.9)], // boom, stick
    [steel, box(0.9, 0.6, 0.6, 0.45, 0.7, 4.6)],
  ], [[-1.45, -2.0], [1.45, -2.0], [1.45, 5.0], [-1.45, 5.0]]);
  const mk = (list, m) => { const o = new THREE.Mesh(mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g))), m); o.castShadow = o.receiveShadow = true; group.add(o); };
  mk(yellow, new THREE.MeshStandardMaterial({ color: 0xe8b21c, roughness: 0.5 }));
  mk(black, new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.8 }));
  mk(glass, new THREE.MeshStandardMaterial({ color: 0x3c4b55, roughness: 0.1, metalness: 0.3 }));
  mk(steel, new THREE.MeshStandardMaterial({ color: 0x5f6266, roughness: 0.6, metalness: 0.4 }));
  return segs;
}

// --- the courtyard as it is now (#132) -------------------------------------------------------------------------
/** A flat plate at y with UVs per 3 m. */
function plate(x0, x1, z0, z1, y) {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 3, p.getZ(i) / 3);
  return g;
}

/** Wet grey concrete (the garage deck with its screed), lighter and darker patches, per 3 m tile. */
const concreteTexture = () => canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#8b8f91'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 400; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(40,45,50,0.05)'; g.fillRect(Math.random() * w, Math.random() * h, 3 + Math.random() * 10, 3 + Math.random() * 10); }
  g.strokeStyle = 'rgba(60,64,66,0.35)'; g.strokeRect(0, 0, w, h);
});
/** Red-brown gravel and soil, per 3 m tile. */
const gravelTexture = () => canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#8a5d45'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 1500; i++) { g.fillStyle = ['#a07258', '#6e4836', '#b08a70', '#5d3d2e'][i % 4]; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2); }
});
/** Light grey precast concrete wall panels, a joint every 2.4 m. */
const wallTexture = () => canvasTex(64, 64, (g, w, h) => {
  g.fillStyle = '#b9b8b2'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 120; i++) { g.fillStyle = 'rgba(90,90,85,0.08)'; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  g.fillStyle = 'rgba(80,80,76,0.6)'; g.fillRect(0, 0, 2, h);
});

/** Concrete skins on the garage box's retaining walls (where the ground outside is lower), just in front of the brick. */
function boxWallSkins() {
  const T = SITE.terrain, geos = [];
  const onBox = (x, z) => T.box.some((b) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1);
  for (const b of T.box) for (const [ax, az, bx, bz, ox, oz] of [[b.x0, b.z0, b.x1, b.z0, 0, -1], [b.x1, b.z0, b.x1, b.z1, 1, 0], [b.x1, b.z1, b.x0, b.z1, 0, 1], [b.x0, b.z1, b.x0, b.z0, -1, 0]]) {
    const len = Math.hypot(bx - ax, bz - az), n = Math.ceil(len);
    for (let k = 0; k < n; k++) {
      const x0 = ax + (bx - ax) * k / n, z0 = az + (bz - az) * k / n, x1 = ax + (bx - ax) * (k + 1) / n, z1 = az + (bz - az) * (k + 1) / n;
      if (onBox((x0 + x1) / 2 + ox * 0.05, (z0 + z1) / 2 + oz * 0.05)) continue;
      const y0 = groundY(x0 + ox * 0.08, z0 + oz * 0.08) - 0.02, y1 = groundY(x1 + ox * 0.08, z1 + oz * 0.08) - 0.02;
      if (y0 > -0.06 && y1 > -0.06) continue;
      const px0 = x0 + ox * 0.08, pz0 = z0 + oz * 0.08, px1 = x1 + ox * 0.08, pz1 = z1 + oz * 0.08, top = 0.2;
      const u0 = (Math.abs(ox) ? z0 : x0) / 2.4, u1 = (Math.abs(ox) ? z1 : x1) / 2.4;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([px0, y0, pz0, px1, y1, pz1, px1, top, pz1, px0, y0, pz0, px1, top, pz1, px0, top, pz0], 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([u0, 0, u1, 0, u1, 1, u0, 0, u1, 1, u0, 1], 2));
      g.computeVertexNormals();
      geos.push(g);
    }
  }
  return geos;
}

/** The courtyard now: wet concrete deck with puddles, gravel outside the east wall, concrete walls, a site hut, a
 * portable toilet, a skip, pallets with big bags, tarps, a hose, a wheelbarrow, a site switchboard, young maples. */
function siteCourtyard(group) {
  const K = C.courtyard, segs = [];
  const deck = new THREE.Mesh(mergeGeometries(K.deck.map(([x0, x1, z0, z1]) => plate(x0, x1, z0, z1, 0.012))), new THREE.MeshStandardMaterial({ map: concreteTexture(), roughness: 0.35, metalness: 0.05 }));
  deck.receiveShadow = true;
  // puddles: dark, glossy ellipses
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const puddles = [];
  for (let i = 0; i < K.puddles; i++) {
    const [x0, x1, z0, z1] = K.deck[i % 2], x = x0 + 1 + rnd() * (x1 - x0 - 2), z = z0 + 1 + rnd() * (z1 - z0 - 2);
    puddles.push(new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2).scale(0.6 + rnd() * 1.8, 1, 0.4 + rnd() * 1.0).rotateY(rnd() * 3).translate(x, 0.016, z));
  }
  const puddle = new THREE.Mesh(mergeGeometries(puddles), new THREE.MeshStandardMaterial({ color: 0x737c82, roughness: 0.06 }));
  puddle.receiveShadow = true;
  // gravel outside the east wall (park level), draped over the slope
  const [gx0, gx1, gz0, gz1] = K.gravel, gpos = [], gidx = [], guv = [], nx = Math.ceil(gx1 - gx0) + 1, nz = Math.ceil(gz1 - gz0) + 1;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = gx0 + (gx1 - gx0) * i / (nx - 1), z = gz0 + (gz1 - gz0) * j / (nz - 1);
    gpos.push(x, groundY(x, z) + 0.03, z); guv.push(x / 3, z / 3);
  }
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i; gidx.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1); }
  const gg = new THREE.BufferGeometry();
  gg.setAttribute('position', new THREE.Float32BufferAttribute(gpos, 3)); gg.setAttribute('uv', new THREE.Float32BufferAttribute(guv, 2)); gg.setIndex(gidx); gg.computeVertexNormals();
  const gravel = new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ map: gravelTexture(), roughness: 1 }));
  gravel.receiveShadow = true;
  const walls = new THREE.Mesh(mergeGeometries(boxWallSkins()), new THREE.MeshStandardMaterial({ map: wallTexture(), roughness: 0.9 }));
  group.add(deck, puddle, gravel, walls);

  // the things standing about, merged per material
  const mats = {
    hut: new THREE.MeshStandardMaterial({ color: 0xeceeea, roughness: 0.6 }), blue: new THREE.MeshStandardMaterial({ color: 0x2d5fb0, roughness: 0.6 }),
    win: new THREE.MeshStandardMaterial({ color: 0x2c3a44, roughness: 0.15, metalness: 0.2 }), skip: new THREE.MeshStandardMaterial({ color: 0x3f5a3c, roughness: 0.7 }),
    wood: new THREE.MeshStandardMaterial({ color: 0xb08a5a, roughness: 0.9 }), bag: new THREE.MeshStandardMaterial({ color: 0xf1efe8, roughness: 0.95 }),
    green: new THREE.MeshStandardMaterial({ color: 0x2f8a3a, roughness: 0.6 }), grey: new THREE.MeshStandardMaterial({ color: 0x8c9196, roughness: 0.5, metalness: 0.3 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x222325, roughness: 0.8 }),
  };
  const lists = Object.fromEntries(Object.keys(mats).map((k) => [k, []]));
  const put = ([x, z, deg], parts, half) => {
    const t = new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(deg)).setPosition(x, groundY(x, z), z);
    for (const [k, g] of parts) lists[k].push(g.applyMatrix4(t));
    if (half) segs.push(...rectSegs([[-half[0], -half[1]], [half[0], -half[1]], [half[0], half[1]], [-half[0], half[1]]].map(([u, v]) => { const q = new THREE.Vector3(u, 0, v).applyMatrix4(t); return [q.x, q.z]; })));
  };
  // site hut (byggbod), 6 × 2.45 m, door and windows towards −z, on sleepers, a steel step
  put(K.hut, [['hut', box(6, 2.5, 2.45, 0, 1.45, 0)], ['blue', box(6.02, 0.25, 2.47, 0, 2.5, 0)], ['dark', box(5.8, 0.2, 0.3, 0, 0.1, -0.9)], ['dark', box(5.8, 0.2, 0.3, 0, 0.1, 0.9)],
    ['win', box(1.2, 0.9, 0.04, -1.6, 1.75, -1.24)], ['win', box(1.2, 0.9, 0.04, 1.9, 1.75, -1.24)], ['grey', box(0.9, 2.0, 0.05, 0.3, 1.25, -1.25)], ['grey', box(1.1, 0.2, 0.6, 0.3, 0.1, -1.6)]], [3.05, 1.3]);
  // portable toilet
  put(K.toilet, [['blue', box(1.1, 2.25, 1.15, 0, 1.12, 0)], ['hut', box(1.15, 0.1, 1.2, 0, 2.3, 0)], ['hut', box(0.5, 0.18, 0.02, 0, 1.6, -0.59)]], [0.6, 0.62]);
  // skip (open steel container) with a heap of offcuts
  put(K.skip, [['skip', box(4.0, 0.12, 1.8, 0, 0.1, 0)], ['skip', box(4.0, 1.3, 0.08, 0, 0.75, -0.86)], ['skip', box(4.0, 1.3, 0.08, 0, 0.75, 0.86)],
    ['skip', box(0.08, 1.3, 1.8, -1.96, 0.75, 0)], ['skip', box(0.08, 1.3, 1.8, 1.96, 0.75, 0)], ['wood', box(3.4, 0.5, 1.4, 0, 1.1, 0).rotateZ(0.06)]], [2.05, 0.95]);
  // pallets with white big bags (sand, insulation)
  for (const p of K.pallets) put(p, [['wood', box(1.2, 0.14, 0.8, 0, 0.07, 0)], ['bag', box(0.95, 0.85, 0.75, 0, 0.57, 0)], ['bag', box(0.7, 0.08, 0.5, 0, 1.03, 0)]], [0.65, 0.45]);
  for (const t of K.tarps) put(t, [['blue', box(1.6, 0.35, 1.1, 0, 0.17, 0).rotateY(0.3)], ['blue', box(1.0, 0.3, 0.8, 0.2, 0.45, 0.1)]], [0.9, 0.7]);
  // a wheelbarrow, a site switchboard
  put(K.barrow, [['green', box(0.65, 0.3, 0.95, 0, 0.62, 0)], ['dark', wheel(0.2, 0.08, 0, 0.2, 0.62)], ['grey', box(0.05, 0.05, 1.4, -0.28, 0.5, -0.2)], ['grey', box(0.05, 0.05, 1.4, 0.28, 0.5, -0.2)]]);
  put(K.switchboard, [['grey', box(0.8, 1.25, 0.45, 0, 0.62, 0)], ['skip', box(0.82, 0.08, 0.47, 0, 1.28, 0)]], [0.45, 0.28]);
  // a green hose snaking from the hut over the deck
  lists.green.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(K.hose.map(([x, z]) => new THREE.Vector3(x, 0.035, z))), 80, 0.022, 6));
  const clean = (g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const a of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(a)) n.deleteAttribute(a);
    return n;
  };
  for (const [k, list] of Object.entries(lists)) {
    if (!list.length) continue;
    const o = new THREE.Mesh(mergeGeometries(list.map(clean)), mats[k]);
    o.castShadow = o.receiveShadow = true;
    group.add(o);
  }
  // young maples (thin trunks, small crowns; coloured by the season like the other trees)
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.09, 1, 6).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0x5b4a3a, roughness: 0.9 }), K.maples.length);
  const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true }), K.maples.length);
  const seeds = K.maples.map(([x, z, h], i) => {
    const y = groundY(x, z);
    trunks.setMatrixAt(i, mtx.compose(mid.set(x, y, z), qq.identity(), scl.set(1, h * 0.55, 1)));
    return { pos: new THREE.Vector3(x, y + h * 0.65, z), rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, i * 1.7, 0)), scale: new THREE.Vector3(h * 0.3, h * 0.38, h * 0.3), r1: 0.2 + 0.15 * (i % 3), r2: 0.6, r3: 0.5, r4: 1 };
  });
  const col = new THREE.Color(0x9bbf4a);
  seeds.forEach((sd, i) => { crowns.setMatrixAt(i, mtx.compose(sd.pos, sd.rot, sd.scale)); crowns.setColorAt(i, col); });
  registerTrees(crowns, seeds);
  trunks.castShadow = crowns.castShadow = true;
  group.add(trunks, crowns);
  return segs;
}

/** The whole site as one group (hidden until world.setConstruction(true)) and its collision segments. */
export function buildConstruction() {
  const group = new THREE.Group();
  group.name = 'construction';
  const out = { tubes: [], decks: [], nets: [], segments: [] };
  buildScaffolding(out);
  instanceScaffold(out, group);
  boards(group);
  const segments = [...out.segments, ...fencing(group), ...barriers(group), ...machines(group), ...siteCourtyard(group)];
  group.visible = false;
  return { object: group, segments, counts: { tubes: out.tubes.length, decks: out.decks.length } };
}

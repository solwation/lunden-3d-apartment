import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SEASON } from './config.js';
import { registerSnow, registerSeasonal } from './seasons.js';
import { B, length as len, dir as d, busStopPoint, toLocal } from './busstopgeo.js';

// #1301: the bus stop "Lund Sankt Lars" (SITE.busStop; OSM platform way 189432570 + shelter node 2000527685). A generic shelter, bench, bin,
// sign and a low platform with a kerb and a tactile strip, in four merged meshes (frame and geometry: busstopgeo.js). All sizes are guesses (config).
const yaw = Math.atan2(d[0], d[1]); // a box's local z follows the kerb, its x across (= np)
/** a box (`w` across, `h` tall, `l` along) with its base at height `y` over (s, t), tinted */
const box = (w, h, l, s, t, y, color) => {
  const g = new THREE.BoxGeometry(w, h, l).toNonIndexed(); g.deleteAttribute('uv');
  g.rotateY(yaw); const [x, z] = busStopPoint(s, t); g.translate(x, y + h / 2, z);
  const c = new THREE.Color(color), a = []; for (let i = 0; i < g.attributes.position.count; i++) a.push(c.r, c.g, c.b);
  g.setAttribute('color', new THREE.Float32BufferAttribute(a, 3));
  return g;
};
const cylAt = (r, h, x, z, y, color) => {
  const g = new THREE.CylinderGeometry(r, r, h, 10).toNonIndexed(); g.deleteAttribute('uv'); g.translate(x, y + h / 2, z);
  const c = new THREE.Color(color), a = []; for (let i = 0; i < g.attributes.position.count; i++) a.push(c.r, c.g, c.b);
  g.setAttribute('color', new THREE.Float32BufferAttribute(a, 3));
  return g;
};
const cyl = (r, h, s, t, y, color) => cylAt(r, h, ...busStopPoint(s, t), y, color);
/** a ground-following strip s0..s1 × t0..t1 at `lift` over the ground, tinted (1 m pieces) */
const strip = (ground, s0, s1, t0, t1, lift, color) => {
  const pos = [], n = Math.max(1, Math.ceil((s1 - s0) / 1));
  const v = (s, t) => { const [x, z] = busStopPoint(s, t); return [x, ground(x, z) + lift, z]; };
  for (let k = 0; k < n; k++) {
    const a = s0 + ((s1 - s0) * k) / n, b = s0 + ((s1 - s0) * (k + 1)) / n, p = [v(a, t0), v(a, t1), v(b, t0), v(b, t1)];
    pos.push(...p[0], ...p[2], ...p[1], ...p[1], ...p[2], ...p[3]);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  const nr = g.attributes.normal; for (let i = 0; i < nr.count; i += 3) if (nr.getY(i) < 0) { // winding follows np/d: make every face point up
    const p = g.attributes.position, x = p.getX(i + 1), y = p.getY(i + 1), z = p.getZ(i + 1); p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)); p.setXYZ(i + 2, x, y, z);
  }
  g.computeVertexNormals();
  const c = new THREE.Color(color), a = []; for (let i = 0; i < g.attributes.position.count; i++) a.push(c.r, c.g, c.b);
  g.setAttribute('color', new THREE.Float32BufferAttribute(a, 3));
  return g;
};
const signTexture = () => {
  const S = B.sign, c = document.createElement('canvas'); c.width = 256; c.height = 180;
  const g = c.getContext('2d'), w = 128, h = c.height; // left half: the stop sign
  g.fillStyle = S.colors.bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = S.colors.fg; g.lineWidth = 4; g.strokeRect(5, 5, w - 10, h - 10);
  g.fillStyle = S.colors.accent; g.beginPath(); g.arc(w / 2, h * 0.34, w * 0.34, 0, 7); g.fill(); // a generic bus pictogram on a yellow disc
  g.fillStyle = S.colors.bg; g.fillRect(w * 0.27, h * 0.22, w * 0.46, h * 0.22);
  g.fillStyle = S.colors.accent; g.fillRect(w * 0.3, h * 0.25, w * 0.4, h * 0.07);
  g.beginPath(); g.arc(w * 0.36, h * 0.46, 6, 0, 7); g.arc(w * 0.64, h * 0.46, 6, 0, 7); g.fillStyle = S.colors.bg; g.fill();
  g.fillStyle = S.colors.fg; g.textAlign = 'center'; g.font = 'bold 19px sans-serif'; g.fillText(S.name, w / 2, h * 0.74);
  g.font = 'bold 30px sans-serif'; g.fillText('A', w / 2, h * 0.9);
  const Y = B.cycleSign; // right half, top: the cycle route's direction sign (128 x 64), blue with white text, a bicycle and an arrow
  g.fillStyle = Y.color; g.fillRect(128, 0, 128, 64); g.strokeStyle = '#fff'; g.lineWidth = 3; g.strokeRect(133, 5, 118, 54);
  g.fillStyle = '#fff'; g.textAlign = 'left'; g.font = 'bold 22px sans-serif'; g.fillText(Y.text, 140, 28);
  g.strokeStyle = '#fff'; g.lineWidth = 2.5; for (const cx of [146, 172]) { g.beginPath(); g.arc(cx, 46, 6, 0, 7); g.stroke(); } // the bicycle: two wheels, a frame
  g.beginPath(); g.moveTo(146, 46); g.lineTo(156, 36); g.lineTo(166, 36); g.lineTo(172, 46); g.moveTo(156, 36); g.lineTo(160, 46); g.lineTo(172, 46); g.stroke();
  g.beginPath(); g.moveTo(205, 46); g.lineTo(240, 46); g.lineTo(230, 36); g.moveTo(240, 46); g.lineTo(230, 56); g.stroke(); // the arrow (to the right)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
};

/** The bus stop as one group: platform (+ kerb, tactile strip), furniture (shelter frame, roof, bench, bin, pole), glass, sign faces. `ground(x, z)` = the rendered terrain. */
export function buildBusStop(ground) {
  const group = new THREE.Group(); group.name = 'bus-stop';
  const C = B.colors, Sh = B.shelter;
  // platform: surface, kerb stones along the road edge, tactile strip (OSM tactile_paving=yes) — one vertex-coloured batch
  const tac = B.tactile, [ts] = toLocal(35.59, 192.31); // the tactile_paving node 2000527695
  const plat = [strip(ground, 0, len, 0, B.width, B.lift, C.paving), strip(ground, Math.max(0, ts - tac.len / 2), Math.min(len, ts + tac.len / 2), tac.from, tac.from + tac.w, B.lift + 0.004, tac.color)];
  for (let a = 0; a < len; a += 3) { const l = Math.min(3, len - a), [kx, kz] = busStopPoint(a + l / 2, B.kerbW / 2); plat.push(box(B.kerbW, B.kerbH, l + 0.01, a + l / 2, B.kerbW / 2, ground(kx, kz), C.kerb)); } // 3 m stones, each level on the ground under its middle
  const platMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.92 }); registerSnow(platMat, SEASON.snow.paving);
  registerSeasonal((month) => { const colored = !SEASON.snowMonths.includes(month); if (platMat.vertexColors !== colored) { platMat.vertexColors = colored; platMat.needsUpdate = true; } });
  const platMesh = new THREE.Mesh(mergeGeometries(plat), platMat); platMesh.name = 'bus-stop-platform'; platMesh.receiveShadow = true; group.add(platMesh);
  // furniture
  const [cs, ct] = toLocal(...Sh.at), y0 = ground(...Sh.at) + B.lift, f = [];
  const dy = Sh.glassY, post = Sh.post, hl = Sh.len / 2, hd = Sh.depth / 2;
  for (const ss of [-1, 1]) for (const tt of [-1, 1]) f.push(box(post, Sh.h, post, cs + ss * hl, ct + tt * hd, y0, C.steel));
  f.push(box(Sh.depth + 0.3, Sh.roof, Sh.len + 0.4, cs, ct, y0 + Sh.h, C.steel)); // flat roof with a small overhang
  const bn = Sh.bench; f.push(box(bn.depth, 0.05, bn.len, cs, ct + hd - bn.depth / 2 - 0.05, y0 + bn.h - 0.05, C.wood), box(0.04, 0.3, bn.len, cs, ct + hd - 0.09, y0 + bn.h, C.wood));
  for (const ss of [-1, 1]) f.push(box(0.05, bn.h - 0.05, 0.05, cs + ss * (bn.len / 2 - 0.1), ct + hd - bn.depth / 2 - 0.05, y0, C.steel));
  const bin = B.bin, [bx, bz] = busStopPoint(bin.s, bin.t); f.push(cyl(bin.r, bin.h, bin.s, bin.t, ground(bx, bz) + B.lift, C.bin));
  const S = B.sign, [sx, sz] = busStopPoint(S.s, S.t), sy = ground(sx, sz) + B.lift;
  f.push(cyl(0.035, S.h, S.s, S.t, sy, C.steel));
  const Yc = B.cycleSign; f.push(cylAt(0.03, Yc.h, Yc.at[0], Yc.at[1], ground(...Yc.at) + B.lift, C.steel)); // the cycle sign's pole
  const furn = new THREE.Mesh(mergeGeometries(f), new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.6, metalness: 0.2 })); furn.name = 'bus-stop-furniture'; furn.castShadow = furn.receiveShadow = true; group.add(furn);
  // glass: back and the two ends (the open front faces the road)
  const gl = [], gh = dy[1] - dy[0];
  const pane = (w, s, t, rot) => { const g = new THREE.PlaneGeometry(w, gh).rotateY(rot + yaw); const [x, z] = busStopPoint(s, t); return g.translate(x, y0 + dy[0] + gh / 2, z); };
  gl.push(pane(Sh.len - post, cs, ct + hd, Math.PI / 2), pane(Sh.depth - post, cs - hl, ct, 0), pane(Sh.depth - post, cs + hl, ct, 0));
  const glass = new THREE.Mesh(mergeGeometries(gl.map((g) => g.toNonIndexed())), new THREE.MeshStandardMaterial({ color: C.glass, transparent: true, opacity: 0.3, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false }));
  glass.name = 'bus-stop-glass'; group.add(glass);
  // the stop sign: a panel on the pole, facing along the kerb both ways
  const tex = signTexture(), faces = [], Y = B.cycleSign;
  const face = (w, h, rot, x, y, z, u0, u1, v0, v1) => { const g = new THREE.PlaneGeometry(w, h).rotateY(rot), uv = g.attributes.uv; // a face on the shared sign atlas
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
    return g.translate(x + Math.sin(rot) * 0.04, y, z + Math.cos(rot) * 0.04); };
  for (const back of [0, Math.PI]) faces.push(face(S.panel[0], S.panel[1], back + yaw, sx, sy + S.h - S.panel[1] / 2 - 0.05, sz, 0, 0.5, 0, 1));
  const [cx, cz] = Y.at, cy = ground(cx, cz) + B.lift, ry = THREE.MathUtils.degToRad(Y.yaw); // the cycle sign: its own pole at the route, a panel facing the riders coming from the stop
  for (const back of [0, Math.PI]) faces.push(face(Y.panel[0], Y.panel[1], back + ry, cx, cy + Y.h - Y.panel[1] / 2 - 0.05, cz, 0.5, 1, 1 - 64 / 180, 1));
  const sign = new THREE.Mesh(mergeGeometries(faces), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 })); sign.name = 'bus-stop-sign'; group.add(sign);
  return group;
}

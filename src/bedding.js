import * as THREE from 'three';

// Bedding shapes shared by every bed (#308, #309): pillows and duvets / bedspreads.

/**
 * A real pillow (#308): a closed, stuffed case `w` (local x) × `d` (local z), `h` high in the middle. The outline is a
 * rectangle whose sides are pulled in a little by the filling (`pinch`), so the corners stick out as soft ears; the
 * height follows h × (1 − |u|^p)(1 − |v|^p) (full in the middle, thin at the seams) plus a few low bumps. The top
 * takes (1 − `under`) of it, the bottom the rest (it presses into what it lies on). `base(x, z)` lifts the whole
 * pillow onto something that is not flat (a pillow on a pillow, the edge drooping over the mattress); `dent` =
 * { x, z, r, depth } a hollow where a head has been. UVs are planar metres (x, z), so a print keeps its scale.
 * `uv` = metres per texture repeat; `unitUV`: UVs 0…1 over the face instead (a cushion with a picture on it; v up towards −z).
 * `geo.userData.top(x, z)` gives the top's height at a local point (no pinch), for stacking things on it.
 */
export function pillow(w, d, h, o = {}) {
  const n = o.seg ?? 14, p = o.p ?? 3.2, pinch = o.pinch ?? 0.05, under = o.under ?? 0.3;
  const base = o.base ?? (() => 0), dent = o.dent;
  let s = o.seed ?? 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const bumps = [...Array(4)].map(() => [rnd() * 6.28, rnd() * 6.28, 1.5 + rnd() * 2.5, 1.5 + rnd() * 2.5, (rnd() - 0.5) * 0.12 * h]);
  const fill = (u, v) => (1 - Math.abs(u) ** p) * (1 - Math.abs(v) ** p);
  const rise = (x, z, f) => {
    let y = 0;
    for (const [a, b, fx, fz, amp] of bumps) y += amp * Math.sin(a + (x / w) * fx * 3.14) * Math.sin(b + (z / d) * fz * 3.14);
    if (dent) y -= dent.depth * Math.exp(-((x - dent.x) ** 2 + (z - dent.z) ** 2) / (dent.r * dent.r));
    return (h * (1 - under) + y) * f;
  };
  const top = (x, z) => {
    const u = Math.max(-1, Math.min(1, x / (w / 2))), v = Math.max(-1, Math.min(1, z / (d / 2)));
    return base(x, z) + rise(x, z, fill(u, v));
  };
  // vertices bunched towards the seams, where the shape bends most
  const t = (k) => Math.sin((-1 + (2 * k) / n) * Math.PI / 2);
  const pos = [], uv = [], idx = [], topI = [], botI = [];
  const vert = (x, y, z) => { pos.push(x, y, z); if (o.unitUV) uv.push(0.5 + x / w, 0.5 - z / d); else uv.push(x / (o.uv ?? 1), z / (o.uv ?? 1)); return pos.length / 3 - 1; };
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const u = t(i), v = t(j);
    const x = u * (w / 2) * (1 - pinch * (1 - v * v)), z = v * (d / 2) * (1 - pinch * 0.7 * (1 - u * u));
    const f = fill(u, v), b = base(x, z), k = j * (n + 1) + i;
    topI[k] = vert(x, b + rise(x, z, f), z);
    const seam = i === 0 || j === 0 || i === n || j === n;
    botI[k] = seam ? topI[k] : vert(x, b - h * under * f, z);
  }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, e = c + 1;
    idx.push(topI[a], topI[c], topI[b], topI[b], topI[c], topI[e]);
    idx.push(botI[a], botI[b], botI[c], botI[b], botI[e], botI[c]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.userData.top = top;
  return geo;
}

/**
 * A duvet or bedspread (#309): a thick, soft shell `th` thick lying on a mattress `w` wide (local x, centred) whose
 * top edges are rounded with radius `r`; the cloth runs `l` along z (centred) and hangs `dropL` / `dropR` over the −x /
 * +x sides with a slight `flare` at the hem. The top is gently uneven (low bumps of `bump` m, more crumpled within
 * `crumple` m of the head end, −z); every edge is a rounded seam (the shell's two faces meet). `quilt` = stitched
 * channels across, that far apart; `extentL` ends the cloth on top that far left of the middle (a throw across the
 * foot end). y 0 = the mattress top. UVs are metres along the cloth (÷ `uv`), so a print never
 * stretches over the drape.
 */
export function duvet(w, l, th, o = {}) {
  const r = o.r ?? 0.05, flare = o.flare ?? 0.03, bump = o.bump ?? 0.005, crumple = o.crumple ?? 0.35;
  const dropL = o.dropL ?? o.drop ?? 0.15, dropR = o.dropR ?? o.drop ?? 0.15, uvs = o.uv ?? 1, quilt = o.quilt;
  const R = r + th / 2, a = w / 2 - r, arc = (R * Math.PI) / 2, e = th / 2;
  let s = o.seed ?? 5;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const bumps = [...Array(5)].map(() => [rnd() * 6.28, rnd() * 6.28, 2 + rnd() * 5, 2 + rnd() * 5, 0.5 + rnd()]);
  // the cloth's length across from the middle to each hem (arc length): flat, round the edge, hanging
  const side = (drop) => a + (drop > r ? arc + drop - r : (drop / r) * arc);
  const SL = o.extentL ?? side(dropL), SR = side(dropR); // `extentL`: the cloth ends on top, that far left of the middle
  // samples across: dense round the edges and in the seams
  const across = (S, drop) => {
    const ks = [];
    for (let k = 0; k <= 6; k++) ks.push((a * k) / 6);
    const arcEnd = Math.min(S, a + arc);
    if (arcEnd > a + 1e-4) for (let k = 1; k <= 4; k++) ks.push(a + ((arcEnd - a) * k) / 4);
    if (S > a + arc) for (let k = 1; k <= 3; k++) ks.push(a + arc + ((S - a - arc) * k) / 3);
    const out = ks.filter((v) => v < S - e);
    for (const q of [1, 0.4, 0]) out.push(S - e * q);
    return out;
  };
  const xs = [...across(SL, dropL).map((v) => -v).reverse(), ...across(SR, dropR).slice(1)];
  const zs = [];
  const nz = Math.max(8, Math.round(l / (quilt ? quilt / 3 : 0.1)));
  for (let k = 0; k <= nz; k++) zs.push(-l / 2 + e + ((l - 2 * e) * k) / nz);
  zs.unshift(-l / 2, -l / 2 + e * 0.4);
  zs.push(l / 2 - e * 0.4, l / 2);
  // the centre line of the shell at arc length t (signed) → [x, y, nx, ny]
  const section = (t) => {
    const sg = Math.sign(t) || 1, u = Math.abs(t);
    if (u <= a) return [t, th / 2, 0, 1];
    if (u <= a + arc) {
      const f = (u - a) / R;
      return [sg * (a + R * Math.sin(f)), -r + R * Math.cos(f), sg * Math.sin(f), Math.cos(f)];
    }
    const d = u - a - arc, drop = sg < 0 ? dropL : dropR;
    return [sg * (a + R + flare * (d / Math.max(drop, 0.01)) ** 2), -r - d, sg, 0];
  };
  const cap = (dist) => (dist >= e ? 1 : Math.sqrt(Math.max(0, 1 - ((e - dist) / e) ** 2)));
  const pos = [], uv = [], idx = [];
  const nx = xs.length, nzs = zs.length, topI = [], botI = [];
  for (let j = 0; j < nzs; j++) for (let i = 0; i < nx; i++) {
    const t = xs[i], z = zs[j];
    const [x, y, ox, oy] = section(t);
    const S = t < 0 ? SL : SR;
    let half = (th / 2) * cap(S - Math.abs(t)) * cap(l / 2 - Math.abs(z));
    if (quilt) half *= 0.6 + 0.4 * Math.abs(Math.sin((Math.PI * (z + l / 2)) / quilt));
    // low bumps, more near the head end; weaker down the drape
    const onTop = Math.abs(t) < a ? 1 : 0.4;
    let h = 0;
    for (const [p, q, fx, fz, amp] of bumps) h += amp * Math.sin(p + x * fx) * Math.sin(q + z * fz);
    const near = crumple > 0 ? Math.max(0, 1 - (z + l / 2) / crumple) : 0;
    h *= bump * onTop * (1 + 1.5 * near);
    const k = j * nx + i;
    pos.push(x + ox * half, y + h + oy * half, z); uv.push(t / uvs, z / uvs);
    topI[k] = pos.length / 3 - 1;
    const seam = i === 0 || i === nx - 1 || j === 0 || j === nzs - 1;
    if (seam) botI[k] = topI[k];
    else { pos.push(x - ox * half, y + h - oy * half, z); uv.push(t / uvs, z / uvs); botI[k] = pos.length / 3 - 1; }
  }
  for (let j = 0; j < nzs - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const p = j * nx + i, b = p + 1, c = p + nx, d = c + 1;
    idx.push(topI[p], topI[c], topI[b], topI[b], topI[c], topI[d]);
    idx.push(botI[p], botI[b], botI[c], botI[b], botI[d], botI[c]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

import * as THREE from 'three';

// Bedding shapes shared by every bed (#308, #309).

/**
 * A real pillow (#308): a closed, stuffed case `w` (local x) × `d` (local z), `h` high in the middle. The outline is a
 * rectangle whose sides are pulled in a little by the filling (`pinch`), so the corners stick out as soft ears; the
 * height follows h × (1 − |u|^p)(1 − |v|^p) (full in the middle, thin at the seams) plus a few low bumps. The top
 * takes (1 − `under`) of it, the bottom the rest (it presses into what it lies on). `base(x, z)` lifts the whole
 * pillow onto something that is not flat (a pillow on a pillow, the edge drooping over the mattress); `dent` =
 * { x, z, r, depth } a hollow where a head has been. UVs are planar metres (x, z), so a print keeps its scale.
 * `geo.userData.top(x, z)` gives the top's height at a local point (no pinch), for stacking things on it.
 */
export function pillow(w, d, h, o = {}) {
  const n = o.seg ?? 18, p = o.p ?? 3.2, pinch = o.pinch ?? 0.05, under = o.under ?? 0.3;
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
  const vert = (x, y, z) => { pos.push(x, y, z); uv.push(x, z); return pos.length / 3 - 1; };
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

import * as THREE from 'three';

// Light pools without lights (#434, #433): soft additive decals that make outdoor lamps light the ground (and a façade)
// at night. One merged mesh per kind, one material; no PointLight (CLAUDE.md: the light count stays constant). The
// pools are draped over the terrain (`groundY`), so they lie on slopes and on snow too; the material's opacity fades
// them in and out (hidden at 0).

let tex = null;
/** A radial fall-off: white in the middle, smooth to black at the rim (rgb; additive, so black adds nothing). */
function falloff() {
  if (tex) return tex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (let i = 0; i <= 10; i++) { const t = i / 10, v = Math.round(255 * (1 - t) ** 1.5); grad.addColorStop(t, `rgb(${v},${v},${v})`); }
  g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  tex = new THREE.CanvasTexture(c); // linear data (no sRGB decode: that would steepen the fall-off)
  return tex;
}

/** The additive material for a set of pools / washes (colour × the fall-off × opacity). */
export function glowMaterial(color) {
  return new THREE.MeshBasicMaterial({ map: falloff(), color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
}

/** Additive outdoor glows should vanish into scene fog instead of adding the fog colour at full alpha. */
export function fadeGlowWithFog(material) {
  material.fog = true;
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    const fog = '#include <fog_fragment>';
    if (!shader.fragmentShader.includes(fog)) throw new Error('Glow material has no fog fragment');
    shader.fragmentShader = shader.fragmentShader.replace(fog, `${fog}\n#ifdef USE_FOG\n  gl_FragColor.a *= 1.0 - fogFactor;\n#endif`);
  };
  material.customProgramCacheKey = () => 'ground-glow-fade-with-fog-v1';
  return material;
}

/** A pool on the ground: an ellipse round (cx, cz), `ra` m along (ax, az) and `rb` m across it, its vertices
 * `lift` m over `groundY`. Polar grid (rings × segments), uvs for the fall-off; non-indexed position + uv. */
export function poolGeometry(cx, cz, ax, az, ra, rb, groundY, { lift = 0.05, rings = 8, segs = 28 } = {}) {
  const l = Math.hypot(ax, az) || 1, ux = ax / l, uz = az / l; // along; across = (−uz, ux)
  const pos = [], uv = [];
  const vert = (r, a) => {
    const ca = Math.cos(a) * r, sa = Math.sin(a) * r;
    const x = cx + ux * ca * ra - uz * sa * rb, z = cz + uz * ca * ra + ux * sa * rb;
    pos.push(x, groundY(x, z) + lift, z); uv.push(0.5 + ca * 0.5, 0.5 + sa * 0.5);
  };
  for (let i = 0; i < rings; i++) {
    const r0 = i / rings, r1 = (i + 1) / rings;
    for (let j = 0; j < segs; j++) {
      const a0 = (j / segs) * Math.PI * 2, a1 = ((j + 1) / segs) * Math.PI * 2;
      // two triangles (one at the centre), counter-clockwise seen from above
      vert(r0, a0); vert(r1, a1); vert(r1, a0);
      if (i > 0) { vert(r0, a0); vert(r0, a1); vert(r1, a1); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/** A wash on a wall facing `nx, nz` (unit, out of the wall): an upright ellipse `w` × `h` m centred at (x, y, z),
 * `off` m in front of the wall. Non-indexed position + uv.
 * #1092: `holes` — openings in that wall ({ x0, x1, y0, y1 } and optionally z0 / z1, else the wash's z), left out of
 * the quad so the glow lights the brick / render around a window or door, never its glass: the quad is cut into
 * rectangles round them (the same fall-off uvs, so the glow's shape is unchanged elsewhere). */
export function washGeometry(x, y, z, nx, nz, w, h, off = 0.012, holes = []) {
  // along the wall (the plane's local x after rotateY(atan2(nx, nz))): (nz, −nx); a hole as [u0, u1, v0, v1] from the centre
  const along = (px, pz) => (px - x) * nz - (pz - z) * nx, hw = w / 2, hh = h / 2;
  const cut = holes.map((o) => {
    const a = along(o.x0, o.z0 ?? z), b = along(o.x1, o.z1 ?? z);
    return [Math.max(-hw, Math.min(a, b)), Math.min(hw, Math.max(a, b)), Math.max(-hh, o.y0 - y), Math.min(hh, o.y1 - y)];
  }).filter(([u0, u1, v0, v1]) => u1 > u0 + 1e-4 && v1 > v0 + 1e-4);
  if (!cut.length) {
    const g = new THREE.PlaneGeometry(w, h, 1, 1).toNonIndexed();
    g.deleteAttribute('normal');
    g.rotateY(Math.atan2(nx, nz)).translate(x + nx * off, y, z + nz * off);
    return g;
  }
  // a grid on the holes' edges; each row's cells outside every hole, merged into runs, become two triangles each
  // (counter-clockwise seen from the front, like the plane's)
  const edges = (i, lo, hi) => [...new Set([lo, hi, ...cut.flatMap((c) => [c[i], c[i + 1]])])].sort((p, q) => p - q);
  const us = edges(0, -hw, hw), vs = edges(2, -hh, hh), pos = [], uv = [];
  const vert = (u, v) => { pos.push(x + nx * off + nz * u, y + v, z + nz * off - nx * u); uv.push(u / w + 0.5, v / h + 0.5); };
  for (let j = 0; j + 1 < vs.length; j++) {
    const v0 = vs[j], v1 = vs[j + 1], vm = (v0 + v1) / 2;
    const free = (k) => { const um = (us[k] + us[k + 1]) / 2; return !cut.some(([a, b, c, d]) => um > a && um < b && vm > c && vm < d); };
    for (let i = 0; i + 1 < us.length;) {
      if (!free(i)) { i++; continue; }
      let k = i;
      while (k + 2 < us.length && free(k + 1)) k++;
      const u0 = us[i], u1 = us[k + 1];
      vert(u0, v0); vert(u1, v0); vert(u1, v1); vert(u0, v0); vert(u1, v1); vert(u0, v1);
      i = k + 1;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/** Fades a glow material towards `on` over `fade` s; hidden when fully off. Returns the new level 0…1. */
export function fadeGlow(mesh, level, on, dt, fade, peak) {
  level = THREE.MathUtils.clamp(level + (on ? 1 : -1) * dt / fade, 0, 1);
  mesh.material.opacity = level * peak;
  mesh.visible = level > 0;
  return level;
}

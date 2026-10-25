import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PLAYROOM as R } from './config.js';
import { freeCanvasAfterUpload } from './lowmemory.js';
import { posterDesigns, neonSignCell } from './posterdesigns.js';
import { POSTER_WALLS, posterLayout } from './posterlayout.js';

// #1574: the playhouse's own posters, neon runs, neon signs, pub pendants and wall lamps. One canvas atlas, one unlit vertex-coloured mesh (a single extra
// draw, no light source), hidden with the room's group. Every placement comes from PLAYROOM.posters (*guess*); the layout is pure so tools/ can check it.

const P = R.posters, PANEL = 0xfff6dc; // (the same warm white as the sign atlas's panel swatch)
const cellUV = (g, x, y, w, h, [aw, ah]) => { // map a plane's 0..1 uv onto the atlas rectangle (x, y, w, h in px, y down)
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (x + uv.getX(i) * w) / aw, 1 - (y + (1 - uv.getY(i)) * h) / ah);
};
const rotation = (wall) => { const W = POSTER_WALLS[wall]; return W.axis === 'x' ? (W.n > 0 ? 0 : Math.PI) : (W.n > 0 ? Math.PI / 2 : -Math.PI / 2); };
const tintGeometry = (g, colour) => {
  const c = colour?.isColor ? colour : new THREE.Color(colour), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(a, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
};
const flip = (g) => { const a = g.index ? g.toNonIndexed() : g, p = a.attributes; for (const k of Object.keys(p)) { const s = p[k].itemSize, arr = p[k].array; for (let i = 0; i < p[k].count; i += 3) for (let j = 0; j < s; j++) { const x = arr[(i + 1) * s + j]; arr[(i + 1) * s + j] = arr[(i + 2) * s + j]; arr[(i + 2) * s + j] = x; } } return a; };

/** Builds the mesh (the group's child) and returns it with the layout it came from. */
export function roomPosters() {
  const [AW, AH] = P.atlas, [cw, ch] = P.cell, layout = posterLayout();
  const canvas = document.createElement('canvas'); canvas.width = AW; canvas.height = AH;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#10121a'; ctx.fillRect(0, 0, AW, AH);
  posterDesigns().forEach((draw, i) => {
    ctx.save(); ctx.translate((i % P.cols) * cw, Math.floor(i / P.cols) * ch); ctx.beginPath(); ctx.rect(0, 0, cw, ch); ctx.clip(); ctx.scale(cw / 192, ch / 256); draw(ctx); ctx.restore();
  });
  const stripY = AH - P.sign[1];
  for (const [i, name] of Object.keys(P.neon.signs).entries()) { ctx.save(); ctx.translate(i * P.sign[0], stripY); ctx.beginPath(); ctx.rect(0, 0, P.sign[0], P.sign[1]); ctx.clip(); neonSignCell(ctx, name, P.sign); ctx.restore(); }
  const SW = 16; ctx.fillStyle = '#fff'; ctx.fillRect(AW - SW, AH - SW, SW, SW); // a solid white swatch: emissive runs, lamps and shades take their colour from the vertices
  const swatch = (g) => { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, 1 - SW / 2 / AW, SW / 2 / AH); return g; };
  const geos = [], meta = [], box = (rect, colour, kind = 'lamp', zone) => {
    const g = new THREE.BoxGeometry(rect.x1 - rect.x0, rect.y1 - rect.y0, rect.z1 - rect.z0).translate((rect.x0 + rect.x1) / 2, (rect.y0 + rect.y1) / 2, (rect.z0 + rect.z1) / 2);
    const t = tintGeometry(swatch(g.toNonIndexed()), colour).translate(R.x, 0, R.z); geos.push(t); meta.push({ kind, zone, base: new THREE.Color(colour), n: t.attributes.position.count });
  };
  const quad = (wall, rect, uvRect, tint, zone) => {
    const W = POSTER_WALLS[wall], x = W.axis === 'x', along = x ? rect.x1 - rect.x0 : rect.z1 - rect.z0, face = W.n > 0 ? (x ? rect.z1 : rect.x1) : (x ? rect.z0 : rect.x0); // (the outer face of the thin slab)
    const g = new THREE.PlaneGeometry(along, rect.y1 - rect.y0).rotateY(rotation(wall));
    g.translate(x ? (rect.x0 + rect.x1) / 2 : face, (rect.y0 + rect.y1) / 2, x ? face : (rect.z0 + rect.z1) / 2);
    cellUV(g, ...uvRect, P.atlas); const t = tintGeometry(g.toNonIndexed(), tint).translate(R.x, 0, R.z); geos.push(t); meta.push({ kind: zone ? 'poster' : 'lamp', zone, base: new THREE.Color(0xffffff), n: t.attributes.position.count });
  };
  for (const p of layout.posters) quad(p.wall, p.rect, [(p.design % P.cols) * cw, Math.floor(p.design / P.cols) * ch, cw, ch], new THREE.Color(0xffffff), POSTER_WALLS[p.wall].zone);
  layout.signs.forEach((s, i) => quad(s.wall, s.rect, [i * P.sign[0], stripY, P.sign[0], P.sign[1]], new THREE.Color(0xffffff)));
  for (const r of layout.runs) box(r.rect, r.color);
  for (const p of layout.panels) box(p.rect, PANEL, 'panel', p.zone);
  // pendants: a cord, a green shade with a brass rim and a glowing warm underside (the shade seen from below is the inside, so its inner face is drawn warm)
  const D = P.pendants;
  for (const p of layout.pendants) {
    const cy = D.bottom + D.h / 2, cord = new THREE.CylinderGeometry(D.cord, D.cord, R.ceiling - D.bottom - D.h, 5, 1, true).translate(0, (R.ceiling + D.bottom + D.h) / 2, 0);
    const shade = new THREE.CylinderGeometry(D.rTop, D.rBottom, D.h, 18, 1, true).translate(0, cy, 0), inner = flip(new THREE.CylinderGeometry(D.rTop * .96, D.rBottom * .96, D.h * .98, 18, 1, true).translate(0, cy, 0));
    const rim = new THREE.CylinderGeometry(D.rBottom * 1.02, D.rBottom * 1.02, .02, 18, 1, true).translate(0, D.bottom + .01, 0), bulb = new THREE.CircleGeometry(D.rBottom * .8, 16).rotateX(Math.PI / 2).translate(0, D.bottom + D.h * .25, 0);
    for (const [g, c] of [[cord, 0x222222], [shade, D.shade], [inner, D.glow], [rim, D.rim], [bulb, 0xffffff]]) { const t = tintGeometry(swatch(g.toNonIndexed()), c).translate(R.x + p.x, 0, R.z + p.z); geos.push(t); meta.push({ kind: 'lamp', n: t.attributes.position.count }); }
  }
  // warm wall lamps: a dark back plate and the glowing shade
  const L = P.sconces;
  for (const s of layout.sconces) {
    const r = s.rect, W = POSTER_WALLS[s.wall], plate = { ...r }; // the shade is the whole rect; the plate is a thin slab behind it
    if (W.axis === 'x') { plate.z0 = Math.min(W.plane, W.plane + W.n * .02); plate.z1 = Math.max(W.plane, W.plane + W.n * .02); } else { plate.x0 = Math.min(W.plane, W.plane + W.n * .02); plate.x1 = Math.max(W.plane, W.plane + W.n * .02); }
    const grow = { x0: plate.x0 - (W.axis === 'x' ? .02 : 0), x1: plate.x1 + (W.axis === 'x' ? .02 : 0), y0: plate.y0 - .02, y1: plate.y1 + .02, z0: plate.z0 - (W.axis === 'z' ? .02 : 0), z1: plate.z1 + (W.axis === 'z' ? .02 : 0) };
    box(grow, 0x2a211b);
    const sh = { ...r }; if (W.axis === 'x') { if (W.n > 0) sh.z0 = W.plane + .02; else sh.z1 = W.plane - .02; } else if (W.n > 0) sh.x0 = W.plane + .02; else sh.x1 = W.plane - .02;
    box(sh, L.lit);
  }
  const mesh = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshBasicMaterial({ map: freeCanvasAfterUpload(Object.assign(new THREE.CanvasTexture(canvas), { colorSpace: THREE.SRGBColorSpace, anisotropy: 4 })), vertexColors: true, toneMapped: false }));
  mesh.name = 'playroom-posters'; mesh.matrixAutoUpdate = false; geos.forEach((g) => g.dispose());
  // DynamicDraw/keepCpu: setLevel() rewrites the colours whenever the room's ambient changes (e.g. toggling the disco
  // light), so the phone profile must not free them after upload; a freed array threw in render → blue screen (#1560, #1595).
  mesh.geometry.attributes.color.setUsage(THREE.DynamicDrawUsage);
  mesh.geometry.userData.keepCpu = true;
  // Posters follow the room's ambient light and the ceiling panels the zone's panel level (rewritten vertex colours, only when the level changes); neon and lamps keep their glow.
  const colours = mesh.geometry.attributes.color, panelLevel = { biljard: R.zones.panel[1], spel: R.zones.panel[2] };
  let last = NaN;
  /** `ambient` = the room's current ambient relative to its normal level (playroom.lit / PLAYROOM.lit). */
  const setLevel = (ambient) => {
    if (ambient === last) return; last = ambient;
    let i = 0; const c = new THREE.Color();
    for (const m of meta) {
      if (m.kind === 'poster') c.setScalar(P.tint[m.zone] * ambient); else if (m.kind === 'panel') c.copy(m.base).multiplyScalar(panelLevel[m.zone]); else { i += m.n; continue; }
      for (let j = 0; j < m.n; j++) colours.setXYZ(i + j, c.r, c.g, c.b);
      i += m.n;
    }
    colours.needsUpdate = true;
  };
  setLevel(1);
  /** Current brightness of the first poster and the last panel of each zone (for tests). */
  const probe = () => { let i = 0; const o = {}; for (const m of meta) { if (m.kind === 'poster' && o.poster === undefined) o.poster = colours.getX(i); if (m.kind === 'panel') o[`panel_${m.zone}`] = colours.getX(i); i += m.n; } return o; };
  return { mesh, layout, setLevel, probe };
}

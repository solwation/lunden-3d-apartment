import * as THREE from 'three';
import { LEVELS, SOFFITS, STAIR, LIGHTING } from './config.js';
import { inPoly, crosses } from './player.js';

// Movable pendants (#1106): every lamp in LIGHTING.pendants (the copper trio, the paper shade, the string lamp and any
// later style) is built by lights.js into a group of its own in world coordinates, then made a piece for Möblera om
// here. Its parts are sorted by height: what sits at the ceiling (a canopy, a hook, a ceiling plate) stays at the
// ceiling wherever the lamp goes, what hangs (the shades, bulbs, diffusers) follows the saved pose, and a cord between
// them stretches — its upper vertices go with the ceiling, its lower ones with the shade. A builder may tag a mesh
// `userData.pendant` = 'top' | 'hang' | 'cord' where the height rule would guess wrong (the string lamp's cup). The pose
// (x, y, z and a yaw) is saved like any furniture's: y is the height of the hanging part, so a layout without an entry
// keeps the lamp where config.js puts it. Its room's switch and its light stay with it; the light anchors move with it.

const P = LIGHTING.pendantMove;
const V = THREE.Vector3;

export function ceilingAt(level, x, z) {
  const s = SOFFITS.find((s) => s.level === level && x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1);
  return LEVELS[level].floor + (s ? s.height : LEVELS[level].ceiling);
}

const NAMES = { copper3: 'kopparlamporna', paper: 'papperslampan', string: 'snörlampan', silvia: 'Silvia-lampan' };

export class Pendant {
  /** spec: its LIGHTING.pendants entry; room: its lights.js Room; hold: the group its builder filled (world
   * coordinates); lamps: its pool-light anchors (lights.js moves their `pos`); world: roomMaps and wall outlines. */
  constructor(spec, room, hold, lamps, world) {
    Object.assign(this, { spec, room, lamps, world, level: spec.level });
    this.ceilHome = ceilingAt(spec.level, spec.x, spec.z);
    const top = this.ceilHome - P.band;
    hold.updateMatrixWorld(true);
    const meshes = [];
    hold.traverse((o) => { if (o.isMesh) meshes.push(o); });
    // bake each part into world coordinates and sort its vertices: 1 = goes with the ceiling
    let hangMin = Infinity, hangMax = -Infinity, topLow = this.ceilHome;
    const baked = new Map(); // (meshes sharing a geometry where they are — Silvia's two sides — keep sharing it)
    const parts = meshes.map((m) => {
      const key = m.geometry.uuid + m.matrixWorld.elements.join(), again = baked.get(key);
      const geo = again ?? m.geometry.clone().applyMatrix4(m.matrixWorld), pos = geo.attributes.position;
      baked.set(key, geo);
      geo.computeBoundingBox();
      const b = geo.boundingBox, tag = m.userData.pendant ?? (b.min.y >= top ? 'top' : b.max.y < top ? 'hang' : 'cord');
      const split = tag === 'cord' ? (m.userData.pendant ? (b.min.y + b.max.y) / 2 : top) : 0;
      const mask = new Uint8Array(pos.count);
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i), up = tag === 'top' || (tag === 'cord' && y > split);
        mask[i] = up ? 1 : 0;
        if (up) topLow = Math.min(topLow, y); else { hangMin = Math.min(hangMin, y); hangMax = Math.max(hangMax, y); }
      }
      return { m, geo, tag, mask };
    });
    // the pose's origin: above the middle of the lamp, at the top of what hangs
    this.origin = new V(spec.x, hangMax, spec.z);
    this.hangMin = hangMin - hangMax; // (≤ 0, from the origin)
    this.topDepth = this.ceilHome - topLow; // how far the ceiling fittings reach down
    const object = new THREE.Group();
    object.name = NAMES[spec.style] ?? 'taklampan';
    object.position.copy(this.origin);
    this.box = new THREE.Box2(new THREE.Vector2(Infinity, Infinity), new THREE.Vector2(-Infinity, -Infinity)); // plan extent, local
    this.parts = [];
    const moved = new Set();
    for (const { m, geo, tag, mask } of parts) {
      if (!moved.has(geo)) { geo.translate(-this.origin.x, -this.origin.y, -this.origin.z); moved.add(geo); }
      geo.computeBoundingBox();
      this.box.expandByPoint(new THREE.Vector2(geo.boundingBox.min.x, geo.boundingBox.min.z)).expandByPoint(new THREE.Vector2(geo.boundingBox.max.x, geo.boundingBox.max.z));
      m.geometry = geo;
      m.position.set(0, 0, 0); m.quaternion.identity(); m.scale.set(1, 1, 1);
      if (tag !== 'hang') m.userData.noGhost = true; // (Möblera om's preview shows what hangs)
      object.add(m);
      const part = { mesh: m, tag };
      if (tag === 'cord') Object.assign(part, { mask, base: Float32Array.from(geo.attributes.position.array) });
      this.parts.push(part);
    }
    this.offsets = lamps.map((l) => l.pos.clone().sub(this.origin));
    this.object = object;
    object.userData.pendant = this;
    const r = Math.max(-this.box.min.x, this.box.max.x, -this.box.min.y, this.box.max.y);
    this.piece = {
      id: `f-pendant-${spec.level}-${spec.x}-${spec.z}`, item: { type: 'pendant', level: spec.level, style: spec.style },
      object, level: spec.level, picture: false, name: object.name, pendant: this, radius: r,
      place: (args) => this.place(args),
      placed: () => this.fit(),
    };
  }

  /** The lowest and highest origin y at plan (x, z) with yaw `yaw` — null where it does not fit (a wall, another room,
   * the stair opening, too low a ceiling). */
  limits(x, z, yaw) {
    const level = this.level, map = this.world.roomMaps[level];
    if (map.exact(x, z) !== this.spec.room) return null;
    const c = Math.cos(yaw), s = Math.sin(yaw), g = P.wallGap, b = this.box;
    const poly = [[b.min.x - g, b.min.y - g], [b.max.x + g, b.min.y - g], [b.max.x + g, b.max.y + g], [b.min.x - g, b.max.y + g]]
      .map(([lx, lz]) => [x + c * lx + s * lz, z - s * lx + c * lz]);
    const walls = this.world.levels[level].wallSegments;
    if (walls.some((w) => inPoly(poly, w[0], w[1]) || poly.some((p, i) => crosses(...p, ...poly[(i + 1) % 4], w)))) return null;
    if (level === 0) { // no ceiling over the stair opening
      const h = STAIR.hole;
      if (poly.some(([px, pz]) => px > h.x0 && px < h.x1 && pz > h.z0 && pz < h.z1) || (x > h.x0 - g && x < h.x1 + g && z > h.z0 - g && z < h.z1 + g)) return null;
    }
    const ceil = Math.min(ceilingAt(level, x, z), ...poly.map(([px, pz]) => ceilingAt(level, px, pz)));
    const lo = LEVELS[level].floor + P.minBottom - this.hangMin, hi = ceil - this.topDepth - P.ceilingGap;
    return hi >= lo ? { lo, hi } : null;
  }

  /** Where Möblera om would put it (rearrange.js `update`): aim at the ceiling (or the floor below the spot), `lift` =
   * the height change asked for. { valid, pos, quat, lift } — lift as clamped. */
  place({ ray, camera, original, turn, lift, reach, grid }) {
    const L = LEVELS[this.level], dir = ray.direction;
    const y = dir.y > 0.02 ? L.floor + L.ceiling : L.floor;
    const at = ray.intersectPlane(new THREE.Plane(new V(0, 1, 0), -y), new V());
    const pos = new V(), q = new THREE.Quaternion(), s = new V();
    original.decompose(pos, q, s);
    q.premultiply(new THREE.Quaternion().setFromAxisAngle(new V(0, 1, 0), turn));
    if (!at || at.distanceTo(camera.position) > reach) return { valid: false };
    const x = Math.round(at.x / grid) * grid, z = Math.round(at.z / grid) * grid;
    const yaw = new THREE.Euler().setFromQuaternion(q, 'YXZ').y;
    const lim = this.limits(x, z, yaw);
    if (!lim) return { valid: false };
    const y0 = pos.y, h = Math.min(lim.hi, Math.max(lim.lo, y0 + lift));
    pos.set(x, h, z);
    return { valid: true, pos, quat: q, lift: h - y0 };
  }

  /** How high the lowest point hangs above the floor at origin y `y` (the status line). */
  bottomAt(y) { return y + this.hangMin - LEVELS[this.level].floor; }

  /** After a pose change: the ceiling fittings back at the ceiling, the cords to the shade, the light anchors along. */
  fit() {
    const o = this.object;
    o.updateMatrixWorld(true);
    const at = new V().setFromMatrixPosition(o.matrixWorld);
    const dTop = (ceilingAt(this.level, at.x, at.z) - this.ceilHome) - (at.y - this.origin.y);
    for (const p of this.parts) {
      if (p.tag === 'top') p.mesh.position.y = dTop;
      else if (p.tag === 'cord') {
        const arr = p.mesh.geometry.attributes.position.array;
        for (let i = 0; i < p.mask.length; i++) arr[i * 3 + 1] = p.base[i * 3 + 1] + (p.mask[i] ? dTop : 0);
        p.mesh.geometry.attributes.position.needsUpdate = true;
        p.mesh.geometry.computeBoundingSphere(); p.mesh.geometry.computeBoundingBox();
        if (p.mesh.userData.pendantShort) p.mesh.visible = dTop > 0.002; // a cord that is not there at home
      }
    }
    o.updateMatrixWorld(true);
    this.lamps.forEach((l, i) => { l.pos.copy(this.offsets[i]).applyMatrix4(o.matrixWorld); delete l.roomName; });
    this.onMove?.(this.lamps);
  }
}

import * as THREE from 'three';
import { REARRANGE } from './config.js';

const V = THREE.Vector3;
export const shown = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
export const within = (o, root) => { for (; o; o = o.parent) if (o === root) return true; return false; };
// Actual solid geometry, excluding invisible targets and light overlays (notably TV Ambilight).
export function physicalBounds(root, hiddenRoot = false) {
  const visible = o => { for (; o && o !== root; o = o.parent) if (!o.visible) return false; return true; };
  root.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3();
  root.traverse(o => {
    if (!o.isMesh || !(hiddenRoot ? visible(o) : shown(o)) || o.userData.surface !== undefined) return;
    const materials = Array.isArray(o.material) ? o.material : [o.material];
    if (materials.every(m => m.blending === THREE.AdditiveBlending || m.blending === THREE.CustomBlending)) return;
    if (o.isInstancedMesh) { o.computeBoundingBox(); bounds.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld)); }
    else { o.geometry.computeBoundingBox(); bounds.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)); }
  });
  return bounds;
}

// Geometry-only support queries, shared with the Unreal export of the default arrangement.
export class FurnitureGroups {
  constructor(world, carryables) {
    this.world = world;
    this.pieces = world.furniture.movable;
    this.carryables = carryables;
  }
  supports(piece) {
    if (piece.item.type === 'rug' || piece.picture) return [];
    return [...this.world.furniture.surfaces, ...(this.world.furniture.rearrangeSurfaces ?? [])].filter((s) => within(s, piece.object) && shown(s.parent)).map((s) => new THREE.Box3().setFromObject(s));
  }
  onTop(o, surfaces) {
    if (!surfaces.length) return false;
    o.updateWorldMatrix(true, true);
    const b = physicalBounds(o), c = b.getCenter(new V()), origin = new V().setFromMatrixPosition(o.matrixWorld);
    const inside = (s, p) => p.x >= s.min.x && p.x <= s.max.x && p.z >= s.min.z && p.z <= s.max.z;
    // Tall/asymmetric plants can overhang: their base origin still rests on the support.
    return surfaces.some((s) => Math.abs(b.min.y - s.max.y) < REARRANGE.supportGap
      && (inside(s, c) || (Math.abs(origin.y - b.min.y) < REARRANGE.supportGap && inside(s, origin))));
  }
  groupFor(piece) {
    const group = [piece];
    for (let i = 0; i < group.length; i++) {
      const surfaces = this.supports(group[i]);
      for (const p of this.pieces) if (!group.includes(p) && p.level === piece.level && !p.picture && shown(p.object) && this.onTop(p.object, surfaces)) group.push(p);
    }
    return group;
  }
  looseOn(piece) {
    const surfaces = this.supports(piece);
    return this.carryables().filter((h) => h.model && !h.held && !h.broken && shown(h.model) && !within(h.model, piece.object)
      && (!h.item || h.item.place.at === 'world')
      && (this.onTop(h.model, surfaces) || (!h.placed && h.furnitureHome && within(h.furnitureHome, piece.object))));
  }
}

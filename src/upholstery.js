// #1010: explicit cloth handles created by each builder, before static merging.
// Only these private materials change; no scene traversal or shared-original mutation.
import * as THREE from 'three';
import { MATERIAL_LIBRARY } from './config.js';
import { materialChoices } from './materialcatalog.js';

const maps = new Map();
function patternMap(choice) {
  if (!choice.pattern) return null;
  if (maps.has(choice.id)) return maps.get(choice.id);
  const canvas = document.createElement('canvas'), n = MATERIAL_LIBRARY.pixels;
  canvas.width = canvas.height = n;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = choice.color; ctx.fillRect(0, 0, n, n); ctx.fillStyle = choice.ink;
  if (choice.pattern === 'stripe') ctx.fillRect(0, 0, n / 4, n);
  else { ctx.fillRect(0, 0, n / 2, n / 2); ctx.fillRect(n / 2, n / 2, n / 2, n / 2); }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.setScalar(1 / MATERIAL_LIBRARY.upholsteryTile); map.channel = 1;
  maps.set(choice.id, map); return map;
}

/** One semantic surface, potentially several original finishes (cloth, piping, chair accents).
 * Mutating private handles keeps the material identity used by merge, light washes and moving fronts.
 * `part` marks explicit newly built cloth meshes; original UVs/maps remain intact for original restore.
 */
export function upholsterySurface(group, name = 'Klädsel', { id = 'textile', category = 'klädsel', replaceDetails = false } = {}) {
  const records = new Map();
  const surface = {
    id, name, category, choice: 'original',
    material(original) {
      if (!records.has(original)) records.set(original, { target: original.clone(), color: original.color.clone(), map: original.map, bumpMap: original.bumpMap, vertexColors: original.vertexColors });
      return records.get(original).target;
    },
    part(mesh) {
      // A separate UV set gives generic patterns metre scale without changing any original texture's UVs.
      const { position: p, normal: n } = mesh.geometry.attributes, uv = new Float32Array(p.count * 2);
      for (let i = 0; i < p.count; i++) {
        const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
        uv[i * 2] = ax > ay && ax > az ? p.getZ(i) : p.getX(i);
        uv[i * 2 + 1] = ay >= ax && ay >= az ? p.getZ(i) : p.getY(i);
      }
      mesh.geometry.setAttribute('uv1', new THREE.BufferAttribute(uv, 2));
      return mesh;
    },
    apply(id) {
      const choice = materialChoices(category).find(c => c.id === id) ?? materialChoices(category)[0];
      const map = choice.id === 'original' ? null : patternMap(choice);
      for (const { target, color, map: originalMap, bumpMap, vertexColors } of records.values()) {
        if (replaceDetails) {
          const colors = choice.id === 'original' ? vertexColors : false, bump = choice.id === 'original' ? bumpMap : null;
          if (target.vertexColors !== colors || target.bumpMap !== bump) { target.vertexColors = colors; target.bumpMap = bump; target.needsUpdate = true; }
        }
        const nextMap = choice.id === 'original' ? originalMap : map;
        if (choice.id === 'original') target.color.copy(color);
        else target.color.set(map ? '#ffffff' : choice.color);
        if (target.map !== nextMap) { target.map = nextMap; target.needsUpdate = true; }
      }
      surface.choice = choice.id;
    },
  };
  (group.userData.materialSurfaces ??= []).push(surface);
  return surface;
}

// Carry the web's per-vertex river frame through Interchange's standard texture-coordinate channels.
import * as THREE from 'three';
import { COLORS, RIVER_SURFACE, RAIN_RIPPLES, SEASON, SKY_DUSK } from '../../src/config.js';
import { skyGradientPalette } from '../../src/daycycle.js';
import { riverFlowSpeed } from '../../src/riversurface.js';

export function riverMaterialData() {
  return { ...RIVER_SURFACE, color: '#' + new THREE.Color(COLORS.water).getHexString(), clockPeriod: RAIN_RIPPLES.wrap,
    snowMonths: SEASON.snowMonths, snowGround: new THREE.Color(SEASON.snow.ground).toArray(),
    flowSpeed: riverFlowSpeed(), palette: skyGradientPalette(), dusk: { sun: SKY_DUSK.sun, overcast: SKY_DUSK.overcast, zenith: SKY_DUSK.zenith } };
}

export function riverGeometry(mesh, geometry, surface) {
  const pos = mesh.geometry.getAttribute('position');
  const channel = () => new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2);
  const uv = channel();
  if (surface.flow) {
    const frame = mesh.geometry.getAttribute('riverFlow'), shore = mesh.geometry.getAttribute('riverShore');
    if (!frame || !shore) throw Error('Streaming river surface lost its web river frame');
    const direction = channel(), cross = channel();
    for (let i = 0; i < pos.count; i++) {
      // Each high/low pair reconstructs the distance before shading. Long distances otherwise lose wave phase
      // when Unreal stores a mesh UV in half precision. Linear interpolation commutes with this reconstruction.
      const u = frame.getZ(i) / 8, whole = Math.floor(u);
      uv.setXY(i, whole, u - whole);
      direction.setXY(i, frame.getX(i), frame.getY(i));
      cross.setXY(i, frame.getW(i), shore.getX(i));
    }
    geometry.setAttribute('uv1', direction);
    geometry.setAttribute('uv2', cross);
  } else {
    // Web shader mask on the mixed edge-land mesh: the water colour AND one of the two water elevations.
    const colors = mesh.geometry.getAttribute('color'), water = new THREE.Color(COLORS.water);
    const p = new THREE.Vector3(), rgb = new THREE.Vector3(), target = new THREE.Vector3(water.r, water.g, water.b);
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      const selected = colors && rgb.fromBufferAttribute(colors, i).distanceTo(target) < 0.00001
        && surface.levels.some(level => Math.abs(p.y - level) < RIVER_SURFACE.levelTolerance);
      uv.setXY(i, selected ? 1 : 0, 0);
    }
  }
  return geometry.setAttribute('uv', uv);
}

/** #2441: the terrain's river-bed mud share (src/surroundings.js `bedMud`, 0 … 1 per vertex, the web's bed variant of
 *  src/grass.js grassMaterial) as COLOR_0 = (1 − bedMud, 1, 1): M_LundenGrass mixes MUSSELS.bed's tone in by
 *  BedWeight × (1 − VertexColor.r), and a lawn without COLOR_0 reads Unreal's white default (no mud). Only a piece that
 *  holds some mud gets the colour, so the zones away from Höje å keep their GLBs. Interchange stores COLOR_0 so that the
 *  shader reads the glTF value (GLTFMeshFactory.cpp undoes the engine's sRGB step), 8 bits as the web's byte. */
export function riverBedGeometry(mesh, geometry) {
  const bed = mesh.geometry.getAttribute('bedMud'), pos = geometry.getAttribute('position');
  if (!bed || bed.count !== pos.count) throw Error(`${mesh.name}: bedMud does not match the exported vertices`);
  let any = false;
  const color = new Float32Array(pos.count * 3).fill(1);
  for (let i = 0; i < pos.count; i++) { const t = bed.getX(i); if (t > 0) { color[i * 3] = 1 - t; any = true; } }
  if (!any) return geometry;
  if (geometry.getAttribute('color')) throw Error(`${mesh.name}: a river-bed lawn with vertex colours of its own`);
  const out = geometry.clone();
  out.setAttribute('color', new THREE.BufferAttribute(color, 3));
  return out;
}

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

import * as THREE from 'three';
import { FLARE, SITE, UNIT_TOP, HUS_L, WINDOWS } from './config.js';
import { occluders } from './greet.js';
import { aoTrees } from './surroundings.js';

// Procedural screen-space lens flare quads (Iris 640-friendly: 0 textures, 1 draw call, additive)
const flareVert = /* glsl */`
  attribute vec4 aColor;
  attribute float aType;
  varying vec2 vUv;
  varying vec4 vColor;
  varying float vType;

  void main() {
    vUv = uv * 2.0 - 1.0; // centered in [-1, 1]
    vColor = aColor;
    vType = aType;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const flareFrag = /* glsl */`
  uniform float uIntensity;
  varying vec2 vUv;
  varying vec4 vColor;
  varying float vType;

  void main() {
    float r = length(vUv);
    if (r > 1.0) discard;

    float shape = 0.0;
    if (vType < 0.5) {
      // Type 0: exponential soft sun glare / central glow
      shape = exp(-r * r * 4.0);
    } else if (vType < 1.5) {
      // Type 1: sun corona / halo ring
      float core = exp(-r * r * 12.0);
      float ring = exp(-pow((r - 0.58) * 8.0, 2.0));
      shape = core * 0.75 + ring * 0.45;
    } else if (vType < 2.5) {
      // Type 2: lens aperture disc with soft illuminated rim
      float disc = smoothstep(1.0, 0.75, r);
      float rim = smoothstep(0.4, 0.95, r) * disc;
      shape = disc * 0.6 + rim * 0.4;
    } else {
      // Type 3: wide diffuse chromatic halo ring
      shape = smoothstep(1.0, 0.0, r) * pow(1.0 - r, 1.8);
    }

    float alpha = shape * vColor.a * uIntensity;
    if (alpha < 0.002) discard;
    gl_FragColor = vec4(vColor.rgb * alpha, alpha);
  }
`;

/** Ray vs Axis-Aligned Bounding Box (slab method). Returns true if ray from (ox, oy, oz) along (dx, dy, dz) intersects b. */
export function rayHitsBox(ox, oy, oz, dx, dy, dz, b) {
  let tmin = 0, tmax = 1e6;
  if (Math.abs(dx) < 1e-7) {
    if (ox < b.x0 || ox > b.x1) return false;
  } else {
    const inv = 1 / dx;
    let t1 = (b.x0 - ox) * inv, t2 = (b.x1 - ox) * inv;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  if (Math.abs(dy) < 1e-7) {
    if (oy < b.y0 || oy > b.y1) return false;
  } else {
    const inv = 1 / dy;
    let t1 = (b.y0 - oy) * inv, t2 = (b.y1 - oy) * inv;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  if (Math.abs(dz) < 1e-7) {
    if (oz < b.z0 || oz > b.z1) return false;
  } else {
    const inv = 1 / dz;
    let t1 = (b.z0 - oz) * inv, t2 = (b.z1 - oz) * inv;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return tmax > 0.05;
}

/** Ray vs Sphere. Returns true if ray from (ox, oy, oz) along (dx, dy, dz) intersects sphere at (cx, cy, cz) with radius r. */
export function rayHitsSphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const vx = cx - ox, vy = cy - oy, vz = cz - oz;
  const tproj = vx * dx + vy * dy + vz * dz;
  if (tproj <= 0) return false;
  const distSq = (vx * vx + vy * vy + vz * vz) - tproj * tproj;
  return distSq < r * r;
}

let cachedBuildingBoxes = null;
export function getBuildingBoxes() {
  if (cachedBuildingBoxes) return cachedBuildingBoxes;
  const boxes = occluders();
  for (const b of boxes) {
    b.y1 += 2.5; // include roof ridge above eave
  }
  for (const g of [SITE.west, SITE.east, SITE.north, SITE.south]) {
    if (!g?.buildings) continue;
    for (const b of g.buildings) {
      if (!b.polygon) continue;
      const xs = b.polygon.map((p) => p[0]), zs = b.polygon.map((p) => p[1]);
      boxes.push({
        x0: Math.min(...xs), x1: Math.max(...xs),
        z0: Math.min(...zs), z1: Math.max(...zs),
        y0: b.base ?? 0, y1: (b.base ?? 0) + (b.h ?? (b.storeys ?? 2) * 3.5) + 3,
      });
    }
  }
  cachedBuildingBoxes = boxes;
  return cachedBuildingBoxes;
}

/** Tests whether the ray from eye towards the sun is occluded by buildings, trees or indoor ceilings/walls. */
export function isSunOccluded(cameraPos, sunDir, player = null) {
  let ox = cameraPos.x, oy = cameraPos.y, oz = cameraPos.z;
  const dx = sunDir.x, dy = sunDir.y, dz = sunDir.z;

  if (dy <= 0) return true; // sun at or below horizon
  if (oy < -0.5) return true; // underground (garage / basement)
  if (oy > 16.0) return false; // above all buildings and trees with dy > 0

  // Indoor and underground checks
  if (player && oy < 6.0) {
    if (player.below || player.pos.y < -0.5) return true; // in garage under courtyard slab
    if (player.inCore) return true; // inside stairwell tower
    if (!player.outdoors) {
      // Inside apartment L1007: check ceiling and wall exits
      const cy = oy < 2.5 ? 2.6 : 5.85; // floor 0 / 1 ceiling
      const tCeil = (cy - oy) / dy;
      const xCeil = ox + tCeil * dx, zCeil = oz + tCeil * dz;
      if (xCeil >= 0 && xCeil <= 5.75 && zCeil >= 0.05 && zCeil <= 12.65) {
        return true; // hits indoor ceiling
      }

      // Check if ray exits through a window opening before ceiling
      let windowExit = false;
      if (dz > 0) {
        const tWall = (12.65 - oz) / dz;
        if (tWall < tCeil) {
          const wx = ox + tWall * dx, wy = oy + tWall * dy;
          // South windows / terrace doors
          const southWindows = [
            { x0: 2.8, x1: 4.9, y0: 0.6, y1: 2.6 }, // L0 vardagsrum
            { x0: 1.0, x1: 2.0, y0: 0.0, y1: 2.1 }, // L0 altandörr
            { x0: 0.65, x1: 2.25, y0: 0.7, y1: 2.4 }, // L1 allrum
            { x0: 3.15, x1: 4.55, y0: 0.7, y1: 2.25 }, // L1 sovrum 2
          ];
          if (southWindows.some((w) => wx >= w.x0 && wx <= w.x1 && wy >= w.y0 && wy <= w.y1)) {
            windowExit = true;
            ox = wx; oy = wy; oz = 12.66;
          }
        }
      } else if (dz < 0) {
        const tWall = (0.05 - oz) / dz;
        if (tWall < tCeil) {
          const wx = ox + tWall * dx, wy = oy + tWall * dy;
          // North windows
          const northWindows = [
            { x0: 2.8, x1: 4.9, y0: 0.8, y1: 2.6 }, // L0 kök
            { x0: 1.1, x1: 2.5, y0: 0.9, y1: 2.25 }, // L1 sovrum 3
            { x0: 3.15, x1: 4.55, y0: 0.7, y1: 2.25 }, // L1 sovrum 1
          ];
          if (northWindows.some((w) => wx >= w.x0 && wx <= w.x1 && wy >= w.y0 && wy <= w.y1)) {
            windowExit = true;
            ox = wx; oy = wy; oz = 0.04;
          }
        }
      }
      if (!windowExit) return true; // blocked by solid wall
    }
  }

  // Outdoor checks: buildings
  const boxes = getBuildingBoxes();
  for (let i = 0; i < boxes.length; i++) {
    if (rayHitsBox(ox, oy, oz, dx, dy, dz, boxes[i])) {
      return true;
    }
  }

  // Outdoor checks: trees
  for (let i = 0; i < aoTrees.length; i++) {
    const t = aoTrees[i];
    if (rayHitsSphere(ox, oy, oz, dx, dy, dz, t.x, t.y, t.z, t.r)) {
      return true;
    }
  }

  return false;
}

export class Flare {
  constructor({ scene, camera, day, player = null, weather = null, lowMemory = false }) {
    Object.assign(this, { scene, camera, day, player, weather, lowMemory });
    this.intensity = 0;
    this.target = 0;
    this.occluded = false;
    this.inView = false;
    this.sunNDC = new THREE.Vector3();
    this.sunWorld = new THREE.Vector3();
    this.camDir = new THREE.Vector3();

    const elements = FLARE.elements;
    const n = elements.length;
    const pos = new Float32Array(n * 4 * 3);
    const uvs = new Float32Array(n * 4 * 2);
    const colors = new Float32Array(n * 4 * 4);
    const types = new Float32Array(n * 4);
    const indices = new Uint16Array(n * 6);

    for (let i = 0; i < n; i++) {
      const el = elements[i];
      const v0 = i * 4;
      // UV: [0,0], [1,0], [1,1], [0,1]
      uvs[v0 * 2] = 0;     uvs[v0 * 2 + 1] = 0;
      uvs[(v0 + 1) * 2] = 1; uvs[(v0 + 1) * 2 + 1] = 0;
      uvs[(v0 + 2) * 2] = 1; uvs[(v0 + 2) * 2 + 1] = 1;
      uvs[(v0 + 3) * 2] = 0; uvs[(v0 + 3) * 2 + 1] = 1;

      for (let j = 0; j < 4; j++) {
        const cIdx = (v0 + j) * 4;
        colors[cIdx] = el.color[0];
        colors[cIdx + 1] = el.color[1];
        colors[cIdx + 2] = el.color[2];
        colors[cIdx + 3] = el.alpha;
        types[v0 + j] = el.type;
      }

      const i0 = i * 6;
      indices[i0] = v0;
      indices[i0 + 1] = v0 + 1;
      indices[i0 + 2] = v0 + 2;
      indices[i0 + 3] = v0;
      indices[i0 + 4] = v0 + 2;
      indices[i0 + 5] = v0 + 3;
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    this.geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 4));
    this.geometry.setAttribute('aType', new THREE.BufferAttribute(types, 1));
    this.geometry.setIndex(new THREE.BufferAttribute(indices, 1));

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uIntensity: { value: 0 },
      },
      vertexShader: flareVert,
      fragmentShader: flareFrag,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.renderOrder = 9999;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;

    if (!camera.parent) scene.add(camera);
    camera.add(this.mesh);
  }

  update(dt) {
    if (!FLARE.enabled) {
      this.mesh.visible = false;
      this.intensity = 0;
      return;
    }

    const { camera, day, player, weather } = this;
    const sunDir = day.sunDir;

    // View direction check
    camera.getWorldDirection(this.camDir);
    const cosAngle = this.camDir.dot(sunDir);

    let viewFactor = 0;
    if (cosAngle > 0.05) {
      this.sunWorld.copy(camera.position).addScaledVector(sunDir, 100);
      this.sunNDC.copy(this.sunWorld).project(camera);
      const sunDist = Math.hypot(this.sunNDC.x, this.sunNDC.y);
      viewFactor = 1 - THREE.MathUtils.smoothstep(sunDist, 0.9, 1.5);
      this.inView = sunDist < 1.4;
    } else {
      this.inView = false;
    }

    // Occlusion check
    this.occluded = isSunOccluded(camera.position, sunDir, player);

    // Weather and cloud attenuation
    // Above clouds (day.above === 1), the sky is clear by day (#1251)
    const effectiveOvercast = day.overcast * (1 - (day.above ?? 0));
    let cloudFactor = 1 - THREE.MathUtils.smoothstep(effectiveOvercast, 0.10, 0.45);
    if (weather && weather.rain > 0.05) {
      cloudFactor = 0; // rain clouds extinguish the flare
    }
    const insideCloud = day.uniforms?.uWhite?.value ?? 0;
    const sunElevation = THREE.MathUtils.smoothstep(sunDir.y, 0.02, 0.20);

    this.target = (this.occluded ? 0 : 1) * sunElevation * cloudFactor * (1 - insideCloud) * viewFactor;

    // Smooth transition over time to prevent flickering/popping
    const tau = FLARE.smoothTime ?? 0.12;
    this.intensity += (this.target - this.intensity) * (1 - Math.exp(-dt / tau));

    if (this.intensity < 0.001) {
      this.intensity = 0;
      this.mesh.visible = false;
      return;
    }

    this.mesh.visible = true;
    this.material.uniforms.uIntensity.value = this.intensity;

    // Camera space geometry update at z = -1
    const tanHalfFov = Math.tan((camera.fov * Math.PI) / 360);
    const camH = tanHalfFov;
    const camW = tanHalfFov * camera.aspect;

    const sx = this.sunNDC.x * camW;
    const sy = this.sunNDC.y * camH;

    const pos = this.geometry.attributes.position.array;
    const elements = FLARE.elements;
    let vIdx = 0;

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      const t = el.t;
      const cx = sx * (1 - t);
      const cy = sy * (1 - t);
      const r = el.size * camH;

      pos[vIdx++] = cx - r;
      pos[vIdx++] = cy - r;
      pos[vIdx++] = -1;

      pos[vIdx++] = cx + r;
      pos[vIdx++] = cy - r;
      pos[vIdx++] = -1;

      pos[vIdx++] = cx + r;
      pos[vIdx++] = cy + r;
      pos[vIdx++] = -1;

      pos[vIdx++] = cx - r;
      pos[vIdx++] = cy + r;
      pos[vIdx++] = -1;
    }

    this.geometry.attributes.position.needsUpdate = true;
  }
}

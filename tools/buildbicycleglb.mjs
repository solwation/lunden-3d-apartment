import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import fs from 'node:fs';
import path from 'node:path';

// Node polyfill for FileReader
class NodeFileReader {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = buf;
      if (this.onloadend) this.onloadend();
    });
  }
}
globalThis.FileReader = NodeFileReader;

if (typeof document === 'undefined') {
  globalThis.document = {
    createElement: (tag) => {
      if (tag === 'canvas') {
        return {
          width: 256,
          height: 256,
          getContext: () => new Proxy({
            width: 256,
            height: 256,
            createLinearGradient: () => ({ addColorStop: () => {} }),
            createRadialGradient: () => ({ addColorStop: () => {} }),
            getImageData: () => ({ data: new Uint8ClampedArray(256 * 256 * 4) })
          }, {
            get(target, prop) {
              if (prop in target) return target[prop];
              return () => {};
            },
            set(target, prop, value) {
              target[prop] = value;
              return true;
            }
          })
        };
      }
      return {};
    }
  };
}

export const BICYCLE_GRIP = { x: .31, y: .95, z: .25, radius: .018, length: .09 };

const box = (w, h, d, x = 0, y = 0, z = 0) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y, z);

function merge(geos) {
  const valid = geos.filter(Boolean).map(g => g.index ? g.toNonIndexed() : g);
  for (const g of valid) {
    if (!g.attributes.normal) g.computeVertexNormals();
  }
  const merged = mergeGeometries(valid);
  return mergeVertices(merged);
}

/**
 * Builds the geometries for a Swedish city bicycle.
 * Origin at road level under bottom bracket (facing +x).
 * WX = [-0.5, 0.42], WY = 0.34, WR = 0.33
 */
export function buildBicycleParts(lod = 1) {
  const G = BICYCLE_GRIP;
  const near = lod > 0;
  const T = near ? 8 : 4; // tube segments
  const TW = near ? 24 : 16; // wheel segments

  const cyl = (r, l, seg = T) => new THREE.CylinderGeometry(r, r, l, seg, 1, !near);
  const tube = (ax, ay, bx, by, r = 0.015, seg = T) => {
    const l = Math.hypot(bx - ax, by - ay);
    return cyl(r, l, seg).rotateZ(Math.atan2(ax - bx, by - ay)).translate((ax + bx) / 2, (ay + by) / 2, 0);
  };

  const WX = [-0.5, 0.42], WY = 0.34, WR = 0.33;

  // Mudguards (skärmar)
  const fender = (cx, a0, a1) =>
    new THREE.CylinderGeometry(WR + 0.035, WR + 0.035, 0.065, near ? 16 : 8, 1, true, a0, a1 - a0)
      .rotateX(Math.PI / 2).translate(cx, WY, 0);

  // Ergonomic saddle (sadel)
  const saddle = near
    ? new THREE.SphereGeometry(0.11, 12, 8).scale(1.35, 0.35, 0.95).translate(-0.14, 0.80, 0)
    : box(0.26, 0.035, 0.19, -0.14, 0.80, 0);

  // Front fork (framgaffel)
  const fork = [
    tube(0.42, 0.34, 0.33, 0.78, 0.014).translate(0, 0, 0.05),
    tube(0.42, 0.34, 0.33, 0.78, 0.014).translate(0, 0, -0.05)
  ];

  // Rear stays (bakgaffel och kedjestag)
  const stays = [0.045, -0.045].flatMap((z) => [
    tube(-0.5, 0.34, -0.05, 0.36, 0.013).translate(0, 0, z),
    tube(-0.5, 0.34, -0.12, 0.62, 0.012).translate(0, 0, z)
  ]);

  // Frame assembly
  const frameParts = [
    // Down tube (diagonalrör)
    tube(-0.05, 0.36, 0.33, 0.40, 0.018),
    // Restore the missing lower connection to the steering head (#1912).
    tube(0.33, 0.40, 0.34, 0.76, 0.018),
    // Seat tube (sadelrör)
    tube(-0.05, 0.36, -0.12, 0.72, 0.016),
    // Top tube (överrör)
    tube(-0.12, 0.72, 0.34, 0.76, 0.016),
    // Head tube (styrrör)
    tube(0.34, 0.76, 0.33, 0.92, 0.018),
    // Bottom bracket shell
    cyl(0.022, 0.08).rotateX(Math.PI / 2).translate(-0.05, 0.36, 0),
    // Seat post (sadelstolpe)
    tube(-0.12, 0.62, -0.14, 0.80, 0.013),
    saddle,
    ...fork,
    ...stays,
    // Stem and handlebar (styrstam och styre)
    tube(0.33, 0.78, 0.33, 0.93, 0.014),
    cyl(0.012, 0.56, near ? 10 : 6).rotateX(Math.PI / 2).translate(0.31, 0.95, 0),
    // Fenders (stänkskärmar)
    fender(WX[0], 0.1, Math.PI * 0.9),
    fender(WX[1], 0.1, Math.PI * 0.8),
    // Rear luggage carrier (pakethållare)
    box(0.30, 0.015, 0.12, -0.60, 0.66, 0),
    tube(-0.50, 0.36, -0.70 + 0.12, 0.66, 0.008),
    tube(-0.40, 0.36, -0.50, 0.66, 0.008),
    // Chain guard (kedjeskydd)
    box(0.42, 0.08, 0.02, -0.26, 0.36, 0.075),
    // Front light mount / reflector box
    box(0.06, 0.04, 0.03, 0.41, 0.43, 0.0)
  ];
  const frameGeo = merge(frameParts);

  // Tyres and rubber grips
  const tyreParts = [
    ...WX.map(x => new THREE.TorusGeometry(WR, 0.022, near ? 8 : 4, TW).translate(x, WY, 0)),
    // Handlebar rubber grips
    cyl(G.radius, G.length, near ? 8 : 5).rotateX(Math.PI / 2).translate(G.x, G.y, G.z),
    cyl(G.radius, G.length, near ? 8 : 5).rotateX(Math.PI / 2).translate(G.x, G.y, -G.z)
  ];
  const tyresGeo = merge(tyreParts);

  // Metal: rims, hubs, cranks, pedals, chain, spokes
  const metalParts = [
    // Rims (fälgar)
    ...WX.map(x => new THREE.TorusGeometry(WR - 0.02, 0.009, near ? 6 : 3, TW).translate(x, WY, 0)),
    // Wheel hubs (hjulnav)
    ...WX.map(x => cyl(0.022, 0.11, near ? 8 : 5).rotateX(Math.PI / 2).translate(x, WY, 0)),
    // Chainring / sprocket (kedjekrans)
    cyl(0.075, 0.008, near ? 14 : 8).rotateX(Math.PI / 2).translate(-0.05, 0.36, 0.06),
    // Cranks (vevarmar)
    box(0.016, 0.17, 0.015, -0.05, 0.275, 0.09),
    box(0.016, 0.17, 0.015, -0.05, 0.445, -0.09),
    // Pedals (pedaler)
    box(0.10, 0.022, 0.06, -0.05, 0.19, 0.125),
    box(0.10, 0.022, 0.06, -0.05, 0.53, -0.125),
    // Chain upper & lower runs
    box(0.45, 0.009, 0.012, -0.275, 0.40, 0.065),
    box(0.45, 0.009, 0.012, -0.275, 0.32, 0.065)
  ];
  const metalGeo = merge(metalParts);

  // Spokes: planar disks with UV mapping
  const spokeGeos = WX.map(x => {
    const p = new THREE.PlaneGeometry(WR * 2, WR * 2);
    p.translate(x, WY, 0);
    return p;
  });
  const spokesGeo = merge(spokeGeos);

  return [frameGeo, tyresGeo, metalGeo, spokesGeo];
}

export function buildBicycleScene() {
  const root = new THREE.Group();
  root.name = 'Bicycle';

  const [frameNear, tyresNear, metalNear, spokesNear] = buildBicycleParts(1);
  const [frameLo, tyresLo, metalLo, spokesLo] = buildBicycleParts(0);

  const matFrame = new THREE.MeshStandardMaterial({
    name: 'Mat_Frame',
    color: 0xffffff,
    roughness: 0.35,
    metalness: 0.25
  });

  const matTyres = new THREE.MeshStandardMaterial({
    name: 'Mat_Tyres',
    color: 0x141414,
    roughness: 0.85,
    metalness: 0.05
  });

  const matMetal = new THREE.MeshStandardMaterial({
    name: 'Mat_Metal',
    color: 0xb4b9bd,
    roughness: 0.35,
    metalness: 0.75
  });

  const matSpokes = new THREE.MeshStandardMaterial({
    name: 'Mat_Spokes',
    color: 0xb4b9bd,
    roughness: 0.4,
    metalness: 0.5,
    side: THREE.DoubleSide
  });

  // Near LOD
  const meshFrame = new THREE.Mesh(frameNear, matFrame);
  meshFrame.name = 'Bicycle_frame';
  meshFrame.castShadow = true;

  const meshTyres = new THREE.Mesh(tyresNear, matTyres);
  meshTyres.name = 'Bicycle_tyres';
  meshTyres.castShadow = true;

  const meshMetal = new THREE.Mesh(metalNear, matMetal);
  meshMetal.name = 'Bicycle_metal';
  meshMetal.castShadow = true;

  const meshSpokes = new THREE.Mesh(spokesNear, matSpokes);
  meshSpokes.name = 'Bicycle_spokes';

  // Far LOD
  const meshFrameLo = new THREE.Mesh(frameLo, matFrame);
  meshFrameLo.name = 'Bicycle_frame_Lo';

  const meshTyresLo = new THREE.Mesh(tyresLo, matTyres);
  meshTyresLo.name = 'Bicycle_tyres_Lo';

  const meshMetalLo = new THREE.Mesh(metalLo, matMetal);
  meshMetalLo.name = 'Bicycle_metal_Lo';

  const meshSpokesLo = new THREE.Mesh(spokesLo, matSpokes);
  meshSpokesLo.name = 'Bicycle_spokes_Lo';

  const groupNear = new THREE.Group();
  groupNear.name = 'LOD_Near';
  groupNear.add(meshFrame, meshTyres, meshMetal, meshSpokes);

  const groupFar = new THREE.Group();
  groupFar.name = 'LOD_Far';
  groupFar.add(meshFrameLo, meshTyresLo, meshMetalLo, meshSpokesLo);

  root.add(groupNear, groupFar);
  return root;
}

export function exportBicycleGLB() {
  return new Promise((resolve, reject) => {
    const scene = buildBicycleScene();
    const exporter = new GLTFExporter();
    exporter.parse(
      scene,
      (glb) => resolve(glb),
      (err) => reject(err),
      { binary: true, embedImages: false }
    );
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Building bicycle GLB model...');
  exportBicycleGLB().then((glb) => {
    const outPath = path.resolve(process.cwd(), 'models/bicycle.glb');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, Buffer.from(glb));
    console.log(`Exported models/bicycle.glb: ${glb.byteLength} bytes`);
  }).catch((err) => {
    console.error('Failed to export bicycle GLB:', err);
    process.exit(1);
  });
}

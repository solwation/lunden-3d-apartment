// The web multiplies its grey leaf atlas by a Worley clump field in a fragment shader. glTF carries
// the result in sRGB on the same unwrapped hedge UVs. The green tint and vertex shading stay separate.
import * as THREE from 'three';
import { HEDGE_CLUMP, PATIO, SITE } from '../../src/config.js';
import { clumpShade, CLUMP_MEAN } from '../../src/hedgeclump.js';

export function hedgeTexture(material) {
  const patio = material.name === 'patio-hedge';
  const period = patio ? PATIO.hedge.texturePeriod : SITE.life.strip.hedge.texturePeriod;
  const size = patio ? HEDGE_CLUMP.size.patio : HEDGE_CLUMP.size.boxwood;
  const source = material.map.image, tiles = 2;
  const canvas = document.createElement('canvas');
  canvas.width = source.width * tiles;
  canvas.height = source.height * tiles;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = ctx.createPattern(source, 'repeat');
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const color = new THREE.Color();
  const linear = Array.from({ length: 256 }, (_, i) => color.setScalar(i / 255).convertSRGBToLinear().r);
  for (let y = 0; y < canvas.height; y++) {
    const v = (canvas.height - y - 0.5) / source.height * period / size;
    for (let x = 0; x < canvas.width; x++) {
      const u = (x + 0.5) / source.width * period / size;
      const i = (y * canvas.width + x) * 4;
      const tone = linear[pixels.data[i]] * clumpShade(u, v).k / CLUMP_MEAN;
      const channel = color.setScalar(tone).convertLinearToSRGB().r * 255;
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = channel;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  const map = new THREE.CanvasTexture(canvas);
  map.name = material.name;
  map.colorSpace = THREE.SRGBColorSpace;
  // Mirror the whole tile at its edges so the non-periodic clump field joins without a seam.
  map.wrapS = map.wrapT = THREE.MirroredRepeatWrapping;
  map.repeat.setScalar(1 / tiles);
  return map;
}

import * as THREE from 'three';

// One small, tileable grayscale grain shared by wood finishes. Materials tint it per species.
let grain;
function getGrain() {
  if (!grain) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const image = ctx.createImageData(canvas.width, canvas.height);
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const wave = Math.sin(y * Math.PI * 24 / 64 + Math.sin(x * Math.PI * 8 / 256) * 1.5) * 4.5;
      const fine = Math.sin(y * Math.PI * 48 / 64 + Math.sin(x * Math.PI * 12 / 256)) * 2;
      const knots = Math.sin(x * Math.PI * 6 / 256 + Math.sin(y * Math.PI * 6 / 64)) * 2;
      const n = Math.max(0, Math.min(255, 190 + wave + fine + knots));
      const i = (y * canvas.width + x) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = n;
      image.data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    grain = new THREE.CanvasTexture(canvas);
    grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
    grain.colorSpace = THREE.SRGBColorSpace;
    grain.repeat.set(2, 6);
    grain.anisotropy = 4;
  }
  return grain;
}

export function woodMaterial(color, roughness = 0.65, repeat = null) {
  const base = getGrain();
  let map = base;
  if (repeat && (repeat[0] !== base.repeat.x || repeat[1] !== base.repeat.y)) {
    map = base.clone();
    map.repeat.set(repeat[0], repeat[1]);
  }
  return new THREE.MeshStandardMaterial({ color, map, roughness });
}

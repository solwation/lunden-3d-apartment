import * as THREE from 'three';

// One small, tileable grayscale grain shared by wood finishes. Materials tint it per species.
let grain;
export function woodMaterial(color, roughness = 0.65) {
  if (!grain) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const image = ctx.createImageData(canvas.width, canvas.height);
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const wave = Math.sin(y * Math.PI * 10 / 64 + Math.sin(x * Math.PI * 10 / 256) * 1.8) * 7;
      const knots = Math.sin(x * Math.PI * 6 / 256 + Math.sin(y * Math.PI * 4 / 64)) * 3;
      const n = Math.max(0, Math.min(255, 190 + wave + knots));
      const i = (y * canvas.width + x) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = n;
      image.data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    grain = new THREE.CanvasTexture(canvas);
    grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
    grain.colorSpace = THREE.SRGBColorSpace;
    grain.repeat.set(1, 1);
    grain.anisotropy = 4;
  }
  return new THREE.MeshStandardMaterial({ color, map: grain, roughness });
}

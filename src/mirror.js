import * as THREE from 'three';

// One material for every mirror surface (hall LINDBYN, bathroom mirrors): no real reflection (that
// costs a render per mirror), but a soft light gradient with two diagonal glints reads as a mirror.

function mirrorTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#e9eef1');
  grad.addColorStop(0.55, '#c8d1d6');
  grad.addColorStop(1, '#b9b3ab');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  g.rotate(-0.6);
  for (const [y, w, a] of [[150, 26, 0.55], [196, 10, 0.4]]) {
    const s = g.createLinearGradient(0, y - w, 0, y + w);
    s.addColorStop(0, 'rgba(255,255,255,0)'); s.addColorStop(0.5, `rgba(255,255,255,${a})`); s.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = s;
    g.fillRect(-200, y - w, 600, 2 * w);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const map = mirrorTexture();
export const mirrorMaterial = new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0x4a4a4a, roughness: 0.05, metalness: 0.1 });

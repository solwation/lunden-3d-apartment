import * as THREE from 'three';
import { DOOR_SIGNS, NAME_PLATE } from './config.js';

// Hand-lettered name signs on the hall side of the bedroom doors (DOOR_SIGNS in config).

function signTexture(text, color) {
  const c = document.createElement('canvas');
  c.width = 320; c.height = 140;
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.beginPath();
  g.roundRect(4, 4, 312, 132, 26);
  g.fill();
  g.strokeStyle = 'rgba(60,60,80,0.35)';
  g.lineWidth = 3;
  g.stroke();
  const hand = "'Segoe Print', 'Comic Sans MS', 'Comic Neue', cursive";
  let size = 54;
  g.font = `bold ${size}px ${hand}`;
  while (g.measureText(text).width > 270 && size > 20) g.font = `bold ${(size -= 2)}px ${hand}`;
  g.fillStyle = '#3a3550';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 160, 74);
  // a few small stars/hearts
  g.fillStyle = 'rgba(210,80,120,0.7)';
  for (const [x, y] of [[26, 26], [294, 30], [30, 112], [290, 110]]) {
    g.beginPath();
    g.arc(x, y, 5, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Put each sign on the door of its room, on the face towards the hall. `doors` = all doors,
 * `roomAt(level, x, z)` finds the room on each side of a door.
 */
export function addDoorSigns(doors, roomAt, levelOf) {
  const signs = [];
  for (const s of DOOR_SIGNS) {
    const door = doors.find((d) => {
      if (d.kind !== 'swing' || levelOf(d) !== s.level) return false;
      const { center: [cx, cz], normal: [nx, nz] } = d.opening();
      const a = roomAt(s.level, cx + nx * 0.3, cz + nz * 0.3), b = roomAt(s.level, cx - nx * 0.3, cz - nz * 0.3);
      return (a === s.room && b === 'Hall') || (b === s.room && a === 'Hall');
    });
    if (!door) continue;
    const { center: [cx, cz], normal: [nx, nz] } = door.opening();
    const hallSide = roomAt(s.level, cx + nx * 0.3, cz + nz * 0.3) === 'Hall' ? 1 : -1;
    // door local frame: x = thickness, z = along the leaf; local +x points along the opening
    // normal or against it in the closed pose — pick the face towards the hall
    const a = door.closedAngle, lx = Math.cos(a), lz = -Math.sin(a);
    const face = Math.sign(lx * nx * hallSide + lz * nz * hallSide) || 1;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.13),
      new THREE.MeshStandardMaterial({ map: signTexture(s.text, s.color), roughness: 0.7 }));
    sign.rotation.y = face > 0 ? Math.PI / 2 : -Math.PI / 2;
    sign.position.set(face * 0.022, 1.52, door.len / 2);
    sign.receiveShadow = true; // like the leaf: no evening sun through the house (#607)
    sign.userData.door = door; // looking at the sign still opens the door
    door.object.add(sign);
    signs.push(sign);
  }
  return signs; // hidden with the furniture (F)
}

/** The front door's name plate (#595): a canvas-textured thin box on the stairwell face of the leaf, centred over
 * the letter box, a child of the leaf so it swings with it. `outX` = which local x side is the stairwell (±1). Only
 * the front face shows the text; the other faces sample the plate's plain edge colour. One mesh, one draw call. */
export function namePlate(door, outX) {
  const P = NAME_PLATE, W = 512, H = Math.round(W * P.h / P.w);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, H); // a faint brushed sheen
  grad.addColorStop(0, P.color); grad.addColorStop(0.5, '#e2c57a'); grad.addColorStop(1, P.color);
  g.fillStyle = P.edge; g.fillRect(0, 0, W, H);
  g.fillStyle = grad; g.fillRect(6, 6, W - 12, H - 12);
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2; g.strokeRect(14, 14, W - 28, H - 28);
  g.fillStyle = P.ink; g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = parseInt(P.font.match(/(\d+)px/)[1], 10);
  const font = () => P.font.replace(/\d+px/, `${size}px`);
  g.font = font();
  while (g.measureText(P.text).width > W - 70 && size > 20) g.font = font(size -= 2);
  g.fillText(P.text, W / 2, H / 2 + 3);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const geo = new THREE.BoxGeometry(P.t, P.h, P.w);
  // faces: px, nx, py, ny, pz, nz (4 vertices each); all but the stairwell face sample the edge colour
  const front = outX > 0 ? 0 : 1, uv = geo.attributes.uv;
  for (let f = 0; f < 6; f++) if (f !== front) for (let i = f * 4; i < f * 4 + 4; i++) uv.setXY(i, 2 / W, 0.5);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: P.roughness, metalness: P.metalness }));
  mesh.position.set(outX * (door.thickness ?? 0.04) / 2 + outX * P.t / 2, P.y, door.len / 2);
  mesh.name = 'namnskylten';
  mesh.receiveShadow = true;
  mesh.userData.door = door; // looking at it still opens the door; DetailCuller treats it as exterior door hardware (#519)
  door.object.add(mesh);
  return mesh;
}

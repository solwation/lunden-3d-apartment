import * as THREE from 'three';
import { DOOR_SIGNS } from './config.js';

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
    sign.userData.door = door; // looking at the sign still opens the door
    door.object.add(sign);
  }
}

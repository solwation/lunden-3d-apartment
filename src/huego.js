// The Philips Hue Go portable lamp on Sovrum 1's window board (#409, #428, HUE_GO in config): the classic model
// (docs/hue-go-produktbild.jpg) — a frosted white hemisphere lying on its curved side, its flat round face tilted up and
// out towards the room, a thin clear rim round the face, a small flat foot so it doesn't roll. Our own plain look, no
// logo. A lamp of its own (lights.js FloorLamp: on with the dusk, #234); looked at, the shared action menu (#367,
// actions.js ActionSet) offers "Tänd/Släck" and "Byt färg" (1–2 / the wheel / touch buttons, E = the marked row):
// "Byt färg" steps through HUE_GO.scenes and the glow, the pool light and the shader wash follow (FloorLamp.recolor);
// keep.js keeps the colour over a page-made reload.
import * as THREE from 'three';
import { HUE_GO } from './config.js';
import { sfx } from './audio.js';
import { ActionSet } from './actions.js';

/** The lit shell's glow: one emissive map over the whole lamp — the flat face full, the dome dimmer towards its pole. */
function glowMap() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 4;
  const x = c.getContext('2d'), gr = x.createLinearGradient(0, 0, 64, 0);
  gr.addColorStop(0, '#5a5a5a'); gr.addColorStop(0.75, '#b8b8b8'); gr.addColorStop(0.88, '#ffffff'); gr.addColorStop(1, '#ffffff');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A builder (furniture.js BUILDERS): local origin = the bottom centre on the board, facing +z (the room). */
export function huego(item, lights, H = HUE_GO) {
  const g = new THREE.Group(), R = H.d / 2, tilt = THREE.MathUtils.degToRad(H.tilt);
  // the bowl rests on its curve: the sphere's centre is R over the board, less the flat foot's cut
  const cy = R - H.foot.cut;
  const lamp = new THREE.Group(); // the E target / the lamp's object: at the sphere's centre (the tests aim at it)
  lamp.position.y = cy;
  const shell = new THREE.MeshStandardMaterial({ color: H.body, roughness: 0.55, emissive: H.scenes[0].color, emissiveIntensity: 0.04, emissiveMap: glowMap() });
  const rimMat = new THREE.MeshStandardMaterial({ color: H.rim, roughness: 0.25, transparent: true, opacity: 0.7 });
  // the bowl in its own frame: the dome's pole along +y, the flat face at y = 0 facing −y; turned so the face looks
  // `tilt` from straight up towards the room (+y → −n with n = (0, cos t, sin t))
  const bowl = new THREE.Group();
  bowl.rotation.x = Math.PI + tilt;
  const dome = new THREE.SphereGeometry(R, 48, 20, 0, Math.PI * 2, 0, Math.PI / 2);
  const uv = dome.attributes.uv, pos = dome.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.86 * (1 - pos.getY(i) / R), 0.5); // brighter towards the face
  const face = new THREE.CircleGeometry(R - H.rimW, 48);
  face.rotateX(Math.PI / 2); // facing −y in the bowl's frame
  const fuv = face.attributes.uv;
  for (let i = 0; i < fuv.count; i++) fuv.setXY(i, 0.97, 0.5);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R - H.rimW / 2, H.rimW / 2, 8, 48), rimMat);
  rim.rotation.x = Math.PI / 2;
  const domeM = new THREE.Mesh(dome, shell), faceM = new THREE.Mesh(face, shell);
  for (const m of [domeM, faceM, rim]) { m.castShadow = true; bowl.add(m); }
  lamp.add(bowl);
  // the small flat foot under the lowest point of the curve
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(H.foot.r, H.foot.r, H.foot.h, 32), new THREE.MeshStandardMaterial({ color: H.rim, roughness: 0.6 }));
  foot.position.y = H.foot.h / 2 - cy;
  lamp.add(foot);
  g.add(lamp);
  lights.push({ object: lamp, shade: shell, height: 0.02, level: item.level, name: H.name, light: H.light, room: 'Sovrum 1', options: (l) => menu(l) });
  const spec = lights[lights.length - 1];
  const scene = (l) => Math.max(0, H.scenes.findIndex((s) => s.color === (l.color ?? H.scenes[0].color)));
  // the shared action menu (#367): E = the marked row; switching it on or off, or the next colour scene (a lamp switched
  // off comes on with it)
  const acts = new ActionSet();
  acts.define({ id: 'lampToggle', order: 10, label: (c) => (c.target.isOpen ? 'släcka Hue Go-lampan' : 'tända Hue Go-lampan'), run: (c) => c.target.toggle() });
  acts.define({ id: 'lampColour', order: 20, label: (c) => `byta färg (nu ${H.scenes[scene(c.target)].name})`, run: (c) => {
    const l = c.target, s = H.scenes[(scene(l) + 1) % H.scenes.length];
    l.recolor(s.color);
    if (!l.isOpen) l.set(true);
    sfx.click(lamp.getWorldPosition(new THREE.Vector3()));
  } });
  const menu = (l) => acts.list({ target: l });
  g.userData.keep = [lamp];
  g.userData.footprint = [];
  g.userData.huego = { spec, scene: () => scene(spec.lamp), next: () => menu(spec.lamp)[1].run() }; // (tests)
  g.position.y = item.y ?? 0;
  return g;
}

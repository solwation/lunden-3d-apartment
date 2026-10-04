// The Philips Hue Go portable lamp on Sovrum 1's window board (#409, HUE_GO in config): a white rounded body whose
// upper part is a frosted diffuser, a dark grey silicone handle loop on top, standing in a slim round charging base.
// Our own plain look, no logo. A lamp of its own (lights.js FloorLamp: E on the body, and on with the dusk, #234);
// E on the handle loop steps through its colour scenes ("byta färg på", kind 'huecolor'): the glow, the pool light and
// the shader wash follow (FloorLamp.recolor).
import * as THREE from 'three';
import { HUE_GO } from './config.js';
import { sfx } from './audio.js';

/** A builder (furniture.js BUILDERS): local origin = the bottom centre on the board, facing +z. */
export function huego(item, lights, H = HUE_GO) {
  const g = new THREE.Group(), R = H.d / 2, mid = H.h * 0.5;
  // the lamp: base + body + diffuser in one group (its E target), lifted to mid-height so the lamp's position is the
  // lamp's middle (the tests aim at it)
  const lamp = new THREE.Group();
  lamp.position.y = mid;
  const white = new THREE.MeshStandardMaterial({ color: H.body, roughness: 0.45 });
  const grey = new THREE.MeshStandardMaterial({ color: H.handle, roughness: 0.8 });
  const diffuser = new THREE.MeshStandardMaterial({ color: 0xf6f4f0, roughness: 0.6, emissive: H.scenes[0].color, emissiveIntensity: 0.04 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(H.base.r, H.base.r + 0.003, H.base.h, 40), grey);
  base.position.y = H.base.h / 2 - mid;
  const lathe = (pts, mat) => new THREE.Mesh(new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y - mid)), 48), mat);
  const y0 = H.base.h - 0.006, yb = H.h * H.split, top = H.h - H.loop; // the body sits down in the base; the diffuser above yb
  const body = lathe([[0, y0], [R * 0.86, y0], [R * 0.97, y0 + 0.008], [R, y0 + 0.02], [R, yb]], white);
  const glow = lathe([[R, yb], [R, top - 0.035], [R * 0.95, top - 0.015], [R * 0.78, top - 0.003], [0, top]], diffuser);
  for (const m of [base, body, glow]) { m.castShadow = true; lamp.add(m); }
  g.add(lamp);
  // the handle loop: a flat silicone strap standing up across the top, its ends in the top
  const strap = new THREE.Mesh(new THREE.TorusGeometry(H.loop * 0.62, 0.0065, 8, 24, Math.PI), grey);
  strap.scale.set(1, 1.15, 1.6);
  strap.position.y = top - 0.006;
  strap.castShadow = true;
  g.add(strap);
  lights.push({ object: lamp, shade: diffuser, height: H.h * 0.62 - mid, level: item.level, name: H.name, light: H.light, room: 'Sovrum 1' });
  const spec = lights[lights.length - 1];
  // E on the handle loop: the next colour scene (a lamp switched off comes on with it)
  const target = { kind: 'huecolor', name: H.name, verb: 'byta färg på', pickable: strap, object: strap, scene: 0,
    get isOpen() { return false; },
    toggle() {
      this.scene = (this.scene + 1) % H.scenes.length;
      const s = H.scenes[this.scene];
      spec.lamp?.recolor(s.color);
      if (spec.lamp && !spec.lamp.isOpen) spec.lamp.set(true);
      sfx.click(strap.getWorldPosition(new THREE.Vector3()));
    } };
  strap.userData.door = target;
  g.userData.targets = [target];
  g.userData.keep = [lamp, strap];
  g.userData.footprint = [];
  g.userData.huego = target; // (tests)
  g.position.y = item.y ?? 0;
  return g;
}

import * as THREE from 'three';
import { EGG } from './config.js';

const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .65, ...extra });
const shell = material(0xcda879), carton = material(0xaaa08d);
export function rawEgg() {
  const object = new THREE.Group(), egg = new THREE.Mesh(new THREE.SphereGeometry(EGG.shellRadius, 16, 12), shell);
  egg.scale.set(.94, 1.28, .94); egg.position.y = .028; egg.castShadow = true; object.add(egg);
  return { object };
}
export function eggCarton() {
  const object = new THREE.Group(), eggs = [], lid = new THREE.Group(), C = EGG.carton;
  const tray = new THREE.Mesh(new THREE.BoxGeometry(C.w, .022, C.d), carton); tray.position.y = .011; object.add(tray);
  for (let i = 0; i < 6; i++) { const e = rawEgg().object; e.position.set((i % 3 - 1) * .046, .01, (Math.floor(i / 3) - .5) * .049); object.add(e); eggs.push(e); }
  const top = new THREE.Mesh(new THREE.BoxGeometry(C.w, .012, C.d), carton); top.position.set(0, 0, C.d / 2); lid.add(top);
  lid.position.set(0, C.h, -C.d / 2); object.add(lid);
  return { object, show(item) { lid.rotation.x = item.pkg === 'closed' ? 0 : -1.5; eggs.forEach((e, i) => { e.visible = i < item.amount; }); } };
}
export function friedEgg() {
  const object = new THREE.Group(), shape = new THREE.Shape();
  for (let i = 0; i <= 48; i++) { const a = i / 48 * Math.PI * 2, r = EGG.whiteRadius * (1 + .08 * Math.sin(a * 5)); const x = Math.cos(a) * r, y = Math.sin(a) * r * .82; i ? shape.lineTo(x, y) : shape.moveTo(x, y); }
  const whiteMat = material(0xb9c2b5, { transparent: true, opacity: .7 }), yolkMat = material(0xf3b324, { roughness: .25 });
  const white = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: .0025, bevelEnabled: false }).rotateX(-Math.PI / 2), whiteMat);
  const yolk = new THREE.Mesh(new THREE.SphereGeometry(EGG.yolkRadius, 16, 10), yolkMat); yolk.scale.y = .44; yolk.position.set(.006, .006, -.003);
  object.add(white, yolk); white.receiveShadow = yolk.receiveShadow = true;
  return { object, show(item) {
    const t = Math.min(1, (item.machine.cook ?? 0) / EGG.seconds), burn = Math.max(0, Math.min(1, ((item.machine.cook ?? 0) - EGG.burnAt) / EGG.seconds));
    whiteMat.color.set(0xb9c2b5).lerp(new THREE.Color(0xfff6d7), t).lerp(new THREE.Color(0x574027), burn);
    whiteMat.opacity = .7 + .3 * t; yolkMat.color.set(0xf3b324).lerp(new THREE.Color(0xe9a827), t).lerp(new THREE.Color(0x745023), burn);
    object.scale.setScalar(Math.sqrt(Math.max(.1, item.amount)));
  } };
}

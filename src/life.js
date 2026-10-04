import * as THREE from 'three';
import { LIFE } from './config.js';

// The life simulator (epic #364): making, eating and cleaning up with real things in the flat. This module glues the
// life-sim layers to the game; what exists to build on is mapped in docs/livssimulator-inventering.md (#365).
//
// The developer scenario `&life` (#365, LIFE.dev): a reproducible start for tests and screenshots — every loose thing
// at home, every front and the fridge / freezer shut, no cat, the clock at noon and paused (unless &time), the visitor
// in the kitchen facing a free worktop with a few test things on it. It never touches the visitor's own home: resume.js
// neither reads nor writes the resume / F5 records with `&life`, and nothing the scenario sets is stored.

/** Is this page the `&life` developer scenario? */
export const lifeDev = (search = location.search) => new URLSearchParams(search).has('life');

/**
 * Set the scene for `&life`. `a` = the app's parts (main.js): { world, holdables, cups, things, milk, fish, fries, fruit,
 * airFryer, beer, cat, day, player, camera, at (true when &at= places the camera), timeGiven (true with &time) }.
 */
export function devScenario(a) {
  const D = LIFE.dev;
  if (!a.world.furnitureOn) { a.world.setFurniture(true); a.beer?.show(a.beer.out); } // (F off in this browser: on here, not stored)
  // everything home, every front shut
  for (const h of a.holdables) if (h.held) h.putBack();
  for (const h of a.holdables) if (h.placed) h.goHome();
  a.cups.reset();
  a.fish?.reset();
  a.fries?.reset();
  a.fruit?.reset();
  a.airFryer?.reset();
  for (const l of a.world.lids) if (l.isOpen && l.kind !== 'flush') { l.toggle(); for (let i = 0; i < 40; i++) l.update?.(0.1); }
  // no cat turns up (the scenario stays the same every time)
  if (a.cat.visible) a.cat.hide();
  a.cat.awayFor = Infinity;
  // the clock: noon, paused
  if (!a.timeGiven) { a.day.hour = D.hour; a.day.paused = true; a.day.update?.(0); }
  // the test things: an empty cup and the milk on the worktop, an empty wine glass on the dining table
  const top = a.world.cupSurfaces.find((s) => s.userData.counter)?.userData.surface ?? 0.93;
  const cup = a.cups.cups.find((c) => c.state === 'cabinet');
  if (cup) { cup.take(); cup.placeAt(new THREE.Vector3(D.cup[0], top, D.cup[1])); cup.model.rotation.set(0, 0, 0); }
  if (a.milk) { a.milk.take(); a.milk.placeAt(new THREE.Vector3(D.milk[0], top, D.milk[1])); a.milk.model.rotation.set(0, Math.PI / 2, 0); }
  const glass = a.things.find((t) => t.kind === 'glass' && t.name === 'vinglaset');
  const table = a.world.cupSurfaces.find((s) => Math.abs(s.userData.surface - 0.754) < 0.01)?.userData.surface ?? 0.754;
  if (glass) { glass.take(); glass.placeAt(new THREE.Vector3(D.glass[0], table, D.glass[1])); glass.model.rotation.set(0, 0, 0); }
  // the visitor in the kitchen, facing the worktop (unless &at= says otherwise)
  if (!a.at) {
    const [x, z, yaw, pitch] = D.at;
    a.player.spawn(x, z, THREE.MathUtils.degToRad(yaw));
    a.camera.rotation.x = THREE.MathUtils.degToRad(pitch);
  }
  return { cup, glass, milk: a.milk };
}

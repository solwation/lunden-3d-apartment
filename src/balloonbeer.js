import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { isStowed } from './holdable.js';
import { BeerCan, BeerPortion } from './beercan.js';
import { BALLOON } from './config.js';

// #1770: a few bottles of beer standing on the hot-air balloon's basket floor (src/balloon.js, BALLOON.beer, all *guess*). Each is a
// BeerCan (the fridge-shelf beer, #587) with the basket as its "shelf": E takes it, E / click in the hand drinks a gulp (same gulps,
// sounds, points and life portion as a shelf beer), it can be poured into a glass, put down, thrown in the bin. Its home is in the
// balloon's beer group (a child of the balloon mesh), so it rides with the basket and is hidden with the balloon.
// Carried away it is an ordinary held / put-down beer in the world (it never falls: nothing in this game does); a beer that is not in
// the hand when the balloon next appears (a new period of the shared wall clock) is back in the basket, full, with a new portion id
// (`balloonbeer:<appearance>:<spot>`, so the life it gives is claimed once per appearance). One merged vertex-coloured mesh per
// bottle (one draw call each, only while the balloon is drawn: never in the start view). Not saved (keep.js skips `isBalloonBeer`).

const NOTHING = { name: '', kind: 'none', pickable: new THREE.Object3D(), blocked: true };
const mat = new THREE.MeshLambertMaterial({ vertexColors: true });

function part(g, hex, y) {
  g.deleteAttribute('uv'); g = g.index ? g.toNonIndexed() : g; g.translate(0, y, 0);
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

/** A brown long-neck bottle with a cream label and a gold cap, its origin at the bottom centre. */
function bottleGeometry({ h, r } = BALLOON.beer) {
  const body = h * 0.6, shoulder = h * 0.15, neck = h * 0.2, cap = h * 0.05, seg = 12;
  return mergeGeometries([
    part(new THREE.CylinderGeometry(r, r, body, seg), 0x5b300f, body / 2),
    part(new THREE.CylinderGeometry(r * 1.02, r * 1.02, body * 0.45, seg, 1, true), 0xf0e2b6, body * 0.5), // the label
    part(new THREE.CylinderGeometry(r * 0.4, r, shoulder, seg, 1, true), 0x5b300f, body + shoulder / 2),
    part(new THREE.CylinderGeometry(r * 0.37, r * 0.4, neck, seg, 1, true), 0x5b300f, body + shoulder + neck / 2),
    part(new THREE.CylinderGeometry(r * 0.45, r * 0.45, cap, seg), 0xd8ae2e, body + shoulder + neck + cap / 2),
  ]);
}

export class BalloonBeer extends BeerCan {
  /** `balloon` = the Balloon (its `beerGroup` is the home frame), `i` = the bottle's spot on the basket floor. */
  constructor(scene, camera, balloon, i, cfg = BALLOON.beer) {
    const model = new THREE.Group(), mesh = new THREE.Mesh(BalloonBeer.geometry ??= bottleGeometry(cfg), mat);
    mesh.userData.noDetail = true; // (the small-detail culler would hide it by distance; it is drawn only with the balloon anyway)
    model.add(mesh);
    const a = cfg.at + (i - (cfg.count - 1) / 2) * cfg.step;
    model.position.set(Math.cos(a) * cfg.ring, 0.02, Math.sin(a) * cfg.ring); // (the basket floor is 0.02 m over the balloon's origin)
    model.rotation.set(0, -a, 0);
    super(scene, camera, { group: balloon.beerGroup, fridge: { isOpen: false } }, { object: model, beer: { name: cfg.name, type: 'bottle', ml: cfg.ml }, height: cfg.h, diameter: cfg.r * 2 }, i);
    Object.assign(this, { balloon, isBalloonBeer: true, keepName: `ölen i ballongkorgen ${i}` });
    model.traverse((m) => { if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; } });
  }

  newServing() {
    this.portionId = `balloonbeer:${this.balloon?.stock ?? 0}:${this.spot}`;
    this.portion = new BeerPortion({ id: this.portionId, total: this.full, drunk: 0, finished: false, kind: 'bottle' });
  }

  /** Nothing to take while the balloon is not up (it is still in the hidden basket); in the hand / put down it is a beer like any other. */
  get target() { return !this.held && !this.placed && !this.balloon.active ? NOTHING : super.target; }

  idle() {} // (no fridge: restock() brings it back)

  /** A new appearance `k` of the balloon: full and back in the basket, unless it is in the hand (then at the next one). */
  restock(k) {
    if (this.held || isStowed(this)) return false;
    Object.assign(this, { away: false, broken: false, ml: this.full, sip: 0, pourT: 0 });
    this.generation++;
    this.newServing();
    this.goHome();
    this.model.visible = true;
    return true;
  }
}

/** The basket's beers for `balloon` (main.js pushes them into the holdables). */
export const makeBalloonBeers = (scene, camera, balloon, cfg = BALLOON.beer) =>
  (balloon.beers = Array.from({ length: cfg.count }, (_, i) => new BalloonBeer(scene, camera, balloon, i, cfg)));

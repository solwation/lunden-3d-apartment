import * as THREE from 'three';
import { Holdable, heldItem, setHeld } from './holdable.js';
import { sfx } from './audio.js';
import { BEER_CAN as C } from './config.js';

// A beer from the fridge's beer shelf (#587, the packages of beershelf.js #511): with the fridge open E takes it
// ("Ta <the label's name>"), E with it in the hand drinks a gulp straight from the can or the bottle (no glass); it
// holds the package's ml and is empty after BEER_CAN.sips gulps. Empty it is a package for the bin (`discard`, like
// the milk carton): gone until the fridge is opened again after being shut, then a full one is back on the shelf.
// It is put down on tables / worktops and back on its shelf spot; F sends it home. Its home is in the shelf group's
// frame (a child of the fridge), so the closed fridge hides it with the rest of the shelf.

const NOTHING = { name: '', kind: 'none', pickable: new THREE.Object3D(), blocked: true };

export class BeerCan extends Holdable {
  /** `shelf` = the BeerShelf, `pkg` = one of its packages ({ beer, object, height, diameter }), `i` = its spot. */
  constructor(scene, camera, shelf, pkg, i) {
    const model = pkg.object, local = { pos: model.position.clone(), rot: model.rotation.clone() };
    const bottle = pkg.beer.type !== 'can';
    super(scene, camera, {
      name: pkg.beer.name, verb: 'ta', backName: 'kylskåpet', backVerb: `ställa tillbaka ${pkg.beer.name} i`, placeVerb: 'ställa ner',
      model, homeParent: shelf.group, local, home: { pos: new THREE.Vector3(), rot: new THREE.Euler() },
      heldPose: { pos: new THREE.Vector3(C.held.x, C.held.y, C.held.z), rot: new THREE.Euler(0.1, Math.PI - 0.3, -0.05) }, // (the label towards you)
      pick: { pos: new THREE.Vector3(), size: [pkg.diameter + 0.03, pkg.height + 0.03, pkg.diameter + 0.03] }, cooldown: C.cooldown,
    });
    Object.assign(this, { shelf, beer: pkg.beer, bottle, full: pkg.beer.ml, ml: pkg.beer.ml, sip: 0, away: false, fridgeWas: false,
      drinkKind: 'beer', keepName: `ölen på kylhyllan ${i}`, height: pkg.height }); // (keepName: the beers change daily, the spot stays)
    // the "put it back" box rides in the shelf group and only counts while it is held (as a trinket's in its drawer)
    const pick = this.backTarget.pickable;
    shelf.group.add(pick);
    pick.position.copy(local.pos).y += pkg.height / 2;
    const ray = pick.raycast.bind(pick);
    pick.raycast = (r, hits) => { if (this.held) ray(r, hits); };
    this.rest = { q: new THREE.Quaternion(), lift: 0 }; // it stands when put down (its origin is its bottom centre)
    model.traverse((m) => { if (m.isMesh) delete m.raycast; }); // (beershelf.js made them ray-transparent: now they are taken)
    const self = this;
    Object.defineProperty(this.takeTarget, 'name', { get: () => self.name, configurable: true });
    this.goHome();
  }

  get name() { return this.ml > 0.5 ? this.beer.name : this.bottle ? 'den tomma flaskan' : 'den tomma burken'; }
  set name(v) {} // (Holdable's constructor assigns opts.name)
  /** "Drick" while there is beer left. */
  get useLabel() { return this.ml > 0.5 ? 'Drick' : null; }
  /** What kind of waste it is (the bin, #386): an empty can / bottle is a package. */
  get wasteKind() { return this.ml > 0.5 ? null : 'package'; }
  get target() { return this.away ? NOTHING : super.target; }

  /** Home: its spot on the shelf, in the shelf group's frame. */
  goHome() {
    this.placed = false;
    this.homeParent.add(this.model);
    this.model.position.copy(this.local.pos);
    this.model.rotation.copy(this.local.rot);
  }

  /** Thrown away: out of the hand and gone; a full one is back on the shelf the next time the fridge is opened. */
  discard() {
    if (this.held) { this.held = false; if (heldItem() === this) setHeld(null); }
    this.away = true; this.fridgeWas = !!this.shelf.fridge.isOpen; this.ml = this.full;
    this.goHome();
    this.model.visible = false;
  }

  onTake() { sfx.click(this.where()); }
  onPut() { sfx.click(this.where()); this.sip = 0; }

  onUse() {
    if (this.ml <= 0.5) return;
    this.sip = 1;
    this.ml = Math.max(0, this.ml - this.full / C.sips);
    if (this.ml < 0.5) this.ml = 0; // (n × full/n is not quite full in floats)
    this.onGulp?.();
    sfx.gulp(this.where());
  }

  idle() { // thrown away: back the next time the fridge is opened after being shut
    if (!this.away) return;
    const open = !!this.shelf.fridge.isOpen;
    if (open && !this.fridgeWas) { this.away = false; this.model.visible = true; this.goHome(); }
    this.fridgeWas = open;
  }

  tick(dt) {
    this.sip = Math.max(0, this.sip - dt * 1.6);
    const k = Math.sin(this.sip * Math.PI); // up to the mouth, tipped, and down again
    const light = C.lift * (1 - this.ml / this.full); // lighter with every gulp: it rides a little higher in the hand
    const r = this.heldPose.rot, p = this.heldPose.pos;
    this.model.position.set(p.x - 0.14 * k, p.y + light + 0.18 * k, p.z + 0.08 * k);
    this.model.rotation.set(r.x + 1.1 * k, r.y, r.z + 0.3 * k);
  }

  /** The saved state (keep.js `x`): null for a full one. */
  keepState() { return this.ml < this.full || this.away ? { ml: Math.round(this.ml), ...(this.away ? { away: 1 } : {}) } : null; }
  loadKeep(s) {
    if (!s || typeof s !== 'object') return;
    if (Number.isFinite(s.ml)) this.ml = Math.max(0, Math.min(this.full, s.ml));
    if (s.away) { if (this.held) this.putBack(); this.away = true; this.model.visible = false; this.fridgeWas = !!this.shelf.fridge.isOpen; }
  }
}

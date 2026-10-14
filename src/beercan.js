import * as THREE from 'three';
import { Holdable, heldItem, setHeld } from './holdable.js';
import { sfx } from './audio.js';
import { BEER_CAN as C, DRINKS as D } from './config.js';

// A beer from the fridge's beer shelf (#587, the packages of beershelf.js #511): with the fridge open E takes it
// ("Ta <the label's name>"), E with it in the hand drinks a gulp straight from the can or the bottle; it
// holds the package's ml and is empty after BEER_CAN.sips gulps. Empty it is a package for the bin (`discard`, like
// the milk carton): gone until the fridge is opened again after being shut, then a full one is back on the shelf.
// It is put down on tables / worktops and back on its shelf spot; F sends it home. Its home is in the shelf group's
// frame (a child of the fridge), so the closed fridge hides it with the rest of the shelf. #1007: its normal pour
// interface also fills existing Glass objects, retaining one original consumption ledger across all portions.

const NOTHING = { name: '', kind: 'none', pickable: new THREE.Object3D(), blocked: true };

/** A shared portion consumption contract for beer portions (#1006, #1007). */
export class BeerPortion {
  constructor({ id, total, drunk = 0, finished = false, kind = 'beer' }) {
    this.id = id;
    this.total = total;
    this.drunk = drunk;
    this.finished = finished;
    this.kind = kind;
  }

  drink(amount) {
    if (this.finished) return { amount: 0, terminal: false, finished: true };
    const step = Math.min(amount, Math.max(0, this.total - this.drunk));
    this.drunk += step;
    const terminal = !this.finished && (this.drunk >= this.total - 1e-4);
    if (terminal) this.finished = true;
    return { amount: step, terminal, finished: this.finished };
  }

  toJSON() {
    return {
      id: this.id,
      total: this.total,
      drunk: this.drunk,
      fin: this.finished ? 1 : 0,
      kind: this.kind,
    };
  }

  static fromJSON(s, shared = new Map()) {
    if (!s || typeof s.id !== 'string' || !s.id.length || s.id.length > 64 || !Number.isFinite(s.total) || s.total <= 0
      || !Number.isFinite(s.drunk) || s.drunk < 0 || s.drunk > s.total) return null;
    const prior = shared.get(s.id);
    if (prior && prior.total !== s.total) return null;
    const portion = prior ?? new BeerPortion({ id: s.id, total: s.total, kind: typeof s.kind === 'string' ? s.kind : 'beer' });
    portion.drunk = Math.max(portion.drunk, s.drunk);
    portion.finished ||= !!s.fin || !!s.finished || portion.drunk >= portion.total - 1e-4;
    shared.set(s.id, portion);
    return portion; // silent restore; shared progress never invokes a consumption callback
  }

}

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
      drinkKind: 'beer', pourT: 0, pourSecs: 1, keepName: `ölen på kylhyllan ${i}`, height: pkg.height, spot: i, generation: 1 }); // (keepName: the beers change daily, the spot stays)
    this.newServing();
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

  newServing() {
    this.portionId = `beercan:${this.spot}:${this.generation}`;
    this.portion = new BeerPortion({
      id: this.portionId,
      total: this.full,
      drunk: 0,
      finished: false,
      kind: this.bottle ? 'bottle' : 'can',
    });
  }

  get name() { return this.ml > 0.5 ? this.beer.name : this.bottle ? 'den tomma flaskan' : 'den tomma burken'; }
  set name(v) {} // (Holdable's constructor assigns opts.name)
  /** "Drick" while there is beer left. */
  get drink() { return this.ml > 0.5 && !this.away ? 'beer' : null; }
  /** Reserve actual ml once; the receiving glass keeps the SAME ledger, never a new portion. */
  pour(secs, ml = 0) {
    const amount = Math.max(0, Math.min(this.ml, ml));
    this.ml -= amount; this.pourT = this.pourSecs = secs;
    return { portion: this.portion, ml: amount };
  }

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
  onPut() { sfx.click(this.where()); this.sip = this.pourT = 0; }

  onUse() {
    if (this.ml <= 0.5) return;
    this.sip = 1;
    const gulp = this.full / C.sips;
    const canDrink = Math.min(this.ml, gulp);
    this.ml = Math.max(0, this.ml - gulp);
    if (this.ml < 0.5) this.ml = 0; // (n × full/n is not quite full in floats)
    this.onGulp?.();
    sfx.gulp(this.where());
    if (this.portion) {
      const res = this.portion.drink(canDrink);
      if (res.terminal) this.onConsume?.(this, this.portionId);
    }
  }

  idle() { // thrown away: back the next time the fridge is opened after being shut
    if (!this.away) return;
    const open = !!this.shelf.fridge.isOpen;
    if (open && !this.fridgeWas) {
      this.away = false;
      this.model.visible = true;
      this.generation++;
      this.ml = this.full;
      this.newServing();
      this.goHome();
    }
    this.fridgeWas = open;
  }

  tick(dt) {
    this.sip = Math.max(0, this.sip - dt * 1.6);
    this.pourT = Math.max(0, this.pourT - dt);
    const k = Math.sin(this.sip * Math.PI); // up to the mouth, tipped, and down again
    const light = C.lift * (1 - this.ml / this.full); // lighter with every gulp: it rides a little higher in the hand
    const r = this.heldPose.rot, p = this.heldPose.pos;
    this.model.position.set(p.x - 0.14 * k, p.y + light + 0.18 * k, p.z + 0.08 * k);
    this.model.rotation.set(r.x + 1.1 * k, r.y, r.z + 0.3 * k + (this.pourT > 0 ? D.tilt * Math.sin(Math.PI * (1 - this.pourT / this.pourSecs)) : 0));
  }

  /** The saved state (keep.js `x`): null for a full one. */
  keepState() {
    const modified = this.ml < this.full || this.away || this.portion?.drunk > 0 || this.portion?.finished || this.generation > 1;
    if (!modified) return null;
    return {
      ml: this.ml,
      gen: this.generation,
      portionId: this.portionId,
      drunk: Math.round((this.portion?.drunk ?? (this.full - this.ml)) * 10) / 10,
      fin: this.portion?.finished ? 1 : 0,
      portion: this.portion.toJSON(),
      ...(this.away ? { away: 1 } : {}),
    };
  }

  loadKeep(s, shared = new Map()) {
    if (!s || typeof s !== 'object') return;
    if (Number.isFinite(s.ml)) this.ml = Math.max(0, Math.min(this.full, s.ml));
    if (Number.isInteger(s.gen) && s.gen >= 1) this.generation = s.gen;
    if (typeof s.portionId === 'string' && s.portionId.length > 0 && s.portionId.length <= 64) {
      this.portionId = s.portionId;
    } else {
      this.portionId = `beercan:${this.spot}:${this.generation}`;
    }
    const drunk = Number.isFinite(s.drunk) ? Math.max(0, Math.min(this.full, s.drunk)) : Math.max(0, this.full - this.ml);
    const finished = !!s.fin || (this.ml <= 0 && drunk >= this.full - 0.5);
    const record = s.portion ? { ...s.portion, fin: s.portion.fin || s.portion.finished || s.fin } : { id: this.portionId, total: this.full, drunk, fin: finished ? 1 : 0, kind: this.bottle ? 'bottle' : 'can' };
    const bad = shared.invalid?.has(this.portionId) || record.id !== this.portionId || record.total !== this.full || ((record.fin || record.finished) && record.drunk < record.total - 1e-4);
    this.portion = bad ? null : BeerPortion.fromJSON(record, shared);
    if (!this.portion) { this.ml = 0; this.portion = new BeerPortion({ id: this.portionId, total: this.full, drunk: 0, finished: true }); }

    if (s.away) {
      if (this.held) this.putBack();
      this.away = true;
      this.model.visible = false;
      this.fridgeWas = !!this.shelf.fridge.isOpen;
    }
  }
}

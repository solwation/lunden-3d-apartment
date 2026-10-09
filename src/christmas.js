import * as THREE from 'three';
import { XMAS_TREE as X } from './config.js';
import { daysIn } from './daycycle.js';
import { crownRadius } from './xmastree.js';

// The Christmas season (#571): the tree (a FURNITURE piece, src/xmastree.js) stands from XMAS_TREE.season.from to .to
// inclusive (1 Dec – 6 Jan) by the game's date (the day cycle: today on a new visit, the kitchen calendar's choice),
// and is hidden, unpickable, without collision and without light the rest of the year. While it stands, the furniture
// whose CURRENT pose overlaps its crown (the palm and the ZZ plant at the default spot) is hidden for the time being —
// a visibility layer only: no pose, revision or saved arrangement changes. What stands on such a piece (pieces on its
// surfaces, loose things on it) goes with it, its lamps give no light, its collision and E targets go away. The tree is
// an ordinary movable piece in Möblera om: a confirmed move is saved like any other (rearrange.js), the layer follows it.
// Hidden roots carry `userData.seasonHidden` (main.js / lights.js / world.js / rearrange.js read it).

/** Is (year, month 1–12, date) in the Christmas season? Inclusive both ends, across the new year. */
export function inChristmas(year, month, date) {
  const d = Math.min(date, daysIn(year, month)), key = month * 100 + d;
  const from = X.season.from[0] * 100 + X.season.from[1], to = X.season.to[0] * 100 + X.season.to[1];
  return from <= to ? key >= from && key <= to : key >= from || key <= to;
}

/** Is `o` or one of its parents hidden by the season layer? */
export const seasonHidden = (o) => { for (; o; o = o.parent) if (o.userData.seasonHidden) return true; return false; };

const V = THREE.Vector3;
/** World box of a piece's solid geometry, judged within the piece only (the furniture group may be hidden by F). */
function solidBounds(root) {
  root.updateWorldMatrix(true, true);
  const b = new THREE.Box3(), box = new THREE.Box3();
  root.traverse((o) => {
    if (!o.isMesh || o.userData.surface !== undefined) return;
    for (let p = o; p && p !== root; p = p.parent) if (!p.visible) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (mats.every((m) => m.blending === THREE.AdditiveBlending || m.blending === THREE.CustomBlending)) return;
    if (o.isInstancedMesh) o.computeBoundingBox(); else if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    b.union(box.copy(o.isInstancedMesh ? o.boundingBox : o.geometry.boundingBox).applyMatrix4(o.matrixWorld));
  });
  return b;
}
/** Distance in plan from (x, z) to a convex polygon [[x, z] …] (0 inside). */
function polyDist(poly, x, z) {
  let pos = 0, neg = 0, best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length], dx = bx - ax, dz = bz - az;
    const cross = dx * (z - az) - dz * (x - ax);
    if (cross > 0) pos++; else if (cross < 0) neg++;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(ax + dx * t - x, az + dz * t - z));
  }
  return !pos || !neg ? 0 : best; // inside (either winding): every edge on the same side
}

export class ChristmasSeason {
  /** rearrange: the Rearrange (its pieces, groups, loose things, collision refresh); lights: for the tree's lamp;
   * changed(hiddenPieces): main.js's hook after every re-judgement (stand up from a hidden seat, redraw shadows). */
  constructor({ rearrange, lights, changed }) {
    Object.assign(this, { rearrange, changed, active: null, dirty: false, time: 0, list: [] });
    this.tree = rearrange.pieces.find((p) => p.item.type === 'xmastree') ?? null;
    this.lamp = lights.floorLamps.find((f) => f.spec.object === this.tree?.object) ?? null;
    rearrange.overlay = this;
    this.furnitureOn = rearrange.world.furnitureOn;
  }

  /** Every frame: the date (the day cycle) decides; furniture moves and F re-judge the overlap. */
  update(day, dt) {
    if (!this.tree) return;
    const on = inChristmas(day.year, day.month, day.date);
    if (on !== this.active) this.setActive(on);
    if (this.rearrange.world.furnitureOn !== this.furnitureOn) { this.furnitureOn = this.rearrange.world.furnitureOn; this.dirty = true; }
    if (this.dirty) this.recompute();
    if (this.active && this.tree.object.visible) this.tree.object.userData.xmas.animate(this.time += dt, this.lamp?.k ?? 1);
  }

  get busy() { return !!(this.rearrange.selected || this.rearrange.saving); }

  setActive(on) {
    if (this.busy) {
      if (on || !this.rearrange.selected?.group.includes(this.tree) || this.rearrange.saving) return; // after the move (next frame)
      this.rearrange.cancel(); // the season ended under a tree being moved: drop the move
    }
    this.active = on;
    const o = this.tree.object;
    o.visible = on; o.userData.seasonHidden = !on;
    this.lamp?.set(on); // lit whenever it stands (E switches it off and on again)
    this.recompute();
  }

  /** Show everything the layer hid (as it was). */
  reveal() {
    for (const { object, was } of this.list) { object.visible = was; delete object.userData.seasonHidden; }
    const any = this.list.length > 0;
    this.list = [];
    return any;
  }

  /** The pieces (not rugs, not the tree) on the tree's level whose current pose reaches into its crown. */
  overlapping() {
    const t = this.tree, at = new V().setFromMatrixPosition(t.object.matrixWorld), floor = at.y, margin = 0.02;
    const top = floor + X.crown.top + X.star.size * 1.7;
    return this.rearrange.pieces.filter((p) => {
      if (p === t || p.level !== t.level || p.item.type === 'rug' || !p.object.visible) return false;
      const b = solidBounds(p.object);
      if (b.isEmpty() || b.min.y > top) return false;
      const fp = p.object.userData.footprint;
      let d;
      if (fp?.length) d = Math.min(...fp.map((r) => polyDist([[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]].map(([x, z]) => { const v = p.object.localToWorld(new V(x, 0, z)); return [v.x, v.z]; }), at.x, at.z)));
      else d = Math.hypot(Math.max(b.min.x - at.x, 0, at.x - b.max.x), Math.max(b.min.z - at.z, 0, at.z - b.max.z));
      // the crown narrows upwards: a thing high up (a picture) only counts where the crown is still that wide
      return d < crownRadius(Math.max(b.min.y - floor, X.crown.bottom)) + margin;
    });
  }

  /** Re-judge which pieces the tree hides (after a date change, a furniture move, F). Never during a move in Möblera om:
   * the hidden pieces stay as they are until it is confirmed or cancelled. */
  recompute() {
    if (this.busy) { this.dirty = true; return; }
    this.dirty = false;
    this.reveal();
    const R = this.rearrange, gone = [];
    if (this.active && R.world.furnitureOn) {
      R.scene.updateMatrixWorld(true);
      const pieces = new Set();
      for (const p of this.overlapping()) for (const q of R.groupFor(p)) if (q !== this.tree) pieces.add(q);
      const loose = new Set([...pieces].flatMap((p) => R.looseOn(p)));
      for (const p of pieces) { this.list.push({ object: p.object, was: p.object.visible }); gone.push(p); }
      for (const h of loose) this.list.push({ object: h.model, was: h.model.visible });
      for (const { object } of this.list) { object.visible = false; object.userData.seasonHidden = true; }
    }
    R.refresh(); // collision without the hidden pieces (and without the tree out of season)
    for (const { object } of this.list) object.visible = false; // (refresh → world.setFurniture shows every loose item again)
    this.changed?.(gone);
  }

  /** (tests) */
  get hiddenPieces() { return this.rearrange.pieces.filter((p) => p.object.userData.seasonHidden && p !== this.tree); }
}

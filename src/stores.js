import * as THREE from 'three';
import { LIFE } from './config.js';
import { heldItem } from './holdable.js';

// The life simulator's storage places (#369, LIFE-005): explicit slots with a size class, no packing physics. Each store is
// registered with the item rules (items.js addStore: name, slots, isOpen, the Swedish "Öppna … först" / "… är full") and
// gets one anchor per slot in the scene (life.anchors): what lies in a slot is a child of its anchor, so it rides with a
// drawer or a door and is hidden with the front's static contents (contents.js) while that is shut.
//   fridge    the glass shelves (the chicken's and the milk's places stay free) + the door bins (on the door: they swing)
//   freezer   on top of the frozen bags in its top basket; slot 3 on the lower open shelf beside the fish fingers (#373)
//   pantry    the wall cabinet beyond the hob (interior.js stock 'pantry'): the front of its bottom and its shelf
//   utensils  the top drawer under the hob: on the folded towels at its front (the kitchen knife, butter knife, cheese slicer, #374)
//   plates    a stack of three plates in the wall cabinet over the free worktop (#379)
//   glasses   three drinking glasses at the front of the glass cabinet next to it (#382)
//   sinkBins  the grey bin under the sink, "Avfall" (#381): the life sim's waste bin
//   dwLower / dwUpper / dwTray  the dishwasher's racks (#384): plates on edge, glasses upside down, the tools on the tray
//   boardRack the cutting board's place: on its long edge against the splashback between the sink and the hob (#374)
// A pick box inside each store is the E target "Lägga … i …" while a life item is held (and only then, so it never covers
// the things inside). Opening and shutting never makes or loses a thing: the slots are data.

const UP = new THREE.Vector3(0, 1, 0);

/** An anchor at world point `p` turned `yaw`, as a child of `parent` (its current world pose). */
function anchorIn(parent, p, yaw) {
  const a = new THREE.Object3D();
  parent.updateWorldMatrix(true, false);
  const inv = parent.matrixWorld.clone().invert();
  a.position.copy(p).applyMatrix4(inv);
  const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
  const pq = parent.getWorldQuaternion(new THREE.Quaternion()).invert();
  a.quaternion.copy(pq.multiply(q));
  parent.add(a);
  return a;
}

/** An anchor at world point `p` with the world turn `q`, as a child of `parent` (#384: a plate on edge, a glass upside down). */
function anchorQ(parent, p, q) {
  const a = new THREE.Object3D();
  parent.updateWorldMatrix(true, false);
  a.position.copy(p).applyMatrix4(parent.matrixWorld.clone().invert());
  a.quaternion.copy(parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q));
  parent.add(a);
  return a;
}
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** A pick box (invisible) at world box `[min, max]` under `parent`; it only raycasts while `when()`. */
function pickBox(parent, min, max, when) {
  const size = new THREE.Vector3().subVectors(max, min), mid = new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5);
  const m = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), new THREE.MeshBasicMaterial());
  m.visible = false; // (shown() in main.js looks at the parents only; the box itself is never drawn)
  parent.updateWorldMatrix(true, false);
  m.position.copy(mid).applyMatrix4(parent.matrixWorld.clone().invert());
  parent.add(m);
  const ray = m.raycast.bind(m);
  m.raycast = (r, hits) => { if (when()) ray(r, hits); };
  return m;
}

/**
 * Register the stores. `world` = buildWorld's result (lids: the fridge, the freezer, the kitchen fronts). Returns
 * { stores: { id → spec }, targets: [E targets] } and puts each store in `life`.
 */
export function buildStores(life, world) {
  const I = life.items, S = LIFE.stores, out = {}, targets = [];
  const holding = () => !!I.held();
  function add(id, spec, slots, box) {
    const anchors = slots.map((s) => s.anchor);
    I.addStore({ id, name: spec.name, shutText: spec.shutText, fullText: spec.fullText, isOpen: spec.isOpen, carriers: !!spec.carriers, slots: slots.map((s) => ({ size: s.size })) });
    life.anchors.set(id, (k) => anchors[k] ?? null);
    const target = { name: spec.name, kind: 'life', store: id, pickable: box, outlineRoot: spec.outlineRoot, outlineOwner: spec.outlineOwner };
    target.options = () => life.options(target);
    target.toggle = () => life.run(target);
    Object.defineProperties(target, {
      blocked: { get: () => !target.options().some((a) => !a.reason) },
      blockedText: { get: () => target.options()[0]?.reason ?? null },
    });
    box.userData.door = target;
    targets.push(target);
    out[id] = { ...spec, anchors, target, box };
  }

  // the fridge: three spots across each free glass shelf (things lie along its depth), two per door bin
  const fridge = world.lids.find((l) => l.kind === 'fridge' && !l.freezer);
  if (fridge?.inside) {
    const { cx, cz, iw, depth, y0 } = fridge.inside, slots = [];
    for (const y of S.fridge.shelves) for (const dx of [-0.17, 0, 0.17]) slots.push({ size: 'm', anchor: anchorIn(fridge.object, new THREE.Vector3(cx + dx * iw / 0.55, y0 + y + 0.004, cz), -Math.PI / 2) });
    const s = fridge.sign, w = fridge.size.w;
    for (const [y, xs] of S.fridge.bins) for (const k of xs) {
      const a = new THREE.Object3D();
      a.position.set(s * w * k, y - 0.035, 0.035);
      fridge.door.add(a);
      slots.push({ size: 's', anchor: a });
    }
    const box = pickBox(fridge.object, new THREE.Vector3(cx - iw / 2, y0 + 0.4, cz - depth / 2), new THREE.Vector3(cx + iw / 2, y0 + 1.7, cz + depth / 2), () => holding() && fridge.isOpen);
    add('fridge', { outlineRoot: fridge.object, outlineOwner: fridge, name: 'kylskåpet', shutText: 'Öppna kylen först', fullText: 'Kylskåpet är fullt', isOpen: () => fridge.isOpen, carriers: true }, slots, box); // (a plate with food on it goes in too, #370)
  }
  // the freezer: on the frozen bags in the top basket
  const freezer = world.lids.find((l) => l.kind === 'fridge' && l.freezer);
  if (freezer?.inside) {
    const { cx, cz, iw, depth, y0 } = freezer.inside, y = y0 + S.freezer.y;
    const slots = [-0.15, 0, 0.15].map((dx) => ({ size: 'm', anchor: anchorIn(freezer.object, new THREE.Vector3(cx + dx * iw / 0.55, y, cz + 0.02), -Math.PI / 2) }));
    if (freezer.shelves) slots.push({ size: 'm', anchor: anchorIn(freezer.object, new THREE.Vector3(cx + S.freezer.peas * iw / 0.55, freezer.shelves[0] + 0.002, cz - 0.03), -Math.PI / 2) }); // slot 3: the lower open shelf beside the fish fingers (#373)
    const box = pickBox(freezer.object, new THREE.Vector3(cx - iw / 2, y0 + 0.4, cz - depth / 2), new THREE.Vector3(cx + iw / 2, y0 + 1.75, cz + depth / 2), () => holding() && freezer.isOpen);
    add('freezer', { outlineRoot: freezer.object, outlineOwner: freezer, name: 'frysen', shutText: 'Öppna frysen först', fullText: 'Fryslådan är full', isOpen: () => freezer.isOpen }, slots, box);
  }
  // New cold drawers have separate stable stores; old shelf ids/indices keep saved food and its homes (#504).
  for (const owner of [fridge, freezer].filter(Boolean)) for (const drawer of owner.drawers) {
    const slots = drawer.slotPoints.map(p => ({ size: 'm', anchor: anchorIn(drawer.object, p, -Math.PI / 2) }));
    const open = () => owner.isOpen && owner.t === 1 && drawer.isOpen && drawer.t === 1;
    const box = pickBox(drawer.object, drawer.bounds.min, drawer.bounds.max, () => !!heldItem() && open());
    add(drawer.storeId, { outlineRoot: drawer.object, outlineOwner: drawer, name: drawer.name,
      fullText: `${cap(drawer.name)} är full`, isOpen: open, carriers: true }, slots, box);
    // Transparent walls remain visible but allow selecting the actual food behind them.
    drawer.object.traverse(mesh => {
      if (!mesh.isMesh) return;
      const raycast = mesh.raycast.bind(mesh), ownHits = [];
      mesh.raycast = (ray, hits) => {
        ownHits.length = 0; raycast(ray, ownHits);
        if (!ownHits.length) return;
        if (open()) {
          if (heldItem() && mesh === drawer.body) return; // loading box owns the body; grip still closes
          const contents = I.all().filter(it => it.place.at === 'slot' && it.place.store === drawer.storeId)
            .map(it => life.view(it)?.target.pickable).filter(Boolean);
          if (contents.length && ray.intersectObjects(contents, true).length) return;
        }
        hits.push(...ownHits);
      };
    });
    Object.defineProperty(I.store(drawer.storeId), 'shutText', { get: () => owner.isOpen ? `Dra ut ${drawer.name} helt först` : `Öppna ${owner.freezer ? 'frysen' : 'kylen'} först` });
  }
  // a kitchen front's slots from its stock frame: [u (0…1 across), d (m in front of the plane, < 0 inside), y (m over the bottom
  // of its contents box), size, yaw (extra turn)] — in its contents group (rides with a drawer, hidden while shut)
  function front(id, o, spec, list) {
    const F = o?.stockFrame;
    if (!F) return;
    const parent = o.contents ?? (() => { const g = new THREE.Group(); (F.drawer ? o.object : world.object ?? o.object.parent).add(g); return g; })();
    const b = F.b, uAt = (k) => b.a0 + (b.a1 - b.a0) * k;
    const slots = list.map(([k, d, y, size, yaw = 0]) => ({ size, anchor: anchorIn(parent, F.at(uAt(k), d(b), b.y0 + y(b)), F.yaw + yaw) }));
    const p0 = F.at(b.a0, b.d0), p1 = F.at(b.a1, b.d1);
    const box = pickBox(F.drawer ? o.object : parent, new THREE.Vector3(Math.min(p0.x, p1.x), b.y0, Math.min(p0.z, p1.z)), new THREE.Vector3(Math.max(p0.x, p1.x), b.y1, Math.max(p0.z, p1.z)), () => holding() && o.isOpen);
    add(id, { ...spec, outlineRoot: o.object, outlineOwner: o, isOpen: () => o.isOpen }, slots, box);
  }
  const pantry = world.lids.find((l) => l.stock === 'pantry');
  front('pantry', pantry, { name: 'skafferiet', shutText: 'Öppna skafferiet först', fullText: 'Skafferiet är fullt' }, [
    [0.5, (b) => b.d1 - 0.065, () => 0.002, 'm'],                                  // the bottom, in front of the boxes
    [0.27, (b) => b.d1 - 0.07, (b) => (b.shelf ?? b.y0) - b.y0 + 0.002, 's'],        // the shelf, in front of the jars
    [0.73, (b) => b.d1 - 0.07, (b) => (b.shelf ?? b.y0) - b.y0 + 0.002, 's'],
  ]);
  const drawer = world.lids.find((l) => l.stock === 'utensils');
  front('utensils', drawer, { name: 'lådan', shutText: 'Öppna lådan först', fullText: 'Lådan är full' }, [0.03, 0.06, 0.105].map((dd) => [0.5, (b) => b.d1 - dd, () => 0.046, 's'])); // the kitchen knife, the butter knife, the cheese slicer (#374)
  // the plates (#379): a stack of plates on the bottom of the wall cabinet over the free worktop (its static stack left out)
  const plates = world.lids.find((l) => l.stock === 'platesLife');
  front('plates', plates, { name: 'skåpet', shutText: 'Öppna skåpet först', fullText: 'Där får inte plats fler tallrikar' },
    [0, 1, 2].map((k) => [0.5, (b) => (b.d0 + b.d1) / 2, () => 0.002 + k * S.plates.stack, 'm']));
  for (const id of ['utensils', 'plates']) if (I.store(id)) I.store(id).cleanOnly = true; // washed up first (#383, LIFE.rules.washFirst)
  if (I.store('plates')) Object.assign(I.store('plates'), { accepts: ['plate'], putLabel: (held) => `ställa ${I.name(held)} i skåpet` });
  // the drinking glasses (#382): three at the front of the glass cabinet's lower shelf (its static glasses stand behind them)
  const glassCab = world.lids.find((l) => l.stock === 'glasses');
  front('glasses', glassCab, { name: 'glasskåpet', shutText: 'Öppna glasskåpet först', fullText: 'Där får inte plats fler glas' },
    S.glasses.map((k) => [k, (b) => b.d1 - 0.05, () => 0.002, 's']));
  if (I.store('glasses')) Object.assign(I.store('glasses'), { cleanOnly: true, accepts: ['glass'], putLabel: (held) => `ställa ${I.name(held)} i skåpet` });
  // the waste bin under the sink (#381): one slot in the grey bin behind the bins' door; its anchor is scaled to the bin, so
  // the bin item's model (lifemodels.js `bin`, built 1 × 1 × 1) fits it. Another bin elsewhere (a bathroom's) is the same:
  // a store with one slot for an ITEMS 'bin' and an entry in a stock list.
  const bins = world.lids.find((l) => l.bin);
  if (bins) {
    const B = bins.bin, a = new THREE.Object3D();
    a.position.copy(B.pos); a.rotation.y = B.yaw; a.scale.set(B.w, B.h, B.d);
    life.scene.add(a); // (fitted like the bins: F keeps it)
    const never = pickBox(life.scene, B.pos.clone(), B.pos.clone().addScalar(0.01), () => false); // (nobody puts a bin in)
    add('sinkBins', { name: 'skåpet', shutText: 'Öppna skåpet under diskhon först', fullText: 'Där står redan en hink', isOpen: () => bins.isOpen }, [{ size: 'xl', anchor: a }], never);
    I.store('sinkBins').accepts = ['bin'];
    // #386: the green bin (Matavfall, behind both doors: either opens it) and the small blue one (Förpackningar, the left door)
    for (const [id, k, type] of [['binsPack', 0, 'binPack'], ['binsFood', 1, 'binFood']]) {
      const b = bins.bins?.[k];
      if (!b) continue;
      const an = new THREE.Object3D();
      an.position.copy(b.pos); an.rotation.y = b.yaw; an.scale.set(b.w, b.h, b.d);
      life.scene.add(an);
      const open = b.door === 'left' ? () => !!bins.leftDoor?.isOpen : () => bins.isOpen || !!bins.leftDoor?.isOpen;
      add(id, { name: 'skåpet', shutText: 'Öppna skåpet under diskhon först', fullText: 'Där står redan en hink', isOpen: open }, [{ size: 'xl', anchor: an }], pickBox(life.scene, b.pos.clone(), b.pos.clone().addScalar(0.01), () => false));
      I.store(id).accepts = [type];
    }
  }
  // the dishwasher's racks (#384, dishwasher.js): the lower rack's plates, the upper rack's glasses, the cutlery tray's tools;
  // reached only with the door down and that rack rolled out; the wrong rack says which is right; not what is washed by hand
  // (the wooden board), not with food or a drink left in it (one rule: refused, scrape / pour out first)
  const dwDoor = world.lids.find((l) => l.name === 'diskmaskinen' && l.racks);
  if (dwDoor) {
    const [lower, upper] = dwDoor.racks;
    // A basket's broad hit surface must not cover its dishes or the existing loading targets (#503).
    for (const [rack, ids] of [[lower, ['dwLower']], [upper, ['dwUpper', 'dwTray']]]) {
      rack.pickThrough = (ray) => {
        if (!rack.isOpen || !dwDoor.isOpen) return false;
        if (heldItem()) return true;
        const targets = I.all().filter(it => it.place.at === 'slot' && ids.includes(it.place.store))
          .map(it => life.view(it)?.target.pickable).filter(Boolean);
        for (const id of ids) for (const cup of I.store(id)?.parkedCups?.values() ?? []) targets.push(cup.target.pickable);
        return targets.length > 0 && ray.intersectObjects(targets, true).length > 0;
      };
    }
    const right = { plate: 'Tallrikar i underkorgen', glass: 'Glas i överkorgen', tool: 'Bestick i bestickkorgen' };
    const rightText = (it) => (it.isCup ? 'Glas och koppar i överkorgen' : Object.entries(right).find(([t]) => I.has(it, t) || it.type === t)?.[1] ?? `${cap(I.name(it))} ska inte i diskmaskinen`);
    const the = (k) => ({ water: 'vattnet', milk: 'mjölken' })[k] ?? 'det';
    for (const [id, rack, accept, name, full] of [['dwLower', lower, 'plate', 'underkorgen', 'Underkorgen är full'], ['dwUpper', upper, 'glass', 'överkorgen', 'Överkorgen är full'], ['dwTray', upper, 'tool', 'bestickkorgen', 'Bestickkorgen är full']]) {
      const list = rack.slots.filter((s) => s.accepts.includes(accept));
      const slots = list.map((s) => ({ size: s.size, anchor: anchorQ(rack.object, s.pos, s.quat) }));
      const bb = new THREE.Box3();
      for (const s of list) bb.expandByPoint(s.pos);
      bb.expandByVector(new THREE.Vector3(0.09, 0.08, 0.09));
      const box = pickBox(rack.object, bb.min, bb.max, () => (holding() || !!heldItem()?.isCup) && rack.isOpen && dwDoor.isOpen);
      add(id, { outlineRoot: rack.object, outlineOwner: rack, name, fullText: full, isOpen: () => dwDoor.isOpen && rack.isOpen }, slots, box);
      const st = I.store(id);
      Object.defineProperty(st, 'shutText', { get: () => (dwDoor.isOpen ? `Dra ut ${rack.name} först` : 'Öppna diskmaskinen först'), configurable: true });
      Object.assign(st, {
        dishwasher: true,
        putLabel: (held) => `ställa ${held?.isCup ? 'koppen' : I.name(held)} i ${name}`,
        refuse: (it) => { // why it may not go in here, or null
          if (it.isCup) {
            if (accept !== 'glass') return rightText(it);
            if (it.fill > 0.01) return 'Häll ut det som är i koppen först';
            return null;
          }
          if (!I.has(it, 'dishwasherSafe')) return `${cap(I.name(it))} diskas för hand`;
          if (!(I.has(it, accept) || it.type === accept)) return rightText(it);
          if (I.children(it).length) return `Skrapa av ${I.name(it)} först`;
          if (it.amount > 0.5 && it.machine?.drink) return `Häll ut ${the(it.machine.drink)} först`;
          return null;
        },
      });
      if (id === 'dwUpper') {
        const parkedCups = new Map();
        st.parkedCups = parkedCups;
        st.occupant = (slot) => parkedCups.get(slot) ?? null;
        st.freeSlot = () => {
          for (let k = 0; k < slots.length; k++) {
            if (!parkedCups.has(k) && !I.occupant({ at: 'slot', store: 'dwUpper', slot: k })) return k;
          }
          return -1;
        };
        st.parkCup = (cup, slot) => {
          parkedCups.set(slot, cup);
          cup.parkInRack?.(rack, slot, life.anchors.get('dwUpper')(slot), st);
        };
        st.unparkCup = (cup) => {
          for (const [slot, c] of parkedCups.entries()) {
            if (c === cup) {
              parkedCups.delete(slot);
              break;
            }
          }
        };
        out[id].parkCup = st.parkCup;
        out[id].unparkCup = st.unparkCup;
        out[id].parkedCups = parkedCups;
      }
      st.slots.forEach((s) => { s.accepts = [accept]; });
    }
  }
  // the cutting board's place (#374): on its long edge on the worktop, leaning on the splashback between the sink and the hob
  const counter = world.cupSurfaces?.find((m) => m.userData.counter);
  if (counter) {
    const box = new THREE.Box3().setFromObject(counter), R = S.boardRack, a = THREE.MathUtils.degToRad(R.lean);
    const wall = box.max.x + 0.02, top = counter.userData.surface ?? box.max.y; // (the splashback's face: the worktop's free area ends 3 cm short of the wall)
    const ex = new THREE.Vector3(0, 0, 1), ez = new THREE.Vector3(Math.sin(a), Math.cos(a), 0), ey = new THREE.Vector3().crossVectors(ez, ex);
    const B = new THREE.Vector3(wall - 0.26 * Math.sin(a) - 0.022 * Math.cos(a), top, R.z); // the bottom edge, its top against the tiles
    const anchor = new THREE.Object3D();
    anchor.position.copy(B).addScaledVector(ez, 0.13); // (the board's origin is the middle of its 26 cm width)
    anchor.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(ex, ey, ez));
    life.scene.add(anchor);
    const holdingBoard = () => I.held()?.type === 'board';
    const pick = pickBox(life.scene, new THREE.Vector3(wall - 0.12, top, R.z - 0.24), new THREE.Vector3(wall, top + 0.3, R.z + 0.24), holdingBoard);
    add('boardRack', { name: 'sin plats', isOpen: () => true, fullText: 'Där står redan en skärbräda' }, [{ size: 'l', anchor }], pick);
    Object.assign(I.store('boardRack'), { cleanOnly: true, accepts: ['board'], putLabel: (held) => `ställa ${I.name(held)} på sin plats` });
  }
  life.storeTargets = targets;
  return { stores: out, targets };
}

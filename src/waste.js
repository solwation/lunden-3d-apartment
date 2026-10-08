import * as THREE from 'three';
import { ITEMS, LIFE, LIFE_WASTE } from './config.js';
import { sfx } from './audio.js';
import { heldItem } from './holdable.js';
import { badge } from './stats.js';

// The life simulator's rubbish (epic #364, milestone M2), after the bin under the sink (#381, cooking.js 'throwAway'):
//   #386 three bins under the sink — Matavfall (the green one, a paper bag), Förpackningar (the small blue one), Restavfall
//        (the grey one) — game categories, not a claim about the property's real waste system. The prompt names the bin
//        ("slänga gurkänden i matavfallet"); the wrong one names the right one ("Gurkänden → Matavfall") and keeps the waste in
//        the hand (LIFE.rules.strictSorting; false = in it goes, with a note). A bin with something in it: "Knyta ihop påsen" —
//        a rubbish bag in the hand that carries the bin's amount and parts (moved, not copied), the bin empty and without a
//        bag; "Sätta i en ny påse" (from the roll in the same cabinet: no item of its own) before anything goes in again. A
//        saved single bin (LIFE-017) is split by items.js MIGRATIONS[1].
//   #387 carried out: the bag is held like any thing (out through the front door), and dropped in the drop-off's container of
//        its category by the car park (buildDropoff below).

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const BAG_NAMES = { food: 'matavfallspåsen', package: 'förpackningspåsen', rest: 'soppåsen' };

/** Add the rubbish actions to `life` (life.js calls this once). */
export function wasteActions(life) {
  const A = life.actions, I = life.items;
  const isBin = (it) => !!it && I.has(it, 'bin');
  /** The category a waste kind goes in ("Matavfall"). */
  life.binLabel = (kind) => Object.values(ITEMS).find((d) => d.tags?.includes('bin') && d.sort === kind)?.label ?? 'Restavfall';
  I.namers.rubbishBag = (it) => BAG_NAMES[it.machine?.sort] ?? null;

  A.define({
    id: 'tieBag', order: 0,
    label: 'knyta ihop påsen',
    applies: (c) => isBin(c.target) && !c.heldView && c.target.amount > 0 && !c.target.machine?.nobag,
    check: (c) => c.targetView?.shutReason() ?? null,
    run: (c) => {
      const bin = c.target, d = I.def(bin);
      const bag = life.create('rubbishBag', { at: 'hand' }, { amount: bin.amount, parts: bin.parts, machine: { sort: d.sort ?? 'rest' } });
      if (!bag) return;
      I.setAmount(bin, 0); // (what was in it is in the bag now: moved, never in both)
      I.set(bin, { parts: [], machine: { nobag: 1 } });
      sfx.rustle?.(c.targetView?.where());
      life.emit('tied', { bag: bag.id, sort: bag.machine.sort, amount: bag.amount });
    },
    consumes: 'the bin\'s contents', result: 'a rubbish bag in the hand with exactly that amount and parts; the bin empty, without a bag',
  });
  A.define({
    id: 'newBag', order: 1,
    label: 'sätta i en ny påse',
    applies: (c) => isBin(c.target) && !!c.target.machine?.nobag,
    check: (c) => (c.heldView ? `Lägg ifrån dig ${c.held ? I.name(c.held) : c.heldView.name ?? 'det du håller'} först` : c.targetView?.shutReason() ?? null),
    run: (c) => { I.set(c.target, { machine: { nobag: null } }); sfx.rustle?.(c.targetView?.where()); },
    consumes: 'nothing (a bag off the roll)', result: 'the bin has a bag again',
  });
  // empty the vacuum cleaner into Restavfall (#391, LIFE-027)
  A.define({
    id: 'emptyVacuum', order: 0,
    label: (c) => `tömma dammsugaren i ${I.name(c.target)}`,
    applies: (c) => isBin(c.target) && (!!c.heldView?.isVacuum || !!heldItem()?.isVacuum),
    check: (c) => {
      const vac = c.heldView?.isVacuum ? c.heldView : heldItem();
      if (!vac || vac.dustAmount <= 1e-4) return 'Dammsugaren är redan tom';
      const shut = c.targetView?.shutReason();
      if (shut) return shut;
      if (c.target.machine?.nobag) return 'Sätt i en ny påse först';
      const sort = I.def(c.target).sort;
      if (sort && sort !== 'rest' && LIFE.rules.strictSorting) return 'Damm ska slängas i restavfall';
      if (c.target.amount + 1 > (I.def(c.target).capacity ?? 10) + 1e-6) return I.def(c.target).fullText ?? 'Restavfallspåsen är full';
      return null;
    },
    run: (c) => {
      const vac = c.heldView?.isVacuum ? c.heldView : heldItem();
      const bin = c.target;
      vac.emptyIntoBin?.(bin);
      I.add(bin, 1);
      sfx.rustle?.(c.targetView?.where());
      sfx.vacuumSlurp?.(c.targetView?.where());
      badge('Dammsugaren tömd', false);
      life.emit('emptyVacuum', { into: bin.id });
    },
    consumes: "the vacuum's dust", result: 'dust moved into the bin, vacuum empty',
  });
  // the drop-off (#387): only a rubbish bag, in its own category's container; gone for good, counted once
  A.define({
    id: 'dropBag', order: 0,
    label: (c) => `slänga ${c.held ? I.name(c.held) : c.heldView.name} i ${c.raw.name}`,
    applies: (c) => !!c.raw?.dropoff && !!c.heldView,
    check: (c) => {
      if (!c.held || !I.has(c.held, 'rubbishBag')) return 'Bara soppåsar här';
      const sort = c.held.machine?.sort ?? 'rest';
      if (sort !== c.raw.dropoff && LIFE.rules.strictSorting) return `${cap(I.name(c.held))} → ${life.binLabel(sort)}`;
      return null;
    },
    run: (c) => {
      const bag = c.held, info = { bag: bag.id, sort: bag.machine?.sort ?? 'rest', amount: bag.amount, into: c.raw.dropoff };
      if (!I.remove(bag, { cascade: true })) return; // (out of the hand first: the same bag never counts twice)
      c.raw.lift?.();
      sfx.lid(c.raw.pickable.getWorldPosition(new THREE.Vector3()), true);
      life.bump('rubbishOut', 1);
      life.emit('rubbishOut', info);
    },
    consumes: 'the rubbish bag in the hand (removed)', result: 'gone into the container; stats rubbishOut once',
  });
  A.define({
    id: 'dropInfo', order: 1,
    label: (c) => c.raw.label,
    applies: (c) => !!c.raw?.dropoff && !c.heldView,
    check: () => 'Här lämnar du soppåsarna',
    run: () => {},
    consumes: 'nothing', result: 'nothing: what the container is for',
  });
}


// #387/#520: three containers in the widened open part of the portik (LIFE_WASTE.dropoff).
// Peab p.47 draws the space, not its real use. Each container has a lid; only a rubbish bag goes in
// ("Bara soppåsar här"), in its own
// category's container while the sorting is strict; E drops it in: the lid lifts and shuts with a thud, the bag is gone (one
// emptying, one reward: stats rubbishOut). Back home a new bag goes in under the sink ('newBag').
const CONTAINERS = [
  { sort: 'food', name: 'matavfallsbehållaren', color: 0x7a5530 },
  { sort: 'package', name: 'förpackningsbehållaren', color: 0x2f6fc4 },
  { sort: 'rest', name: 'restavfallsbehållaren', color: 0x4a4d50 },
];

function tagMaterial(word) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#f2f2ee'; g.fillRect(0, 0, 256, 96);
  g.fillStyle = '#2b2b2b'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `bold ${word.length > 9 ? 34 : 44}px sans-serif`; g.fillText(word, 128, 48);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 });
}

/**
 * The drop-off in the portik (#387, #520). Returns { object, targets, segments, update(dt) }; the targets are life-sim targets
 * (kind 'life', `dropoff` = the category), the segments the containers' outlines for the visitor's collision.
 */
export function buildDropoff(life) {
  const W = LIFE_WASTE.dropoff, g = new THREE.Group();
  g.name = 'dropoff';
  g.position.set(W.x, W.y ?? 0, W.z);
  g.rotation.y = THREE.MathUtils.degToRad(W.yaw ?? 0);
  const body = new THREE.MeshStandardMaterial({ color: 0x55585b, roughness: 0.8 });
  const s = W.size, h = W.h, targets = [], lids = [], segments = [];
  CONTAINERS.forEach((k, i) => {
    const x = (i - 1) * W.gap;
    const post = new THREE.Mesh(new THREE.BoxGeometry(s, h, s), body);
    post.position.set(x, h / 2, 0); post.castShadow = post.receiveShadow = true;
    const lid = new THREE.Group(); // hinged at its back edge
    lid.position.set(x, h, -s / 2);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(s + 0.04, 0.05, s + 0.04), new THREE.MeshStandardMaterial({ color: k.color, roughness: 0.5 }));
    slab.position.set(0, 0.025, s / 2); slab.castShadow = true;
    lid.add(slab);
    const label = life.binLabel(k.sort);
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(s * 0.8, s * 0.3), tagMaterial(label));
    tag.position.set(x, h - 0.2, s / 2 + 0.002);
    g.add(post, lid, tag);
    const target = { name: k.name, kind: 'life', dropoff: k.sort, label, pickable: slab };
    target.options = () => life.options(target);
    target.toggle = () => life.run(target);
    Object.defineProperties(target, {
      blocked: { get: () => !target.options().some((a) => !a.reason) },
      blockedText: { get: () => target.options()[0]?.reason ?? null },
    });
    for (const m of [slab, post, tag]) m.userData.door = target;
    targets.push(target);
    lids.push({ lid, t: 0 });
    target.lift = () => { lids[i].t = 1; };
  });
  g.updateMatrixWorld(true);
  // collision: the row's outline (one box round all three)
  const half = W.gap + s / 2 + 0.03, c = [[-half, -s / 2 - 0.03], [half, -s / 2 - 0.03], [half, s / 2 + 0.03], [-half, s / 2 + 0.03]].map(([x, z]) => new THREE.Vector3(x, 0, z).applyMatrix4(g.matrixWorld));
  for (let i = 0; i < 4; i++) { const a = c[i], b = c[(i + 1) % 4]; segments.push([a.x, a.z, b.x, b.z]); }
  return {
    object: g, targets, segments, poly: c.map((p) => [p.x, p.z]), // (an obstacle: nobody is left standing inside it, player.js unstick)
    update(dt) { // a lid lifts and drops shut again (a thud as it lands)
      for (const L of lids) {
        if (L.t <= 0) continue;
        L.t = Math.max(0, L.t - dt / 0.9);
        L.lid.rotation.x = -1.1 * Math.sin(Math.PI * (1 - L.t));
        if (L.t === 0) sfx.lid(L.lid.getWorldPosition(new THREE.Vector3()), false);
      }
    },
  };
}

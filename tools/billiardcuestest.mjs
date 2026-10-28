import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

if (typeof document === 'undefined') {
  globalThis.document = {
    createElement(tag) {
      if (tag === 'canvas') {
        return {
          width: 768,
          height: 384,
          getContext: () => ({
            fillRect: () => {},
            strokeRect: () => {},
            fillText: () => {},
            save: () => {},
            restore: () => {},
            beginPath: () => {},
            clip: () => {},
            scale: () => {}
          })
        };
      }
      return {};
    }
  };
}

import { PLAYROOM as R } from '../src/config.js';
import { Billiards } from '../src/billiards.js';
import { PlayroomCueRack, BilliardCue, buildCueGeometry } from '../src/playroomcues.js';
import { heldItem, setHeld } from '../src/holdable.js';

test('buildCueGeometry creates valid 1.2m tapered cue geometry', () => {
  const geo = buildCueGeometry(1.2);
  assert.ok(geo, 'geometry created');
  assert.ok(geo.attributes.position.count > 0, 'has vertices');
  assert.ok(geo.attributes.color, 'has vertex colors');
});

test('cue rack initializes with 4 cues in slots', () => {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const billiards = new Billiards();

  const rack = new PlayroomCueRack(group, mat);
  assert.equal(rack.slots.length, 4, '4 slots');
  assert.equal(rack.slots.every((s) => s === null), true, 'slots initially empty before makeCues');

  const cues = rack.makeCues(scene, camera, billiards);
  assert.equal(cues.length, 4, 'made 4 cues');
  assert.equal(rack.slots.every((s) => s !== null), true, 'all 4 slots filled');
  assert.equal(rack.nextFreeSlot(), null, 'no free slots when full');
  assert.equal(rack.allCuesGone(), false, 'not all cues gone');
});

test('taking a cue empties its slot and enables billiard aiming', () => {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const billiards = new Billiards();
  billiards.hasCue = () => !!heldItem()?.isBilliardCue;

  const rack = new PlayroomCueRack(group, mat);
  const cues = rack.makeCues(scene, camera, billiards);

  // Initially without holding cue
  setHeld(null);
  assert.equal(billiards.hasCue(), false, 'no cue in hand initially');
  assert.equal(billiards.target.blocked, true, 'table blocked without cue');
  assert.equal(billiards.target.blockedText, 'Hämta en kö i stället först');
  assert.equal(billiards.shoot(camera), false, 'cannot shoot without cue');
  assert.equal(billiards.blockReason, 'Hämta en kö i stället först');

  // Take cue 0
  cues[0].take();
  assert.equal(heldItem(), cues[0], 'cue 0 is held');
  assert.equal(rack.slots[0], null, 'slot 0 is vacated');
  assert.equal(rack.nextFreeSlot(), 0, 'slot 0 is next free slot');
  assert.equal(billiards.hasCue(), true, 'hasCue() true while holding cue');
  assert.equal(billiards.target.blocked, false, 'table not blocked with cue');

  // Shooting can start charging
  const started = billiards.shoot(camera);
  assert.equal(started, true, 'shoot() succeeds while holding cue');
  assert.ok(billiards.charge, 'charge started');

  // Clean up
  setHeld(null);
});

test('putting cue back in rack occupies free slot', () => {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const billiards = new Billiards();

  const rack = new PlayroomCueRack(group, mat);
  const cues = rack.makeCues(scene, camera, billiards);

  // Take cue 2
  cues[2].take();
  assert.equal(rack.slots[2], null, 'slot 2 vacated');
  assert.equal(heldItem(), cues[2], 'cue 2 held');

  // Return to rack
  const returned = rack.returnHeldCue(cues[2]);
  assert.equal(returned, true, 'returned cue to rack');
  assert.equal(heldItem(), null, 'cue no longer held');
  assert.equal(rack.slots[2], cues[2], 'cue 2 back in slot 2');
  assert.equal(cues[2].inRack, true, 'inRack flag restored');
});

test('rack replenishes when all 4 cues are gone from room, rack and hands', () => {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const billiards = new Billiards();

  const rack = new PlayroomCueRack(group, mat);
  const cues = rack.makeCues(scene, camera, billiards);

  // Take all 4 cues out of rack
  for (let i = 0; i < 4; i++) {
    cues[i].take();
    // Simulate placing cue far outside playroom (e.g. at x=0, z=0 in courtyard)
    cues[i].placeAt(new THREE.Vector3(0, 0, 0), 0);
  }

  assert.equal(heldItem(), null, 'nothing held');
  assert.equal(rack.slots.every((s) => s === null), true, 'all rack slots empty');
  assert.equal(rack.allCuesGone(), true, 'all cues gone from room and rack');

  // Update rack -> should replenish all 4 cues
  rack.update(0.1);
  assert.equal(rack.slots.every((s) => s !== null), true, 'all 4 slots replenished');
  assert.equal(cues.every((c) => c.inRack), true, 'all cues back in rack');
});

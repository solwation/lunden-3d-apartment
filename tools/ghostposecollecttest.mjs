// #2463: a body rebuilt while the frame collects its pose (the outer layer going on or off,
// e.g. the avatar panel's preview) must not hand poseOlof an undefined pose.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { avatarLook } from '../src/config.js';
// Ghost's browser events are inert here; imported statistics timers must not keep the Node worker alive.
globalThis.location ??= { search: '' };
globalThis.addEventListener ??= () => {};
const interval = globalThis.setInterval;
globalThis.setInterval = (...args) => { const t = interval(...args); t.unref(); return t; };
const { Ghost } = await import('../src/ghosts.js');
globalThis.setInterval = interval;

test('outer-layer preview rebuilding the own body mid-frame keeps a collected pose', () => {
  const scene = new T.Scene(), g = new Ghost(scene, 'me', 'Collect2463', true);
  g.setAvatarLook({ ...avatarLook('collect2463'), outer: 1 });
  g.root.position.set(12.5, 0, 26); g.root.visible = true;
  const was = Ghost.outerPreview;
  try {
    Ghost.outerPreview = false;
    g.animate(1000, 1 / 60, 0, 0);
    const before = g.avatar;
    Ghost.outerPreview = true; // the avatar panel shows the coat: updateOuter rebuilds the body inside animate
    assert.doesNotThrow(() => g.animate(1016, 1 / 60, 0, 0));
    assert.notEqual(g.avatar, before, 'the body was rebuilt during this frame');
    assert.ok(g.avatar.pendingPose?.hip, 'the rebuilt body collected and applied a pose');
    assert.equal(g.avatar.collectPose, false, 'collection ends with the frame');
    Ghost.outerPreview = false;
    assert.doesNotThrow(() => g.animate(1032, 1 / 60, 0, 0), 'taking the layer off again');
  } finally {
    Ghost.outerPreview = was;
    g.dispose();
  }
});

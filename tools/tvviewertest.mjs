import assert from 'node:assert/strict';
import test from 'node:test';
import { TVMedia } from '../src/tvmedia.js';

test('shared TV viewing interest follows the programme, room and availability', () => {
  const tv = new TVMedia({targets: []});
  const viewer = {pos: {x: 3, y: 0, z: 10}};
  const player = {state: null, update(inside) { this.inside = inside; }};
  tv.sessions.set('lounge', {target: {}, player});

  tv.update(viewer, null, null, true);
  assert.equal(tv.watching, false, 'no shared state yet');
  player.state = {video: ''};
  assert.equal(tv.watching, false, 'legacy room with no shared channel');
  player.state.tv = {on: false, ch: 0};
  assert.equal(tv.watching, false, 'ordinary TV is off');
  player.state.tv.on = true;
  assert.equal(tv.watching, true, 'ordinary TV is on');
  tv.update(viewer, null, null, false);
  assert.equal(tv.watching, false, 'TV sessions unavailable, including a hidden tab');
  viewer.pos.z = 5;
  tv.update(viewer, null, null, true);
  assert.equal(tv.watching, false, 'viewer left the lounge');
  viewer.pos.z = 10;
  player.state = {video: 'abc123xyz91'};
  tv.update(viewer, null, null, true);
  assert.equal(tv.watching, true, 'a film in the same room still counts');
});

// #2218: the Olof-name rule and which look a session starts with. Run: node --test tools/olofnametest.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { nameGetsOlofLook, sessionStartLook } from '../src/olofname.js';
import { Group } from 'three';
import { olofLook, OlofDriver } from '../src/olof.js';
import { avatarLook, encodeAvatarLook, decodeAvatarLook, encodeAvatarWireLook } from '../src/config.js';

test('name rule: case-insensitive substring', () => {
  for (const n of ['Olof', 'olof', 'OLOF', 'Olof W', 'Olofsson', 'Wolof', 'Super-Olof 2']) assert.equal(nameGetsOlofLook(n), true, n);
  for (const n of ['', 'Ólof', 'Olaf', 'Olo f', 'Anonym', null, undefined, 42]) assert.equal(nameGetsOlofLook(n), false, String(n));
});

test('session flow: start -> Olof look, mirror edit kept in session, next start -> Olof look again', () => {
  const own = encodeAvatarLook(avatarLook('Kim'));
  let storage = own; // lunden.avatar
  const start = (name) => sessionStartLook(name, storage, name);
  let look = start('Olof W');
  assert.deepEqual(look, olofLook());
  assert.equal(storage, own, 'starting does not overwrite the saved look');
  look = { ...look, hair: avatarLook('x').hair, style: 3 }; // mirror edit: customizer saves and sets the session look
  storage = encodeAvatarLook(look);
  assert.equal(look.style, 3, 'edit holds for the session (the caller keeps the look; no re-decision)');
  look = start('Olof W'); // next session
  assert.deepEqual(look, olofLook());
});

test('other names use the saved look or the seeded default', () => {
  const own = encodeAvatarLook(avatarLook('Kim'));
  assert.deepEqual(sessionStartLook('Kim', own, 'Kim'), decodeAvatarLook(own, 'Kim'));
  assert.deepEqual(sessionStartLook('Kim', null, 'Kim'), decodeAvatarLook(null, 'Kim'));
});

test('Olof look on the wire: the code stays valid and keeps the encodable parts', () => {
  const l = olofLook(), d = decodeAvatarLook(encodeAvatarWireLook(l), 'x');
  for (const k of ['top', 'pants', 'shoes', 'style', 'sleeves', 'gender', 'facial']) assert.equal(d[k], l[k], k);
  // known loss (reported in #2218): skin/hair colours snap to the nearest palette entry; the beard colour is not on the wire
  assert.notEqual(d.skin, l.skin);
});

test('Olof wears aviators from June through August; other players keep their mirror choice', () => {
  for (let month = 1; month <= 12; month++) {
    const expected = month >= 6 && month <= 8 ? 4 : 0;
    const look = sessionStartLook('Olof Test', null, 'Olof Test', month);
    assert.equal(look.glasses, expected);
    assert.equal(decodeAvatarLook(encodeAvatarWireLook(look), 'remote').glasses, expected);
  }
  const other = { ...avatarLook('Liv'), glasses: 4, earrings: 2 };
  const saved = encodeAvatarLook(other);
  assert.match(saved, /g24/);
  const winter = sessionStartLook('Liv', saved, 'Liv', 1);
  assert.equal(winter.glasses, 4);
  assert.equal(winter.earrings, 2);
});

test('the seated driver changes glasses on the same mesh when the month changes', () => {
  const driver = new OlofDriver({object: new Group()}, 1);
  const {mesh, material} = driver.avatar;
  for (const [month, glasses] of [[1, 0], [6, 4], [8, 4], [9, 0]]) {
    driver.setSeason(month);
    assert.equal(driver.avatar.look.glasses, glasses);
    assert.equal(material.userData.u.uGlasses.value, glasses);
    assert.equal(driver.avatar.mesh, mesh);
    assert.equal(mesh.material, material);
  }
  driver.avatar.dispose();
});

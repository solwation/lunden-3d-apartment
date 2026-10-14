// Ordinary shared geometry tests; no renderer, anatomy slices or live room required.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/config.js'), 'utf8');
  const { PVP_HEAD_BOXES: H, avatarLook, rifleBoxHeadContact: hit, rifleHeadBaseY: base } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  let checks = 0;
  const check = (ok, name) => { assert.ok(ok, name); console.log(`PASS ${name}`); checks++; };
  const near = (a, b) => Math.abs(a - b) < 1e-8;
  const seed = 'headboxes', look = avatarLook(seed), width = [.93, 1, 1.08][look.build];
  const standing = { p: [2, 3, 4], r: -Math.PI };
  for (const [i, box] of H.boxes.entries()) {
    const height = standing.p[1] + look.tall * (box.low + box.high) / 2;
    const contact = hit(seed, standing, [2, height, 7], [0, 0, -2], 10);
    check(contact && near(contact.distance, 3 - box.front * width) && near(contact.point[2], 4 + box.front * width), `standing box ${i + 1}: first face, normalized direction, world distance`);
  }
  const middle = H.boxes[1], y = 3 + look.tall * (middle.low + middle.high) / 2;
  const turned = { ...standing, r: -Math.PI / 2 };
  const contact = hit(seed, turned, [5, y, 4], [-1, 0, 0], 10);
  check(contact && near(contact.distance, 3 - middle.front * width), 'quarter-turn head faces the rotated ray');
  const crouch = { ...standing, c: true }, lean = H.crouchLean, canonicalY = (middle.low + middle.high) / 2 - H.hipY;
  const centre = [2, 3 + look.tall * (H.hipY - H.hipDrop + Math.cos(lean) * canonicalY), 4 + width * (H.hipForward - Math.sin(lean) * canonicalY)];
  const crouched = hit(seed, crouch, [centre[0], centre[1], centre[2] + 3], [0, 0, -1], 10);
  check(crouched && crouched.distance > 2 && crouched.distance < 3, 'crouched head follows hip drop and torso lean');
  check(near(base(seed, standing), 3 + look.tall * H.boxes[0].low) && base(seed, crouch) < base(seed, standing), 'body boundary uses lowest transformed head height');
  check(hit(seed, standing, [3, y, 7], [0, 0, -1], 10) === null, 'off-head ray misses');
  check(hit(seed, standing, [2, y, 7], [0, 0, -1], 1) === null, 'range stops before head');
  check(hit(seed, standing, [2, y, 4], [1, 0, 0], 0)?.distance === 0, 'ray starting inside head has zero entry distance');
  for (const c of [0, .5, 1]) check(Number.isFinite(base(seed, { ...standing, c })), `interpolated crouch ${c} has a finite logical body boundary`);
  check(hit(seed, standing, [2, y, 7], [0, 0, 0], 10) === null && hit(seed, standing, [2, y, 7], [0, NaN, -1], 10) === null, 'invalid ray returns no contact');
  check(hit(seed, { p: [0, NaN, 0], r: 0 }, [0, 1, 3], [0, 0, -1], 10) === null && base(seed, { ...standing, c: 2 }) === null, 'invalid pose returns no contact or body boundary');
  check(hit(seed, standing, [2, y, 7], [0, 0, -1], Infinity) === null, 'invalid range returns no contact');
  console.log(`ALL PASS ${checks} checks`);
})().catch(error => { console.error(error); process.exitCode = 1; });

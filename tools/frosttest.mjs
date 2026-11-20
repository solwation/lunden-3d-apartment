// #2195: hoar frost (src/frost.js pure parts), headless. Run: node tools/frosttest.mjs
import assert from 'node:assert/strict';
import { FROST as F, SNOW_COVER as S } from '../src/config.js';
import { frostCover, frostAmount, frostGLSL, FrostCover, frostUniform } from '../src/frost.js';
import { snowGroundGLSL } from '../src/snowground.js';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };
const night = { temp: -5, overcast: 0, wind: 1, rain: 0, snow: 0, sunY: -0.5 };

ok(frostCover(night) > 0.99, 'a cold clear calm night: full frost');
eq(frostCover({ ...night, temp: 3 }), 0, 'above +1.5 C: none');
ok(frostCover({ ...night, temp: 0 }) > 0 && frostCover({ ...night, temp: 0 }) < 1, 'about 0 C: partial');
ok(frostCover({ ...night, temp: -1 }) > frostCover({ ...night, temp: 0 }), 'colder: more frost');
eq(frostCover({ ...night, overcast: 1 }), 0, 'overcast: none (no radiative cooling)');
ok(frostCover({ ...night, overcast: 0.6 }) < 1, 'partly cloudy: less');
eq(frostCover({ ...night, wind: 9 }), 0, 'windy: none');
eq(frostCover({ ...night, rain: 0.8 }), 0, 'rain: none');
eq(frostCover({ ...night, snow: 0.5 }), 0, 'snow lying: no frost (the snow takes over)');
ok(frostCover({ ...night, snow: 0.1 }) < 1, 'a thin snow cover already thins it');
// the sun: melts after sunrise, builds up after sunset
const morning = (sunY) => frostCover({ ...night, sunY, evening: false });
ok(morning(-0.1) > 0.99 && morning(0.03) < morning(0) && morning(0.15) === 0, 'melts as the sun climbs');
const evening = (sunY) => frostCover({ ...night, sunY, evening: true });
eq(evening(0.2), 0, 'daytime: none'); ok(evening(-0.1) > 0 && evening(-0.1) < evening(-0.4), 'builds up gradually after sunset'); ok(evening(-0.5) > 0.99, 'full late at night');

// the per-spot amount
const full = frostAmount('grass', 1, { n: 0.5 }), none = frostAmount('grass', 0);
ok(full > 0.7, 'grass full cover: clearly white'); eq(none, 0, 'no cover: none');
ok(frostAmount('grass', 0.5, { shelter: 1 }) > frostAmount('grass', 0.5, { shelter: 0 }), 'the shade keeps its frost longer (more at the same melt stage)');
ok(frostAmount('car', 0.5, { shelter: 1 }) === frostAmount('car', 0.5, { shelter: 0 }), 'only grass reads the shelter map');
ok(frostAmount('grass', 0.4, { n: 0.1 }) > frostAmount('grass', 0.4, { n: 0.9 }), 'patchy: noise decides where it melts first');
eq(frostAmount('grass', 1, { ny: 0 }), 0, 'no frost on a vertical lawn face'); ok(frostAmount('roof', 1, { ny: 0.4 }) > 0, 'a sloping roof frosts (lower up threshold)');
ok(frostAmount('glass', 1, { ny: 0 }) > 0 && frostAmount('glass', 1, { ny: 0 }) < frostAmount('glass', 1, { ny: 1 }), 'glass frosts on its sides too, less than on top');
eq(frostAmount('nope', 1), 0, 'unknown kind: nothing');
for (const k of Object.keys(F.kinds)) ok(frostAmount(k, 1, { ny: 1, n: 0.5 }) > 0.4, `${k}: visible at full cover`);

// the car snow class (snowground.js): the sloping windscreen gets snow, a ground class' up range does not
ok(S.hold.car > 0 && S.hold.car < S.hold.asphalt && S.upBy.car[0] < S.up[0], 'car class: holds snow early, also on slopes');
ok(snowGroundGLSL('car').body.includes(S.upBy.car[0].toFixed(4)), 'the car step uses its own up range');
ok(snowGroundGLSL('grass').body.includes(S.up[0].toFixed(4)), 'a ground class keeps the common up range');

// shader source: no NaN / undefined number leaks into either step (a config typo once swallowed `color`)
for (const k of ['grass', 'car']) ok(!/NaN|undefined/.test(snowGroundGLSL(k).body + frostGLSL(k).body), `${k}: glsl has no NaN`);
for (const k of Object.keys(F.kinds)) { const g = frostGLSL(k); ok(g.head.includes('uniform float uFrost;') && g.body.includes('diffuseColor'), `${k}: glsl`); }
ok(frostGLSL('grass').head.includes('uFrostShelter') && !frostGLSL('grass', true).head.includes('uFrostShelter'), 'phones: no shelter lookup');
ok(!frostGLSL('car').head.includes('uFrostShelter'), 'cars: no shelter lookup');
ok(frostGLSL('grass').head.includes('uniform float uFrost;') && !frostGLSL('grass').head.includes('uSnowShelter'), 'own uniform names: no clash with snowground');

// the driver
const day = { hour: 7, sunDir: { y: -0.3 } }, weather = { temp: -4, overcast: 0.1, rain: 0, wind: { x: 1, z: 0 } }, snow = { cover: 0 };
const d = new FrostCover(weather, day, snow);
d.update(0); ok(frostUniform.value > 0.99, 'driver: frost on a cold clear morning');
day.sunDir.y = 0.3; d.update(0.5); ok(frostUniform.value > 0 && frostUniform.value < 1, 'driver: eases away after sunrise'); for (let i = 0; i < 20; i++) d.update(1); eq(frostUniform.value, 0, 'driver: melted');
d.force = 0.6; d.update(0.1); eq(frostUniform.value, 0.6, 'driver: &frost= pins it');
console.log(`frosttest: ${n} checks ok`);

// Headless test of the web → Unreal coordinate mapping (#2245): node tools/unreal-engine/coordinatestest.mjs
// Known points (L1007's outer corners from data/plan.json, the stair's foot and START from src/config.js, Övre plan's
// floor) must land within 1 cm of their expected Unreal positions, a north arrow must point to Unreal −Y, and the yaw
// conversion must agree with the web camera's actual view direction (src/player.js `spawn`).
// The literal web coordinates below are also checked against the current data, so a moved corner or START shows up
// as a fixture to update rather than as a silently wrong expectation.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { webToUnreal, unrealToWeb, planToUnreal, webYawToUnrealYaw, unrealYawToWebYaw, webForward, unrealForward, webRotationYToUnrealYaw,
  rectToUnreal, normDeg } from './coordinates.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const plan = JSON.parse(fs.readFileSync(path.join(root, 'data/plan.json'), 'utf8'));
const { START, STAIR, LEVELS, PLAYER } = await import(path.join(root, 'src/config.js'));

let pass = 0, fail = 0;
const check = (ok, what) => { if (ok) pass++; else fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`); };
const near = (a, b, tol) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= tol);
const fmt = (p) => `[${p.map((v) => +v.toFixed(3)).join(', ')}]`;

// --- fixture: literal web points (m) and their expected Unreal positions (cm) ---
const W = 5.753, D = 12.699; // data/plan.json floors[0].size (Entréplan)
const fixture = [
  { name: 'L1007 NW outer corner (north façade, west party wall)', web: [0, 0, 0], unreal: [0, 0, 0] },
  { name: 'L1007 NE outer corner', web: [W, 0, 0], unreal: [575.3, 0, 0] },
  { name: 'L1007 SE outer corner (patio façade)', web: [W, 0, D], unreal: [575.3, 1269.9, 0] },
  { name: 'L1007 SW outer corner', web: [0, 0, D], unreal: [0, 1269.9, 0] },
  { name: 'stair foot (west end of flight A, Entréplan floor)', web: [3.5, 0, 7.13], unreal: [350, 713, 0] },
  { name: 'START at eye height (street, north of the entrance)', web: [2.875, 1.62, -12], unreal: [287.5, -1200, 162] },
  { name: 'Övre plan finished floor over the hall', web: [1.2, 3.25, 1.2], unreal: [120, 120, 325] },
];

// the literal fixture still matches the data it was read from
const size = plan.floors[0].size;
check(size.x === W && size.z === D, `fixture L1007 size ${W} × ${D} m = data/plan.json floors[0].size (${size.x} × ${size.z})`);
check(STAIR.aX0 === 3.5 && Math.abs((STAIR.aZ[0] + STAIR.aZ[1]) / 2 - 7.13) < 1e-9, `fixture stair foot = STAIR.aX0 ${STAIR.aX0}, mid aZ ${(STAIR.aZ[0] + STAIR.aZ[1]) / 2}`);
check(START.x === 2.875 && START.z === -12 && PLAYER.eye === 1.62, `fixture START (${START.x}, ${START.z}) and eye ${PLAYER.eye} = src/config.js`);
check(LEVELS[1].floor === 3.25, `fixture Övre plan floor 3.25 = LEVELS[1].floor (${LEVELS[1].floor})`);

for (const p of fixture) {
  const got = webToUnreal(p.web);
  check(near(got, p.unreal, 1), `${p.name}: web ${fmt(p.web)} m → Unreal ${fmt(got)} cm (want ${fmt(p.unreal)} ± 1 cm)`);
  check(near(unrealToWeb(got), p.web, 1e-9), `${p.name}: round trip back to web`);
}
check(near(planToUnreal(W, D, 0), [575.3, 1269.9, 0], 1e-9), 'planToUnreal(x, z, y) = webToUnreal([x, y, z])');
const r = rectToUnreal({ x0: 0, x1: W, z0: 0, z1: D });
check(r.x0 === 0 && Math.abs(r.x1 - 575.3) < 1e-9 && r.y0 === 0 && Math.abs(r.y1 - 1269.9) < 1e-9, 'plan rectangle → Unreal X/Y ranges');

// --- north arrow: web north (−z) must point to Unreal −Y; east to +X; up to +Z ---
const north = webToUnreal([0, 0, -1]), east = webToUnreal([1, 0, 0]), up = webToUnreal([0, 1, 0]);
check(near(north, [0, -100, 0], 1e-9), `north arrow (web −z, 1 m) → Unreal ${fmt(north)} = −Y`);
check(near(east, [100, 0, 0], 1e-9), `east arrow (web +x) → Unreal ${fmt(east)} = +X`);
check(near(up, [0, 0, 100], 1e-9), `up (web +y) → Unreal ${fmt(up)} = +Z`);
// the web frame is right-handed (x × y = z: east × up = south) …
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
check(near(cross([1, 0, 0], [0, 1, 0]), [0, 0, 1], 1e-9), 'web: east × up = south (right-handed)');
// … and the Unreal map has determinant −1 (the axis swap), which is what turns right-handed into left-handed, so the
// plan seen from above is not mirrored (north stays opposite south, east is +X, turning right stays turning right):
const det = (() => { const m = [webToUnreal([1, 0, 0]), webToUnreal([0, 1, 0]), webToUnreal([0, 0, 1])].map((v) => v.map((c) => c / 100));
  return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]); })();
check(det === -1, `axis map determinant ${det} (−1: a handedness change, the right-handed web frame becomes Unreal's left-handed one)`);

// --- yaw: the documented table and the camera's real direction ---
for (const [web, unreal, what] of [[0, -90, 'north'], [90, 180, 'west'], [180, 90, 'south'], [-90, 0, 'east']]) {
  check(webYawToUnrealYaw(web) === unreal, `web yaw ${web} (${what}) → Unreal yaw ${webYawToUnrealYaw(web)} (want ${unreal})`);
  check(unrealYawToWebYaw(unreal) === normDeg(web), `Unreal yaw ${unreal} → web yaw ${unrealYawToWebYaw(unreal)} (want ${normDeg(web)})`);
}
let worst = 0;
for (let y = -360; y <= 360; y += 7.5) {
  const [fx, fz] = webForward(y), want = webToUnreal([fx, 0, fz]).map((c) => c / 100), got = unrealForward(webYawToUnrealYaw(y));
  worst = Math.max(worst, Math.hypot(got[0] - want[0], got[1] - want[1]));
}
check(worst < 1e-9, `for 97 web yaws the Unreal forward vector equals the mapped web forward vector (worst error ${worst.toExponential(1)})`);
const [sx, sz] = webForward(START.yawDeg);
check(Math.abs(sx) < 1e-9 && Math.abs(sz - 1) < 1e-9 && webYawToUnrealYaw(START.yawDeg) === 90, `START yaw ${START.yawDeg} looks south (towards the house) = Unreal yaw 90 (+Y)`);
check(webYawToUnrealYaw(-90) - webYawToUnrealYaw(0) === 90, 'turning right (web yaw −90) is a Unreal yaw of +90');
// an object's rotation.y: a SwingDoor leaf runs along (sin a, cos a); a = 0 points south (+z) = Unreal +Y = yaw 90
check(webRotationYToUnrealYaw(0) === 90 && webRotationYToUnrealYaw(Math.PI / 2) === 0 && webRotationYToUnrealYaw(Math.PI) === -90,
  'rotation.y 0 / 90° / 180° (local +z south / east / north) → Unreal yaw 90 / 0 / −90');
for (let a = -Math.PI; a <= Math.PI; a += Math.PI / 12) {
  const want = webToUnreal([Math.sin(a), 0, Math.cos(a)]).map((c) => c / 100), got = unrealForward(webRotationYToUnrealYaw(a));
  worst = Math.max(worst, Math.hypot(got[0] - want[0], got[1] - want[1]));
}
check(worst < 1e-9, 'rotation.y → Unreal yaw agrees with the mapped local +z direction for 25 angles');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

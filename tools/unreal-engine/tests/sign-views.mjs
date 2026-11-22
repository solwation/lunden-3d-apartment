// #2400: paired web/Unreal cameras in front of the flats' number signs (Hus A, B, C and L) and the garage's HYRFÖRRÅD plate.
//   node tools/unreal-engine/tests/sign-views.mjs [export dir] > views.json
// Writes capture-web-views.cjs views (LUNDEN_CAPTURE_VIEWS) with the Unreal eye and rotation of each, which
// tests/capture_flat_signs.py reads. The signs follow src/core.js buildFlatDoors: CORE.flatDoorParts.sign wide, centred
// frame + 3 cm + sign/2 beyond the latch jamb, 1.55 m above the floor, 4 mm proud of the hall face. A/B/C take the first
// ground-floor flat door per house from measurements.json `doors`; Hus L's L1101 and the garage plate (src/garage.js
// plate('HYRFÖRRÅD', …)) come from src/config.js.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../sources.mjs';
import { webToUnreal, webYawToUnrealYaw, webPitchToUnrealPitch } from '../coordinates.mjs';
import { CORE, GARAGE, storeyFloor } from '../../../src/config.js';

const dir = path.resolve(process.argv[2] || path.join(ROOT, 'unreal/Lunden/Import'));
const { doors } = JSON.parse(fs.readFileSync(path.join(dir, 'measurements.json'), 'utf8'));
const D = CORE.flatDoorParts, EYE = 1.62, beyond = D.frame + 0.03 + D.sign / 2;

/** A camera `back` m out from the sign along `normal`, `side` m towards the door (`toDoor`), aimed a little door-wards. */
function view(id, label, sign, normal, toDoor, feetY, back = 0.8, side = 0.25) {
  const eye = [sign[0] + normal[0] * back + toDoor[0] * side, feetY + EYE, sign[2] + normal[1] * back + toDoor[1] * side];
  const aim = [sign[0] + toDoor[0] * 0.15, sign[1], sign[2] + toDoor[1] * 0.15];
  const d = aim.map((v, i) => v - eye[i]), flat = Math.hypot(d[0], d[2]);
  const yawDeg = Math.atan2(-d[0], -d[2]) * 180 / Math.PI, pitchDeg = Math.atan2(d[1], flat) * 180 / Math.PI;
  const r = (v) => Math.round(v * 1e4) / 1e4;
  return { id, label, x: r(eye[0]), z: r(eye[2]), yawDeg: r(yawDeg), pitchDeg: r(pitchDeg), feetY: r(feetY), lighting: 'day',
    sign: sign.map(r), unreal: { eyeCm: webToUnreal(eye.map(r)).map((v) => Math.round(v * 100) / 100),
      yaw: r(webYawToUnrealYaw(r(yawDeg))), pitch: r(webPitchToUnrealPitch(r(pitchDeg))) } };
}

const views = [];
for (const house of ['a', 'b', 'c']) {
  const row = doors.find((r) => r.house === house && r.leafType === 'flat' && r.hinge.web[1] === 0);
  const h = row.hinge.web, latch = row.checkClosed.web, open = row.checkOpen.web;
  const len = Math.hypot(latch[0] - h[0], latch[2] - h[2]), t = [(latch[0] - h[0]) / len, (latch[2] - h[2]) / len];
  let n = [-t[1], t[0]];
  if ((open[0] - h[0]) * n[0] + (open[2] - h[2]) * n[1] < 0) n = [-n[0], -n[1]]; // the hall: the side the leaf swings into
  const sign = [latch[0] + t[0] * beyond + n[0] * 0.004, h[1] + 1.55, latch[2] + t[1] * beyond + n[1] * 0.004];
  views.push(view(`hus-${house}`, row.name.replace('dörren till ', ''), sign, n, [-t[0], -t[1]], h[1]));
}
{ // Hus L: CORE.flatDoors[0] (L1101) in the east wall x1, the hall west of it (side −1), the sign on the z0 side
  const [j, z0, , label] = CORE.flatDoors[0], y = storeyFloor(j);
  views.push(view('hus-l', label, [CORE.x1 - 0.004, y + 1.55, z0 - beyond], [-1, 0], [0, 1], y));
}
{ // the garage: plate('HYRFÖRRÅD', -0.53, F + 2.35, 7.82, facing(0, 1), 0.6) over the rental stores' door
  const F = GARAGE.floor;
  views.push(view('garage', 'HYRFÖRRÅD', [-0.53, F + 2.35, 7.82], [0, 1], [0, 0], F, 1.3, 0));
}
process.stdout.write(JSON.stringify(views, null, 1) + '\n');

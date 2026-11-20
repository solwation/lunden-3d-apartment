// #2246. Read Unreal's observations and derive the independent reference distances from the web's plan and config.
import fs from 'node:fs';
import { LEVELS, STAIR } from '../../src/config.js';

const [file] = process.argv.slice(2);
if (!file) throw new Error('Usage: node tools/unreal-engine/check-pilot-distances.mjs UNREAL-OBSERVATIONS.json');
const input = JSON.parse(fs.readFileSync(file, 'utf8'));
const planBytes = fs.readFileSync(new URL('../../data/plan.json', import.meta.url));
const floor = JSON.parse(planBytes).floors[0];
const { surfaces } = input;
const cmPerMetre = 100;
const toleranceCm = 1;
const x = 0, y = 1, z = 2; // Unreal world axes
const living = floor.rooms.find(room => room.name === 'Vardagsrum');
const door = floor.doors[3];
const wallX = (index, edge) => edge(...floor.walls[index].outer.map(point => point[0]));

// Check that the sampled faces cover the chosen cross-section. The small epsilon handles float conversion at an edge.
function covers(key, coordinates) {
  const { minCm, maxCm } = surfaces[key];
  for (const [axis, metres] of coordinates) {
    const point = cmPerMetre * metres;
    if (!(minCm[axis] - .01 <= point && point <= maxCm[axis] + .01))
      throw new Error(`${key} does not cover the measurement cross-section on axis ${axis}`);
  }
}
for (const wall of ['living_west', 'living_east']) covers(wall, [[y,living.z],[z,1]]);
for (const surface of ['entrance_floor', 'entrance_ceiling', 'upper_floor', 'upper_ceiling'])
  covers(surface, [[x,living.x],[y,living.z]]);
const mean = pair => (pair[0] + pair[1]) / 2;
covers('entrance_floor', [[x, STAIR.aX0 - .01], [y, mean(STAIR.aZ)]]);
covers('stair_landing', [[x, STAIR.bX1 - .01], [y, mean(STAIR.bZ)]]);
covers('stair_last_tread', [[x, STAIR.bX1 + .01], [y, mean(STAIR.bZ)]]);
for (const jamb of ['door_north_jamb', 'door_south_jamb']) covers(jamb, [[x,door.hinge[0]],[z,1]]);

function distance(name, reference, metres, axis, lowerKey, lowerFace, upperKey, upperFace) {
  const expected = cmPerMetre * metres;
  const measured = surfaces[upperKey][upperFace][axis] - surfaces[lowerKey][lowerFace][axis];
  if (!Number.isFinite(expected) || !Number.isFinite(measured) || measured <= 0) throw new Error(`Invalid distance: ${name}`);
  return { name, reference, axis: 'XYZ'[axis], endpoints: [`${lowerKey}.${lowerFace}`, `${upperKey}.${upperFace}`],
    expectedCm: expected, measuredCm: measured, errorCm: measured - expected, pass: Math.abs(measured - expected) <= toleranceCm };
}
const rise = LEVELS[1].floor - LEVELS[0].floor;
const treads = STAIR.treads.a + STAIR.treads.w + STAIR.treads.b;
const checks = [
  distance('living room clear width', 'plan.json floor 0, inside faces of walls 3 and 4 at Vardagsrum',
    wallX(4, Math.min) - wallX(3, Math.max), x, 'living_west', 'maxCm', 'living_east', 'minCm'),
  distance('entrance floor clear height', 'config.js LEVELS[0].ceiling',
    LEVELS[0].ceiling, z, 'entrance_floor', 'maxCm', 'entrance_ceiling', 'minCm'),
  distance('upper floor clear height', 'config.js LEVELS[1].ceiling',
    LEVELS[1].ceiling, z, 'upper_floor', 'maxCm', 'upper_ceiling', 'minCm'),
  distance('total stair rise', 'config.js LEVELS[1].floor minus LEVELS[0].floor',
    rise, z, 'entrance_floor', 'maxCm', 'stair_landing', 'maxCm'),
  distance('interior door structural opening', 'plan.json floor 0, door 3 hinge to wall endpoint',
    Math.hypot(door.wall[0] - door.hinge[0], door.wall[1] - door.hinge[1]), y,
    'door_north_jamb', 'maxCm', 'door_south_jamb', 'minCm'),
  distance('last tread to upper landing', 'config.js floor rise divided by (STAIR.treads count plus landing)',
    rise / (treads + 1), z, 'stair_last_tread', 'maxCm', 'stair_landing', 'maxCm'),
];
console.log(JSON.stringify({ ...input, toleranceCm, checks }, null, 2));
if (checks.some(check => !check.pass)) process.exitCode = 1;

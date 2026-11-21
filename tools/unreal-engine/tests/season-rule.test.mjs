// #2295: the dates in season-dates.json against the web's own season rule (src/christmas.js inChristmas, the window
// XMAS_TREE.season in src/config.js), and the export's season window against src/config.js. test_seasons.py checks the
// Unreal rule (/Game/Lunden/Seasons/BPC_LundenSeasons) against the same rows, so both sides answer alike.
// Run: THREE_DIR=/path/to/node_modules/three node tools/unreal-engine/tests/season-rule.test.mjs [--export unreal/Lunden/Import]
import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '../../..');
const three = process.env.THREE_DIR ?? path.join(root, 'node_modules/three');
if (!fs.existsSync(path.join(three, 'build/three.module.js'))) {
  console.error(`season-rule: three.js not found at ${three} (set THREE_DIR)`); process.exit(2);
}
const base = pathToFileURL(three + '/').href;
register('data:text/javascript,' + encodeURIComponent(`const base=${JSON.stringify(base)};export async function resolve(s,c,n){` +
  `if(s==='three')return{url:base+'build/three.module.js',shortCircuit:true};` +
  `if(s.startsWith('three/addons/'))return{url:base+'examples/jsm/'+s.slice(13),shortCircuit:true};return n(s,c);}`));
globalThis.window ??= globalThis; globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const { inChristmas, christmasCoverage } = await import(pathToFileURL(path.join(root, 'src/christmas.js')).href);
const { XMAS_TREE } = await import(pathToFileURL(path.join(root, 'src/config.js')).href);
const { cushionsOut } = await import(pathToFileURL(path.join(root, 'src/patio.js')).href); // #2387
const table = JSON.parse(fs.readFileSync(path.join(here, 'season-dates.json'), 'utf8'));
let failed = 0;
const ok = (good, line) => { if (!good) failed++; console.log(`${good ? 'ok  ' : 'FAIL'} ${line}`); };
// The Unreal encoding: month * 100 + day (import_world.py season_tags)
const key = ([m, d]) => m * 100 + d;
const from = key(XMAS_TREE.season.from), to = key(XMAS_TREE.season.to);
for (const row of table.dates) {
  const [y, m, d] = row.date.split('-').map(Number), web = inChristmas(y, m, d);
  ok(web === row.christmas, `${row.date} web inChristmas ${web}, table ${row.christmas} (${row.why})`);
  const out = cushionsOut(m);
  ok(out === row.cushions, `${row.date} web cushionsOut ${out}, table ${row.cushions} (${row.why})`);
}
ok(from > to, `the web window ${from}..${to} wraps the new year, so the table exercises the wrap`);
// A wide table touches the crown on one edge. Its supported piece and a loose item on the far edge
// lie outside the crown themselves. Moving the tree away must restore the entire group.
const T = await import('three');
const { FurnitureGroups } = await import(pathToFileURL(path.join(root, 'src/furnituregroups.js')).href);
const scene = new T.Group();
function box(type, x, y, width, height) {
  const object = new T.Mesh(new T.BoxGeometry(width, height, 0.25), new T.MeshBasicMaterial());
  object.position.set(x, y, 0);
  scene.add(object);
  return { item: { type }, object, level: 0 };
}
const tree = box('xmastree', 0, 0, 0.2, 0.4);
const desk = box('desk', 1.5, 0.25, 3, 0.5);
const surface = new T.Mesh(new T.BoxGeometry(3, 0.02, 0.25));
surface.userData.surface = true;
surface.position.y = 0.24;
desk.object.add(surface);
const supported = box('plant', 2.5, 0.6, 0.2, 0.2);
const carryable = { model: box('loose', 2, 0.6, 0.2, 0.2).object };
const rug = box('rug', 0, 0, 0.3, 0.05);
const upstairs = { ...box('chair', 0, 0.25, 0.3, 0.5), level: 1 };
const groups = new FurnitureGroups({ furniture: { movable: [tree, desk, supported, rug, upstairs], surfaces: [surface] } }, () => [carryable]);
scene.updateMatrixWorld(true);
const covered = christmasCoverage(groups, tree);
ok(covered.pieces.size === 2 && covered.pieces.has(desk) && covered.pieces.has(supported) && covered.loose.has(carryable),
  'overlapping table carries the supported plant and loose item; rug and other floor stay outside the group');
tree.object.position.x = 6;
scene.updateMatrixWorld(true);
const moved = christmasCoverage(groups, tree);
ok(!moved.pieces.size && !moved.loose.size, 'moving the tree clear releases the supported group');

const i = process.argv.indexOf('--export');
if (i > 0) {
  const dir = path.resolve(process.argv[i + 1]), buf = fs.readFileSync(path.join(dir, 'l1007.glb'));
  const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
  const seasonal = json.nodes.filter((n) => n.extras?.seasonal);
  const groups = { christmas: ['xmastree'], outsideChristmas: ['armchair', 'floorlamp', 'ottoman', 'randerstable'] };
  for (const [group, types] of Object.entries(groups)) {
    const actual = seasonal.filter(n => n.extras.seasonal.what === group).map(n => n.name.split('_')[1]).sort();
    ok(JSON.stringify(actual) === JSON.stringify(types), `${group}: web default corner, exported ${actual.join(', ')}`);
  }
  // #2387: the patio sofa's decorative cushions (one part node) carry cushionsOut's months as a date window.
  const patio = fs.readFileSync(path.join(dir, 'l1007-uteplats.glb'));
  const patioJson = JSON.parse(patio.subarray(20, 20 + patio.readUInt32LE(12)).toString('utf8'));
  const cushions = patioJson.nodes.filter((n) => n.extras?.seasonal);
  ok(cushions.length >= 1 && cushions.every((n) => n.extras.seasonal.what === 'patioCushions' && n.extras.kind === 'part'
    && n.extras.parent?.startsWith('furn_veronasofa_')), `patio: seasonal nodes ${cushions.map((n) => n.name)} are the sofa's cushion parts`);
  for (const n of cushions) {
    const s = n.extras.seasonal, start = key(s.from), end = key(s.to), missing = [];
    for (let date = new Date(Date.UTC(2028, 0, 1)); date.getUTCFullYear() === 2028; date.setUTCDate(date.getUTCDate() + 1)) {
      const month = date.getUTCMonth() + 1, now = key([month, date.getUTCDate()]);
      const visible = start <= end ? start <= now && now <= end : start <= now || now <= end;
      if (visible !== cushionsOut(month)) missing.push(now);
    }
    ok(!missing.length, `${n.name}: patioCushions ${start}..${end}, 366 web dates, mismatches [${missing}]`);
  }
  const { lights } = JSON.parse(fs.readFileSync(path.join(dir, 'measurements.json')));
  const lit = lights.filter(l => l.seasonal).sort((a, b) => a.id.localeCompare(b.id));
  ok(lit.map(l => l.id.split('_')[1]).join() === 'floorlamp,xmastree' && lit.every(l =>
    JSON.stringify(l.seasonal) === JSON.stringify(seasonal.find(n => n.name === l.id)?.extras.seasonal)),
    'floor lamp and tree point lights use the same window as their matching furniture');
  for (const n of seasonal) {
    const s = n.extras.seasonal, start = key(s.from), end = key(s.to);
    const missing = [];
    for (let date = new Date(Date.UTC(2028, 0, 1)); date.getUTCFullYear() === 2028; date.setUTCDate(date.getUTCDate() + 1)) {
      const month = date.getUTCMonth() + 1, day = date.getUTCDate(), now = key([month, day]);
      const visible = start <= end ? start <= now && now <= end : start <= now || now <= end;
      const christmas = inChristmas(2028, month, day);
      if (!(s.what in groups) || visible !== (s.what === 'christmas' ? christmas : !christmas)) missing.push(now);
    }
    ok(!missing.length, `${n.name}: ${s.what} ${start}..${end}, 366 web dates, mismatches [${missing}]`);
  }
}
console.log(failed ? `season-rule: ${failed} failed` : 'season-rule: all passed');
process.exit(failed ? 1 : 0);

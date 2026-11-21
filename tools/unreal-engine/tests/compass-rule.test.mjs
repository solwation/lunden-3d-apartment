// #2286: the Unreal compass against the web's own. test_ui.py writes, for nine view yaws, the bearing that
// /Game/Lunden/UI/WBP_LundenHud showed (Saved/ui-result.json, kept as docs/verification/2286/ui-result.json). This
// script turns each Unreal yaw into the web yaw with coordinates.mjs and runs src/compass.js compassBearing on it with
// DAY.planNorth from src/config.js, so the same place and the same direction must give the same bearing and name.
// Run: THREE_DIR=/path/to/node_modules/three node tools/unreal-engine/tests/compass-rule.test.mjs [ui-result.json]
import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '../../..');
const three = process.env.THREE_DIR ?? path.join(root, 'node_modules/three');
if (!fs.existsSync(path.join(three, 'build/three.module.js'))) {
  console.error(`compass-rule: three.js not found at ${three} (set THREE_DIR)`); process.exit(2);
}
const base = pathToFileURL(three + '/').href;
register('data:text/javascript,' + encodeURIComponent(`const base=${JSON.stringify(base)};export async function resolve(s,c,n){` +
  `if(s==='three')return{url:base+'build/three.module.js',shortCircuit:true};` +
  `if(s.startsWith('three/addons/'))return{url:base+'examples/jsm/'+s.slice(13),shortCircuit:true};return n(s,c);}`));
globalThis.window ??= globalThis; globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const { compassBearing } = await import(pathToFileURL(path.join(root, 'src/compass.js')).href);
const { DAY } = await import(pathToFileURL(path.join(root, 'src/config.js')).href);
const { unrealYawToWebYaw } = await import(pathToFileURL(path.join(here, '../coordinates.mjs')).href);
const file = process.argv[2] ?? path.join(root, 'docs/verification/2286/ui-result.json');
const result = JSON.parse(fs.readFileSync(file, 'utf8'));
const names = ['norr', 'nordost', 'öster', 'sydost', 'söder', 'sydväst', 'väster', 'nordväst']; // src/compass.js
const diff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
let failed = 0;
const ok = (good, line) => { if (!good) failed++; console.log(`${good ? 'ok  ' : 'FAIL'} ${line}`); };

ok(result.planNorth === DAY.planNorth, `the export's planNorth ${result.planNorth} = src/config.js DAY.planNorth ${DAY.planNorth}`);
for (const row of result.compass) {
  const webYaw = unrealYawToWebYaw(row.unrealYaw), web = compassBearing(webYaw * Math.PI / 180);
  const name = names[Math.round(web / 45) % 8];
  ok(diff(web, row.bearing) < 0.01 && name === row.name,
    `Unreal yaw ${row.unrealYaw} = web yaw ${webYaw}: web ${web.toFixed(3)}° ${name}, Unreal ${row.bearing}° ${row.name}`);
}
ok(result.compass.length >= 8, `${result.compass.length} directions checked`);
console.log(failed ? `compass-rule: ${failed} failed` : 'compass-rule: all passed');
process.exit(failed ? 1 : 0);

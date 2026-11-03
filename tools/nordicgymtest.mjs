// Photo-read Nordic Wellness front, green hall and entrance contracts (#1822–24).
// Optional module/config paths let the conductor verify the exact composed child delivery before integration.
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
if (process.env.THREE_DIR) register('data:text/javascript,' + encodeURIComponent(`
const root=${JSON.stringify(pathToFileURL(process.env.THREE_DIR + '/').href)};
export async function resolve(s,c,n){if(s==='three')return{url:root+'build/three.module.js',shortCircuit:true};if(s.startsWith('three/addons/'))return{url:root+'examples/jsm/'+s.slice(13),shortCircuit:true};return n(s,c);}`));
const T = await import('three');
const load = async (name, fallback) => import(process.env[name] ? pathToFileURL(process.env[name]).href : fallback);
const { SITE } = await load('NORDIC_GYM_CONFIG', '../src/config.js');
const { buildNordicGym } = await load('NORDIC_GYM_MODULE', '../src/nordicgym.js');
const record = SITE.east.buildings.find(b => b.template === 'nordicgym'), p = record.polygon.slice(0, -1);
const parts = { facade: [], roof: [], glass: [] }, base = 5, bottom = 4.5;
const gym = buildNordicGym(record, p, base, bottom, parts, () => base), N = gym.nordicGym, G = record.model.glass, H = record.model.hall;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${text}`); if (!ok) failed++; };
const meshes = Object.values(parts).flat().map(g => new T.Mesh(g, new T.MeshBasicMaterial({ side: T.DoubleSide })));
meshes.forEach(m => m.updateMatrixWorld());
const colorMatches = (g, hex) => { const c = new T.Color(hex), a = g.attributes.color; return !!a && Math.abs(a.getX(0) - c.r) < 1e-6 && Math.abs(a.getY(0) - c.g) < 1e-6 && Math.abs(a.getZ(0) - c.b) < 1e-6; };
const center = g => { const a = g.attributes.position, c = new T.Vector3(); for (let i = 0; i < a.count; i++) c.add(new T.Vector3().fromBufferAttribute(a, i)); return c.divideScalar(a.count); };
const roadNormal = new T.Vector3(-N.axis[0], 0, -N.axis[1]), sideNormal = new T.Vector3(-N.axis[1], 0, N.axis[0]);
const hitFrom = (point, delta) => new T.Raycaster(point.clone().add(delta), delta.clone().negate().normalize(), 0, delta.length() + .1).intersectObjects(meshes)[0];
check([0, 1, 2].every(f => gym.windows.filter(w => w.frontFloor === f).length === 7), 'seven road panes on every floor');
let visible = 0;
for (const w of gym.windows) {
  const n = new T.Vector3(w.n[0], 0, w.n[1]), c = new T.Vector3(w.x + w.n[1] * w.width * .13, w.y + .09, w.z - w.n[0] * w.width * .13);
  if (Math.abs((hitFrom(c, n)?.distance ?? 0) - 1) < .02) visible++;
}
check(visible === 26 && gym.windows.length === 26, `all front and hall panes visible outside frames/panels (${visible}/26)`);
check(gym.windows.filter(w => w.frontFloor == null).length === H.windowCount && G.south === H.frontDepth && G.east === 6,
  'five hall panes and aligned 12 × 6 m circulation corner');
const washes = meshes.filter(m => m.geometry.attributes.position.count === 180);
let warm = 0;
for (const m of washes) {
  const colors = m.geometry.attributes.color.array;
  if (hitFrom(center(m.geometry), roadNormal)?.object === m && Math.max(...colors) - Math.min(...colors) > .1 &&
      new T.Vector3().fromBufferAttribute(m.geometry.attributes.normal, 0).dot(roadNormal) > .99) warm++;
}
check(warm === 7 && washes.length === 7, 'seven unoccluded road-facing radial wall washes');
const treads = meshes.filter(m => m.geometry.attributes.position.count === 6 && colorMatches(m.geometry, G.stairColor));
const flights = [0, 0, 0, 0];
for (let i = 0; i < treads.length; i++) {
  const m = treads[i], flight = Math.floor(i / G.stair.steps), normal = flight < 2 ? sideNormal : roadNormal;
  const hit = hitFrom(center(m.geometry), normal.clone().multiplyScalar(4).add(new T.Vector3(0, .35, 0)));
  if (hit && colorMatches(hit.object.geometry, G.stairColor)) flights[flight]++;
}
check(treads.length === G.stair.steps * 4 && flights.every(n => n > 0), `all four entrance flights have exposed treads (${flights.join('/')})`);
const globes = meshes.filter(m => colorMatches(m.geometry, G.globeColor));
check(globes.length === G.globes.length && globes.every(m => hitFrom(center(m.geometry), roadNormal.clone().multiplyScalar(4))?.object === m),
  'both warm globes visible through road profiles');
const doors = meshes.filter(m => colorMatches(m.geometry, G.doorColor));
check(doors.length === 1 && hitFrom(center(doors[0].geometry), roadNormal.clone().multiplyScalar(2))?.object === doors[0], 'decorative road entrance door is exposed');
check(Object.keys(parts).length === 3 && Object.values(parts).flat().every(g => [...g.attributes.position.array].every(Number.isFinite)),
  'finite native geometry in existing facade/roof/glass lists only');
check(gym.eave === 15.8 && [[-190, -320], [-175, -340]].every(q => gym.roofY(...q) === 16.1) && gym.roofY(-150, -320) === -Infinity,
  'existing eave and representative flat roofY/outside samples retained');
// Curved terrain deliberately differs from the asphalt's corner-interpolated deck. Paint must stay above the actual deck.
const slope = { facade: [], roof: [], glass: [] };
buildNordicGym(record, p, base, bottom, slope, (x, z) => base + .01 * (x + 180) ** 2 + .005 * (z + 360) ** 2);
const slopeMeshes = Object.values(slope).flat().map(g => new T.Mesh(g, new T.MeshBasicMaterial({ side: T.DoubleSide })));
slopeMeshes.forEach(m => m.updateMatrixWorld());
const stripes = slopeMeshes.filter(m => colorMatches(m.geometry, H.line));
const stripeHits = stripes.filter(m => {
  const point = center(m.geometry), ray = new T.Raycaster(point.clone().add(new T.Vector3(0, 2, 0)), new T.Vector3(0, -1, 0), 0, 3);
  return ray.intersectObjects(slopeMeshes)[0]?.object === m;
}).length;
check(stripes.length === H.stalls + 1 && stripeHits === stripes.length, `all seven parking stripes visible above the rendered deck on curved terrain (${stripeHits}/7)`);
const triangles = Object.values(parts).flat().reduce((n, g) => n + g.attributes.position.count / 3, 0);
// #1822 full campus 86,873 includes its 2,014-triangle gym/Grenhuset contribution. No other source changes here.
const campus = 86873 - 2014 + triangles;
check(campus < 87800, `combined campus contribution ${triangles}, recursive campus ${campus} < 87800`);
const fingerprint = lists => { const hash = createHash('sha256'); for (const [name, geometries] of Object.entries(lists)) { hash.update(name); for (const g of geometries) for (const attr of ['position', 'normal', 'color']) hash.update(g.attributes[attr] ? Buffer.from(g.attributes[attr].array.buffer) : attr + ':absent'); } return hash.digest('hex'); };
console.log(`geometry SHA256 ${fingerprint(parts)}`);
if (process.env.NORDIC_GYM_COMPARE_MODULE && process.env.NORDIC_GYM_COMPARE_CONFIG) {
  const { SITE: other } = await load('NORDIC_GYM_COMPARE_CONFIG');
  const { buildNordicGym: build } = await load('NORDIC_GYM_COMPARE_MODULE');
  const rec = other.east.buildings.find(b => b.template === 'nordicgym'), compare = { facade: [], roof: [], glass: [] };
  build(rec, rec.polygon.slice(0, -1), base, bottom, compare, () => base);
  check(fingerprint(compare) === fingerprint(parts), 'configuration-only offset centralisation preserves all emitted position/normal/colour bytes');
}
process.exitCode = failed ? 1 : 0;

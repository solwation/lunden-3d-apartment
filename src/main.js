import * as THREE from 'three';
import { COLORS, LEVELS, DAY, START, PLAYER, DRAWING, STAIR, HOLD, REMOTE } from './config.js';
const DRAWING_COLORS = DRAWING.colors;
import { buildWorld } from './world.js';
import { Player } from './player.js';
import { setupTouch } from './touch.js';
import { watchForUpdates } from './version.js';
import { CatSpawner, VARIANTS, BREEDS } from './cat.js';
import { initAudio, sfx, toggleMuted, isMuted, updateListener } from './audio.js';
import { stairHeight } from './stairs.js';
import { loadChangelog, renderChangelog, buildNote } from './changelog.js';
import { stats, bump, catFound, renderStats, resetStats, visitRoom, setRoomTotal, setBadgeElement } from './stats.js';
import { Minimap } from './minimap.js';
import { Measure } from './measure.js';
import { cloudTexture } from './surroundings.js';
import { DayCycle } from './daycycle.js';
import { WallClock, ClockPanel } from './wallclock.js';
import { Patio, buildStringLights } from './patio.js';
import { updateReflections, reflectors } from './reflections.js';
import { applySeason } from './seasons.js';
import { saveResume, takeResume } from './resume.js';
import { Rest, chooseSpot } from './rest.js';
import { Saber } from './saber.js';
import { buildToys } from './toys.js';
import { Remote } from './remote.js';
import { Book } from './book.js';
import { buildCups } from './cups.js';
import { Drawing } from './drawing.js';
import { CatCalendar, CalendarPanel } from './calendar.js';
import { heldItem } from './holdable.js';
import { Tap, animateWater } from './water.js';
import { CatBoard, snapshot } from './catboard.js';
import { Lights } from './lights.js';
import { setupInstall } from './install.js';
import { Marks } from './marks.js';
import { Target } from './target.js';

const overlay = document.getElementById('overlay');
const hud = document.getElementById('hud');
const levelEl = document.getElementById('level');
const promptEl = document.getElementById('prompt');
const actionBtn = document.getElementById('action');
const pauseBtn = document.getElementById('pause');
// iPhone: "add to home screen" first (&install shows the sheet anywhere, for screenshots)
setupInstall({ force: new URLSearchParams(location.search).has('install') });

const renderer = new THREE.WebGLRenderer({ antialias: true });
const MAX_PIXEL_RATIO = Math.min(window.devicePixelRatio, 1.5);
renderer.setPixelRatio(MAX_PIXEL_RATIO);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(COLORS.sky); // replaced by the day-cycle sky
scene.fog = new THREE.Fog(COLORS.sky, 45, 160);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 400);
camera.rotation.order = 'YXZ';

const hemi = new THREE.HemisphereLight(0xeaf3ff, 0xd6d2ca, 2.0);
const ambient = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(hemi, ambient);
// Shadowless fill from the north-east so wall orientations read differently indoors
const fill = new THREE.DirectionalLight(0xf4f6ff, 0.9);
fill.position.set(8, 6, -5);
scene.add(fill);

const params0 = new URLSearchParams(location.search);
const plan = await fetch('data/plan.json').then((r) => r.json());
const world = buildWorld(plan);
scene.add(world.object);

// Sun from the south-west (north = the entrance side, −z). Shadows cover the house + patio.
const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
const cx = world.size.x / 2, cz = world.size.z / 2;
sun.position.set(cx - 10, 16, cz + 18);
sun.target.position.set(cx, 0, cz);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 60 });
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);
// The shadow map is only redrawn when it can have changed (#48): the sun moved > 0.2°, something
// was just opened/closed (doors, lids … swing for ~1 s), or at least twice a second.
renderer.shadowMap.autoUpdate = false;
const shadowState = { dir: new THREE.Vector3(), hold: 0, age: Infinity };
function updateShadows(dt) {
  const dir = new THREE.Vector3().subVectors(sun.position, sun.target.position).normalize();
  shadowState.hold -= dt;
  shadowState.age += dt;
  if (shadowState.hold > 0 || shadowState.age > 0.5 || dir.angleTo(shadowState.dir) > 0.0035) {
    renderer.shadowMap.needsUpdate = true;
    shadowState.dir.copy(dir);
    shadowState.age = 0;
  }
}

// Changelog: only on the note on the freezer (the visitor finds it there, #40)
const changelog = await loadChangelog();
const note = buildNote(changelog);
scene.add(note.object);
const noteEl = document.getElementById('note');
renderChangelog(document.getElementById('note-list'), changelog);
const boardEl = document.getElementById('board-view');
let reading = false;
function showBoard(show) {
  reading = show;
  boardEl.hidden = !show;
  player.keys.clear();
  if (show) document.getElementById('board-img').src = board.canvas.toDataURL('image/jpeg', 0.9);
}
document.getElementById('board-close').addEventListener('click', () => showBoard(false));
function showNote(show) {
  if (!show && !boardEl.hidden) { showBoard(false); return; }
  if (!show && clockPanel.open) { showClock(false); return; }
  if (!show && calPanel.open) { showCalendar(false); return; }
  if (!show && book.reading) { showBook(false); return; }
  reading = show;
  noteEl.hidden = !show;
  player.keys.clear();
  if (show) sfx.paper({ x: note.object.position.x, y: note.object.position.y, z: note.object.position.z });
}
document.getElementById('note-close').addEventListener('click', () => showNote(false));

const lights = new Lights(scene, world);
// every visit starts at the browser's own time and date (#95), or ?time=HH (e.g. ?time=21.5) / ?month=1–12 /
// ?day=1–31 (with ?month alone the date is the 15th)
const now = new Date();
const startHour = params0.has('time') ? Number(params0.get('time')) : now.getHours() + now.getMinutes() / 60;
const month = params0.has('month') ? Number(params0.get('month')) : now.getMonth() + 1;
const date = params0.has('day') ? Number(params0.get('day')) : params0.has('month') ? 15 : now.getDate();
const day = new DayCycle({ scene, camera, lights: { sun, hemi, ambient, fill }, clouds: cloudTexture(), startHour, month, date, year: now.getFullYear() });
day.paused = params0.has('freeze');
// the kitchen wall clock: shows the time; E opens the strip to spool / pause it (the date: the calendar)
const wallClock = new WallClock();
scene.add(wallClock.object);
const clockPanel = new ClockPanel(day, document.getElementById('clock-panel'));
// patio seasons: parasol up on summer days, beers in summer, a snowman in winter
const patio = new Patio();
scene.add(patio.object);
function showClock(show) {
  reading = show;
  clockPanel.show(show);
  player.keys.clear();
}
document.getElementById('clock-close').addEventListener('click', () => showClock(false));
// the cat calendar under the clock: E opens a strip to pick the date (#95)
const calendar = new CatCalendar(day);
scene.add(calendar.object);
const calPanel = new CalendarPanel(calendar, document.getElementById('cal-panel'));
function showCalendar(show) {
  reading = show;
  calPanel.show(show);
  player.keys.clear();
}
document.getElementById('cal-close').addEventListener('click', () => showCalendar(false));
if (day.daylight < 0.3 || params0.has('lights')) lights.setAll(true); // arriving in the dark: lights on
// LED string lights on the patio's screen walls (#81): switched by daylight, borrow pool lights
{
  const site = plan.floors[0].site;
  if (site.fences?.length) {
    const sl = buildStringLights(site.fences, site.patio ? (site.patio.x0 + site.patio.x1) / 2 : world.size.x / 2);
    sl.forced = params0.has('lights');
    world.looseItems.push(sl.object); // decoration: hidden with F
    scene.add(sl.object);
    lights.extra.push(...sl.lamps);
    patio.setStringLights(sl, sl.forced);
  }
}
const taps = world.taps.map((spec) => new Tap(spec));
let inShower = false, shriekAt = 0;
for (const t of taps) scene.add(t.object);

const player = new Player(world, camera);
const rest = new Rest(camera); // sitting / lying down (#71/#72)
const saber = new Saber(scene, camera); // the lightsaber in Sovrum 2 (#78)
const toys = buildToys(scene, camera); // Nerf blasters, magic wands, the flashlight (#86, #87, #89)
// the TV remote (#101): works on the TV in the look direction, within reach, not through a wall
const tvRay = new THREE.Raycaster();
const remote = new Remote(scene, camera, () => {
  camera.updateMatrixWorld();
  tvRay.setFromCamera(new THREE.Vector2(0, 0), camera);
  tvRay.far = REMOTE.reach;
  const tvs = world.furnitureTargets.filter((t) => t.kind === 'tv');
  const hit = tvRay.intersectObjects(tvs.map((t) => t.pickable), true)[0];
  if (!hit || behindWall(hit.point)) return null;
  return tvs.find((t) => { let o = hit.object; while (o && o !== t.pickable) o = o.parent; return !!o; }) ?? null;
});
// the book on the side table by the armchair (#140): a click opens it in #book-panel (reading mode)
const book = new Book(scene, camera, document.getElementById('book-panel'), (show) => showBook(show));
function showBook(show) {
  reading = show;
  book.show(show);
  player.keys.clear();
}
const holdables = [saber, ...toys.items, remote, book]; // things you can take and hold, one at a time (holdable.js)
const cups = buildCups(scene, camera, world, world.cupCabinet); // coffee cups in the wall cabinet (#90)
let placeTarget = null; // while something is held: the table top / floor spot it would go down on (#102)
// a faint ring where the held thing would land
const placeGhost = new THREE.Mesh(new THREE.RingGeometry(0.035, 0.05, 24).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false }));
placeGhost.visible = false;
scene.add(placeGhost);
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), floorHit = new THREE.Vector3();
/** Where the look ray meets the floor the visitor stands on, within reach — or null (stairs, the stair opening). */
function floorSpot() {
  const lv = player.level, y = LEVELS[Math.max(0, lv)]?.floor ?? 0;
  if (lv < 0 || Math.abs(player.pos.y - y) > 0.05) return null;
  floorPlane.constant = -y;
  if (!raycaster.ray.intersectPlane(floorPlane, floorHit)) return null;
  const d = floorHit.distanceTo(camera.position);
  const h = STAIR.hole;
  if (d > HOLD.reach || (lv === 1 && floorHit.x > h.x0 && floorHit.x < h.x1 && floorHit.z > h.z0 && floorHit.z < h.z1)) return null;
  return { point: floorHit.clone(), distance: d };
}
const drawing = new Drawing(scene, camera); // crayons on the paper on the desk in Sovrum 3 (#93)
const measure = new Measure(scene, camera, [world.object], document.getElementById('measure'));
document.getElementById('measure-btn').addEventListener('click', () => measure.press());
const cat = new CatSpawner(world);
scene.add(cat.object);
const target = new Target(); // the Nerf target on the lawn (#99)
scene.add(target.object);
world.looseItems.push(target.object);
const marks = new Marks(scene, camera, [world.object, patio.object, target.object], cat); // burn marks, stars, splashes on surfaces (#96)
for (const h of [saber, ...toys.wands, toys.darts]) Object.assign(h, { marks, cat }); // the saber burns, the wands do magic (#97), darts splash (#98)
cat.onFound = (label, rare) => catFound(label, rare);
// a photo of every cat you pet goes up on the board, once its eyes are shut and the hand is there
const board = new CatBoard();
scene.add(board.object);
board.load();
cat.onPet = () => {
  bump('petted');
  setTimeout(() => {
    if (!cat.visible) return;
    const head = cat.head.getWorldPosition(new THREE.Vector3());
    board.add(cat.catName, snapshot(renderer, scene, camera, head));
  }, 700);
};

/** Open/close a door (with sound); the cat may turn up (or leave) behind doors you open. */
function useDoor(door) {
  const opening = !door.isOpen;
  door.toggle();
  if (opening) bump('doors');
  const [x, z] = door.opening().center;
  const pos = { x, y: player.pos.y + 1.1, z };
  if (door.kind === 'swing') {
    if (opening) sfx.doorOpen(pos);
    else sfx.doorClose(pos, 0.5);
  } else {
    sfx.slide(pos, { dur: 0.45, wardrobe: door.kind === 'wardrobe' });
  }
  if (opening && world.furnitureOn) cat.onOpen(door, player.pos);
  else cat.onClose(door);
}

// footsteps every stride while walking on the ground
let stride = 0;
const lastPos = new THREE.Vector3();
function footsteps() {
  const d = Math.hypot(player.pos.x - lastPos.x, player.pos.z - lastPos.z);
  lastPos.copy(player.pos);
  if (d > 0.5 || player.vy !== 0) return; // teleport / falling
  bump('metres', d);
  stride += d;
  if (stride < (player.sprinting ? PLAYER.strideRun : PLAYER.strideWalk)) return;
  stride = 0;
  bump('steps');
  const { x, z } = player.pos;
  const inside = x > 0 && x < world.size.x && z > 0 && z < world.size.z;
  sfx.step(stairHeight(x, z) !== null ? 'stair' : inside ? 'wood' : 'outside');
}
function spawnAtStart() {
  player.spawn(START.x, START.z, THREE.MathUtils.degToRad(START.yawDeg));
  camera.rotation.x = THREE.MathUtils.degToRad(START.pitchDeg);
}
spawnAtStart();
// after the "Ladda om" button: back where the visitor was (resume.js), unless that spot is no longer
// walkable (the plan changed) — then the usual start. The start screen offers "Börja från start".
const resumed = takeResume();
function resumeAt(r) {
  player.spawn(r.x, r.z, r.yaw);
  player.pos.y = r.feetY;
  player.eyeY = r.feetY + PLAYER.eye;
  camera.position.y = player.eyeY;
  camera.rotation.x = r.pitch;
  // reject spots inside a wall: one standing step must not push the visitor away
  const before = player.pos.clone();
  player.update(1 / 60);
  if (player.pos.distanceTo(before) > 0.05 || Math.abs(player.groundAt(r.x, r.z, r.feetY) - r.feetY) > 0.3) { spawnAtStart(); return false; }
  return true;
}

// Debug/screenshot helper: ?at=x,z,yawDeg[,pitchDeg[,feetY]] places the camera (plan metres).
const at = new URLSearchParams(location.search).get('at');
if (at) {
  const [x, z, yaw = 180, pitch = 0, feet] = at.split(',').map(Number);
  player.spawn(x, z, THREE.MathUtils.degToRad(yaw));
  if (feet !== undefined) { player.pos.y = feet; player.eyeY = feet + 1.62; }
  camera.position.y = player.eyeY;
  camera.rotation.x = THREE.MathUtils.degToRad(pitch);
}
// the resumed place (not with ?at=): back to the same spot, view and time; the start screen then
// says so and offers "Börja från start" instead
const resumeEl = document.getElementById('resume');
if (resumed && !at && resumeAt(resumed)) {
  if (Number.isFinite(resumed.hour)) day.hour = resumed.hour;
  if (resumed.month >= 1 && resumed.month <= 12) day.month = resumed.month;
  resumeEl.hidden = false;
}
for (const id of ['restart', 'to-start']) { // also on the start screen shown when the mouse is freed (pause)
  document.getElementById(id).addEventListener('click', () => { spawnAtStart(); resumeEl.hidden = true; });
}
const params = new URLSearchParams(location.search);
if (params.has('shot')) overlay.hidden = true;
if (params.has('tv')) for (const t of world.furnitureTargets) if (t.kind === 'tv') t.toggle();
// ?open opens every door (screenshots of open doors/wardrobes)
// &water turns every tap on (screenshots)
// &tv switches the TV on (screenshots)
if (params.has('water')) for (const t of taps) t.toggle();
if (params.has('open')) for (const d of [...world.doors, ...world.lids]) { d.toggle(); for (let i = 0; i < 30; i++) d.update(0.1); }
// ?cat=x,z[,yaw[,feetY]] puts the cat somewhere (screenshots)
if (params.has('cat')) {
  const [x, z, yaw = 0, y = 0] = params.get('cat').split(',').map(Number);
  cat.object.position.set(x, y, z);
  cat.object.rotation.y = THREE.MathUtils.degToRad(yaw);
  cat.object.visible = true;
  // &catb=i breed, &catv=i coat (of that breed, or of all coats for a huskatt)
  const breed = BREEDS[Number(params.get('catb') ?? 0)];
  const coats = breed.name === 'huskatt' ? VARIANTS : breed.coats;
  cat.setCat(breed, coats[Number(params.get('catv') ?? 0) % coats.length]);
  cat.t = Number(params.get('catt') ?? 1.5);
  cat.nextMeow = 1e9;
  cat.update(0);
  // &pet: the cat is being petted (screenshots)
  if (params.has('pet')) { cat.pet(player.pos); cat.petT = 1e9; cat.update(1.1); }
}
// ?note opens the changelog note (screenshots)
if (params.has('note')) showNote(true);
// ?clock opens the wall clock's strip (screenshots)
if (params.has('clock')) showClock(true);
// ?clip=y cuts away everything above height y (plan check from above)
if (params.has('clip')) renderer.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, -1, 0), Number(params.get('clip')))];

// --- input ---------------------------------------------------------------
// Mouse/keyboard uses pointer lock; touch (phone, tablet, Surface screen) uses an
// on-screen joystick + drag to look. The start screen lets the visitor pick.
const canvas = renderer.domElement;
const stickEl = document.getElementById('stick');
let locked = false;
const touch = setupTouch({ onLook: (dx, dy) => look(dx * 0.005, dy * 0.005) });
const active = () => locked || touch.enabled;

function look(dyaw, dpitch) {
  camera.rotation.y -= dyaw;
  camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x - dpitch, -1.45, 1.45);
  rest.clampLook(camera); // sitting / lying: only so far
}

function showOverlay(show) {
  overlay.hidden = !show;
  hud.hidden = show;
  document.body.classList.toggle('touch', touch.enabled);
}

// Explicit choice on the start screen — a Surface has both a touchscreen and a keyboard.
function startMouse() { initAudio(); canvas.requestPointerLock(); }
document.getElementById('start-mouse').addEventListener('click', startMouse);
// Esc on the start screen = "Mus & tangentbord". Browsers don't count Esc as a user gesture, so
// it can't grab the mouse or start the sound itself: it closes the start screen and the next
// click (anywhere) does exactly what the button does. Esc in the game still just frees the mouse.
const armEl = document.getElementById('arm');
let unlockedAt = -1e9;
const otherOverlay = () => ['install', 'note', 'board-view'].some((id) => !document.getElementById(id)?.hidden)
  || getComputedStyle(document.getElementById('rotate')).display !== 'none';
document.addEventListener('keydown', (e) => {
  if (e.code !== 'Escape' || locked || overlay.hidden || otherOverlay()) return;
  if (performance.now() - unlockedAt < 700) return; // the Esc that just freed the mouse
  e.preventDefault();
  overlay.hidden = true;
  armEl.hidden = false;
});
armEl.addEventListener('click', () => { armEl.hidden = true; startMouse(); });
document.addEventListener('pointerlockerror', () => { if (!armEl.hidden || overlay.hidden) { armEl.hidden = true; showOverlay(true); } });
document.getElementById('start-touch').addEventListener('click', () => {
  initAudio();
  touch.enabled = true;
  // fullscreen first: orientation.lock only works there (Android); iOS gets the rotate hint
  document.documentElement.requestFullscreen?.()
    .then(() => screen.orientation?.lock?.('landscape'))
    .catch(() => {});
  showOverlay(false);
});
document.getElementById('start-go').addEventListener('click', () => document.getElementById('start-touch').click());
pauseBtn.addEventListener('click', () => {
  touch.enabled = false;
  player.analog.x = player.analog.y = 0;
  showOverlay(true);
});
/** Are all the object's parents visible? (Its own flag is ignored: invisible pick helpers on taps and
 * mirrors are meant to be hit; what F hides is a parent group.) */
function shown(o) {
  for (let p = o.parent; p; p = p.parent) if (!p.visible) return false;
  return true;
}
/** Sit down / lie down on the furniture you look at (the seat or side nearest the look ray). */
function sitOrLie(target) {
  raycaster.setFromCamera(center, camera);
  const spot = chooseSpot(target, raycaster.ray, cat.visible ? cat.object.position : null);
  if (!spot) return;
  player.crouch = false;
  rest.begin(target, spot, { x: player.pos.x, z: player.pos.z, y: player.pos.y, yaw: camera.rotation.y });
  bump(spot.kind === 'lie' ? 'lay' : 'sat');
  sfx.rustle(spot.pos);
  if (spot.pc) usePc(spot);
}
/** The gaming chair starts the PC; the seat in the bunk also swings its monitor round for a film. */
function usePc(spot) {
  const pc = world.furnitureTargets.find((t) => t.kind === 'pc' && t.pickable.getWorldPosition(new THREE.Vector3()).distanceTo(spot.pos) < 3);
  if (!pc) return;
  pc.watch(spot.pc === 'film' ? spot.pos : null);
  if (!pc.isOpen) { pc.toggle(); sfx.tvClick(pc.pickable.getWorldPosition(new THREE.Vector3()), true); }
}
/** Drawing mode (#93): the view over the paper, the pointer free (mouse) / touch looking off, the palette. */
const drawPanel = document.getElementById('draw-panel');
const drawColors = drawPanel.querySelector('.colors');
DRAWING_COLORS.forEach((c, i) => {
  const b = document.createElement('button');
  b.style.background = c;
  b.title = `${i + 1}`;
  b.addEventListener('click', () => pickColor(i));
  drawColors.append(b);
});
function pickColor(i) {
  drawing.color = DRAWING_COLORS[i];
  [...drawColors.children].forEach((b, k) => b.classList.toggle('on', k === i));
}
pickColor(4);
let drawTouch = false;
function beginDraw() {
  drawing.begin();
  drawPanel.hidden = false;
  promptEl.hidden = true;
  actionBtn.hidden = true;
  drawTouch = touch.enabled;
  touch.enabled = false; // the finger draws now, it doesn't look around
  if (locked) document.exitPointerLock();
}
function endDraw(byKey = 'E') {
  drawing.end();
  drawPanel.hidden = true;
  if (drawTouch) touch.enabled = true;
  else if (byKey === 'Escape') { overlay.hidden = true; armEl.hidden = false; } // Esc can't grab the mouse: click to go on
  else canvas.requestPointerLock();
}
drawPanel.querySelector('[data-act=clear]').addEventListener('click', () => drawing.clear());
drawPanel.querySelector('[data-act=done]').addEventListener('click', () => endDraw('button'));
canvas.addEventListener('pointerdown', (e) => { if (drawing.active) { drawing.pointerDown(e.clientX, e.clientY, canvas); e.preventDefault(); } });
canvas.addEventListener('pointermove', (e) => { if (drawing.active) drawing.pointerMove(e.clientX, e.clientY, canvas); });
window.addEventListener('pointerup', () => { if (drawing.active) drawing.pointerUp(); });
document.addEventListener('keydown', (e) => {
  if (!drawing.active) return;
  if (e.code === 'KeyE' || e.code === 'Escape') { e.preventDefault(); endDraw(e.code); }
  else if (/^Digit[1-9]$/.test(e.code)) pickColor(Number(e.code.slice(5)) - 1);
  e.stopImmediatePropagation();
}, true);

/** Stand up again where you stood before sitting / lying down. */
function standUp() {
  const film = rest.spot?.pc === 'film';
  const s = rest.end();
  if (!s) return;
  // getting up from the film: the monitor goes back to the desk (and the game) — the PC stays on
  if (film) for (const t of world.furnitureTargets) if (t.kind === 'pc') t.watch(null);
  player.spawn(s.x, s.z, s.yaw);
  player.pos.y = s.y; // spawn() finds the ground floor; upstairs we stood on Övre plan
  player.eyeY = s.y + PLAYER.eye;
  camera.position.y = player.eyeY;
  sfx.rustle(camera.position);
}
/** E / the action button on what you look at: doors toggle, the note opens. */
function use(thing) {
  shadowState.hold = 1.5; // whatever moves now casts a moving shadow
  if (thing.kind === 'note') showNote(true);
  else if (thing.kind === 'clock') showClock(true);
  else if (thing.kind === 'calendar') showCalendar(true);
  else if (thing.kind === 'board') showBoard(true);
  else if (thing.kind === 'switch' || thing.kind === 'lamp') { thing.toggle(); if (thing.isOpen) bump('lights'); }
  else if (thing.kind === 'fridge') { thing.toggle(); if (thing.isOpen) bump('fridge'); }
  else if (thing.kind === 'keybox') thing.toggle();
  else if (thing.kind === 'appliance') { thing.toggle(); if (thing.isOpen) bump('appliances'); } // oven, microwave (#82)
  else if (thing.kind === 'coffee') thing.toggle();
  else if (thing.kind === 'cabinet') { thing.toggle(); if (thing.isOpen) bump('cabinets'); } // wall cabinets that open (#138)
  else if (thing.kind === 'target') thing.toggle(); // clear the score (#99)
  else if (thing.kind === 'rest') sitOrLie(thing);
  else if (thing.blocked) sfx.click(camera.position); // put down what you hold first (#102)
  else if (thing.kind === 'saber' || thing.kind === 'holdable' || thing.kind === 'cup') thing.toggle();
  else if (thing.kind === 'place') thing.item.placeAt(thing.point);
  else if (thing.kind === 'paper') beginDraw();
  else if (thing.kind === 'pc') { const on = thing.toggle(); sfx.tvClick(thing.pickable.getWorldPosition(new THREE.Vector3()), on); }
  else if (thing.kind === 'tv') {
    const on = thing.toggle();
    sfx.tvClick(thing.pickable.getWorldPosition(new THREE.Vector3()), on);
  } else if (thing.kind === 'parasol') {
    const opening = thing.toggle();
    sfx.parasol(thing.pickable.getWorldPosition(new THREE.Vector3()).setY(2), opening);
  }
  else if (thing.kind === 'carkey') thing.press();
  else if (thing.kind === 'lid') {
    thing.toggle();
    if (thing.isOpen) bump('lids');
    sfx.lid(thing.object.position, thing.isOpen);
  } else if (thing.kind === 'cat') cat.pet(player.pos);
  else if (thing.kind === 'tap') {
    thing.toggle();
    if (thing.isOpen) bump('taps');
  }
  else useDoor(thing);
}
actionBtn.addEventListener('click', () => { if (reading) showNote(false); else if (rest.active) standUp(); else if (focused) use(focused); else heldItem()?.use(); });
const muteBtn = document.getElementById('mute');
function updateMute(m = isMuted()) {
  muteBtn.textContent = m ? '🔇' : '🔊';
  muteBtn.setAttribute('aria-label', m ? 'Slå på ljud' : 'Stäng av ljud');
}
muteBtn.addEventListener('click', () => updateMute(toggleMuted()));
updateMute();
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (!locked) unlockedAt = performance.now();
  armEl.hidden = true;
  if (locked) touch.enabled = false;
  if (!drawing.active) showOverlay(!locked); // drawing frees the mouse on purpose: no start screen
  if (!locked) { player.keys.clear(); holdStats(false); if (!touch.enabled) player.crouch = false; }
  if (!locked && reading) showNote(false);
});
document.addEventListener('mousemove', (e) => {
  if (locked) look(e.movementX * PLAYER.mouseSens, e.movementY * PLAYER.mouseSens);
});
document.addEventListener('mousedown', (e) => {
  if (locked && e.button === 0) { if (book.reading) book.turn(1); else heldItem()?.use(); } // a click: swing, fire, toggle the flashlight, change channel, read / turn the page
  if (locked && e.button === 2) heldItem()?.useAlt?.(); // right click: the remote's power button (#101)
});
document.addEventListener('contextmenu', (e) => { if (locked) e.preventDefault(); });
// touch: the remote's power button beside the action button while it is held
const powerBtn = document.getElementById('power-btn');
powerBtn.addEventListener('click', () => heldItem()?.useAlt?.());
const stripKeys = new Set(); // keys pressed while a strip / the note is open
document.addEventListener('keydown', (e) => {
  if (!locked) return;
  if (reading) {
    // WASD drive the strips (#120): auto-repeat of a key already held while walking up to them is ignored
    if (!e.repeat) stripKeys.add(e.code);
    else if (!stripKeys.has(e.code)) return;
    if (clockPanel.open && clockPanel.key(e.code, true, e.repeat)) e.preventDefault();
    else if (calPanel.open && calPanel.key(e.code, true)) e.preventDefault();
    else if (book.reading && book.key(e.code)) e.preventDefault();
    else if (e.code === 'KeyE') showNote(false);
    return;
  }
  player.keys.add(e.code);
  if (e.code === 'ControlLeft' || e.code === 'ControlRight') player.crouch = true; // crouch while held (#70)
  if (e.code === 'KeyE' && rest.active) standUp();
  else if (e.code === 'KeyE' && focused) use(focused);
  if (e.code === 'KeyM') updateMute(toggleMuted());
  if (e.code === 'KeyT') toggleStats();
  if (e.code === 'Tab') { e.preventDefault(); if (!e.repeat) holdStats(true); }
  if (e.code === 'KeyK') toggleMap();
  if (e.code === 'KeyQ') measure.press();
  if (e.code === 'KeyF') toggleFurniture();
  if (e.code.startsWith('Arrow')) e.preventDefault();
});
document.addEventListener('keyup', (e) => {
  player.keys.delete(e.code);
  stripKeys.delete(e.code);
  if (e.code === 'ControlLeft' || e.code === 'ControlRight') player.crouch = false;
  if (clockPanel.open && clockPanel.key(e.code, false)) e.preventDefault(); // no button click on Space
  if (e.code === 'Tab') holdStats(false);
});
window.addEventListener('blur', () => { if (!touch.enabled) player.crouch = false; }); // no stuck crouch
// touch: a crouch toggle beside the action button
const crouchBtn = document.getElementById('crouch-btn');
crouchBtn.addEventListener('click', () => {
  player.crouch = !player.crouch;
  crouchBtn.classList.toggle('on', player.crouch);
});
window.addEventListener('resize', () => {
  window.scrollTo(0, 0); // iOS may have scrolled the page when the bars or orientation changed
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- door interaction: look at a door within reach, press E ----------------
const raycaster = new THREE.Raycaster();
raycaster.far = 2.2;
const pickables = [...world.doors.map((d) => d.pickable), ...world.lids.map((l) => l.pickable), ...taps.map((t) => t.pickable), note.pickable, board.pickable, wallClock.pickable, calendar.pickable, ...lights.targets.map((t) => t.pickable)];
const center = new THREE.Vector2(0, 0);
const keyCabinet = world.lids.find((l) => l.kind === 'keybox');
let focused = null;

/** Is there a wall between the eye and `p` (plan view)? Pickables aren't occluded by walls in the
 * raycast (it only tests pickables), so check the line against the level's wall outlines. */
function behindWall(p) {
  const segs = world.levels[Math.max(0, player.level)]?.wallSegments ?? [];
  const ax = camera.position.x, az = camera.position.z, bx = p.x, bz = p.z;
  return segs.some(([cx, cz, dx, dz]) => {
    const d = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx);
    if (Math.abs(d) < 1e-9) return false;
    const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / d;
    const u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / d;
    return t > 0 && t < 0.98 && u > 0 && u < 1;
  });
}

function updateFocus() {
  if (rest.active) { // sitting / lying: E (or the button) only gets you up again
    focused = null;
    promptEl.textContent = 'Tryck E för att resa dig';
    promptEl.hidden = touch.enabled;
    actionBtn.textContent = 'Res dig';
    actionBtn.hidden = !touch.enabled;
    return;
  }
  camera.updateMatrixWorld(); // the player just moved it; render hasn't run yet
  raycaster.setFromCamera(center, camera);
  // (the raycaster ignores visibility, so the cat is only a target while it is there)
  // the car key only while its cabinet is open
  const extra = [...(cat.visible ? [cat.object] : []), ...(keyCabinet?.keyReachable ? [world.carKey.pickable] : []),
    ...(world.furnitureOn ? [target.target, ...patio.targets, ...world.furnitureTargets, ...holdables.map((h) => h.target), drawing.target].map((t) => t.pickable) : [])]; // parasol, TV, seats, beds, toys — unless F hid the furniture
  // the nearest hit on something actually shown (F hides the loose items, the raycaster doesn't care)
  const cupTargets = cups.cups.filter((c) => !c.held).map((c) => c.target.pickable);
  const hit = raycaster.intersectObjects([...pickables, ...extra, ...cupTargets], true).find((h) => shown(h.object));
  focused = hit && !behindWall(hit.point) ? hit.object.userData.door : null;
  // holding something: a table top / worktop in front of you, or else the floor (nearer than anything
  // else you look at), is where it goes down (#102)
  const item = heldItem();
  placeGhost.visible = false;
  if (item?.placeAt) {
    const top = raycaster.intersectObjects(world.cupSurfaces, false).find((h) => shown(h.object) && h.point.y >= h.object.userData.surface - 0.02);
    let spot = top && top.distance < HOLD.reach && !behindWall(top.point) ? { point: top.point.clone().setY(top.object.userData.surface), distance: top.distance } : null;
    if (!spot) { const f = floorSpot(); if (f && !behindWall(f.point)) spot = f; } // a table top is always above (before) the floor
    if (spot && (!hit || spot.distance <= hit.distance + 0.05)) {
      placeTarget = { name: `${item.name} här`, kind: 'place', verb: item.placeVerb ?? 'lägga ner', item, point: spot.point };
      focused = placeTarget;
      placeGhost.position.copy(spot.point).y += 0.003;
      placeGhost.visible = true;
    }
  }
  // the remote in the hand, aimed at a TV: the click / the touch button are the remote's (#101)
  const remoteAim = heldItem() === remote && focused?.kind === 'tv';
  if (remoteAim) focused = null;
  // a bed with a seat in it: the verb of the spot the look ray picks
  const spot = focused?.kind === 'rest' ? chooseSpot(focused, raycaster.ray, null) : null;
  const verb = !focused ? '' : spot?.verb ?? focused.verb ?? (focused.isOpen ? 'stänga' : 'öppna');
  if (focused?.blocked) {
    actionBtn.textContent = promptEl.textContent = 'Lägg ifrån dig det du håller först';
  } else if (focused && touch.enabled) {
    actionBtn.textContent = `${verb[0].toUpperCase()}${verb.slice(1)} ${focused.name}`;
  } else if (focused) {
    promptEl.textContent = `Tryck E för att ${verb} ${focused.name}`;
  }
  const holding = !focused && heldItem(); // touch: the button uses what you hold (fire, wave, light)
  if (holding && touch.enabled) actionBtn.textContent = holding.useLabel;
  if (reading && touch.enabled) actionBtn.textContent = 'Stäng lappen';
  promptEl.hidden = !focused || touch.enabled || reading;
  if (remoteAim && !touch.enabled && !reading) { promptEl.textContent = 'Klicka för att byta kanal · högerklick: av/på'; promptEl.hidden = false; }
  actionBtn.hidden = !(focused || reading || holding) || !touch.enabled || clockPanel.open || calPanel.open; // the strips have their own ×
  powerBtn.hidden = !touch.enabled || !heldItem()?.useAlt || reading;
}

// --- furniture on/off (F / 🛋) ---------------------------------------------
function toggleFurniture(on = !world.furnitureOn) {
  if (rest.active) standUp(); // the seat is about to vanish
  world.setFurniture(on);
  if (!on) { // whatever is in the hand, or put down somewhere, goes home first (#102)
    heldItem()?.putBack(); toys.darts.hide();
    for (const h of holdables) if (h.placed) h.goHome();
    for (const c of cups.cups) if (c.state === 'placed') c.model.position.copy(c.counter);
  }
  if (!on && cat.visible) cat.hide(); // the cat goes too (and stops purring); none turn up until F is back
  if (!on) for (const t of world.furnitureTargets) if ((t.kind === 'tv' || t.kind === 'pc') && t.isOpen) t.toggle(); // screens off
  try { localStorage.setItem('lunden.furniture', on ? '1' : '0'); } catch { /* ignore */ }
}
world.looseItems.push(board.object, ...holdables.flatMap((h) => [h.holder, h.model]), ...toys.deco);
world.looseItems.push(...cups.cups.map((c) => c.model), drawing.paper, calendar.object); // the cups and the paper go with F too // the cat board and the toys go with the furniture (F)
try { if (localStorage.getItem('lunden.furniture') === '0') toggleFurniture(false); } catch { /* ignore */ }
document.getElementById('furniture-btn').addEventListener('click', () => toggleFurniture());

// --- statistics panel: hidden; Tab held (like a scoreboard), T / 📊 toggle -------
// Counted events pop up as small badges instead.
const statsEl = document.getElementById('stats');
setBadgeElement(document.getElementById('badges'));
let statsPinned = false;
// the minimap is part of the same "extra HUD" (#85): shown with the stats; K shows the map on its own
let mapPinned = false;
function showStats(show) {
  if (show && statsEl.hidden) renderStats(statsEl);
  statsEl.hidden = !show;
  document.getElementById('minimap').hidden = !(show || mapPinned);
}
function toggleStats() { statsPinned = !statsPinned; showStats(statsPinned); }
const holdStats = (down) => showStats(down || statsPinned);
document.getElementById('stats-btn').addEventListener('click', () => toggleStats());
document.getElementById('stats-reset').addEventListener('click', () => {
  if (confirm('Nollställa statistiken?')) { resetStats(); renderStats(statsEl); }
});
renderStats(statsEl);
setInterval(() => { if (!statsEl.hidden) renderStats(statsEl); }, 250);

// --- loop ----------------------------------------------------------------
const clock = new THREE.Clock();
let lastLevel = -1, lastRoom = null, mapTimer = 0;
const mapEl = document.getElementById('minimap');
const minimap = new Minimap(mapEl, world.roomMaps);
setRoomTotal(world.roomMaps.reduce((n, m) => n + new Set(m.rooms.map((r) => r.name)).size, 0));
function toggleMap() { // K: the map alone (Tab / T / 📊 show it with the stats)
  mapPinned = !mapPinned;
  mapEl.hidden = !(mapPinned || !statsEl.hidden);
}
mapEl.hidden = true; // hidden by default (#85); the old saved 'lunden.mapShown' is ignored
function step(dt) {
  for (const d of world.doors) d.update(dt);
  for (const l of world.lids) l.update(dt);
  for (const t of taps) t.update(dt);
  // stepping into a running (cold!) shower: "iiiih!" once per visit
  const wet = taps.some((t) => t.hits(player.pos.x, player.pos.y, player.pos.z));
  if (wet && !inShower && performance.now() > shriekAt) { sfx.shriek(); shriekAt = performance.now() + 1500; }
  inShower = wet;
  animateWater(dt);
  lights.update(Math.max(0, player.level), player.pos);
  day.update(dt);
  wallClock.update(day.hour);
  calendar.update(); // redraws only when the page or the date changed
  patio.update(day, dt);
  applySeason(day.month); // tree colours, snow (only does work when the month changes)
  for (const t of world.furnitureTargets) t.update?.(dt);
  for (const h of holdables) h.update(dt);
  cups.update(dt);
  toys.update(dt);
  marks.update(dt);
  if (clockPanel.open) clockPanel.render();
  world.windowLights.update(day.hour, 1 - day.daylight);
  cat.update(dt);
  measure.update(dt, window.innerWidth, window.innerHeight);
  if (active() && reading) updateFocus();
  else if (drawing.active) drawing.update(dt); // drawing: the camera over the paper, nothing else moves you
  else if (active() && rest.active) { rest.update(dt); updateFocus(); } // sitting / lying: look, no walking
  else if (active()) {
    player.analog.x = touch.analog.x;
    player.analog.y = touch.analog.y;
    player.update(dt);
    stickEl.classList.toggle('sprint', touch.enabled && player.sprinting); // joystick knob turns green
    footsteps();
    updateFocus();
  }
  const outside = player.pos.x <= 0 || player.pos.x >= world.size.x || player.pos.z <= 0 || player.pos.z >= world.size.z;
  const lvl = outside ? -1 : player.level;
  const room = lvl < 0 ? null : world.roomAt(lvl, player.pos.x, player.pos.z);
  if (room && active()) visitRoom(`${lvl}:${room}`);
  if (room !== lastRoom && room) lastRoom = room; // keep the last name while inside a doorway
  mapTimer -= dt;
  if (mapTimer <= 0 && !mapEl.hidden) {
    mapTimer = 0.1;
    minimap.draw(lvl, lastRoom, player.pos.x, player.pos.z, camera.rotation.y);
  }
  if (active() && !outside) bump('seconds', dt);
  if (lvl !== lastLevel && lvl >= 0 && lastLevel >= 0) bump('stairs');
  if (lvl < 0) lastRoom = null;
  const label = `${lvl < 0 ? 'Utomhus' : `${LEVELS[lvl].name}${lastRoom ? ` · ${lastRoom}` : ''}`} · ${day.clock}`;
  if (lvl !== lastLevel || label !== levelEl.textContent) {
    levelEl.textContent = label;
    lastLevel = lvl;
  }
}
// &perf: fps + what the renderer did last frame (draw calls, triangles, geometries, textures)
const perfEl = new URLSearchParams(location.search).has('perf') ? document.createElement('pre') : null;
if (perfEl) {
  perfEl.id = 'perf';
  Object.assign(perfEl.style, { position: 'fixed', right: '8px', top: '8px', margin: 0, padding: '6px 8px', zIndex: 30,
    background: 'rgba(0,0,0,.6)', color: '#bdf', font: '12px/1.3 monospace', pointerEvents: 'none' });
  document.body.append(perfEl);
}
let perfFrames = 0, perfT = performance.now();
// Dynamic resolution (#48): if the frame rate stays under ~30 fps for 2 s, render at a lower pixel
// ratio (steps of 0.85×, not below 0.6 of the full ratio); back up again after 4 s above ~50 fps.
const dynRes = { ratio: MAX_PIXEL_RATIO, slow: 0, fast: 0 };
const shotMode = new URLSearchParams(location.search).has('shot'); // screenshots: always full resolution
function adaptResolution(dt) {
  if (dt <= 0) return;
  const fps = 1 / dt;
  dynRes.slow = fps < 30 ? dynRes.slow + dt : 0;
  dynRes.fast = fps > 50 ? dynRes.fast + dt : 0;
  let next = dynRes.ratio;
  if (dynRes.slow > 2) next = Math.max(MAX_PIXEL_RATIO * 0.6, dynRes.ratio * 0.85);
  else if (dynRes.fast > 4) next = Math.min(MAX_PIXEL_RATIO, dynRes.ratio / 0.85);
  if (Math.abs(next - dynRes.ratio) > 1e-3) {
    dynRes.ratio = next;
    renderer.setPixelRatio(next);
    dynRes.slow = dynRes.fast = 0;
  }
}
function showPerf() {
  perfFrames++;
  const now = performance.now();
  if (now - perfT < 500) return;
  const i = renderer.info;
  perfEl.textContent = `${(perfFrames * 1000 / (now - perfT)).toFixed(0)} fps · px ${dynRes.ratio.toFixed(2)}\ncalls ${i.render.calls}\ntris  ${i.render.triangles}\ngeoms ${i.memory.geometries}\ntex   ${i.memory.textures}`;
  perfFrames = 0; perfT = now;
}
renderer.setAnimationLoop(() => {
  const raw = clock.getDelta(), dt = Math.min(raw, 0.05);
  if (!overlay.hidden || document.hidden || shotMode) dynRes.slow = dynRes.fast = 0; // only while playing (not &shot)
  else adaptResolution(raw);
  step(dt);
  updateShadows(dt);
  // one mirror image at a time, and none once the frame rate has made us lower the resolution
  updateReflections(camera, Math.max(0, player.level), dynRes.ratio >= MAX_PIXEL_RATIO * 0.99);
  updateListener(camera);
  renderer.render(scene, camera);
  if (perfEl) showPerf();
});

// --- "new version published" notice ------------------------------------
const updateEl = document.getElementById('update');
const updateHint = document.getElementById('update-hint');
let latestVersion = null;
function showUpdate(version = latestVersion) {
  latestVersion = version;
  updateHint.textContent = locked
    ? 'Tryck Esc för att släppa musen och ladda sedan om sidan.'
    : 'Ladda om sidan för att se den.';
  updateEl.hidden = false;
}
/** Button that also reacts to the touch being lifted (some phones never send the click to these
 * fixed buttons over the canvas, #41); runs once per press. */
function onTap(el, fn) {
  let done = false;
  el.addEventListener('pointerdown', () => { done = false; });
  el.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse' && !done) { done = true; fn(); } });
  el.addEventListener('click', () => { if (!done) fn(); done = false; });
}
// reload to a fresh URL, so neither the browser's nor GitHub Pages' cache hands back the old page
onTap(document.getElementById('update-reload'), () => {
  saveResume({ x: player.pos.x, z: player.pos.z, feetY: player.pos.y, yaw: camera.rotation.y, pitch: camera.rotation.x,
    hour: day.hour, month: day.month });
  const url = new URL(location.href);
  url.searchParams.set('v', latestVersion ?? Date.now());
  location.replace(url.href);
});
onTap(document.getElementById('update-close'), () => { updateEl.hidden = true; });
document.addEventListener('pointerlockchange', () => { if (!updateEl.hidden) showUpdate(); });
watchForUpdates(showUpdate);

// handle for tests/debugging (tools/touchtest.html)
window.__app = { book, showBook, reflectors, updateReflections, target, marks, remote, toggleFurniture, calendar, calPanel, showCalendar, drawing, beginDraw, endDraw, cups, toys, heldItem, stairHeight, stats, saber, rest, standUp, renderer, scene, player, world, camera, touch, step, showUpdate, cat, useDoor, use, note, showNote, measure, taps, board, lights, day, wallClock, clockPanel, showClock, patio };

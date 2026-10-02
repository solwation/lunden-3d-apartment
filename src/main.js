import * as THREE from 'three';
import { COLORS, LEVELS, DAY, START, PLAYER } from './config.js';
import { buildWorld } from './world.js';
import { Player } from './player.js';
import { setupTouch } from './touch.js';
import { watchForUpdates } from './version.js';
import { CatSpawner, VARIANTS, BREEDS } from './cat.js';
import { initAudio, sfx, toggleMuted, isMuted, updateListener } from './audio.js';
import { stairHeight } from './stairs.js';
import { loadChangelog, renderChangelog, buildNote } from './changelog.js';
import { bump, catFound, renderStats, resetStats, visitRoom, setRoomTotal, setBadgeElement } from './stats.js';
import { Minimap } from './minimap.js';
import { Measure } from './measure.js';
import { cloudTexture } from './surroundings.js';
import { DayCycle } from './daycycle.js';
import { WallClock, ClockPanel } from './wallclock.js';
import { Patio } from './patio.js';
import { Tap, animateWater } from './water.js';
import { CatBoard, snapshot } from './catboard.js';
import { Lights } from './lights.js';
import { setupInstall } from './install.js';

const overlay = document.getElementById('overlay');
const hud = document.getElementById('hud');
const levelEl = document.getElementById('level');
const promptEl = document.getElementById('prompt');
const actionBtn = document.getElementById('action');
const pauseBtn = document.getElementById('pause');
// iPhone: "add to home screen" first (&install shows the sheet anywhere, for screenshots)
setupInstall({ force: new URLSearchParams(location.search).has('install') });

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
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

// Changelog: only on the note on the freezer (the start screen just says when there is news)
const changelog = await loadChangelog();
document.getElementById('news-hint').hidden = !changelog.some((e) => e.isNew);
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
  reading = show;
  noteEl.hidden = !show;
  player.keys.clear();
  if (show) sfx.paper({ x: note.object.position.x, y: note.object.position.y, z: note.object.position.z });
}
document.getElementById('note-close').addEventListener('click', () => showNote(false));

const lights = new Lights(scene, world);
// every visit starts at 07:00 in the visitor's month, or ?time=HH (e.g. ?time=21.5) / ?month=1–12
const startHour = params0.has('time') ? Number(params0.get('time')) : DAY.startHour;
const month = params0.has('month') ? Number(params0.get('month')) : new Date().getMonth() + 1;
const day = new DayCycle({ scene, camera, lights: { sun, hemi, ambient, fill }, clouds: cloudTexture(), startHour, month });
day.paused = params0.has('freeze');
// the kitchen wall clock: shows the time; E opens the strip to spool/pause it and pick the month
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
if (day.daylight < 0.3 || params0.has('lights')) lights.setAll(true); // arriving in the dark: lights on
const taps = world.taps.map((spec) => new Tap(spec));
let inShower = false, shriekAt = 0;
for (const t of taps) scene.add(t.object);

const player = new Player(world, camera);
const measure = new Measure(scene, camera, [world.object], document.getElementById('measure'));
document.getElementById('measure-btn').addEventListener('click', () => measure.press());
const cat = new CatSpawner(world);
scene.add(cat.object);
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
  if (opening) cat.onOpen(door, player.pos);
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
  if (stride < 0.62) return;
  stride = 0;
  bump('steps');
  const { x, z } = player.pos;
  const inside = x > 0 && x < world.size.x && z > 0 && z < world.size.z;
  sfx.step(stairHeight(x, z) !== null ? 'stair' : inside ? 'wood' : 'outside');
}
player.spawn(START.x, START.z, THREE.MathUtils.degToRad(START.yawDeg));
camera.rotation.x = THREE.MathUtils.degToRad(START.pitchDeg);

// Debug/screenshot helper: ?at=x,z,yawDeg[,pitchDeg[,feetY]] places the camera (plan metres).
const at = new URLSearchParams(location.search).get('at');
if (at) {
  const [x, z, yaw = 180, pitch = 0, feet] = at.split(',').map(Number);
  player.spawn(x, z, THREE.MathUtils.degToRad(yaw));
  if (feet !== undefined) { player.pos.y = feet; player.eyeY = feet + 1.62; }
  camera.position.y = player.eyeY;
  camera.rotation.x = THREE.MathUtils.degToRad(pitch);
}
const params = new URLSearchParams(location.search);
if (params.has('shot')) overlay.hidden = true;
// ?open opens every door (screenshots of open doors/wardrobes)
// &water turns every tap on (screenshots)
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
let locked = false;
const touch = setupTouch({ onLook: (dx, dy) => look(dx * 0.005, dy * 0.005) });
const active = () => locked || touch.enabled;

function look(dyaw, dpitch) {
  camera.rotation.y -= dyaw;
  camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x - dpitch, -1.45, 1.45);
}

function showOverlay(show) {
  overlay.hidden = !show;
  hud.hidden = show;
  document.body.classList.toggle('touch', touch.enabled);
}

// Explicit choice on the start screen — a Surface has both a touchscreen and a keyboard.
document.getElementById('start-mouse').addEventListener('click', () => { initAudio(); canvas.requestPointerLock(); });
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
/** E / the action button on what you look at: doors toggle, the note opens. */
function use(thing) {
  if (thing.kind === 'note') showNote(true);
  else if (thing.kind === 'clock') showClock(true);
  else if (thing.kind === 'board') showBoard(true);
  else if (thing.kind === 'switch' || thing.kind === 'lamp') { thing.toggle(); if (thing.isOpen) bump('lights'); }
  else if (thing.kind === 'fridge') { thing.toggle(); if (thing.isOpen) bump('fridge'); }
  else if (thing.kind === 'keybox') thing.toggle();
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
actionBtn.addEventListener('click', () => { if (reading) showNote(false); else if (focused) use(focused); });
const muteBtn = document.getElementById('mute');
function updateMute(m = isMuted()) {
  muteBtn.textContent = m ? '🔇' : '🔊';
  muteBtn.setAttribute('aria-label', m ? 'Slå på ljud' : 'Stäng av ljud');
}
muteBtn.addEventListener('click', () => updateMute(toggleMuted()));
updateMute();
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (locked) touch.enabled = false;
  showOverlay(!locked);
  if (!locked) { player.keys.clear(); holdStats(false); }
  if (!locked && reading) showNote(false);
});
document.addEventListener('mousemove', (e) => {
  if (locked) look(e.movementX * PLAYER.mouseSens, e.movementY * PLAYER.mouseSens);
});
document.addEventListener('keydown', (e) => {
  if (!locked) return;
  if (reading) {
    if (clockPanel.open && clockPanel.key(e.code, true, e.repeat)) e.preventDefault();
    else if (e.code === 'KeyE') showNote(false);
    return;
  }
  player.keys.add(e.code);
  if (e.code === 'KeyE' && focused) use(focused);
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
  if (clockPanel.open && clockPanel.key(e.code, false)) e.preventDefault(); // no button click on Space
  if (e.code === 'Tab') holdStats(false);
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
const pickables = [...world.doors.map((d) => d.pickable), ...world.lids.map((l) => l.pickable), ...taps.map((t) => t.pickable), note.pickable, board.pickable, wallClock.pickable, ...lights.targets.map((t) => t.pickable)];
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
  camera.updateMatrixWorld(); // the player just moved it; render hasn't run yet
  raycaster.setFromCamera(center, camera);
  // (the raycaster ignores visibility, so the cat is only a target while it is there)
  // the car key only while its cabinet is open
  const extra = [...(cat.visible ? [cat.object] : []), ...(keyCabinet?.keyReachable ? [world.carKey.pickable] : [])];
  const hit = raycaster.intersectObjects(extra.length ? [...pickables, ...extra] : pickables, true)[0];
  focused = hit && !behindWall(hit.point) ? hit.object.userData.door : null;
  const verb = !focused ? '' : focused.verb ?? (focused.isOpen ? 'stänga' : 'öppna');
  if (focused && touch.enabled) {
    actionBtn.textContent = `${verb[0].toUpperCase()}${verb.slice(1)} ${focused.name}`;
  } else if (focused) {
    promptEl.textContent = `Tryck E för att ${verb} ${focused.name}`;
  }
  if (reading && touch.enabled) actionBtn.textContent = 'Stäng lappen';
  promptEl.hidden = !focused || touch.enabled || reading;
  actionBtn.hidden = !(focused || reading) || !touch.enabled || clockPanel.open; // the strip has its own ×
}

// --- furniture on/off (F / 🛋) ---------------------------------------------
function toggleFurniture(on = !world.furnitureOn) {
  world.setFurniture(on);
  try { localStorage.setItem('lunden.furniture', on ? '1' : '0'); } catch { /* ignore */ }
}
try { if (localStorage.getItem('lunden.furniture') === '0') toggleFurniture(false); } catch { /* ignore */ }
document.getElementById('furniture-btn').addEventListener('click', () => toggleFurniture());

// --- statistics panel: hidden; Tab held (like a scoreboard), T / 📊 toggle -------
// Counted events pop up as small badges instead.
const statsEl = document.getElementById('stats');
setBadgeElement(document.getElementById('badges'));
let statsPinned = false;
function showStats(show) {
  if (show && statsEl.hidden) renderStats(statsEl);
  statsEl.hidden = !show;
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
function toggleMap(show = mapEl.hidden) {
  mapEl.hidden = !show;
  try { localStorage.setItem('lunden.mapShown', show ? '1' : '0'); } catch { /* ignore */ }
}
try { toggleMap(localStorage.getItem('lunden.mapShown') !== '0'); } catch { /* ignore */ }
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
  patio.update(day, dt);
  if (clockPanel.open) clockPanel.render();
  world.windowLights.update(day.hour, 1 - day.daylight);
  cat.update(dt);
  measure.update(dt, window.innerWidth, window.innerHeight);
  if (active() && reading) updateFocus();
  else if (active()) {
    player.analog.x = touch.analog.x;
    player.analog.y = touch.analog.y;
    player.update(dt);
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
renderer.setAnimationLoop(() => {
  step(Math.min(clock.getDelta(), 0.05));
  updateListener(camera);
  renderer.render(scene, camera);
});

// --- "new version published" notice ------------------------------------
const updateEl = document.getElementById('update');
const updateHint = document.getElementById('update-hint');
function showUpdate() {
  updateHint.textContent = locked
    ? 'Tryck Esc för att släppa musen och ladda sedan om sidan.'
    : 'Ladda om sidan för att se den.';
  updateEl.hidden = false;
}
document.getElementById('update-reload').addEventListener('click', () => location.reload());
document.getElementById('update-close').addEventListener('click', () => { updateEl.hidden = true; });
document.addEventListener('pointerlockchange', () => { if (!updateEl.hidden) showUpdate(); });
watchForUpdates(showUpdate);

// handle for tests/debugging (tools/touchtest.html)
window.__app = { player, world, camera, touch, step, showUpdate, cat, useDoor, use, note, showNote, measure, taps, board, lights, day, wallClock, clockPanel, showClock, patio };

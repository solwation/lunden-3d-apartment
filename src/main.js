import * as THREE from 'three';
import { COLORS, LEVELS } from './config.js';
import { buildWorld } from './world.js';
import { Player } from './player.js';
import { setupTouch } from './touch.js';
import { watchForUpdates } from './version.js';
import { CatSpawner, VARIANTS, applyVariant } from './cat.js';
import { initAudio, sfx, toggleMuted, isMuted, updateListener } from './audio.js';
import { stairHeight } from './stairs.js';
import { loadChangelog, renderChangelog, buildNote } from './changelog.js';

const overlay = document.getElementById('overlay');
const hud = document.getElementById('hud');
const levelEl = document.getElementById('level');
const promptEl = document.getElementById('prompt');
const actionBtn = document.getElementById('action');
const pauseBtn = document.getElementById('pause');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(COLORS.sky);
scene.fog = new THREE.Fog(COLORS.sky, 30, 90);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 200);
camera.rotation.order = 'YXZ';

scene.add(new THREE.HemisphereLight(0xeaf3ff, 0xd6d2ca, 2.0));
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
// Shadowless fill from the north-east so wall orientations read differently indoors
const fill = new THREE.DirectionalLight(0xf4f6ff, 0.9);
fill.position.set(8, 6, -5);
scene.add(fill);

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

// Changelog: latest entries on the start screen, the full list on a note on the freezer
const changelog = await loadChangelog();
renderChangelog(document.getElementById('changes'), changelog, 3);
document.getElementById('changes-box').hidden = !changelog.length;
const note = buildNote(changelog);
scene.add(note.object);
const noteEl = document.getElementById('note');
renderChangelog(document.getElementById('note-list'), changelog);
let reading = false;
function showNote(show) {
  reading = show;
  noteEl.hidden = !show;
  player.keys.clear();
  if (show) sfx.paper({ x: note.object.position.x, y: note.object.position.y, z: note.object.position.z });
}
document.getElementById('note-close').addEventListener('click', () => showNote(false));

const player = new Player(world, camera);
const cat = new CatSpawner(world);
scene.add(cat.object);

/** Open/close a door (with sound); the cat may turn up (or leave) behind doors you open. */
function useDoor(door) {
  const opening = !door.isOpen;
  door.toggle();
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
  stride += d;
  if (stride < 0.62) return;
  stride = 0;
  const { x, z } = player.pos;
  const inside = x > 0 && x < world.size.x && z > 0 && z < world.size.z;
  sfx.step(stairHeight(x, z) !== null ? 'stair' : inside ? 'wood' : 'outside');
}
const entrance = world.doors.find((d) => d.name === 'ytterdörren' && d.hinge[1] < 1);
player.spawn(entrance ? entrance.hinge[0] + entrance.len / 2 : 1.2, -1.6, Math.PI);

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
if (params.has('open')) for (const d of [...world.doors, ...world.lids]) { d.toggle(); for (let i = 0; i < 30; i++) d.update(0.1); }
// ?cat=x,z[,yaw[,feetY]] puts the cat somewhere (screenshots)
if (params.has('cat')) {
  const [x, z, yaw = 0, y = 0] = params.get('cat').split(',').map(Number);
  cat.object.position.set(x, y, z);
  cat.object.rotation.y = THREE.MathUtils.degToRad(yaw);
  cat.object.visible = true;
  if (params.has('catv')) applyVariant(VARIANTS[Number(params.get('catv'))]);
  cat.t = Number(params.get('catt') ?? 1.5);
  cat.nextMeow = 1e9;
  cat.update(0);
}
// ?note opens the changelog note (screenshots)
if (params.has('note')) showNote(true);
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
  document.documentElement.requestFullscreen?.().catch(() => {});
  showOverlay(false);
});
pauseBtn.addEventListener('click', () => {
  touch.enabled = false;
  player.analog.x = player.analog.y = 0;
  showOverlay(true);
});
/** E / the action button on what you look at: doors toggle, the note opens. */
function use(thing) {
  if (thing.kind === 'note') showNote(true);
  else if (thing.kind === 'lid') { thing.toggle(); sfx.lid(thing.object.position, thing.isOpen); }
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
  if (!locked) player.keys.clear();
  if (!locked && reading) showNote(false);
});
document.addEventListener('mousemove', (e) => {
  if (locked) look(e.movementX * 0.0022, e.movementY * 0.0022);
});
document.addEventListener('keydown', (e) => {
  if (!locked) return;
  if (reading) {
    if (e.code === 'KeyE') showNote(false);
    return;
  }
  player.keys.add(e.code);
  if (e.code === 'KeyE' && focused) use(focused);
  if (e.code === 'KeyM') updateMute(toggleMuted());
  if (e.code.startsWith('Arrow')) e.preventDefault();
});
document.addEventListener('keyup', (e) => player.keys.delete(e.code));
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- door interaction: look at a door within reach, press E ----------------
const raycaster = new THREE.Raycaster();
raycaster.far = 2.2;
const pickables = [...world.doors.map((d) => d.pickable), ...world.lids.map((l) => l.pickable), note.pickable];
const center = new THREE.Vector2(0, 0);
let focused = null;

function updateFocus() {
  raycaster.setFromCamera(center, camera);
  const hit = raycaster.intersectObjects(pickables, true)[0];
  focused = hit ? hit.object.userData.door : null;
  const verb = !focused ? '' : focused.verb ?? (focused.isOpen ? 'stänga' : 'öppna');
  if (focused && touch.enabled) {
    actionBtn.textContent = `${verb[0].toUpperCase()}${verb.slice(1)} ${focused.name}`;
  } else if (focused) {
    promptEl.textContent = `Tryck E för att ${verb} ${focused.name}`;
  }
  if (reading && touch.enabled) actionBtn.textContent = 'Stäng lappen';
  promptEl.hidden = !focused || touch.enabled || reading;
  actionBtn.hidden = !(focused || reading) || !touch.enabled;
}

// --- loop ----------------------------------------------------------------
const clock = new THREE.Clock();
let lastLevel = -1;
function step(dt) {
  for (const d of world.doors) d.update(dt);
  for (const l of world.lids) l.update(dt);
  cat.update(dt);
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
  if (lvl !== lastLevel) {
    levelEl.textContent = lvl < 0 ? 'Utomhus' : LEVELS[lvl].name;
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
window.__app = { player, world, camera, touch, step, showUpdate, cat, useDoor, use, note, showNote };

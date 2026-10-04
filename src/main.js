import * as THREE from 'three';
import { UNIT_TOP, COLORS, LEVELS, DAY, START, PLAYER, DRAWING, STAIR, HOLD, LIFE, REMOTE, REST, DOOR_HEIGHT, TURBO, WEATHER, BREAK, CAR, KITCHEN, LAPTOP, NEST, AUTO_RELOAD, MIELE, CUPS, GARAGE } from './config.js';
import { MieleHeld, HeartFireworks } from './miele.js';
const DRAWING_COLORS = DRAWING.colors;
import { buildWorld } from './world.js';
import { photoGlow } from './furniture.js';
import { Player, inPoly, crosses } from './player.js';
import { Fall } from './fall.js';
import { setupTouch } from './touch.js';
import { watchForUpdates, BUILD } from './version.js';
import { CatSpawner, VARIANTS, BREEDS, kittenName } from './cat.js';
import { initAudio, sfx, toggleMuted, isMuted, updateListener } from './audio.js';
import { stairHeight } from './stairs.js';
import { rugLift } from './rugs.js';
import { loadChangelog, renderChangelog, buildNote, scrollNote } from './changelog.js';
import { loadTodo, buildTodoNotes } from './todo.js';
import { setScoreElement, totalScore, setStatsExtra, stats, bump, badge, catFound, secretFound, renderStats, resetStats, visitRoom, setRoomTotal, setBadgeElement, penalize } from './stats.js';
import { Minimap } from './minimap.js';
import { Measure } from './measure.js';
import { cloudTexture, groundY } from './surroundings.js';
import { Jetpack } from './jetpack.js';
import { DayCycle } from './daycycle.js';
import { WallClock, ClockPanel } from './wallclock.js';
import { Patio, buildStringLights } from './patio.js';
import { updateReflections, reflectors } from './reflections.js';
import { applySeason } from './seasons.js';
import { saveResume, saveSession, takeResume } from './resume.js';
import { saveWorld, loadWorld } from './keep.js';
import { lifeDev, devScenario, Life } from './life.js';
import { shownRows } from './actions.js';
import { buildStores } from './stores.js';
import { clearLocalHome, takeResetDone } from './reset.js';
import { Rest, chooseSpot } from './rest.js';
import { Saber } from './saber.js';
import { buildToys } from './toys.js';
import { Remote } from './remote.js';
import { Book } from './book.js';
import { Pan } from './pan.js';
import { Toaster } from './toaster.js';
import { buildSillPots } from './plants.js';
import { Chicken } from './chicken.js';
import { SmokeAlarm } from './hood.js';
import { Grill } from './grill.js';
import { Sonos } from './sonos.js';
import { DetailCuller } from './detail.js';
import { BlindPanel } from './blinds.js';
import { Turbo } from './turbo.js';
import { Beer } from './beer.js';
import { buildThings } from './things.js';
import { buildSecret } from './secret.js';
import { Hand } from './hand.js';
import { HandWash } from './handwash.js';
import { Milk } from './milk.js';
import { buildCups } from './cups.js';
import { buildFish } from './fishfingers.js';
import { ToiletPaper } from './toiletpaper.js';
import { AirFryer } from './airfryer.js';
import { buildFries } from './fries.js';
import { buildCoffeeJar } from './coffeejar.js';
import { FruitBowl } from './fruit.js';
import { Drawing } from './drawing.js';
import { CatCalendar, CalendarPanel } from './calendar.js';
import { heldItem } from './holdable.js';
import { Tap, animateWater } from './water.js';
import { CatBoard, BoardPanel, snapshot } from './catboard.js';
import { Lights } from './lights.js';
import { setupInstall } from './install.js';
import { Marks } from './marks.js';
import { Breaker } from './breaking.js';
import { Target } from './target.js';
import { Car } from './car.js';
import { Garage } from './garage.js';
import { Core } from './core.js';
import { People } from './people.js';
import { Greetings } from './greet.js';
import { Nests } from './nest.js';
import { Weather } from './weather.js';
import { Posters, HeldDrawing, paperOnly } from './posters.js';
import { PaperBalls } from './paperball.js';
import { Cloud } from './cloud.js';
import { Leaderboard } from './leaderboard.js';
import { Basketball, Hoop } from './basket.js';

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
const garage = world.garage = new Garage(); // the garage and the förråd under the courtyard (#357)
scene.add(garage.object, garage.blackout, garage.door.object); // (+ its door, #358)
const core = world.core = new Core(); // Hus L's stairwell and lift by the portik (#415)
scene.add(core.object);

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
// the note sits on the freezer door and swings with it (#161); E on it still reads it (it is nearer than the door)
const freezer = world.lids.find((l) => l.kind === 'fridge' && l.freezer);
if (freezer) { freezer.door.updateWorldMatrix(true, false); freezer.door.attach(note.object); }
const noteEl = document.getElementById('note');
renderChangelog(document.getElementById('note-list'), changelog);
// the open issues as post-its on the fridge door (#340); only a teaser, nothing to read up close (#431)
const todo = buildTodoNotes(await loadTodo(), world.lids.find((l) => l.kind === 'fridge' && !l.freezer));
const boardEl = document.getElementById('board-view');
let reading = false;
let boardPanel = null, boardFreed = false; // the panel (#170) frees the mouse to click its buttons
function showBoard(show, byKey = 'E') {
  reading = show;
  boardPanel.show(show);
  player.keys.clear();
  if (show && locked) { boardFreed = true; document.exitPointerLock(); }
  if (!show && boardFreed) {
    boardFreed = false;
    if (byKey === 'Escape') { overlay.hidden = true; armEl.hidden = false; } // Esc can't grab the mouse: click to go on
    else canvas.requestPointerLock();
  }
}
document.getElementById('board-close').addEventListener('click', () => showBoard(false, 'button'));
document.addEventListener('keydown', (e) => { // the board panel's keys, with or without pointer lock
  if (!boardPanel?.open) return;
  if (e.code === 'KeyE' || e.code === 'Escape') { e.preventDefault(); showBoard(false, e.code); }
  else if (boardPanel.key(e.code)) e.preventDefault();
  e.stopImmediatePropagation();
}, true);
function showNote(show) {
  if (!show && !boardEl.hidden) { showBoard(false); return; }
  if (!show && clockPanel.open) { showClock(false); return; }
  if (!show && sonos.open) { showSonos(false); return; }
  if (!show && calPanel.open) { showCalendar(false); return; }
  if (!show && blindPanel.open) { showBlind(null); return; }
  if (!show && book.reading) { showBook(false); return; }
  if (!show && viewing) { showPoster(null); return; }
  reading = show;
  if (show) notePaper.scrollTop = 0;
  noteEl.hidden = !show;
  player.keys.clear();
  if (show) sfx.paper(note.object.getWorldPosition(new THREE.Vector3()));
}
document.getElementById('note-close').addEventListener('click', () => showNote(false));
const notePaper = noteEl.querySelector('.paper');
// under pointer lock the wheel goes to the canvas: pass it on to the open note (#275)
document.addEventListener('wheel', (e) => { if (locked && !noteEl.hidden) notePaper.scrollTop += e.deltaY * (e.deltaMode === 1 ? 40 : 1); }, { passive: true });

const lights = new Lights(scene, world);
const lookDir = new THREE.Vector3(); // (the light pool prefers lamps in front, #276)
// every visit starts at the browser's own time and date (#95), or ?time=HH (e.g. ?time=21.5) / ?month=1–12 /
// ?day=1–31 (with ?month alone the date is the 15th)
const now = new Date();
const startHour = params0.has('time') ? Number(params0.get('time')) : now.getHours() + now.getMinutes() / 60;
const month = params0.has('month') ? Number(params0.get('month')) : now.getMonth() + 1;
const date = params0.has('day') ? Number(params0.get('day')) : params0.has('month') ? 15 : now.getDate();
const day = new DayCycle({ scene, camera, lights: { sun, hemi, ambient, fill }, clouds: cloudTexture(), startHour, month, date, year: now.getFullYear() });
const weather = new Weather(scene, camera, day, params0.get('weather')); // rain in spring and autumn, thunder in late summer (#248)
weather.surfaceAt = (x, z) => world.roofs.topAt(x, z); // the rain falls on the roofs you can stand on, and on you up there (#360)
const lastWeatherPos = new THREE.Vector3();
// out in it (#249): walking about outdoors in rain / snow / hail / a thunderstorm counts once per shower
const WEATHER_WALKS = { rain: ['walkRain', '🌧 Ute i regnet'], snow: ['walkSnow', '❄️ Ute i snön'], hail: ['walkHail', '🧊 Ute i haglet'], storm: ['walkStorm', '⛈ Ute i åskvädret'] };
weather.onExperience = (kind) => { const [key, text] = WEATHER_WALKS[kind]; bump(key); badge(text, false); };
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
// music in the SYMFONISK speakers (#187): E on one plays in all of them, #sonos-panel steers it (reading mode)
const sonos = new Sonos(world.furnitureTargets.filter((t) => t.kind === 'speaker'), document.getElementById('sonos-panel'));
function showSonos(show) {
  reading = show;
  sonos.show(show);
  player.keys.clear();
}
document.getElementById('sonos-close').addEventListener('click', () => showSonos(false));
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
// the pleated blinds (#273): E on one opens #blind-panel (reading mode): W / S, ↑ / ↓ or ▲ ▼ held draw it up / down
const blinds = world.blinds;
const blindPanel = new BlindPanel(blinds, document.getElementById('blind-panel'));
function showBlind(b) {
  reading = !!b;
  blindPanel.show(b);
  player.keys.clear();
}
document.getElementById('blind-close').addEventListener('click', () => showBlind(null));
blinds.onMove = (b, first) => { shadowState.hold = Math.max(shadowState.hold, 0.3); if (first) bump(b.kind === 'curtain' ? 'curtains' : 'blinds', 1, b.id); }; // its shadow moves; the first pull each time scores
if (params0.has('blinds')) for (const b of blinds.list) b.set(Number(params0.get('blinds')) || 0); // &blinds=0…1 (screenshots; not saved)
if (params0.has('curtains')) for (const c of blinds.curtains) c.set(Number(params0.get('curtains')) || 0); // &curtains=0…1 drawn shut (#342; not saved)
// the small lamps switch themselves with the dusk, the ceiling lamps are by hand only (#234); &lights: everything on
lights.forced = params0.has('lights');
if (lights.forced) lights.setAll(true);
lights.updateAuto(day.daylight, 0);
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
// falling more than FALL.hurt hurts (#361): black-out, awake outside the front door; a deduction
const fall = new Fall({ el: document.getElementById('fall'), player, camera, onHurt: () => { bump('falls'); penalize('fall'); } });
player.onLand = (drop, gap) => fall.land(drop, gap);
// the jetpack on its hook by the garage door (#359): worn on the back, flies; home again after a bad fall
const jetpack = new Jetpack({ scene, camera, player, groundY, hud: { el: document.getElementById('jetpack'), glow: document.getElementById('jet-glow'),
  up: document.getElementById('jet-up'), down: document.getElementById('jet-down') } });
jetpack.onFlight = () => bump('flights', 1, 'jetpack'); // each take-off; the first one scores (SCORE.first.flights)
jetpack.onLeftAtDoor = () => badge('🚀 Jetpacken står kvar utanför', false);
jetpack.onRoofed = () => badge('🚀 Inte inomhus', false); // Space under the garage's ceiling (#441)
fall.onWake.push(() => jetpack.goHome());
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
  if (show) bump('read'); // statistics and points (#197)
  player.keys.clear();
}
const beer = new Beer(scene, camera); // a big beer on the lounge table when you sit down in the lounge sofa (#117)
beer.onGulp = () => bump('beer');
const things = buildThings(scene, camera, world.things); // bottles and glasses in the living room (#152)
const secret = buildSecret(things, { first: params0.has('secret') ? Number(params0.get('secret')) : null, onFind: (t, rare) => secretFound(t.secret, t.name, rare) }); // a new surprise in the secretary's secret drawer each time (#183)
for (const t of things) t.onSip = (drink) => { if (drink) bump(drink); }; // a sip from a glass: wine, whisky … (#167)
const pingping = things.find((t) => t.kind === 'pingping') ?? null; // the penguin cushion in Sarah and Olof's bed (#269)
if (pingping) pingping.onHug = () => bump('pingpingHugs');
const sillPots = buildSillPots(scene, camera, world.sillPlants); // the pots on the window boards can be lifted (#185)
const holdables = [saber, ...toys.items, remote, book, beer, ...things, ...sillPots]; // things you can take and hold, one at a time (holdable.js)
const cups = buildCups(scene, camera, world, world.cupCabinet); // coffee cups in the wall cabinet (#90)
const hand = new Hand(camera, scene); // the visitor's arm and hand: holding things, reaching for doors (#195)
const petAt = new THREE.Vector3();
holdables.push(cups.jug);
const coffeeJar = buildCoffeeJar(scene, camera, world); // the coffee jar + scoop beside the Moccamaster: water and coffee before a pot (#334)
if (coffeeJar) { holdables.push(coffeeJar.scoop); world.looseItems.push(coffeeJar.object); }
const fish = buildFish(scene, camera, world); // fish fingers in the freezer, one at a time (#162)
if (fish) fish.onEaten = () => bump('fish');
const toiletPaper = new ToiletPaper(scene, camera, world); // a holder with a roll by each toilet (#426)
Object.assign(toiletPaper, { onFlush: (f) => bump('flushes', 1, idOf(f)), onThrown: () => bump('toiletPaper') });
// washing the hands at a running basin tap and drying them on a towel (#437)
const handWash = new HandWash({ hand, held: () => heldItem(), bump });
for (const t of taps) if (!t.spec.shower) t.options = () => handWash.tapRows(t);
for (const t of world.furnitureTargets) if (t.kind === 'towel') handWash.addTowel(t);
const ovenDoor = world.lids.find((l) => l.name === 'ugnen');
if (ovenDoor?.handle) world.looseItems.push(handWash.kitchenTowel(ovenDoor).object);
const pan = world.panDrawer ? new Pan(scene, camera, world.panDrawer, world.hob) : null; // the frying pan in the drawer under the hob (#159)
if (pan) holdables.push(pan);
const toaster = world.toasterDrawer ? new Toaster(scene, camera, world.toasterDrawer) : null; // the toaster in the drawer by the corner (#401)
if (toaster) { holdables.push(toaster); toaster.onToast = () => bump('toaster', 1, 'toaster'); }
if (fish) Object.assign(fish, { pan, hob: world.hob, onFried: () => bump('fried'), onBurnt: () => { bump('burnt'); penalize('burnt'); } }); // fish fingers fry in the pan too (#214); burnt: a deduction (#288)
// the air fryer on the worktop in the corner left of the freezer (#287): a loose thing (F hides it)
const airFryer = new AirFryer(KITCHEN.baseTop + KITCHEN.worktop);
scene.add(airFryer.object);
world.looseItems.push(airFryer.object);
if (fish) fish.fryer = airFryer;
// Aviko fries in the freezer, poured into the air fryer (#301): golden → points the first time, burnt → a deduction
const fries = buildFries(scene, camera, world, airFryer);
if (fries) Object.assign(fries, { fishIn: () => !!fish?.inFryer.length, onGolden: () => bump('friesCooked', 1, 'fries'),
  onBurnt: () => { bump('friesBurnt'); penalize('burnt'); }, onEaten: () => bump('fries') });
const fruit = new FruitBowl(scene, camera); // the copper fruit bowl on the coffee table (#326)
// the life simulator's things (#364, #366): item instances (items.js) shown as Holdables (life.js); a refusal pops up as a badge
const life = new Life({ scene, camera, say: (t) => badge(t, false), feet: () => ({ at: 'world', pos: [player.pos.x, player.pos.y, player.pos.z], yaw: camera.rotation.y }),
  floorY: () => (player.level >= 0 ? LEVELS[player.level].floor : -Infinity), // (nothing goes down under the floor, #368)
  persist: lifeDev() ? null : { key: LIFE.save.key, canSave: () => { try { return !resetHome.going; } catch { return false; } } }, debug: params0.has('debug') }); // the home's stock kept between visits (#371; never with &life)
const lifeStores = buildStores(life, world); // the fridge, the freezer, the pantry, the utensil drawer as slots (#369)
life.bump = (key, n, id) => bump(key, n, id); // the life sim's counts (#376 …)
{ // a worktop under a world point (#375: the cutting board is a station only there)
  const tops = world.cupSurfaces.filter((m) => m.userData.worktop).map((m) => ({ box: new THREE.Box3().setFromObject(m), y: m.userData.surface }));
  life.worktopAt = (p) => tops.some((t) => p[0] >= t.box.min.x - 0.01 && p[0] <= t.box.max.x + 0.01 && p[2] >= t.box.min.z - 0.01 && p[2] <= t.box.max.z + 0.01 && Math.abs(p[1] - t.y) < 0.03);
}
life.restore(); // a new visit: the stock as it was left, empty-handed (#371; a page-made reload's `life` part replaces it below)
life.restock(); // whatever the kitchen always has and is missing (#373): a fresh home, or something used up and thrown away
fruit.onEaten = (f) => bump('fruit', 1, f.kind);
airFryer.onDone = () => { if (fish?.inFryer.length || fries?.count) bump('airfried', 1, 'airfryer'); }; // a batch done (#287)
const fridge = world.lids.find((l) => l.kind === 'fridge' && !l.freezer);
const chicken = fridge ? new Chicken(scene, camera, fridge, pan, world.hob) : null; // the roast chicken: take it, fry it in the pan (#160)
if (chicken) holdables.push(chicken);
// the cooker hood draws the chicken's smoke; without it the smoke alarm in the kitchen ceiling goes off (#194)
const smokeAlarm = new SmokeAlarm();
const grill = new Grill(); // the courtyard's kettle grill: E lights it (#204)
scene.add(grill.object);
lights.extra.push(grill.lamp);
lights.extra.push(...garage.lamps); // the garage's tubes light the cars down there (#357)
scene.add(smokeAlarm.object);
smokeAlarm.onRing = () => penalize('smokeAlarm'); // a deduction (#288)
// the fridge and freezer beep when left open too long: a deduction when it starts, a little more while it goes on (#288)
for (const l of world.lids) if (l.kind === 'fridge') l.onAlarm = (longer) => penalize(`${l.freezer ? 'freezer' : 'fridge'}${longer ? 'Longer' : 'Open'}`);
if (chicken) { chicken.hood = world.hood; chicken.onEaten = () => bump('chicken'); chicken.onCooked = () => bump('cooked'); }
const turbo = new Turbo({ el: document.getElementById('turbo'), edge: document.getElementById('turbo-edge') }); // three cups of coffee: Kaffeturbo! (#217)
turbo.onStart = () => bump('turbo');
for (const c of cups.cups) c.onSip = (drink, coffee) => { bump(drink ?? 'coffee'); turbo.drink(coffee); }; // drink from a cup (#117); the coffee counts towards Kaffeturbo (#217) // the Moccamaster's jug: take it, pour, put it back (#141)
let placeTarget = null; // while something is held: the table top / floor spot it would go down on (#102)
// a faint ring where the held thing would land
const placeGhost = new THREE.Mesh(new THREE.RingGeometry(0.035, 0.05, 24).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false }));
placeGhost.visible = false;
placeGhost.userData.ghost = true; // (not a thing standing there, furniture.js standingOn, #447)
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
  return { point: floorHit.clone().setY(y + rugLift(lv, floorHit.x, floorHit.z)), distance: d }; // on a rug: on top of it (#310)
}
// Putting things down (#368): the spot snaps to a grid (LIFE.place: a table top / worktop clamped inside its edges, the
// floor coarser), the thing turns in steps (R / the ⟳ button) from the way you look, and a faint ghost of the thing itself
// stands where it will land (`poseAt` of its class; without one the ring as before). E puts it down exactly like that.
let placeTurn = 0, ghostOf = null, ghostItem = null;
const ghostMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false });
const itemGhost = new THREE.Group();
itemGhost.visible = false;
itemGhost.userData.ghost = true;
scene.add(itemGhost);
const snapBox = new THREE.Box3(), snapQ = new THREE.Quaternion();
/** Snap `spot.point` to the grid; on a surface (a cupSurfaces box) inside its edges. */
function snapSpot(spot, surface) {
  const P = LIFE.place, g = surface ? P.grid : P.floorGrid, p = spot.point;
  p.x = Math.round(p.x / g) * g; p.z = Math.round(p.z / g) * g;
  if (surface) {
    snapBox.setFromObject(surface);
    const mx = Math.min(P.margin, (snapBox.max.x - snapBox.min.x) / 2), mz = Math.min(P.margin, (snapBox.max.z - snapBox.min.z) / 2);
    p.x = THREE.MathUtils.clamp(p.x, snapBox.min.x + mx, snapBox.max.x - mx);
    p.z = THREE.MathUtils.clamp(p.z, snapBox.min.z + mz, snapBox.max.z - mz);
  }
  return spot;
}
/** The turn a thing goes down with: the view's direction in steps of LIFE.place.turn°, plus the R turns. */
function placeYaw() {
  const st = THREE.MathUtils.degToRad(LIFE.place.turn);
  return Math.round(camera.rotation.y / st) * st + placeTurn * st;
}
/** R / ⟳: turn what is about to be put down one step. */
function turnPlacement() { placeTurn = (placeTurn + 1) % Math.round(360 / LIFE.place.turn); if (focused?.kind === 'place') focused.yaw = placeYaw(); }
/** A see-through copy of the held thing's meshes (lights, particles left out), rebuilt when the hand changes. */
function buildGhost(item) {
  itemGhost.clear();
  const m = item.model;
  m.updateMatrixWorld(true);
  const inv = m.matrixWorld.clone().invert();
  m.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !o.visible || !o.geometry) return;
    const g = new THREE.Mesh(o.geometry, ghostMat);
    g.matrixAutoUpdate = false;
    g.matrix.multiplyMatrices(inv, o.matrixWorld);
    g.raycast = () => {};
    itemGhost.add(g);
  });
}
function showItemGhost(item) {
  if (item !== ghostItem) { ghostItem = item; placeTurn = 0; ghostOf = null; }
  const t = focused?.kind === 'place' && !focused.blocked && focused.item === item && placeGhost.visible ? focused : null;
  if (!t || !item?.poseAt) { itemGhost.visible = false; return; }
  if (ghostOf !== item) { buildGhost(item); ghostOf = item; }
  item.poseAt(itemGhost, t.point, t.yaw ?? placeYaw());
  itemGhost.visible = true;
  placeGhost.visible = false; // (the ring only for things without a ghost)
}
const drawing = new Drawing(scene, camera); // crayons on the paper on the desk in Sovrum 3 (#93)
const measure = new Measure(scene, camera, [world.object], document.getElementById('measure'));
document.getElementById('measure-btn').addEventListener('click', () => measure.press());
const cat = new CatSpawner(world);
scene.add(cat.object);
const target = new Target(); // the Nerf target on the lawn (#99)
const car = new Car(); // our Renault, called by the key in the hall (#173)
scene.add(car.object);
try { localStorage.removeItem('lunden.bygge'); } catch { /* the removed building-site mode's setting (#209) */ }
const people = new People(); // walkers, cyclists, kids, neighbours (#114)
scene.add(people.object);
// the courtyard's benches (#438): a spot someone sits on is not offered, and nobody turns up on the visitor's own spot
for (const t of world.courtyardTargets) for (const sp of t.spots) sp.taken = () => people.seatTaken(sp.pos.x, sp.pos.z);
people.visitorSeat = () => (rest.active ? rest.spot.pos : null);
const greet = new Greetings(people, camera, document.getElementById('speech'), (p) => behindWall(p)); // say hello to them (#247)
car.garage = garage; // it lives in the garage, its door opens for it (#358)
car.ground = (x, z) => (garage.inside(x, z) ? GARAGE.floor : groundY(x, z)); // the drive and Karpvägen slope, the garage's floor
if (params0.has('car')) car.park(); // &car: parked out front (screenshots)
else car.toGarage(); // in its stall (#358)
garage.extra = () => car.segments('garage'); // in its stall it is in the way down there
garage.extraPolys = () => (car.state === 'garage' ? [car.poly()] : []);
weather.extraBoxes = () => car.box(); // no rain inside our parked car (#250)
{ const moving = world.movingSegments; world.movingSegments = (lvl) => [...moving(lvl), ...(lvl === 0 ? [...car.segments(), ...garage.door.segments(), ...core.dynamic(0)] : [])]; } // parked: in the way; the garage door while shut (#358)
scene.add(target.object); // up only while something that can hit it is in the hand (#144, #179, step)
const marks = new Marks(scene, camera, [world.object, patio.object, target.object], cat); // burn marks, stars, splashes on surfaces (#96)
// glasses, bottles, cups, the jug and the beer can be shot to pieces (#263): more points from further away
const breaker = new Breaker(scene, marks, cat);
marks.breaker = breaker;
for (const t of things) if (t.kind === 'glass' || t.drink) breaker.add(t, t.kind);
for (const c of cups.cups) breaker.add(c, 'cup');
breaker.add(cups.jug, 'jug');
breaker.add(beer, 'beer');
breaker.onBreak = (item, kind, d, weapon) => {
  bump('shattered', 1, kind);
  const pts = Breaker.points(d, weapon);
  if (pts > 0) bump('shatterRange', pts);
  badge(`💥 ${BREAK.kinds[kind].name[0].toUpperCase()}${BREAK.kinds[kind].name.slice(1)} krossad · ${d.toFixed(1).replace('.', ',')} m`, false);
};
const rifle = things.find((t) => t.isRifle) ?? null; // the AK-47 in the NORDLI chest (#196): bullet holes, the target, the cat
if (rifle) Object.assign(rifle, { marks, cat, onShot: () => bump('shots') });
saber.onBurn = () => bump('cuts'); // the lightsaber's marks (#96)
toys.darts.onSplash = () => bump('splashes'); // a Nerf dart's paint splash (#98)
drawing.onDrawn = () => bump('drawn'); // a drawing changed and kept (#93)
{ const mocca = world.lids.find((l) => l.kind === 'coffee'); if (mocca) mocca.onBrewed = () => { bump('brews'); bump('handBrew'); }; } // a full jug brewed; handBrew: the first pot by hand (#334)
// Tilly's basketball over her daybed; the hoop out front rises while it is out of its holder (basket.js)
const hoop = new Hoop();
scene.add(hoop.object);
if (params0.has('hoop')) hoop.update(10, true); // &hoop: up from the start (screenshots)
const ball = new Basketball(scene, camera, { marks, hoop, world });
ball.onBasket = (three) => { bump('baskets'); if (three) bump('threes'); };
ball.onDribble = () => bump('dribbles');
holdables.push(ball);
{ const moving = world.movingSegments; world.movingSegments = (lvl) => [...moving(lvl), ...(lvl === 0 ? hoop.segments() : [])]; } // its base is in the way
// the parked car and the hoop's base as closed boxes: one that appears round the visitor pushes them out (#314)
world.movingPolys = (lvl) => lvl === 0 ? [car.segments(), hoop.segments()].filter((sg) => sg.length).map((sg) => sg.map(([x, z]) => [x, z])) : [];
player.debug = new URLSearchParams(location.search).has('debug'); // log every unstick (#314)
// drawings taped up on walls and the fridge (#176); the one in the hand
const posters = new Posters(scene, world, marks, note);
if (todo) posters.reserved.push(todo); // no drawing taped over the post-its (#340)
const postersLoaded = posters.load();
const heldDrawing = new HeldDrawing(scene, camera, drawing);
drawing.holding = () => heldItem() === heldDrawing;
heldDrawing.rehang = (rec) => posters.rehang(rec);
const balls = new PaperBalls(scene, camera, world, (x, z, y) => player.groundAt(x, z, y)); // thrown-away drawings (#177)
// E on a taped-up drawing: it fills #poster-panel (reading mode) — Släng / Ta ner / Stäng (#177)
const posterPanel = document.getElementById('poster-panel');
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const drawnAt = (t) => { const d = new Date(t); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
let viewing = null; // the poster in the panel
function showPoster(p) {
  viewing = p;
  reading = !!p;
  posterPanel.hidden = !p;
  player.keys.clear();
  if (!p) return;
  posterPanel.querySelector('img').src = p.rec.image;
  posterPanel.querySelector('.when').textContent = `Ritad ${drawnAt(p.rec.time)}`;
  sfx.paper(p.mesh.getWorldPosition(new THREE.Vector3()));
}
/** Släng: off the wall, out of storage, crumpled and thrown. */
function throwPoster() {
  const p = viewing;
  if (!p) return;
  showPoster(null);
  const tex = p.mesh.material.map;
  posters.remove(p, true);
  balls.throwAway(tex, paperOnly(tex));
  bump('thrown');
}
/** Ta ner: off the wall and into the hand, to be taped up somewhere else. */
function takeDownPoster() {
  const p = viewing;
  if (!p) return;
  showPoster(null);
  posters.remove(p);
  heldDrawing.take(p.rec.image, { id: p.rec.id, time: p.rec.time, rec: p.rec });
}
posterPanel.querySelector('[data-act=throw]').addEventListener('click', throwPoster);
posterPanel.querySelector('[data-act=down]').addEventListener('click', takeDownPoster);
posterPanel.querySelector('[data-act=close]').addEventListener('click', () => showPoster(null));
target.onSink = () => marks.dropUnder(target.object); // its marks don't hang in the air as it sinks (#179)
for (const h of [saber, ...toys.wands, toys.darts]) Object.assign(h, { marks, cat });
for (const wd of toys.wands) wd.onMagic = () => bump('magic'); // statistics and points (#197)
target.onHit = (pts) => bump('target', pts);
car.radio.onPlay = (ch) => bump('carMusic', 1, ch); // each song in the car once (#268)
core.lift.onArrive = (k) => bump('liftFloors', 1, `v${k}`); // each storey reached by lift once (#415)
sonos.onPlay = (ch) => bump('songs', 1, ch); // each song (channel) once // the saber burns, the wands do magic (#97), darts splash (#98)
// the cat goes for a fish finger lying on the floor near it and eats it (#163)
if (fish) {
  cat.fishSource = () => fish.placed;
  cat.onFishEaten = (f) => fish.eatenByCat(f);
  fish.onCatEaten = () => bump('catFish');
  cat.watchPoint = () => camera.position;
}
cat.onFound = (label, rare, breed, kitten) => { catFound(label, rare, breed); if (kitten) bump('kittens', 1, 'kattunge'); }; // a kitten (#363): more points
// a kitten bats a cup standing on its floor over (#363): it falls away from the kitten, what it held splashes out (the
// kitten's fault: no deduction); put down again, it may be knocked over again
const tippedCups = new Map(); // cup → its placedAt when it was knocked over
cat.toySource = () => cups.cups.filter((c) => c.state === 'placed' && tippedCups.get(c) !== c.placedAt).map((c) => ({ thing: c, at: c.model.position }));
cat.onTip = (c) => {
  tippedCups.set(c, c.placedAt);
  const at = c.model.position, k = cat.object.position, yaw = Math.atan2(at.x - k.x, at.z - k.z);
  if (c.fill > 0.01) {
    const col = c.contents.color(new THREE.Color()), ahead = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(0.12).add(at);
    const h = marks.hit(ahead.clone().setY(at.y + 0.12), ahead.clone().setY(at.y - 0.3));
    if (h?.object) marks.add('splash', h, { color: col.getHex(), force: true, size: 0.09 });
  }
  c.contents.clear(); c.heat = 0; c.show();
  c.model.quaternion.setFromEuler(new THREE.Euler(Math.PI / 2, yaw, 0, 'YXZ')); // on its side, the rim away from the kitten
  c.model.position.y += CUPS.r;
  sfx.click(at);
};
// a photo of every cat you pet goes up on the board, once its eyes are shut and the hand is there
const board = new CatBoard();
boardPanel = new BoardPanel(board, boardEl);
scene.add(board.object);
const boardLoaded = board.load();
// the shared world (#178, #119): inert unless CLOUD_URL (or &cloud=) is set — then drawings, the desk sheet and
// cat photos sync silently with the Cloudflare Worker (cloud.js)
const cloud = new Cloud({ posters, drawing, holding: () => heldItem() === heldDrawing });
// the global leaderboard (#198): the name on the start screen (optional), the top list there and under the stats
const leaderboard = new Leaderboard(cloud.url, totalScore, { nameRow: document.getElementById('lb-name'), input: document.getElementById('player-name'), list: document.getElementById('lb-start') });
setStatsExtra(() => leaderboard.html());
cloud.ready = cloud.on ? Promise.all([postersLoaded, boardLoaded]).then(() => cloud.sync()) : Promise.resolve(); // (tests wait on it)
cat.onPet = () => { bump('petted'); if (cat.kitten) bump('kittenPets'); }; // a kitten's pat is worth more (#363)
cat.onHurt = (weapon) => penalize(cat.kitten ? 'kittenShot' : 'catShot', weapon); // a kitten: extra bad (#363) // shot, cut or hit: it hisses and flees (#288)
cat.onPhoto = () => { // 0.7 s into the pat (cat.js), before it walks off (#206)
  bump('catPhotos');
  const head = cat.head.getWorldPosition(new THREE.Vector3());
  board.add(cat.catName, snapshot(renderer, scene, camera, head), { kitten: cat.kitten }); // a kitten's photo is marked (#363)
};

// a cat's bum (the X) seen from behind with its tail up (#262): once per tail-up, the first time per cat counts the most
const buttFrustum = new THREE.Frustum(), buttMat = new THREE.Matrix4(), buttAt = new THREE.Vector3();
let buttCounted = null;
function checkCatButt() {
  const key = `${cat.catName}|${cat.breed.name}|${cat.variant.name}`;
  if (buttCounted === `${key}#${cat.tailPeriod}` || !cat.buttFacing(camera.position)) return;
  camera.updateMatrixWorld();
  buttFrustum.setFromProjectionMatrix(buttMat.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  if (!buttFrustum.containsPoint(cat.buttPoint(buttAt)) || behindWall(buttAt)) return;
  buttCounted = `${key}#${cat.tailPeriod}`;
  bump('catButts', 1, key);
}

// Miele (#328): the family's cat, super-rare. Seen (on screen, within MIELE.see, no wall between) she counts once per
// time she turns up: heart fireworks, a trill and a pling, a big score; E takes her into your arms (miele.js)
const miele = new MieleHeld(scene, camera, cat);
const fireworks = new HeartFireworks(scene);
cat.canHold = () => !heldItem();
cat.watchPoint ??= () => camera.position;
miele.dropSpot = () => { // at your feet, a little in front
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).setY(0).normalize().multiplyScalar(0.45);
  const x = player.pos.x + f.x, z = player.pos.z + f.z;
  return new THREE.Vector3(x, player.pos.y + rugLift(Math.max(0, player.level), x, z), z);
};
const miePhoto = () => { // her photo on the cat board: the first time she is held or hugged, each time she turns up
  if (cat.photoDone) return;
  cat.photoDone = true;
  bump('catPhotos');
  board.add('Miele', snapshot(renderer, scene, camera, cat.head.getWorldPosition(new THREE.Vector3())));
};
miele.onPickUp = miePhoto;
miele.onHug = () => { bump('mieleHugs'); miePhoto(); };
if (params0.has('kitten')) cat.forceKitten = true; // &kitten: the next cat to turn up is a kitten (#363)
if (params0.has('miele')) cat.forceMiele = true; // &miele: the next cat to turn up is her (tests, screenshots)
const mieleFrustum = new THREE.Frustum(), mieleAt = new THREE.Vector3();
function checkMiele() {
  if (!cat.visible || !cat.isMiele || cat.seen || cat.held || cat.leaving?.hurt) return;
  const head = cat.head.getWorldPosition(mieleAt);
  if (head.distanceTo(camera.position) > MIELE.see) return;
  camera.updateMatrixWorld();
  mieleFrustum.setFromProjectionMatrix(buttMat.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  if (!mieleFrustum.containsPoint(head) || behindWall(head)) return;
  cat.seen = true;
  const again = !!stats.seen?.miele?.Miele;
  bump('miele', 1, 'Miele');
  badge(again ? '💖 Miele igen!' : '💖 Du hittade Miele!', false);
  fireworks.burst(head.clone());
  sfx.meow(head, cat.variant.pitch * (cat.breed.pitch ?? 1), cat.voice);
  sfx.pling(head, 1.2);
}

/** A stable name for a thing you use (its name and where it is), for the points that come once per thing (#197). */
function idOf(t) {
  const o = t.pickable ?? t.object;
  if (!o?.getWorldPosition) return t.name ?? t.kind;
  const p = o.getWorldPosition(new THREE.Vector3());
  return `${t.name ?? t.kind}@${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}`;
}
/** Open/close a door (with sound); the cat may turn up (or leave) behind doors you open. */
function useDoor(door) {
  const opening = !door.isOpen;
  door.toggle();
  if (opening) bump('doors', 1, idOf(door));
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
  if (d > 0.5 || player.vy !== 0 || player.flying) return; // teleport / falling / flying (#359)
  bump('metres', d);
  stride += d;
  if (stride < (player.sprinting ? PLAYER.strideRun : PLAYER.strideWalk)) return;
  stride = 0;
  bump('steps');
  const { x, z } = player.pos;
  sfx.step(player.outdoors ? 'outside' : stairHeight(x, z) !== null ? 'stair' : 'wood'); // (the loftgång over the flat: outside, #360)
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
  player.unstick(0, true); // a record inside a piece of furniture / the car: the nearest free floor (#314)
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
// &fall=h (#361): drop from h m above the ground here (a test of falling until the jetpack / roofs can give one)
if (params0.has('fall')) player.pos.y += Number(params0.get('fall') || 5);
if (params0.has('jetpack')) jetpack.putOn(); // &jetpack (#359): on your back from the start (outdoors only)
// the resumed place (not with ?at=): back to the same spot and view (the clock is real, #143); the start screen then
// says so and offers "Börja från start" instead
const resumeEl = document.getElementById('resume');
const resumeOk = !!resumed && !at && resumeAt(resumed); // the place; the clock is the real one (#143) unless a mid-visit record keeps the world (#277, below)
// reloaded mid-visit (#181): no start screen, straight back in (see `continueAfterReload` below); a record made
// on the start screen (no mode) shows it with "Du fortsätter där du var" as before
if (resumeOk && !resumed.mode) resumeEl.hidden = false;
if (!(resumeOk && resumed.mode)) document.documentElement.classList.remove('resuming'); // no (good) record after all: the start screen (#222)
/** Back to the real time and date (#143): the wall clock and the cat calendar show now, not what was spooled or picked. */
function realNow() {
  const n = new Date();
  Object.assign(day, { hour: n.getHours() + n.getMinutes() / 60 + n.getSeconds() / 3600, year: n.getFullYear(), month: n.getMonth() + 1, date: n.getDate(), paused: false, spool: 0 });
}
for (const id of ['restart', 'to-start']) { // also on the start screen shown when the mouse is freed (pause)
  document.getElementById(id).addEventListener('click', () => { spawnAtStart(); realNow(); resumeEl.hidden = true; });
}
const params = new URLSearchParams(location.search);
if (params.has('shot')) overlay.hidden = true;
if (params.has('tv')) for (const t of world.furnitureTargets) if (t.kind === 'tv') t.toggle();
// Tilly's laptop (#283): every clip kind seen counts once (stats `clips`); &laptop switches it on (screenshots)
const laptops = [...new Set(world.furnitureTargets.filter((t) => t.kind === 'laptop').map((t) => t.laptop))];
for (const l of laptops) l.onClip = (key) => bump('clips', 1, key);
if (params.has('laptop')) for (const l of laptops) l.set(true);
// the smart speakers (#325): E wakes one, it answers (the time, the weather, the coffee, jokes …)
const nests = new Nests(world.furnitureTargets.filter((t) => t.kind === 'nest'), { day, weather, coffee: world.lids.find((l) => l.kind === 'coffee'), camera, layer: document.getElementById('speech') });
if (params.has('turbo')) turbo.start(); // Kaffeturbo at once (screenshots, #217)
// ?open opens every door (screenshots of open doors/wardrobes)
// &water turns every tap on (screenshots)
// &tv switches the TV on (screenshots)
if (params.has('water')) for (const t of taps) t.toggle();
if (params.has('open')) for (const d of [...world.doors, ...world.lids, ...world.furnitureTargets.filter((t) => t.kind === 'appliance' || t.kind === 'cabinet')]) { d.toggle(); for (let i = 0; i < 30; i++) d.update(0.1); } // + cabinet doors / drawers in the furniture
if (params.has('open')) { airFryer.setOpen(true); airFryer.update(1); } // the air fryer's basket out too (#296 screenshots)
if (params.has('toaster') && toaster) { toaster.take(); toaster.placeAt(new THREE.Vector3(5.24, KITCHEN.baseTop + KITCHEN.worktop, 4.62)); toaster.model.rotation.set(0, Math.PI / 2, 0); toaster.setPlugged(true, true); toaster.press(); toaster.left = 600; toaster.update(2); } // &toaster: out on the worktop, plugged in, toasting (for a long while) (#401 screenshots)
if (params.has('fries') && fries) { airFryer.setOpen(true); airFryer.update(1); fries.cooked(); } // &fries: golden, steaming fries in the open basket (#301 screenshots)
// ?cat=x,z[,yaw[,feetY]] puts the cat somewhere (screenshots)
if (params.has('cat')) {
  const [x, z, yaw = 0, y = 0] = params.get('cat').split(',').map(Number);
  cat.object.position.set(x, y, z);
  cat.object.rotation.y = THREE.MathUtils.degToRad(yaw);
  cat.object.visible = true;
  // &catb=i breed, &catv=i coat (of that breed, or of all coats for a huskatt)
  const ordinary = BREEDS.filter((b) => !b.superRare); // Miele only with &miele (#328)
  const breed = params.has('miele') ? BREEDS.find((b) => b.superRare) : ordinary[Number(params.get('catb') ?? 0) % ordinary.length];
  const coats = breed.name === 'huskatt' ? VARIANTS : breed.coats;
  cat.setCat(breed, coats[Number(params.get('catv') ?? 0) % coats.length], params.has('kitten')); // &kitten: a kitten (#363)
  if (cat.kitten) { cat.catName = kittenName(); cat.forceKitten = false; }
  if (breed.superRare) cat.forceMiele = false; // she is here already
  cat.t = Number(params.get('catt') ?? 1.5);
  cat.nextMeow = 1e9;
  // &catwalk: up on all four, walking on the spot (#224; &catt = the moment in the gait)
  if (params.has('catwalk')) cat.walkOnTheSpot();
  // &cattail: the tail always up, the X showing (#262)
  if (params.has('cattail')) { cat.forceTail = true; cat.updateTail(0); cat.tailU = 1; }
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

let played = false; // left the start screen at least once this visit (an F5 then carries on, #203)
function showOverlay(show) {
  if (!show) { played = true; document.getElementById('reset-done').hidden = true; } // "Hemmet är återställt" only until the visit starts (#303)
  overlay.hidden = !show;
  hud.hidden = show;
  document.body.classList.toggle('touch', touch.enabled);
}

// Explicit choice on the start screen — a Surface has both a touchscreen and a keyboard.
let startClickAt = -1e9, lockRetried = false;
function startMouse() {
  initAudio();
  startClickAt = performance.now(); lockRetried = false;
  canvas.requestPointerLock()?.catch?.(() => {}); // a refusal also fires pointerlockerror (handled below)
}
document.getElementById('start-mouse').addEventListener('click', startMouse);
// Esc on the start screen = "Mus & tangentbord". Browsers don't count Esc as a user gesture, so
// it can't grab the mouse or start the sound itself: it closes the start screen and the next
// click (anywhere) does exactly what the button does — #arm is a see-through click catcher with a small
// line at the bottom, no box (#190). Esc in the game still just frees the mouse.
const armEl = document.getElementById('arm');
let unlockedAt = -1e9;
const otherOverlay = () => ['install', 'reset-confirm', 'note', 'board-view', 'poster-panel'].some((id) => !document.getElementById(id)?.hidden)
  || getComputedStyle(document.getElementById('rotate')).display !== 'none';
document.addEventListener('keydown', (e) => {
  if (e.code !== 'Escape' || locked || overlay.hidden || otherOverlay()) return;
  if (performance.now() - unlockedAt < 700) return; // the Esc that just freed the mouse
  e.preventDefault();
  overlay.hidden = true;
  armEl.hidden = false;
});
armEl.addEventListener('click', () => { armEl.hidden = true; startMouse(); });
// refused (Chrome wants ~1 s between freeing the mouse and taking it again): try once more while the click
// still counts as a gesture, else the game shows and the next click takes the mouse — never back to the start
// screen, never a box to click (#190)
document.addEventListener('pointerlockerror', () => {
  if (!lockRetried && performance.now() - startClickAt < 4000) { lockRetried = true; setTimeout(() => canvas.requestPointerLock()?.catch?.(() => {}), 1100); }
  showOverlay(false); armEl.hidden = false;
});
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
  life.interrupt('satte sig'); // (#372)
  raycaster.setFromCamera(center, camera);
  const spot = chooseSpot(target, raycaster.ray, cat.visible ? cat.object.position : null);
  if (!spot) return;
  sitAt(target, spot, { x: player.pos.x, z: player.pos.z, y: player.pos.y, yaw: camera.rotation.y });
  bump(spot.kind === 'lie' ? 'lay' : 'sat', 1, `${target.name}@${spot.pos.x.toFixed(1)},${spot.pos.y.toFixed(1)},${spot.pos.z.toFixed(1)}`); // each seat / side of a bed once
  sfx.rustle(spot.pos);
  if (target.name === 'loungesoffan') beer.serve(); // a big beer on the table (#117)
}
/** Down on `spot` of `target`; `stand` = where to get up again. `now`: already there (a reload putting you back, #277). */
function sitAt(target, spot, stand, now = false) {
  player.crouch = false;
  rest.begin(target, spot, stand);
  if (now) { rest.t = 1; camera.position.copy(spot.pos); rest.clampLook(camera); }
  if (spot.pc) usePc(spot);
  if (spot.tv) { // sitting up in bed puts the room's TV on (#213), and getting up puts it off again
    const tv = world.furnitureTargets.find((t) => t.kind === 'tv' && t.room === spot.tv);
    if (tv && (!tv.isOpen || now)) { if (!tv.isOpen) { tv.toggle(); sfx.tvClick(tv.pickable.getWorldPosition(new THREE.Vector3()), true); } rest.tvOn = tv; }
  }
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
  takeBtn.disabled = drawing.blank;
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
drawPanel.querySelector('[data-act=clear]').addEventListener('click', () => { drawing.clear(); takeBtn.disabled = true; });
drawPanel.querySelector('[data-act=done]').addEventListener('click', () => endDraw('button'));
/** "Ta teckningen" (#176): out of drawing mode with the sheet in the hand; a fresh one on the desk. */
const takeBtn = drawPanel.querySelector('[data-act=take]');
function takeDrawing(byKey = 'button') {
  if (drawing.blank) return;
  endDraw(byKey);
  heldDrawing.take(drawing.take());
}
takeBtn.addEventListener('click', () => takeDrawing());
canvas.addEventListener('pointerdown', (e) => { if (drawing.active) { drawing.pointerDown(e.clientX, e.clientY, canvas); takeBtn.disabled = drawing.blank; e.preventDefault(); } });
canvas.addEventListener('pointermove', (e) => { if (drawing.active) drawing.pointerMove(e.clientX, e.clientY, canvas); });
window.addEventListener('pointerup', () => { if (drawing.active) drawing.pointerUp(); });
document.addEventListener('keydown', (e) => {
  if (!drawing.active) return;
  if (e.code === 'KeyE' || e.code === 'Escape') { e.preventDefault(); endDraw(e.code); }
  else if (e.code === 'KeyT') takeDrawing('E'); // T: take the drawing (#176)
  else if (/^Digit[1-9]$/.test(e.code)) pickColor(Number(e.code.slice(5)) - 1);
  e.stopImmediatePropagation();
}, true);

/** Stand up again where you stood before sitting / lying down. */
/**
 * Where to get up (#202, #302): where you stood before, unless that is behind you as you look now; then a free spot
 * in front of the seat, as straight ahead as there is room. Free = clear of walls and furniture, not inside a piece's
 * footprint (a table's middle is far from its edges) and reached from the seat without crossing furniture (not over the
 * dining table to its far side), not through a wall. None in front (a chair pushed in under the table): the old spot if
 * it is still free, else the nearest free spot all round (behind the chair), else the nearest free floor (#314). Out of a
 * bed (`bed`): the old spot whenever it is free (#314).
 */
function standSpot(seat, yaw, old, bed = false) {
  if (bed && standFree(seat, old.x, old.z, false)) return old; // out of a bed: where you got in (lying, "in front" means nothing, #314)
  const ahead = (old.x - seat.x) * -Math.sin(yaw) + (old.z - seat.z) * -Math.cos(yaw) >= 0;
  if (ahead && standFree(seat, old.x, old.z, false)) return old;
  const ring = (turns) => {
    for (const turn of turns) for (const d of [0.55, 0.7, 0.85, 1.0, 1.2, 1.4]) {
      const x = seat.x - Math.sin(yaw + turn) * d, z = seat.z - Math.cos(yaw + turn) * d;
      if (standFree(seat, x, z, true)) return { x, z };
    }
    return null;
  };
  const front = ring([0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9]); // straight ahead first
  if (front) return front;
  if (standFree(seat, old.x, old.z, false)) return old;
  // all round, nearest first, finer (a bunk between the wall and the desk leaves little floor)
  const turns = Array.from({ length: 41 }, (_, i) => (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 20));
  for (let d = 0.5; d < 2.05; d += 0.1) for (const turn of turns) {
    const x = seat.x - Math.sin(yaw + turn) * d, z = seat.z - Math.cos(yaw + turn) * d;
    if (standFree(seat, x, z, true)) return { x, z };
  }
  return player.nearestFree(seat.x, seat.z) ?? old; // never into a blocked spot (#314)
}
/** Can the visitor stand at (x, z) after getting up from `seat` (#302)? `path`: also the way there from the seat. */
function standFree(seat, x, z, path) {
  if (!player.isFree(x, z)) return false; // clear of walls and furniture, inside no footprint (#314)
  if (behindWall({ x, z })) return false; // (the camera is still at the seat)
  if (path) { // through no wall or window (#302: behindWall knows no windows), and out of the seat's own piece(s) and
    // never into another one: not over the table to its far side
    const [, dyn] = player.segments(), feet = player.obstacles();
    if ([...(world.levels[player.level]?.fixedSegments ?? []), ...dyn].some((sg) => crosses(seat.x, seat.z, x, z, sg))) return false;
    const own = feet.filter((q) => inPoly(q, seat.x, seat.z)), n = Math.ceil(Math.hypot(x - seat.x, z - seat.z) / 0.05);
    let out = false;
    for (let i = 1; i < n; i++) {
      const px = seat.x + (x - seat.x) * i / n, pz = seat.z + (z - seat.z) * i / n;
      const hit = feet.filter((q) => inPoly(q, px, pz));
      if (hit.length === 0) out = true;
      else if (out || hit.some((q) => !own.includes(q))) return false;
    }
  }
  return true;
}
function standUp() {
  const film = rest.spot?.pc === 'film';
  const bed = rest.target?.rest === 'lie'; // lying or sitting up in a bed (#213)
  const seat = rest.spot?.pos.clone(), lying = rest.kind === 'lie', inCar = rest.spot?.car; // out of the car: back where you stood, by the door (#250)
  // you keep looking the way you looked while seated (#202); lying you were facing the ceiling: level
  const yaw = camera.rotation.y, pitch = lying ? 0 : camera.rotation.x;
  const s = rest.end();
  if (!s) return;
  if (rest.tvOn) { if (rest.tvOn.isOpen) { rest.tvOn.toggle(); sfx.tvClick(rest.tvOn.pickable.getWorldPosition(new THREE.Vector3()), false); } rest.tvOn = null; } // (#213)
  // getting up from the film: the monitor goes back to the desk (and the game) — the PC stays on
  if (film) for (const t of world.furnitureTargets) if (t.kind === 'pc') t.watch(null);
  const at = seat && !inCar ? standSpot(seat, yaw, s, bed) : s;
  player.spawn(at.x, at.z, yaw);
  camera.rotation.x = pitch;
  player.pos.y = s.y; // spawn() finds the ground floor; upstairs we stood on Övre plan
  player.eyeY = s.y + PLAYER.eye;
  camera.position.y = player.eyeY;
  sfx.rustle(camera.position);
}
/** A drink run over (#288, `o` = { at, color } from a glass / cup's overflow): a splash on the surface beside it, a deduction. */
function spill(o) {
  const side = new THREE.Vector3(camera.position.x - o.at.x, 0, camera.position.z - o.at.z).normalize().multiplyScalar(0.07);
  const from = o.at.clone().add(side), h = marks.hit(from.clone().setY(o.at.y + 0.12), from.clone().setY(o.at.y - 0.4));
  if (h?.object) marks.add('splash', h, { color: o.color, force: true, size: 0.08 });
  penalize('spill');
}
// --- a choice of actions (#367): a life-sim thing with several things to do. Mouse & keyboard: a list under the
// crosshair, E = the marked row, 1–4 pick, the wheel moves the mark; touch: a big button per row by the action button
// (buttons: touch.js never takes them for looking). Blocked rows say why in words.
const choicesEl = document.getElementById('choices');
const choices = { rows: null, target: null, sel: 0, key: '' };
function showChoices(rows, target) {
  const key = rows ? rows.map((r) => `${r.id}:${r.label}:${r.reason ?? ''}`).join('|') : '';
  if (target !== choices.target || key !== choices.key) {
    const keepSel = target === choices.target && rows && choices.rows && rows.length === choices.rows.length;
    Object.assign(choices, { rows, target, key, sel: keepSel ? choices.sel : Math.max(0, rows?.findIndex((r) => !r.reason) ?? 0) });
    renderChoices();
  } else choices.rows = rows; // (fresh closures for run)
  choicesEl.hidden = !rows;
}
function renderChoices() {
  choicesEl.replaceChildren();
  if (!choices.rows) return;
  choices.rows.forEach((r, i) => {
    const b = document.createElement('button');
    const text = `${r.label[0].toUpperCase()}${r.label.slice(1)}`;
    b.textContent = touch.enabled ? (r.reason ? `${text} – ${r.reason}` : text) : `${i + 1}  ${text}${r.reason ? ` – ${r.reason}` : ''}${i === choices.sel ? '  ◀ E' : ''}`;
    b.className = `${i === choices.sel ? 'sel' : ''} ${r.reason ? 'no' : ''}`;
    b.dataset.i = i;
    b.addEventListener('click', (e) => { e.stopPropagation(); runChoice(i); });
    choicesEl.append(b);
  });
  if (!touch.enabled) { const h = document.createElement('div'); h.className = 'hint'; h.textContent = `${heldItem()?.clickIsUse ? 'E' : 'Klicka (E)'} eller 1–${choices.rows.length} väljer · hjulet flyttar`; choicesEl.append(h); }
}
/** Do row `i` of the menu (a blocked one only clicks: its reason is on screen). */
function runChoice(i) {
  const r = choices.rows?.[i];
  if (!r) return false;
  if (r.reason) { sfx.click(camera.position); return false; }
  if (!heldItem() && focusPoint) hand.reach(focusPoint);
  shadowState.hold = 1.5;
  r.run();
  choices.key = ''; // (re-render with the new state)
  return true;
}
function moveChoice(d) {
  if (!choices.rows) return false;
  choices.sel = (choices.sel + d + choices.rows.length) % choices.rows.length;
  renderChoices();
  return true;
}
document.addEventListener('wheel', (e) => { if (locked && !reading && choices.rows && moveChoice(Math.sign(e.deltaY))) e.preventDefault(); }, { passive: false });

/** E / the action button on what you look at: doors toggle, the note opens. */
function use(thing) {
  shadowState.hold = 1.5; // whatever moves now casts a moving shadow
  if (!heldItem() && !['rest', 'place', 'note', 'clock', 'calendar', 'board', 'poster', 'paper'].includes(thing.kind) && focusPoint && thing === focused) hand.reach(focusPoint); // the arm reaches out (#195)
  if (thing.options && thing.kind !== 'life' && choices.rows && choices.target === thing) { // a lamp with a choice (#428): the marked row
    runChoice(choices.sel);
    if (thing.kind === 'lamp' && thing.isOpen) bump('lights', 1, idOf(thing));
  } else if (thing.blocked && (thing.kind === 'appliance' || thing.kind === 'cabinet')) sfx.click(camera.position); // something stands on the secretary's flap / the cushion box's lid (#447)
  else if (thing.kind === 'note') showNote(true);
  else if (thing.kind === 'clock') { showClock(true); bump('clock'); }
  else if (thing.kind === 'calendar') { showCalendar(true); bump('calendar'); }
  else if (thing.kind === 'blind' || thing.kind === 'curtain') showBlind(thing); // a pleated blind (#273), the curtains (#342)
  else if (thing.kind === 'board') showBoard(true);
  else if (thing.kind === 'poster') showPoster(thing); // a taped-up drawing (#177)
  else if (thing.kind === 'switch' || thing.kind === 'lamp') { thing.toggle(); if (thing.isOpen) bump('lights', 1, idOf(thing)); }
  else if (thing.kind === 'fridge') { thing.toggle(); if (thing.isOpen) bump('fridge', 1, idOf(thing)); }
  else if (thing.kind === 'keybox') { thing.toggle(); if (thing.isOpen) bump('cabinets', 1, idOf(thing)); }
  else if (thing.kind === 'appliance') { thing.toggle(); if (thing.isOpen) bump('appliances', 1, idOf(thing)); } // oven, microwave (#82)
  else if (thing.kind === 'coffee') thing.toggle();
  else if (thing.kind === 'speaker') { if (!sonos.playing) sonos.play(); showSonos(true); } // music in all the speakers (#187)
  else if (thing.kind === 'grill') { thing.toggle(); if (thing.on) bump('grill'); } // light / put out the grill (#204)
  else if (thing.kind === 'hood') { thing.toggle(); if (thing.on) bump('hood'); } // the cooker hood's fan (#194)
  else if (thing.kind === 'hob') { thing.toggle(); if (thing.on) bump('appliances', 1, 'hob'); } // the induction hob (#158)
  else if (thing.kind === 'cabinet') { thing.toggle(); if (thing.isOpen) bump('cabinets', 1, idOf(thing)); } // wall cabinets that open (#138)
  else if (thing.kind === 'target') thing.toggle(); // clear the score (#99)
  else if (thing.kind === 'rest') sitOrLie(thing);
  else if (thing.kind === 'life' && !thing.tooFar) { // a life-sim thing (#367): the chosen row of the menu, else its first allowed action
    const row = choices.rows && choices.target === thing ? choices.rows[choices.sel] : null;
    if (row) runChoice(choices.sel); else life.run(thing);
  }
  else if (thing.blocked) { const o = thing.overflow?.(); if (o) spill(o); else sfx.click(camera.position); } // put down what you hold first (#102); E on a full glass/cup anyway: it runs over (#288)
  else if (thing.kind === 'airfryer') { thing.toggle(); if (thing.isOpen) bump('appliances', 1, thing.id); } // the air fryer's basket / panel (#287)
  else if (thing.kind === 'airfry') thing.item.airfryHeld(); // a fish finger into the air fryer's basket (#287)
  else if (thing.kind === 'pourfries') thing.toggle(); // fries from the bag into the air fryer's basket (#301)
  else if (thing.kind === 'coffeejar' || thing.kind === 'mocca') thing.toggle(); // the coffee jar's scoop, the jug's water, the filter (#334)
  else if (thing.kind === 'saber' || thing.kind === 'holdable' || thing.kind === 'cup') thing.toggle();
  else if (thing.kind === 'place') thing.item.placeAt(thing.point, thing.yaw); // (as the ghost showed it, #368)
  else if (thing.kind === 'fry') thing.item.intoPan(); // the chicken into the pan on the hob (#160)
  else if (thing.kind === 'fryfish') thing.item.fryHeld(); // a fish finger into the pan (#214)
  else if (thing.kind === 'paper') { if (heldItem() === heldDrawing) heldDrawing.putBack(); else beginDraw(); } // holding the drawing: back on the desk (#176)
  else if (thing.kind === 'tape') { posters.tape(heldDrawing.image, thing.spot, heldDrawing.meta ?? {}); heldDrawing.release(); drawing.save(); bump('posted'); } // tape the drawing up (#176)
  else if (thing.kind === 'pc') { const on = thing.toggle(); if (on) bump('pc', 1, idOf(thing)); sfx.tvClick(thing.pickable.getWorldPosition(new THREE.Vector3()), on); }
  else if (thing.kind === 'nest') { thing.toggle(); bump('nest', 1, idOf(thing)); } // a smart speaker answers (#325)
  else if (thing.kind === 'laptop') { // the screen: on, then the next clip; the keyboard: on / off (#283)
    const was = thing.isOpen;
    thing.toggle();
    if (thing.isOpen !== was) sfx.tvClick(thing.pickable.getWorldPosition(new THREE.Vector3()), thing.isOpen);
    else sfx.beat(thing.pickable.getWorldPosition(new THREE.Vector3()), 'hat', 0.2); // a soft swipe
  } else if (thing.kind === 'tv') {
    const on = thing.toggle();
    if (on) bump('tv', 1, idOf(thing));
    sfx.tvClick(thing.pickable.getWorldPosition(new THREE.Vector3()), on);
  } else if (thing.kind === 'parasol') {
    const opening = thing.toggle();
    bump('parasol');
    sfx.parasol(thing.pickable.getWorldPosition(new THREE.Vector3()).setY(2), opening);
  }
  else if (thing.kind === 'cardoor') thing.toggle(); // open / shut a door of our car (#250)
  else if (thing.kind === 'carmusic') thing.toggle(); // music in the car: on / off, ⏮ ⏭ (#268)
  else if (thing.kind === 'jetpack') thing.toggle(); // put the jetpack on / stand it down (#359)
  else if (thing.kind === 'liftcall' || thing.kind === 'liftbtn') thing.press(); // the lift (#415)
  else if (thing.kind === 'garagebutton') { thing.press(); bump('garageDoor'); } // the garage door's buttons (#358)
  else if (thing.kind === 'carkey') { thing.press(); car.call(); bump('car'); } // beep beep: the car comes, or leaves (#173)
  else if (thing.kind === 'flush') { if (thing.toggle()) bump('flushes', 1, idOf(thing)); } // the toilet's flush button (#155)
  else if (thing.kind === 'lid') {
    thing.toggle();
    if (thing.isOpen) bump('lids', 1, idOf(thing));
    sfx.lid(thing.object.position, thing.isOpen);
  } else if (thing.kind === 'cat') { if (cat.isMiele && !heldItem()) miele.take(); else cat.pet(player.pos); } // Miele: into your arms (#328)
  else if (thing.kind === 'greet') { greet.greet(thing.fig); bump('greets', 1, `fig${people.figs.indexOf(thing.fig)}`); } // hello (#247)
  else if (thing.kind === 'towel') handWash.dry(thing, focusPoint); // dry the hands (#437)
  else if (thing.kind === 'tap') {
    thing.toggle();
    if (thing.isOpen) bump('taps', 1, idOf(thing));
  }
  else useDoor(thing);
}
actionBtn.addEventListener('click', () => { if (reading) showNote(false); else if (focused) use(focused); else if (heldItem()?.useLabel) heldItem().use(); else if (rest.active) standUp(); });
const standBtn = document.getElementById('stand-btn'); // touch, sitting with something in reach or in the hand: get up (#184)
standBtn.addEventListener('click', () => { if (rest.active) standUp(); });
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
  if (!drawing.active && !boardFreed) showOverlay(!locked); // drawing and the board panel free the mouse on purpose: no start screen
  if (!locked) { player.keys.clear(); holdStats(false); if (!touch.enabled) player.crouch = false; }
  if (!locked && reading && !boardFreed) showNote(false);
});
document.addEventListener('mousemove', (e) => {
  if (locked) look(e.movementX * PLAYER.mouseSens, e.movementY * PLAYER.mouseSens);
});
/**
 * A mouse click (#443), the one rule for mouse & keyboard (touch has its own buttons):
 *  - left, reading the book: the next page; in another panel / strip: nothing (they have their own keys and buttons)
 *  - left, holding a weapon or the ball (`clickIsUse`): always fire / throw (automatic while held: the rifle, #196)
 *  - left, something in focus: E on it (open, take, put down where the ghost shows, pour, sit, pet, greet, a menu row …);
 *    a blocked target ("Lägg ifrån dig …", "Glaset är fullt"): nothing — spilling is E's only (#288)
 *  - left, nothing in focus: use what you hold (eat, drink, hug, read, light …); empty-handed, seated or not: nothing
 *  - right: the held thing's own alternative (`useAlt`: the remote's power, the ball's dribble), else its use (eat …)
 * Returns what it did (tools/clicktest.html).
 */
function click(button) {
  const held = heldItem(), focused = clickTarget();
  if (button === 2) {
    if (reading) return 'none';
    if (held?.useAlt) { held.useAlt(); return 'alt'; }
    if (held) { held.use(); return 'use'; }
    return 'none';
  }
  if (book.reading) { book.turn(1); return 'page'; }
  if (reading) return 'none';
  if (held?.clickIsUse || !focused) {
    if (held?.trigger) held.trigger(true); else held?.use();
    return held ? 'use' : 'none';
  }
  if (focused.blocked) return 'blocked';
  use(focused);
  return 'e';
}
/** What a left click may do E on: the focus, but not the jetpack's "stand it down" (E's fallback with nothing in focus). */
const clickTarget = () => (focused === jetpack.dropTarget ? null : focused);
/** Does a left click do E on what is in focus now (the prompt says "Klicka (E)")? */
const clickIsE = () => !!clickTarget() && !focused.blocked && !heldItem()?.clickIsUse;
document.addEventListener('mousedown', (e) => { if (locked && (e.button === 0 || e.button === 2)) click(e.button); });
document.addEventListener('contextmenu', (e) => { if (locked) e.preventDefault(); });
document.addEventListener('mouseup', (e) => { if (e.button === 0) heldItem()?.trigger?.(false); });
// touch: holding the action button keeps the rifle firing (#196)
actionBtn.addEventListener('pointerdown', () => { if (!focused && heldItem()?.trigger) heldItem().trigger(true); });
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) actionBtn.addEventListener(ev, () => heldItem()?.trigger?.(false));
// touch: the remote's power button beside the action button while it is held
const powerBtn = document.getElementById('power-btn');
const turnBtn = document.getElementById('turn-btn');
turnBtn.addEventListener('click', () => turnPlacement());
powerBtn.addEventListener('click', () => heldItem()?.useAlt?.());
const stripKeys = new Set(); // keys pressed while a strip / the note is open
const isCtrl = (code) => code === 'ControlLeft' || code === 'ControlRight';
document.addEventListener('keydown', (e) => {
  if (!locked) return;
  if (reading) {
    // WASD drive the strips (#120): auto-repeat of a key already held while walking up to them is ignored
    if (!e.repeat) stripKeys.add(e.code);
    else if (!stripKeys.has(e.code)) return;
    if (clockPanel.open && clockPanel.key(e.code, true, e.repeat)) e.preventDefault();
    else if (sonos.open && sonos.key(e.code)) e.preventDefault();
    else if (calPanel.open && calPanel.key(e.code, true)) e.preventDefault();
    else if (blindPanel.open && blindPanel.key(e.code, true)) e.preventDefault();
    else if (book.reading && book.key(e.code)) e.preventDefault();
    else if (viewing && e.code === 'KeyS') throwPoster(); // the drawing's panel (#177)
    else if (viewing && e.code === 'KeyT') takeDownPoster();
    else if (e.code === 'KeyE') showNote(false);
    else if (!noteEl.hidden && scrollNote(notePaper, e.code, e.shiftKey)) e.preventDefault(); // #275
    return;
  }
  player.keys.add(e.code);
  if (e.code === 'Space' && jetpack.worn) e.preventDefault(); // thrust (#359)
  // crouch while held (#70): C, so crouching and walking is never Ctrl+W = close the tab (#274); Ctrl still works,
  // and while it is held the browser's other Ctrl shortcuts (save, print, bookmark …) are kept from opening
  if (isCtrl(e.code)) player.crouch = true;
  else if (e.ctrlKey) e.preventDefault();
  if (choices.rows && /^Digit[1-9]$/.test(e.code) && runChoice(Number(e.code.slice(5)) - 1)) e.preventDefault(); // a menu row (#367)
  if (e.code === 'KeyE' && focused) use(focused); // also while sitting: what is within reach (#184)
  else if (e.code === 'KeyE' && rest.active) standUp();
  else if ((e.code === 'Space' || e.code === 'KeyC') && rest.active) { e.preventDefault(); standUp(); } // seated, C gets you up
  else if (e.code === 'KeyC' && !e.repeat) player.crouch = true; // (the repeats of the C that just stood you up do not crouch)
  if (e.code === 'KeyM') updateMute(toggleMuted());
  if (e.code === 'KeyT') toggleStats();
  if (e.code === 'Tab') { e.preventDefault(); if (!e.repeat) holdStats(true); }
  if (e.code === 'KeyK') toggleMap();
  if (e.code === 'KeyQ') measure.press();
  if (e.code === 'KeyR' && !e.ctrlKey && !e.metaKey && focused?.kind === 'place') turnPlacement(); // turn what you put down (#368)
  if (e.code === 'KeyF') toggleFurniture();
  if (e.code.startsWith('Arrow')) e.preventDefault();
});
document.addEventListener('keyup', (e) => {
  player.keys.delete(e.code);
  stripKeys.delete(e.code);
  if (isCtrl(e.code) || e.code === 'KeyC') player.crouch = ['KeyC', 'ControlLeft', 'ControlRight'].some((k) => player.keys.has(k));
  if (clockPanel.open && clockPanel.key(e.code, false)) e.preventDefault(); // no button click on Space
  if (blindPanel.open) blindPanel.key(e.code, false);
  if (e.code === 'Tab') holdStats(false);
});
window.addEventListener('blur', () => { if (!touch.enabled) player.crouch = false; heldItem()?.trigger?.(false); }); // no stuck crouch, no stuck trigger
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
const pickables = [...garage.targets.map((t) => t.pickable), ...core.targets.map((t) => t.pickable), airFryer.basketTarget.pickable, airFryer.panelTarget.pickable, ...world.doors.map((d) => d.pickable), ...world.lids.map((l) => l.pickable), ...taps.map((t) => t.pickable), note.pickable, board.pickable, ...(coffeeJar ? [coffeeJar.target.pickable] : []), wallClock.pickable, calendar.pickable, ...lights.targets.map((t) => t.pickable), grill.pickable, blinds.object];
const center = new THREE.Vector2(0, 0);
const keyCabinet = world.lids.find((l) => l.kind === 'keybox');
let focused = null, focusPoint = null;

/** Does the line a → b pass through one of the flat's slabs (a level's ceiling .. the next floor, the roof too) inside
 * its footprint, other than through the stair hole (#446)? Both faces of the slab are tested; a line grazing the hole's
 * edge by up to 5 cm still passes (the rattan lamp at the edge, seen from the stair). */
function throughSlab(a, b) {
  for (let i = 0; i < LEVELS.length; i++) {
    const L = LEVELS[i];
    for (const y of [L.floor + L.ceiling, L.top]) {
      if ((a.y - y) * (b.y - y) >= 0) continue; // both on one side of this face
      const t = (y - a.y) / (b.y - a.y), x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      if (x <= 0 || x >= world.size.x || z <= 0 || z >= world.size.z) continue; // outside the flat
      const h = i === 0 ? STAIR.hole : null; // only the slab between our two levels has an opening
      if (h && x > h.x0 - 0.05 && x < h.x1 + 0.05 && z > h.z0 - 0.05 && z < h.z1 + 0.05) continue;
      return true;
    }
  }
  return false;
}

/** Is there a wall between the eye and `p` (plan view)? Pickables aren't occluded by walls in the
 * raycast (it only tests pickables), so check the line against the level's wall outlines. */
function behindWall(p) {
  if (player.aloft && p.y < UNIT_TOP && p.x > 0 && p.x < world.size.x && p.z > 0 && p.z < world.size.z) return true; // up on the roof: the flat is under it (#360)
  // a floor / ceiling between (#446: the bed upstairs through the kitchen ceiling); a plan point without y (standFree's
  // floor spot on the visitor's own level) has no slab between: NaN would read as "through" (#454)
  if (p.y !== undefined && throughSlab(camera.position, p)) return true;
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
  // sitting / lying (#184): what is within arm's reach can be used as usual (not the seat itself, nothing to sit on);
  // E with nothing in reach, Space / C or the "Res dig" button get you up
  const reach = rest.active ? REST.reach[rest.spot.kind === 'lie' ? 'lie' : 'sit'] : HOLD.reach;
  camera.updateMatrixWorld(); // the player just moved it; render hasn't run yet
  raycaster.setFromCamera(center, camera);
  raycaster.far = reach;
  // (the raycaster ignores visibility, so the cat is only a target while it is there)
  // the car key only while its cabinet is open
  const extra = [...(cat.visible && !cat.held ? [cat.object] : []), ...(keyCabinet?.keyReachable ? [world.carKey.pickable] : []), ...car.targets(rest.target).map((t) => t.pickable), // our car's doors and front seats (#250)
    ...jetpack.targets(), // the jetpack on its hook / where it was stood down (#359)
    ...world.courtyardTargets.map((t) => t.pickable), // the courtyard's benches (#438): F keeps them
    ...(world.furnitureOn ? [...(target.object.visible ? [target.target] : []), ...patio.targets, ...world.furnitureTargets, ...holdables.map((h) => h.target), drawing.target, ...posters.targets].map((t) => t.pickable) : [])]; // parasol, TV, seats, beds, toys — unless F hid the furniture
  // the nearest hit on something actually shown (F hides the loose items, the raycaster doesn't care)
  const cupTargets = cups.cups.filter((c) => !c.held && c.state !== 'spare').map((c) => c.target.pickable);
  if (fish && world.furnitureOn) cupTargets.push(fish.target.pickable, ...fish.placed.map((f) => f.target.pickable), ...fish.inPan.map((f) => f.target.pickable)); // the carton + fish fingers lying out (#162) or in the pan (#214)
  if (fish && world.furnitureOn && airFryer.open) cupTargets.push(...fish.inFryer.map((f) => f.target.pickable)); // in the open air fryer basket (#287)
  if (fries && world.furnitureOn) cupTargets.push(...fries.placed.map((b) => b.target.pickable)); // bunches of fries put down (#301)
  if (world.furnitureOn) cupTargets.push(...fruit.targets()); // the fruit in the bowl / lying out, the bowl with something in the hand (#326)
  cupTargets.push(...life.targets().map((t) => t.pickable));
  cupTargets.push(...toiletPaper.targets()); // the toilet-paper rolls and the strips hanging (#426) // the life sim's things (#366; F hides the ones lying out: `shown`)
  const hit = raycaster.intersectObjects([...pickables, ...extra, ...cupTargets], true)
    .find((h) => shown(h.object) && !(rest.active && (h.object.userData.door === rest.target || h.object.userData.door?.kind === 'rest' || h.object.userData.door?.seat === rest.target.pickable))); // (not the lid you sit on, #445)
  focused = hit && !behindWall(hit.point) ? hit.object.userData.door : null;
  focusPoint = focused ? hit.point.clone() : null; // where the hand reaches on E (#195)
  focused?.aimAt?.(focusPoint); // the car's screen: which of its buttons (#268)
  if (!focused) { // a life-sim thing just out of reach (#367): say so instead of nothing
    raycaster.far = reach + LIFE.tooFar;
    const far = raycaster.intersectObjects(life.targets().map((t) => t.pickable), true).find((h) => shown(h.object));
    raycaster.far = reach;
    if (far && far.distance > reach && !behindWall(far.point)) { focused = { name: '', kind: 'life', blocked: true, blockedText: 'För långt bort', tooFar: true }; focusPoint = far.point.clone(); }
  }
  if (!focused && !rest.active) { // nothing in reach: a person outside further off to say hello to (#247)
    const g = greet.target(raycaster.ray);
    if (g) { focused = g; focusPoint = g.point; }
  }
  // holding something: a table top / worktop in front of you, or else the floor (nearer than anything
  // else you look at), is where it goes down (#102)
  const item = heldItem();
  placeGhost.visible = false;
  // holding a drawing: a wall or the fridge/freezer door in front of you is where it can be taped up (#176)
  let posterSpot = null;
  if (item === heldDrawing) {
    posterSpot = posters.spot(raycaster.ray, player.level, behindWall, reach, new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion)); // + under a top bunk, lying in the lower one (#199)
    if (posterSpot && hit && posterSpot.distance > hit.distance + 0.05 && hit.object.userData.door?.kind !== 'fridge' && hit.object.userData.door?.kind !== 'freezer') posterSpot = null;
    if (posterSpot) {
      posterSpot.level = Math.max(0, player.level);
      focused = posterSpot.full ? { name: '', kind: 'tape', blocked: true, blockedText: 'Det får inte plats fler teckningar – släng en först' }
        : { name: 'teckningen', kind: 'tape', verb: 'tejpa upp', spot: posterSpot };
    }
  }
  posters.showGhost(posterSpot, heldDrawing.tex);
  if (item?.placeAt) {
    const top = raycaster.intersectObjects(world.cupSurfaces, false).find((h) => shown(h.object) && h.point.y >= h.object.userData.surface - 0.02 && (item.soft || !h.object.userData.soft)); // a bed / a sofa only for a plush toy (#269)
    let spot = top && top.distance < reach && !behindWall(top.point) ? { point: top.point.clone().setY(top.object.userData.surface), distance: top.distance } : null;
    if (spot && item.softOnly && !top.object.userData.soft) { // Miele: not on a table or a worktop (#328)
      if (!hit || spot.distance <= hit.distance + 0.05) focused = { name: '', kind: 'place', blocked: true, blockedText: 'Miele får inte vara på bordet' };
      spot = null;
    } else if (!spot) { const f = floorSpot(); if (f && f.distance < reach && !behindWall(f.point)) spot = f; } // a table top is always above (before) the floor
    const lifeAim = focused?.kind === 'life' && !!focused.options?.().some((a) => !a.reason); // a plate it can go on (#367): that, not the table under it
    if (spot && !lifeAim && (!hit || spot.distance <= hit.distance + 0.05)) {
      snapSpot(spot, top && spot.point.y > LEVELS[Math.max(0, player.level)].floor + 0.05 ? top.object : null); // on a grid (#368)
      placeTarget = { name: `${item.name} här`, kind: 'place', verb: item.placeVerb ?? 'lägga ner', item, point: spot.point, yaw: placeYaw() };
      focused = placeTarget;
      placeGhost.position.copy(spot.point).y += 0.003;
      placeGhost.visible = true;
    }
  }
  // the pan in the hand, aimed at the hob (or a spot on it): stand it on the big front zone (#159)
  if (item === pan && world.hob && (focused?.kind === 'hob' || (focused?.kind === 'place' && focused.point.distanceTo(world.hob.zone) < 0.35))) {
    focused = { name: 'stekpannan på hällen', kind: 'place', verb: 'ställa', item: pan, point: world.hob.zone.clone() };
    placeGhost.position.copy(world.hob.zone).y += 0.003;
    placeGhost.visible = true;
  }
  // the chicken in the hand, aimed at the pan on the hob (or the hob): into the pan (#160)
  if (item === chicken && pan?.onHob && !chicken.inPan && !fish?.inPan.length && (focused === pan.takeTarget || focused?.kind === 'hob'
    || (focused?.kind === 'place' && focused.point.distanceTo(world.hob.zone) < 0.35))) {
    focused = { name: 'kycklingen i pannan', kind: 'fry', verb: 'lägga', item: chicken };
    placeGhost.visible = false;
  }
  // a fish finger in the hand, aimed at the pan on the hob (or a fish finger in it, or the hob): into the pan (#214)
  if (item?.isFish && fish?.canFry(chicken?.inPan) && (focused === pan.takeTarget || focused?.kind === 'hob' || fish.inPan.some((f) => f.target === focused)
    || (focused?.kind === 'place' && focused.point.distanceTo(world.hob.zone) < 0.35))) {
    focused = { name: 'fiskpinnen i pannan', kind: 'fryfish', verb: 'lägga', item: fish };
    placeGhost.visible = false;
  }
  // looking into the open air fryer basket with a free hand: the fish finger in it nearest the look (#287)
  if (focused === airFryer.trayTarget && airFryer.open && !item && fish?.inFryer.length) {
    const near = fish.inFryer.map((f) => [f, f.middle(new THREE.Vector3()).distanceTo(focusPoint)]).sort((a, b) => a[1] - b[1])[0][0];
    focused = near.target;
  }
  // fries (#301): with a free hand, a look into the open basket takes a bunch; the bag in the hand pours a portion in;
  // a fish finger does not go in with them (one kind at a time)
  const atBasket = airFryer.open && (focused === airFryer.basketTarget || focused === airFryer.trayTarget || focused === airFryer.panelTarget
    || focused === fries?.takeTarget || !!fish?.inFryer.some((f) => f.target === focused));
  if (fries?.count && !item && focused === airFryer.trayTarget && airFryer.open) focused = fries.takeTarget;
  if (fries && item === fries.bag && atBasket) { focused = fries.pourTarget; placeGhost.visible = false; }
  if (fries?.count && item?.isFish && atBasket) { focused = { name: '', kind: 'airfry', blocked: true, blockedText: 'Korgen har pommes frites' }; placeGhost.visible = false; }
  // a fish finger in the hand, aimed at the open air fryer basket (or a fish finger in it): into the basket (#287)
  if (item?.isFish && !fries?.count && fish?.canAirfry() && (focused === airFryer.basketTarget || focused === airFryer.trayTarget || focused === airFryer.panelTarget || fish.inFryer.some((f) => f.target === focused))) {
    focused = { name: 'fiskpinnen i airfryern', kind: 'airfry', verb: 'lägga', item: fish };
    placeGhost.visible = false;
  }
  // the torn-off paper in the hand, aimed at a toilet: in it goes, flushed (#426)
  const paperAim = toiletPaper.aim(focused);
  if (paperAim) focused = paperAim;
  // the coffee ritual (#334): the jug at a running tap / with water at the Moccamaster, the full scoop at its filter
  const coffeeAim = coffeeJar && hit && focused === hit.object.userData.door ? coffeeJar.aim(item, focused) : null;
  if (coffeeAim) { focused = coffeeAim; placeGhost.visible = false; }
  // the jetpack (#359): no sitting down in the air; with nothing else to do, E / the action button stands it down
  if (player.flying && focused?.kind === 'rest') focused = null;
  if (!focused && !rest.active && jetpack.canTakeOff) focused = jetpack.dropTarget;
  // the remote in the hand, aimed at a TV: the click / the touch button are the remote's (#101)
  const remoteAim = heldItem() === remote && focused?.kind === 'tv';
  if (remoteAim) focused = null;
  showItemGhost(item); // the thing's own ghost where it would land (#368)
  // a bed with a seat in it: the verb of the spot the look ray picks
  const spot = focused?.kind === 'rest' ? chooseSpot(focused, raycaster.ray, null) : null;
  let verb = !focused ? '' : spot?.verb ?? focused.verb ?? (focused.isOpen ? 'stänga' : 'öppna');
  // a life-sim thing (#367): its actions; one = the usual prompt, several = the choice menu
  const rows = focused?.options ? shownRows(focused.options()) : null;
  showChoices(rows && rows.length > 1 && !reading ? rows : null, focused);
  const one = rows?.length === 1 ? rows[0] : null;
  if (one && !one.reason) verb = one.label;
  const named = one ? '' : ` ${focused?.name ?? ''}`; // (an action's label names its thing)
  if (choices.rows) { promptEl.textContent = ''; }
  else if (one?.reason) {
    actionBtn.textContent = promptEl.textContent = one.reason;
  } else if (focused?.blocked) {
    actionBtn.textContent = promptEl.textContent = focused.blockedText ?? 'Lägg ifrån dig det du håller först'; // or: the glass / cup is full (#167)
  } else if (focused && touch.enabled) {
    actionBtn.textContent = `${verb[0].toUpperCase()}${verb.slice(1)}${named}`;
  } else if (focused) {
    const own = heldItem()?.useLabel && !heldItem().useAlt && !heldItem().clickIsUse ? ` · högerklick: ${heldItem().useLabel.toLowerCase()}` : ''; // (#443)
    promptEl.textContent = clickIsE() ? `Klicka (E) för att ${verb}${named}${own}` : `Tryck E för att ${verb}${named}`;
  }
  const holding = !focused && heldItem()?.useLabel ? heldItem() : null; // touch: the button uses what you hold (fire, wave, light); a cup or the jug has no use of its own
  if (holding && touch.enabled) actionBtn.textContent = holding.useLabel;
  const seated = rest.active && !reading; // sitting / lying: E with nothing in reach gets you up; Space / C always do
  if (seated && !focused && !holding) actionBtn.textContent = 'Res dig';
  if (seated && !touch.enabled) promptEl.textContent = focused && !focused.blocked ? `${promptEl.textContent} · Mellanslag – res dig` : focused?.blocked ? promptEl.textContent : 'Tryck E för att resa dig';
  standBtn.hidden = !touch.enabled || !seated || (!focused && !holding);
  if (reading && touch.enabled) actionBtn.textContent = boardPanel.open ? 'Stäng tavlan' : 'Stäng lappen';
  promptEl.hidden = (!focused && !seated) || touch.enabled || reading || (!!choices.rows && !seated);
  const job = life.runner.job; // a timed life action going on (#372): what and how far
  if (job && !reading) { promptEl.textContent = `${job.label[0].toUpperCase()}${job.label.slice(1)} … ${Math.round(Math.min(1, job.t / Math.max(job.duration, 1e-6)) * 100)} %`; promptEl.hidden = false; }
  if (remoteAim && !touch.enabled && !reading) { promptEl.textContent = 'Klicka för att byta kanal · högerklick: av/på'; promptEl.hidden = false; }
  if (heldItem() === ball && !focused && !touch.enabled && !reading) { promptEl.textContent = 'Klicka för att skjuta · högerklick: studsa bollen'; promptEl.hidden = false; }
  actionBtn.hidden = !(focused || reading || holding || seated) || !touch.enabled || (!!choices.rows && !reading) || clockPanel.open || calPanel.open || blindPanel.open || sonos.open || !!viewing; // the strips have their own ×
  powerBtn.hidden = !touch.enabled || !heldItem()?.useAlt || reading;
  turnBtn.hidden = !touch.enabled || reading || focused?.kind !== 'place' || !!focused.blocked || !itemGhost.visible; // ⟳ (#368)
  if (!powerBtn.hidden) { const icon = heldItem().altIcon ?? '⏻'; if (powerBtn.textContent !== icon) { powerBtn.textContent = icon; powerBtn.setAttribute('aria-label', heldItem().altLabel ?? 'Stäng av / slå på TV:n'); } }
}

// --- furniture on/off (F / 🛋) ---------------------------------------------
function toggleFurniture(on = !world.furnitureOn) {
  life.interrupt('F'); // a timed life action stops (#372): nothing used before its commit
  if (rest.active) standUp(); // the seat is about to vanish
  if (!on) breaker.reset(); // whatever was shot to pieces is whole and home again (#263)
  world.setFurniture(on);
  if (!on) beer.show(false); else beer.show(beer.out); // the beer only once served (setFurniture showed it)
  if (!on) { // whatever is in the hand, or put down somewhere, goes home first (#102)
    heldItem()?.putBack(); toys.darts.hide();
    toiletPaper.reset(); // full rolls, the torn-off paper gone (#426)
    handWash.reset(); // (the kitchen towel goes with the loose items)
    fish?.reset(); // the fish fingers lying around are cleared away, the carton is full again (#162)
    airFryer.reset(); // off, the basket in and empty (#287)
    fries?.reset(); // the fries out of the basket and the hand, a full bag (#301)
    fruit.reset(); // every piece of fruit back in the bowl, whole (#326)
    for (const l of world.lids) if (l.kind === 'fridge' && l.isOpen) l.toggle(); // the fridge and freezer doors shut: no alarm (#288)
    rifle?.reset(); // the dropped magazines go, a full one in (#196)
    for (const h of holdables) if (h.placed) h.goHome();
    jetpack.goHome(); // back on its hook by the garage (#359)
    cups.reset(); // the cups standing out go, the cabinet is full again (#215)
    coffeeJar?.reset(); // the scoop in its loop, the Moccamaster's tank and filter empty (#334)
  }
  if (!on && cat.visible && !(cat.isMiele && (cat.released || cat.leaving))) cat.hide(); // (Miele, just put down, walks off, #328) // the cat goes too (and stops purring); none turn up until F is back
  if (!on) for (const t of world.furnitureTargets) if ((t.kind === 'tv' || t.kind === 'pc') && t.isOpen) t.toggle(); // screens off
  if (!on) for (const l of laptops) l.set(false); // Tilly's laptop too (#283)
  if (!on) nests.hush(); // the smart speakers stop talking (#325)
  if (!on) world.hob?.set(false); // the hob stays (Peab's kitchen), but off
  if (!on) chicken?.reset(); // home to the fridge, no smoke
  if (!on) { world.hood?.set(false); smokeAlarm.reset(); } // the fan off, the alarm quiet (#194)
  if (!on) { if (sonos.open) showSonos(false); sonos.stop(); } // the speakers go: the music stops
  if (!on) car.radio.stop(); // and the car's (#268)
  try { localStorage.setItem('lunden.furniture', on ? '1' : '0'); } catch { /* ignore */ }
}
world.looseItems.push(board.object, ...holdables.flatMap((h) => (h.homeParent ? [h.holder] : [h.holder, h.model])), ...toys.deco); // (the secretary's things go home into it with F, and the secret drawer shows one at a time, #183)
const milk = fridge?.milkAt ? new Milk(scene, camera, fridge) : null; // the milk carton in the fridge (#168): not hidden with F, only sent home
if (milk) holdables.push(milk);
holdables.push(miele); // Miele in your arms (#328): not a loose item (she is the cat)
if (fries) holdables.push(fries.bag); // the bag of fries in the freezer (#301): like the milk, not hidden with F, only sent home
world.looseItems.push(life.group, fruit.group, ...cups.cups.map((c) => c.model), drawing.paper, calendar.object, ...posters.groups, ...(fish ? [fish.object] : [])); // the cups and the paper go with F too // the cat board and the toys go with the furniture (F)
try { if (localStorage.getItem('lunden.furniture') === '0') toggleFurniture(false); } catch { /* ignore */ }
document.getElementById('furniture-btn').addEventListener('click', () => toggleFurniture());

// --- statistics panel: hidden; Tab held (like a scoreboard), T / 📊 toggle -------
// Counted events pop up as small badges instead.
const statsEl = document.getElementById('stats'), statsBody = document.getElementById('stats-body');
setBadgeElement(document.getElementById('badges'));
setScoreElement(document.getElementById('score')); // points, top left (#197)
let statsPinned = false;
// the minimap is part of the same "extra HUD" (#85): shown with the stats; K shows the map on its own
let mapPinned = false;
function showStats(show) {
  if (show && statsEl.hidden) renderStats(statsBody);
  statsEl.hidden = !show;
  if (!show) { statsEl.classList.remove('full'); document.getElementById('stats-full').textContent = '⤢'; } // full screen (#245) only until it is closed
  document.getElementById('minimap').hidden = !(show || mapPinned);
}
function toggleStats() { statsPinned = !statsPinned; showStats(statsPinned); }
const holdStats = (down) => showStats(down || statsPinned);
document.getElementById('stats-btn').addEventListener('click', () => toggleStats());
// touch (#245): ⤢ full screen and back, ✕ closes (the same as 📊 again)
document.getElementById('stats-full').addEventListener('click', () => {
  const full = statsEl.classList.toggle('full');
  document.getElementById('stats-full').textContent = full ? '⤡' : '⤢';
  statsEl.scrollTop = 0;
});
document.getElementById('stats-close').addEventListener('click', () => { statsPinned = false; showStats(false); });
document.getElementById('stats-reset').addEventListener('click', () => {
  if (confirm('Nollställa statistiken?')) { resetStats(); renderStats(statsBody); }
});
renderStats(statsBody);
setInterval(() => { if (!statsEl.hidden) renderStats(statsBody); }, 250);

// --- loop ----------------------------------------------------------------
const clock = new THREE.Clock();
let lastLevel = -1, lastRoom = null, mapTimer = 0, lastRoof = null, roofName = null;
const mapEl = document.getElementById('minimap');
const minimap = new Minimap(mapEl, world.roomMaps);
setRoomTotal(world.roomMaps.reduce((n, m) => n + new Set(m.rooms.map((r) => r.name)).size, 0) + garage.roomNames.length + 2); // + the garage's (#357), Trapphus and Hiss (#415)
function toggleMap() { // K: the map alone (Tab / T / 📊 show it with the stats)
  mapPinned = !mapPinned;
  mapEl.hidden = !(mapPinned || !statsEl.hidden);
}
mapEl.hidden = true; // hidden by default (#85); the old saved 'lunden.mapShown' is ignored
let detail = null; // small-detail culling (#189), set up once everything is built (below)
let lastHeld = null;
const tmpV = new THREE.Vector3();
function step(dt) {
  autoReload.update(dt);
  // Kaffeturbo (#217): faster feet, a wider view, the speakers turned down under the tune
  turbo.update(dt);
  player.boost = turbo.speed;
  const fov = 72 + TURBO.fov * turbo.k;
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  const clipsNear = laptops.some((l) => l.on && l.screen.getWorldPosition(tmpV).distanceTo(camera.position) < LAPTOP.near); // Tilly's clips playing near (#283)
  sonos.setDuck(turbo.active ? 0.3 : car.radio.playing && car.occupied ? CAR.music.duckHouse : clipsNear ? LAPTOP.duck : nests.talkingNear(camera.position) ? NEST.duck : 1); // (sitting in the car with its music on, #268)
  car.radio.setDuck(turbo.active ? 0.3 : 1);
  for (const d of world.doors) d.update(dt);
  for (const l of world.lids) l.update(dt);
  for (const t of taps) t.update(dt);
  // stepping into a running (cold!) shower: "iiiih!" once per visit
  const wet = taps.some((t) => t.hits(player.pos.x, player.pos.y, player.pos.z));
  if (wet && !inShower && performance.now() > shriekAt) { sfx.shriek(); shriekAt = performance.now() + 1500; }
  inShower = wet;
  animateWater(dt);
  lights.updateAuto(day.daylight * (1 - 0.6 * weather.overcast), dt); // under rain clouds the small lamps come on earlier (#248)
  lights.update(player.aloft ? -1 : Math.max(0, player.level), player.pos, dt, camera.getWorldDirection(lookDir)); // (looking towards a lamp keeps its pool light, #276)
  day.dim = blinds.update(dt, { level: Math.max(0, player.level), room: player.outdoors ? null : world.roomAt(Math.max(0, player.level), player.pos.x, player.pos.z),
    outdoors: player.outdoors, daylight: day.daylight, sunDir: day.sunDir, overcast: weather.overcast, lit: (lv, name) => lights.roomLit(lv, name) }); // blinds drawn up: less daylight in the room (#273)
  if (blindPanel.open) blindPanel.render();
  photoGlow(day.daylight * (1 - 0.5 * weather.overcast), lights.roomLit(1, 'Sovrum 1')); // Miele's photo reads like a lit print (#327)
  core.update(dt, player, camera); // the stairwell's doors, the lift, drawn only near (#415)
  garage.update(dt, player, camera, car); // its door (#358), the förråd doors, the tubes' motion sensor, drawn only near (#357)
  day.under = garage.under; // down there no daylight
  day.lit = garage.lit; // … but the tubes' light on the cars (#440)
  day.update(dt);
  wallClock.update(day.hour);
  calendar.update(); // redraws only when the page or the date changed
  patio.update(day, dt);
  applySeason(day.month); // tree colours, snow (only does work when the month changes)
  for (const t of world.furnitureTargets) t.update?.(dt);
  nests.update(dt); // the smart speakers: talk, wake lights, the display (#325)
  for (const h of holdables) h.update(dt);
  grill.update(dt);
  airFryer.update(dt);
  if (fish) fish.freezer.paused = !noteEl.hidden; // reading the note on the freezer door counts as using it (#288)
  smokeAlarm.update(dt, !!chicken?.freeSmoke || !!fish?.fryerSmoke || !!fries?.smoke); // smoke the hood does not draw away (#194); a burning air fryer (#287)
  cat.ownHand = !!heldItem(); // petting with a thing in the hand: the cat shows a free hand of its own (#242)
  const petting = cat.ownHand ? null : cat.petHand(petAt);
  player.kneel = !!petting && petting.y < player.pos.y + 0.7; // down on your knees to stroke a cat on the floor (#242)
  handWash.update(dt); // washing / drying the hands, wet hands drying by themselves (#437)
  hand.update(dt, heldItem(), petting); // the arm: holding something, petting the cat, or reaching for what E was used on (#195)
  cups.update(dt);
  fish?.update(dt);
  toiletPaper.update(dt);
  fries?.update(dt);
  fruit.update(dt);
  life.update(dt);
  toys.update(dt);
  marks.update(dt);
  breaker.update(dt);
  balls.update(dt);
  target.update(dt, world.furnitureOn && !!heldItem()?.hitsTarget); // the target rises with a blaster, the saber or a wand in the hand (#144, #179)
  hoop.update(dt, world.furnitureOn && (ball.out || params0.has('hoop'))); // the hoop stands out front while the basketball is out of its holder
  if (clockPanel.open) clockPanel.render();
  sonos.update(player.aloft ? -1 : player.level, (p) => behindWall(p)); // (up on the roof: muffled as from outside, #360) // music: schedule ahead, walls muffle (#187)
  world.windowLights.update(day.hour, 1 - day.daylight);
  car.occupied = !!rest.target?.car; // sitting in it: the screens stay awake (#250)
  car.update(dt, day.daylight < 0.35, player);
  const moved = Math.hypot(player.pos.x - lastWeatherPos.x, player.pos.z - lastWeatherPos.z); // on foot (not a jump / spawn)
  lastWeatherPos.copy(player.pos);
  weather.update(dt, !player.outdoors || player.below || player.inCore, moved < 1 ? moved : 0); // (the garage: dry and muffled, #357) // after the day: it sets the overcast / flash the next day.update applies (#248)
  people.update(dt, weather.rain > WEATHER.people ? 0 : day.daylight, day.month, player); // they go in when it pours
  greet.update(dt); // greetings and answers (#247)
  cat.update(dt);
  checkCatButt();
  checkMiele();
  fireworks.update(dt);
  measure.update(dt, window.innerWidth, window.innerHeight);
  if (active() && reading) updateFocus();
  else if (drawing.active) drawing.update(dt); // drawing: the camera over the paper, nothing else moves you
  else if (active() && rest.active) { rest.update(dt); updateFocus(); } // sitting / lying: look, no walking
  else if (fall.active) fall.update(dt); // hurt by a fall (#361): no walking until awake outside the door
  else if (active()) {
    fall.update(dt); // (the fade back in)
    player.analog.x = touch.analog.x;
    player.analog.y = touch.analog.y;
    player.update(dt);
    stickEl.classList.toggle('sprint', touch.enabled && player.sprinting); // joystick knob turns green
    footsteps();
    updateFocus();
  }
  jetpack.update(dt); // flames, smoke, the roar, the heat bar; stood down at the door (#359)
  const outside = player.outdoors; // (the loftgång and the terraces over the flat too, #360)
  // up on a roof (#360): the first time on each one counts; the HUD names it
  const roof = outside && player.aloft && !player.fall ? world.roofs.standingOn(player.pos.x, player.pos.z, player.pos.y) : null;
  if (roof && roof.id !== lastRoof && active()) bump('roofs', 1, roof.id);
  if (roof || !player.fall) lastRoof = roof?.id ?? null;
  if (roof) roofName = roof.name; else if (!player.aloft) roofName = null;
  const lvl = outside ? -1 : player.level;
  const room = lvl < 0 ? null : world.roomAt(lvl, player.pos.x, player.pos.z);
  if (room && active()) visitRoom(`${lvl}:${room}`);
  const under = !outside ? null : player.inCore ? `Hus L · ${core.roomAt(player.pos.x, player.pos.z, player.pos.y)}` // the stairwell, the lift (#415)
    : player.below ? `Under gården · ${garage.roomAt(player.pos.x, player.pos.z)}` : null; // the garage, the förråd, the lobby (#357)
  if (under && active()) visitRoom(`g:${under.split(' · ')[1]}`);
  if (room !== lastRoom && room) lastRoom = room; // keep the last name while inside a doorway
  mapTimer -= dt;
  if (mapTimer <= 0 && !mapEl.hidden) {
    mapTimer = 0.1;
    minimap.draw(lvl, lastRoom, player.pos.x, player.pos.z, camera.rotation.y);
  }
  if (active() && !outside) bump('seconds', dt);
  if (lvl !== lastLevel && lvl >= 0 && lastLevel >= 0) bump('stairs');
  if (lvl < 0) lastRoom = null;
  const label = `${lvl < 0 ? under ? under : `Utomhus${roofName ? ` · ${roofName}` : ''}` : `${LEVELS[lvl].name}${lastRoom ? ` · ${lastRoom}` : ''}`} · ${day.clock}${weather.icon}`;
  if (lvl !== lastLevel || label !== levelEl.textContent) {
    levelEl.textContent = label;
    lastLevel = lvl;
  }
  const held = heldItem();
  if (held !== lastHeld) { lastHeld = held; detail?.refresh(); } // a thing taken from afar is drawn in the hand at once
  detail?.update(camera); // far-away small things are not drawn (#189)
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
const frontDoor = world.doors.find((d) => d.name === 'ytterdörren' && Math.abs(d.object.getWorldPosition(new THREE.Vector3()).z) < 0.5);
detail = new DetailCuller(scene, { W: world.size.x, D: world.size.z, roof: world.openings.roof, floor1: LEVELS[1].floor, doorHeight: DOOR_HEIGHT }, world.openings, () => frontDoor.t > 0.02); // everything is built by now (the holdables too); the open front door shows the hall (#210)
// Warm-up (#432): the first time the inside of the flat is drawn (opening the front door after a fresh start shows
// what the detail culler kept on its hidden layer) three compiled the shadow-depth programs and uploaded the geometry
// and textures of everything in it in one frame — a freeze of a couple of seconds. So a few frames in (after
// lampwash has patched the materials: the programs compiled are the final ones), while the start screen / "Laddar…"
// is up, every material's program is compiled (compileAsync: in parallel where the GPU can) and then ONE frame is
// drawn with every layer and no frustum culling, shadows included, which uploads the rest; the next frame draws
// over it. Headless test browsers skip it (minutes of SwiftShader, nobody looks), `&warm` forces it.
let warmIn = (/HeadlessChrome/.test(navigator.userAgent) && !params.has('warm')) ? -1 : 3, warmDraw = false;
function warmUp() {
  const t = performance.now();
  renderer.compileAsync(scene, camera).catch(() => {}).then(() => { warmDraw = true; if (perfEl) console.log(`warm-up: programs ${Math.round(performance.now() - t)} ms`); });
  clock.getDelta(); // (a slow frame here is no reason to lower the resolution)
}
function warmRender() {
  const t = performance.now(), culled = [];
  scene.traverse((o) => { if (o.frustumCulled) { o.frustumCulled = false; culled.push(o); } });
  camera.layers.enableAll();
  renderer.shadowMap.needsUpdate = true;
  renderer.render(scene, camera);
  camera.layers.set(0);
  for (const o of culled) o.frustumCulled = true;
  renderer.shadowMap.needsUpdate = true; // the real view's shadows next
  clock.getDelta();
  if (perfEl) console.log(`warm-up: first draw of everything ${Math.round(performance.now() - t)} ms`);
}
renderer.setAnimationLoop(() => {
  const raw = clock.getDelta(), dt = Math.min(raw, 0.05);
  if (!overlay.hidden || document.hidden || shotMode) dynRes.slow = dynRes.fast = 0; // only while playing (not &shot)
  else adaptResolution(raw);
  if (warmIn > 0 && --warmIn === 0) warmUp();
  if (warmDraw) { warmDraw = false; warmRender(); }
  step(dt);
  updateShadows(dt);
  // one mirror image at a time, and none once the frame rate has made us lower the resolution
  updateReflections(camera, player.aloft ? -1 : Math.max(0, player.level), dynRes.ratio >= MAX_PIXEL_RATIO * 0.99);
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
/** Where the visitor is, for a reload: place, view, mute, mode (none = still on the first start screen), the build. */
const placeNow = () => ({ x: player.pos.x, z: player.pos.z, feetY: player.pos.y, yaw: camera.rotation.y, pitch: camera.rotation.x,
  hour: day.hour, month: day.month, muted: isMuted(), fullscreen: !!document.fullscreenElement, build: BUILD,
  mode: locked ? 'mouse' : touch.enabled ? 'touch' : (!armEl.hidden || played) ? 'mouse' : undefined });
// F5 carries on (#203): the place goes to this tab's sessionStorage every 2 s and when the page goes away
const keepSession = () => { if (played && !resetHome.going) saveSession(placeNow()); };
setInterval(keepSession, 2000);
window.addEventListener('pagehide', keepSession);
window.addEventListener('pagehide', () => { if (life.dirty) life.flush(); }); // the life sim's stock (#371)
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') keepSession(); });
// Ctrl+W by mistake (#274): the browser keeps Ctrl+W to itself, so while a visit runs (not on the start screen) leaving
// the page asks first; the page's own reloads (a new version, "Ladda om") set `reloading` and go through
let reloading = false;
// F5 / Ctrl+R mid-visit is a reload that carries on (#203), not leaving: no question for it (the browser's own reload
// button cannot be told from closing the tab, so that one still asks)
window.addEventListener('keydown', (e) => {
  if (e.code === 'F5' || (e.code === 'KeyR' && (e.ctrlKey || e.metaKey))) reloading = true;
}, true);
window.addEventListener('beforeunload', (e) => {
  if (reloading || !played || !overlay.hidden) return;
  e.preventDefault();
  e.returnValue = '';
});
// In fullscreen made by the page (Touch start, a resumed fullscreen visit) Chromium lets it take the game keys, Ctrl+W too
const GAME_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyC', 'KeyE', 'KeyQ', 'KeyF', 'KeyT', 'KeyM', 'KeyK', 'Space', 'Tab',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement) navigator.keyboard?.lock?.(GAME_KEYS).catch(() => {});
  else navigator.keyboard?.unlock?.();
});
// "Återställ" (#303): asks first, then every local 'lunden.*' key but the whitelist goes (reset.js, RESET_KEEP: never
// the cloud's queue, drawings, the score or the name) and the page reloads clean — no resume or F5 record, so it is a
// fresh first visit: START, the real time, everything shut, off and at home. The new page says "Hemmet är återställt".
const resetEl = document.getElementById('reset-confirm');
const resetHome = {
  going: false,
  go(url) { location.replace(url); }, // (tests replace this)
  ask() { resetEl.hidden = false; },
  cancel() { resetEl.hidden = true; },
  confirm() {
    if (this.going) return;
    this.going = true; // no F5 record on the way out (keepSession)
    reloading = true; // no "leave the page?" question
    clearLocalHome();
    this.go(location.href);
  },
};
onTap(document.getElementById('reset-home'), () => resetHome.ask());
onTap(document.getElementById('reset-no'), () => resetHome.cancel());
onTap(document.getElementById('reset-yes'), () => resetHome.confirm());
document.addEventListener('keydown', (e) => { if (e.code === 'Escape' && !resetEl.hidden) { e.preventDefault(); resetHome.cancel(); } });
if (takeResetDone()) document.getElementById('reset-done').hidden = false;
onTap(document.getElementById('update-reload'), () => {
  reloading = true;
  saveResume({ ...placeNow(), build: null, world: keepWorld() }); // a new version for sure; the world as it is (#277)
  const url = new URL(location.href);
  url.searchParams.set('v', latestVersion ?? Date.now());
  location.replace(url.href);
});
onTap(document.getElementById('update-close'), () => { updateEl.hidden = true; });
document.addEventListener('pointerlockchange', () => { if (!updateEl.hidden) showUpdate(); });
// A new version (#192): no button to press — once the visitor has been still for a moment (no keys, stick, mouse
// or touch, not walking, no panel open, no music playing, nothing time-bound going on) "Uppdateras om 5 … 1" counts
// down at the top (#277); any input or movement cancels it ("Uppdatering avbruten") and the stillness starts over.
// Then the picture fades out, the place and the world's state (keep.js: the car on its way, what you hold, doors,
// lamps, sitting, the clock …) are saved and the new version loads; it fades back in where they were with "Ny version
// laddad". Never still for AUTO_RELOAD.fallback s: the old notice with its "Ladda om" button.
const fadeEl = document.getElementById('fade');
const countEl = document.getElementById('countdown');
const autoReload = {
  version: null, still: 0, since: 0, going: false, count: null, cancelT: 0, last: new THREE.Vector3(),
  go(url) { location.replace(url); }, // (tests replace this)
  poke() { this.still = 0; if (this.count !== null) this.cancel(); },
  /** Input or movement during the countdown: called off, said so briefly. */
  cancel() {
    this.count = null; this.still = 0;
    countEl.textContent = 'Uppdatering avbruten';
    countEl.hidden = false;
    clearTimeout(this.cancelT);
    this.cancelT = setTimeout(() => { if (this.count === null) countEl.hidden = true; }, AUTO_RELOAD.cancelled * 1000);
  },
  /** Something time-bound that a reload would cut short (and keep.js does not keep): wait for it to end. */
  get waiting() {
    return !!(jetpack.flying || world.lids.find((l) => l.kind === 'coffee')?.isOpen || chicken?.smoking || (world.hob?.on && pan?.onHob)
      || airFryer.running || toaster?.toasting || life.runner.busy || grill.on || turbo.active || car.radio.playing || ball.flying || nests.talking);
  },
  update(dt) {
    if (!this.version || this.going) return;
    const moved = player.pos.distanceTo(this.last) > 0.01;
    this.last.copy(player.pos);
    const busy = moved || player.keys.size || touch.analog.x || touch.analog.y || reading || drawing.active || sonos.playing || this.waiting;
    if (busy) { if (this.count !== null) this.cancel(); this.still = 0; } else this.still += dt;
    if ((performance.now() - this.since) / 1000 > AUTO_RELOAD.fallback && updateEl.hidden) showUpdate(this.version);
    if (this.count === null) {
      if (this.still < AUTO_RELOAD.still) return;
      this.count = AUTO_RELOAD.countdown;
      clearTimeout(this.cancelT);
      countEl.hidden = false;
    }
    this.count -= dt;
    if (this.count > 0) { countEl.textContent = `Uppdateras om ${Math.ceil(this.count)}`; return; }
    this.count = null;
    countEl.hidden = true;
    this.going = true;
    fadeEl.style.transition = `opacity ${AUTO_RELOAD.fade}s`;
    fadeEl.hidden = false;
    void fadeEl.offsetWidth; // (a reflow, so the change of opacity is animated)
    fadeEl.style.opacity = '1';
    setTimeout(() => {
      saveResume({ ...placeNow(), build: null, world: keepWorld() }); // a new version for sure; the world as it is (#277)
      reloading = true;
      const url = new URL(location.href);
      url.searchParams.set('v', this.version);
      this.go(url.href);
    }, AUTO_RELOAD.fade * 1000 + 50);
  },
};
for (const ev of ['keydown', 'mousedown', 'pointerdown', 'wheel']) window.addEventListener(ev, () => autoReload.poke(), { capture: true, passive: true });
window.addEventListener('mousemove', (e) => { if (Math.abs(e.movementX) + Math.abs(e.movementY) > 2) autoReload.poke(); }, { passive: true });
watchForUpdates((v) => { autoReload.version = v; autoReload.since = performance.now(); autoReload.still = 0; });

// After "Ladda om" mid-visit (#181): no start screen. Touch plays at once (sound and fullscreen wait for the
// first touch: they need a gesture); mouse & keyboard gets the "Klicka för att fortsätta" cover (pointer lock
// needs a click). A short "Ny version laddad" fades out at the top. F5 carries on the same way from the tab's running
// record (#203), with the note only when the build changed; a new visit finds no record.
const reloadedEl = document.getElementById('reloaded');
const RELOAD_NOTE_S = 3; // seconds the "Ny version laddad" note stays before it fades
function continueAfterReload(r) {
  played = true;
  if (r.build !== BUILD) { // fade back in from the dark the page left in (#192)
    fadeEl.style.transition = 'none'; fadeEl.style.opacity = '1'; fadeEl.hidden = false;
    void fadeEl.offsetWidth;
    fadeEl.style.transition = 'opacity 0.6s'; fadeEl.style.opacity = '0';
    setTimeout(() => { fadeEl.hidden = true; }, 900);
  }
  if (r.muted && !isMuted()) updateMute(toggleMuted());
  if (r.mode === 'touch') {
    touch.enabled = true;
    showOverlay(false);
    window.addEventListener('pointerdown', () => {
      initAudio();
      if (r.fullscreen) document.documentElement.requestFullscreen?.().then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
    }, { once: true, capture: true });
  } else {
    overlay.hidden = true;
    armEl.hidden = false; // the next click takes the mouse (pointer lock needs a gesture)
  }
  if (r.build === BUILD) return; // F5 on the same version: straight back in, no note (#203)
  reloadedEl.hidden = false;
  reloadedEl.classList.remove('gone');
  setTimeout(() => reloadedEl.classList.add('gone'), RELOAD_NOTE_S * 1000);
  setTimeout(() => { reloadedEl.hidden = true; }, RELOAD_NOTE_S * 1000 + 700);
}
// the world's state for a reload made by the page (#277, keep.js): what each part needs
const keepApp = { life, jetpack, car, world, lights, day, grill, sonos, patio, holdables, cups, beer, chicken, scene, rest, cat, BREEDS, VARIANTS,
  sitAt: (target, spot, stand) => sitAt(target, spot, stand, true) };
function keepWorld() { try { return saveWorld(keepApp); } catch (e) { console.warn('keep', e); return null; } }
if (resumeOk && resumed.mode && resumed.world) loadWorld(keepApp, resumed.world); // mid-visit only: the game's clock too (a new visit: real time, #143)
if (resumeOk && resumed.mode) continueAfterReload(resumed);
// &life (#365): the life simulator's developer scenario — a cleared worktop, a few test things, never saved (life.js)
if (lifeDev()) devScenario({ life, world, holdables, cups, things, milk, fish, fries, fruit, airFryer, beer, cat, day, player, camera, at: !!at, timeGiven: params0.has('time'), keepOpen: params0.has('open') });
document.documentElement.classList.remove('resuming'); // the page is ready: off with the "Laddar…" cover (#222)

// handle for tests/debugging (tools/touchtest.html)
window.__app = { handWash, click, clickIsE, toiletPaper, lifeStores, placement: { ghost: itemGhost, ring: placeGhost, turn: turnPlacement, target: () => (focused?.kind === 'place' ? focused : null) }, jetpack, toaster, life, choices, runChoice, moveChoice, focus: () => ({ focused, focusPoint, raycaster }), fall, todo, coffeeJar, miele, fireworks, nests, fruit, resetHome, bump, fries, keepWorld, countEl, airFryer, blinds, blindPanel, showBlind, pingping, breaker, weather, greet, people, ball, hoop, hand, totalScore, leaderboard, turbo, grill, autoReload, smokeAlarm, cloud, detail: () => detail, secret, sillPots, takeDownPoster, throwPoster, showPoster, balls, car, sonos, showSonos, milk, fridge, fish, posters, heldDrawing, takeDrawing, chicken, pan, reloadedEl, things, realNow, beer, book, showBook, reflectors, updateReflections, target, marks, remote, toggleFurniture, calendar, calPanel, showCalendar, drawing, beginDraw, endDraw, cups, toys, heldItem, stairHeight, stats, saber, rest, standUp, renderer, scene, player, world, camera, touch, step, showUpdate, cat, useDoor, use, note, showNote, measure, taps, board, lights, day, wallClock, clockPanel, showClock, patio };

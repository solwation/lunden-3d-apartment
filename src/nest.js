import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { NEST as N } from './config.js';
import { sfx, isMuted } from './audio.js';

// Smart speakers (#325): a smart display with a screen on the kitchen window board and two round speakers in wall mounts
// (the living room by the patio door, the upstairs hall). Our own plain look in chalk fabric: no logo, no wordmark.
// E on one wakes it: four white dots light up (the display: its screen), a chime, then a made-up answer in Swedish —
// the game's time, date and weather, the coffee, jokes, facts about Lund, Höje å and cats, pep talks, silliness, or just
// a sound (a fanfare, a drum roll, a boop); never the same twice in a row. Speech is the browser's own (Web Speech API,
// sv-SE, as in greet.js; silent when muted); the words show in a bubble over a round one and as a caption card on the
// display. Idle, the display shows a clock and the weather, now and then Miele's photo, dimmed by night; its canvas is
// redrawn only when something on it changes. The builders (nesthub / nestmini) are furniture (FURNITURE in config): a
// loose item, hidden with F; `Nests` (main.js) answers and animates them.

const TAU = Math.PI * 2;
const HOURS = ['tolv', 'ett', 'två', 'tre', 'fyra', 'fem', 'sex', 'sju', 'åtta', 'nio', 'tio', 'elva'];
const WEEKDAYS = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'];
const MONTHS = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];

/** The time in words, the way a Swede says it ("kvart över sju på kvällen"), to the nearest five minutes. */
export function timePhrase(hour) {
  const total = Math.round((((hour % 24) + 24) % 24) * 60) % 1440, r = Math.round(total / 5) * 5;
  const h = Math.floor(r / 60) % 24, m = r % 60, H = (k) => HOURS[k % 12];
  const words = { 0: H(h), 5: `fem över ${H(h)}`, 10: `tio över ${H(h)}`, 15: `kvart över ${H(h)}`, 20: `tjugo över ${H(h)}`,
    25: `fem i halv ${H(h + 1)}`, 30: `halv ${H(h + 1)}`, 35: `fem över halv ${H(h + 1)}`, 40: `tjugo i ${H(h + 1)}`,
    45: `kvart i ${H(h + 1)}`, 50: `tio i ${H(h + 1)}`, 55: `fem i ${H(h + 1)}` }[m];
  const hh = m >= 25 ? (h + 1) % 24 : h; // the hour it is said by
  const part = hh < 5 ? 'på natten' : hh < 10 ? 'på morgonen' : hh < 12 ? 'på förmiddagen' : hh < 18 ? 'på eftermiddagen' : 'på kvällen';
  return `${r !== total ? 'ungefär ' : ''}${words} ${part}`;
}
const hhmm = (hour) => { const t = Math.floor((((hour % 24) + 24) % 24) * 60); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };

/** Lines that need no state: [key, text]. */
const LINES = [
  ['joke-wall', 'Vad sa den ena väggen till den andra? Vi ses i hörnet!'],
  ['joke-lemon', 'Vad kallas en katt som har ätit en citron? En surkatt.'],
  ['joke-pirate', 'Vilken bokstav gillar pirater bäst? Rrrrr!'],
  ['joke-eight', 'Vad sa nollan till åttan? Snyggt bälte!'],
  ['joke-snowman', 'Vad äter snögubbar till frukost? Snöflingor, förstås.'],
  ['joke-napkin', 'Hur får man en servett att skratta? Man kittlar den tills den viker sig.'],
  ['lund-cathedral', 'Lunds domkyrka invigdes år elvahundrafyrtiofem. Den är alltså nästan niohundra år gammal.'],
  ['lund-clock', 'I Lunds domkyrka finns ett astronomiskt ur. Varje dag spelar det en melodi och små figurer rör sig.'],
  ['lund-university', 'Lunds universitet grundades år sextonhundrasextiosex. Det är ett av Nordens äldsta.'],
  ['lund-old', 'Lund är över tusen år gammalt. Här fanns en stad redan på vikingatiden.'],
  ['hoje', 'Höje å rinner från Vombsjön ut i Öresund vid Lomma. Den går precis söder om oss.'],
  ['stlars', 'Där vi bor hette det förr Sankt Lars sjukhus. De gamla tegelhusen står kvar runt parken.'],
  ['cat-sleep', 'Katter sover ungefär sexton timmar om dygnet. Nästan lika mycket som tonåringar.'],
  ['cat-sweet', 'Katter kan inte känna söt smak. Godis bryr de sig inte om – men fiskpinnar, däremot!'],
  ['cat-whiskers', 'En katts morrhår är ungefär lika breda som katten. Så vet den om den får plats.'],
  ['cat-purr', 'När en katt spinner vibrerar den mellan tjugofem och hundrafemtio gånger i sekunden.'],
  ['pep-water', 'Du är bra precis som du är. Och glöm inte att dricka vatten!'],
  ['pep-stretch', 'Dags att sträcka på dig! Upp med armarna … och ner igen. Snyggt!'],
  ['pep-day', 'Det här blir en fin dag. Jag känner det i alla mina mikrofoner.'],
  ['silly-catflap', 'Söker efter kattlucka … Ingen kattlucka hittades.'],
  ['silly-plants', 'Jag har räknat alla krukväxter i huset. De är … väldigt många.'],
  ['silly-fish', 'Förlåt, jag lyssnade inte. Jag tänkte på fiskpinnar.'],
  ['silly-meow', 'Uppdatering klar: jag kan nu säga mjau på fyra språk. Mjau. Miaou. Meow. Miau.'],
  ['silly-pingping', 'Påminnelse: någon borde krama Pingping i dag.'],
  ['silly-hands', 'Jag skulle gärna hjälpa till med disken, men jag har inga händer.'],
];
/** Answers without words: [key, caption, sfx.nest kind]. */
const SOUNDS = [['fanfare', '🎺 Ta-da!', 'fanfare'], ['drumroll', '🥁 Trumvirvel …', 'drumroll'], ['boop', 'Boop!', 'boop']];

/** A material that glows white for the dots (one per dot: they pulse out of step). */
const dotMat = () => new THREE.MeshBasicMaterial({ color: N.dots, transparent: true, opacity: 0, toneMapped: false, depthWrite: false });

/** The round speaker in its wall mount (a builder). Local: the wall at z 0, facing +z, the centre at y 0 (item.y up). */
export function nestmini(item) {
  const g = new THREE.Group(), { r, h, mount } = N.mini;
  const fabric = new THREE.MeshStandardMaterial({ color: N.fabric, roughness: 0.95 });
  const shell = new THREE.MeshStandardMaterial({ color: N.shell, roughness: 0.45 });
  const lathe = (pts, m) => { const o = new THREE.Mesh(new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 40).rotateX(Math.PI / 2), m); o.position.z = mount; o.castShadow = true; return o; };
  // the puck: a shell at the back, the fabric dome in front (heights along +z)
  const body = new THREE.Group();
  body.add(lathe([[0, 0], [r * 0.93, 0], [r * 0.99, h * 0.12], [r, h * 0.5]], shell));
  body.add(lathe([[r, h * 0.5], [r * 0.985, h * 0.72], [r * 0.9, h * 0.9], [r * 0.6, h * 0.985], [0, h]], fabric));
  // the mount: a back plate on the wall and a lip round the puck; a short cord down into a cable cover
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.75, r * 0.75, mount, 32).rotateX(Math.PI / 2), shell);
  plate.position.z = mount / 2;
  const lip = new THREE.Mesh(new THREE.TorusGeometry(r + 0.002, 0.0035, 8, 40), shell);
  lip.position.z = mount + h * 0.25;
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.12, 8), new THREE.MeshStandardMaterial({ color: 0xf2f1ee, roughness: 0.6 }));
  cord.position.set(0, -r - 0.06, 0.004);
  const cover = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.012), shell);
  cover.position.set(0, -r - 0.125, 0.006);
  body.add(plate, lip, cord, cover);
  body.traverse((m) => { if (m.isMesh) m.receiveShadow = true; }); // (#609: the low sun lit it through the house)
  g.add(body);
  // four white dots in a row on the front
  const dots = [-1.5, -0.5, 0.5, 1.5].map((k) => {
    const d = new THREE.Mesh(new THREE.CircleGeometry(0.0034, 14), dotMat());
    d.position.set(k * 0.011, 0, mount + h * 0.985 + 0.0012);
    g.add(d);
    return d;
  });
  g.position.y = item.y ?? 1.6;
  const self = new Speaker('mini', g, { dots, room: item.room });
  g.userData.keep = [...dots];
  g.userData.footprint = [];
  g.userData.interact = self.target;
  g.userData.nest = self;
  return g;
}

/** The smart display (a builder): a fabric speaker base and a screen leaning back over its front. Local: facing +z, the
 * bottom centre at the origin (item.y = the board). */
export function nesthub(item) {
  const g = new THREE.Group(), H = N.hub, B = H.base;
  const fabric = new THREE.MeshStandardMaterial({ color: N.fabric, roughness: 0.95 });
  const shell = new THREE.MeshStandardMaterial({ color: N.shell, roughness: 0.4 });
  const base = new THREE.Mesh(new RoundedBoxGeometry(B.w, B.h, B.d, 3, 0.022), fabric);
  base.position.set(0, B.h / 2, -0.012); base.castShadow = base.receiveShadow = true;
  const foot = new THREE.Mesh(new RoundedBoxGeometry(B.w - 0.01, 0.006, B.d - 0.01, 2, 0.003), new THREE.MeshStandardMaterial({ color: 0x9a9893, roughness: 0.8 }));
  foot.position.set(0, 0.003, -0.012);
  g.add(base, foot);
  // the screen: white-backed panel tilted back about its bottom edge, the display on its front
  const tilt = new THREE.Group();
  tilt.position.set(0, H.lift, B.d / 2 - 0.012 + 0.006);
  tilt.rotation.x = -THREE.MathUtils.degToRad(H.lean);
  const panel = new THREE.Mesh(new RoundedBoxGeometry(H.w, H.h, H.d, 2, 0.004), shell);
  panel.position.set(0, H.h / 2, -H.d / 2); panel.castShadow = true;
  const bezel = new THREE.Mesh(new THREE.PlaneGeometry(H.w - 0.006, H.h - 0.006), new THREE.MeshStandardMaterial({ color: 0xf4f3f0, roughness: 0.35 }));
  bezel.position.set(0, H.h / 2, 0.0004);
  const [W, Hp] = H.px;
  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: Hp });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const screenMat = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(...H.screen), screenMat);
  screen.position.set(0, H.h / 2 + 0.003, 0.0008);
  tilt.add(panel, bezel, screen);
  for (const m of [foot, panel, bezel]) m.receiveShadow = true; // (#609: the bezel glowed in the evening sun through the house)
  g.add(tilt);
  g.position.y = item.y ?? 0;
  const self = new Speaker('hub', g, { screen, canvas, texture, room: item.room });
  g.userData.keep = [screen];
  g.userData.footprint = [];
  g.userData.interact = self.target;
  g.userData.nest = self;
  return g;
}

const tmp = new THREE.Vector3();

/** One speaker: its wake light, its talking state, the display's canvas (hub). */
class Speaker {
  constructor(type, object, extra) {
    Object.assign(this, { type, object, ...extra, wake: 0, talkT: 0, chimeT: 0, answer: null, t: 0, stamp: '', drawAcc: 0 });
    this.target = {
      kind: 'nest', nest: this, pickable: object, object,
      name: type === 'hub' ? 'den smarta skärmen' : 'den smarta högtalaren', verb: 'prata med',
      get isOpen() { return false; },
      toggle: () => { this.onPress?.(this); return true; },
    };
  }
  /** World position (sounds, distance, the bubble). */
  pos(out = tmp) { return this.object.getWorldPosition(out); }
  get talking() { return this.chimeT > 0 || this.talkT > 0; }
}

/** The hub's screen: idle clock + weather, Miele's photo now and then, a caption card while it talks. */
function drawHub(sp, st) {
  const g = sp.canvas.getContext('2d'), [W, H] = N.hub.px;
  if (st.mode === 'photo' && st.photo) {
    const im = st.photo, k = Math.max(W / im.naturalWidth, H / im.naturalHeight), w = im.naturalWidth * k, h = im.naturalHeight * k;
    g.drawImage(im, (W - w) / 2, (H - h) / 2, w, h);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, H - 52, W, 52);
    g.fillStyle = '#fff'; g.font = '600 30px system-ui, sans-serif'; g.textAlign = 'left'; g.fillText(st.clock, 18, H - 16);
    g.font = '18px system-ui, sans-serif'; g.textAlign = 'right'; g.fillText('Miele', W - 18, H - 20); g.textAlign = 'left';
    return;
  }
  const gr = g.createLinearGradient(0, 0, W, H);
  gr.addColorStop(0, '#1d2633'); gr.addColorStop(1, '#2f3d4f');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  if (st.mode === 'talk') {
    // the four dots pulsing over a caption card
    for (let i = 0; i < 4; i++) {
      const a = 0.5 + 0.5 * Math.sin(st.t * 7 - i * 0.9);
      g.fillStyle = `rgba(255,255,255,${0.35 + 0.65 * a})`;
      g.beginPath(); g.arc(W / 2 + (i - 1.5) * 26, 34 - 6 * a, 8, 0, TAU); g.fill();
    }
    g.fillStyle = '#f6f4ef';
    roundRect(g, 22, 62, W - 44, H - 84, 18); g.fill();
    g.fillStyle = '#1f2630'; g.font = '600 26px system-ui, sans-serif';
    wrap(g, st.caption, 44, 104, W - 88, 33, 5);
    return;
  }
  // idle: the clock, the date, the weather
  g.fillStyle = '#fff'; g.font = '300 96px system-ui, sans-serif'; g.textAlign = 'left';
  g.fillText(st.clock, 30, 130);
  g.font = '24px system-ui, sans-serif'; g.fillStyle = 'rgba(255,255,255,0.8)';
  g.fillText(st.date, 34, 176);
  weatherIcon(g, st.weather, W - 92, 92);
  g.font = '22px system-ui, sans-serif'; g.textAlign = 'center'; g.fillStyle = 'rgba(255,255,255,0.85)';
  g.fillText(st.weatherText, W - 92, 176); g.textAlign = 'left';
  if (st.mode === 'wake') for (let i = 0; i < 4; i++) { g.fillStyle = '#fff'; g.beginPath(); g.arc(W / 2 + (i - 1.5) * 26, H - 40, 8, 0, TAU); g.fill(); }
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function wrap(g, text, x, y, maxW, lh, maxLines) {
  const words = text.split(' '); let line = '', n = 0;
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (g.measureText(t).width > maxW && line) { g.fillText(line, x, y + n * lh); line = w; if (++n >= maxLines - 1) break; } else line = t;
  }
  if (n < maxLines) g.fillText(line, x, y + n * lh);
}
/** A plain weather icon (no emoji font needed): 'sun' | 'moon' | 'cloud' | 'rain' | 'snow' | 'hail' | 'storm'. */
function weatherIcon(g, kind, cx, cy) {
  const cloud = (col) => { g.fillStyle = col; g.beginPath(); g.arc(cx - 22, cy + 6, 20, 0, TAU); g.arc(cx + 2, cy - 6, 28, 0, TAU); g.arc(cx + 26, cy + 8, 18, 0, TAU); g.fill(); g.fillRect(cx - 22, cy + 6, 48, 20); };
  if (kind === 'sun') {
    g.strokeStyle = g.fillStyle = '#ffd25a'; g.lineWidth = 5;
    g.beginPath(); g.arc(cx, cy, 24, 0, TAU); g.fill();
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; g.beginPath(); g.moveTo(cx + Math.cos(a) * 32, cy + Math.sin(a) * 32); g.lineTo(cx + Math.cos(a) * 44, cy + Math.sin(a) * 44); g.stroke(); }
    return;
  }
  if (kind === 'moon') { g.fillStyle = '#f2ecd0'; g.beginPath(); g.arc(cx, cy, 28, 0, TAU); g.fill(); g.fillStyle = '#26303f'; g.beginPath(); g.arc(cx + 14, cy - 10, 26, 0, TAU); g.fill(); return; }
  cloud(kind === 'cloud' ? '#dfe5ec' : '#aab4c0');
  g.fillStyle = g.strokeStyle = kind === 'rain' || kind === 'storm' ? '#7cc0ff' : '#fff'; g.lineWidth = 4;
  for (let i = 0; i < 3; i++) {
    const x = cx - 18 + i * 18, y = cy + 38;
    if (kind === 'rain') { g.beginPath(); g.moveTo(x, y); g.lineTo(x - 5, y + 14); g.stroke(); } else if (kind === 'snow') { g.beginPath(); g.arc(x, y + 6, 4, 0, TAU); g.fill(); } else if (kind === 'hail') { g.beginPath(); g.arc(x, y + 6, 5, 0, TAU); g.fill(); }
  }
  if (kind === 'storm') { g.fillStyle = '#ffd25a'; g.beginPath(); g.moveTo(cx + 2, cy + 22); g.lineTo(cx - 12, cy + 48); g.lineTo(cx, cy + 46); g.lineTo(cx - 6, cy + 66); g.lineTo(cx + 14, cy + 38); g.lineTo(cx + 2, cy + 40); g.closePath(); g.fill(); }
}

/** All the smart speakers: picks the answers, speaks, lights them, draws the display. */
export class Nests {
  /** `targets`: the furniture E targets of kind 'nest'; `ctx`: { day, weather, coffee (the Moccamaster), camera, layer
   * (the #speech element for bubbles) }. */
  constructor(targets, ctx) {
    Object.assign(this, ctx, { speakers: targets.map((t) => t.nest), last: null, spoken: [], synth: undefined, onAnswer: null });
    for (const s of this.speakers) s.onPress = (sp) => this.press(sp);
    this.voices = [];
    const load = () => { this.voices = window.speechSynthesis?.getVoices().filter((v) => /^sv/i.test(v.lang)) ?? []; };
    if ('speechSynthesis' in window) { load(); window.speechSynthesis.addEventListener?.('voiceschanged', load); }
    this.bubble = document.createElement('div');
    this.bubble.className = 'say nest';
    this.bubble.hidden = true;
    this.layer?.append(this.bubble);
    this.photo = new Image();
    this.photo.src = new URL(`../${N.photo}`, import.meta.url).href;
    this.idle = 0; // seconds of the display's idle cycle (the photo now and then)
    for (const s of this.speakers) if (s.type === 'hub') this.draw(s, 0);
  }

  /** Every answer possible right now: { key, text, sound?, weight }. */
  answers(sp) {
    const d = this.day, w = this.weather, list = LINES.map(([key, text]) => ({ key, text, weight: 1 }));
    for (const [key, text, sound] of SOUNDS) list.push({ key, text, sound, weight: 1 });
    if (d) {
      list.push({ key: 'time', text: `Klockan är ${timePhrase(d.hour)}.`, weight: 4 });
      const dt = new Date(d.year, d.month - 1, d.date);
      const xmas = d.month === 12 && d.date === 24 ? ' Det är julafton!' : d.month === 12 && d.date < 24 ? ` ${24 - d.date} dagar kvar till julafton.` : '';
      list.push({ key: 'date', text: `I dag är det ${WEEKDAYS[dt.getDay()]} den ${d.date} ${MONTHS[d.month - 1]}.${xmas}`, weight: 3 });
    }
    if (w) list.push({ key: 'weather', text: this.weatherLine(), weight: 4 });
    const c = this.coffee;
    if (c?.isOpen) list.push({ key: 'coffee', text: 'Kaffet håller på att bryggas. Snart klart!', weight: 4 });
    else if (c && c.fill > 0.2 && c.jugHome) list.push({ key: 'coffee', text: 'Kaffet är klart! Det står en kanna på bryggaren i köket.', weight: 4 });
    if (sp?.room) list.push({ key: 'where', text: `Hej från ${sp.room}! Här händer det grejer.`, weight: 1 });
    return list;
  }

  weatherLine() {
    const w = this.weather, day = this.day?.daylight ?? 1;
    if (w.storm && w.rain > 0.15) return 'Det är åska över Lund just nu. Räkna sekunderna mellan blixten och mullret!';
    if (w.rain > 0.15 && w.kind === 'snow') return 'Det snöar i Lund! Perfekt väder för en snögubbe.';
    if (w.rain > 0.15 && w.kind === 'hail') return 'Det haglar ute just nu. Kanske bäst att stanna inne en stund.';
    if (w.rain > 0.15) return 'Det regnar i Lund just nu. Ta med paraply om du ska ut.';
    if (day < 0.15) return 'Uppehåll i Lund i natt. Kanske syns stjärnorna.';
    if ((w.overcast ?? 0) > 0.4) return 'Uppehåll men molnigt i Lund just nu.';
    return 'Uppehållsväder i Lund. Fint läge för en promenad längs Höje å!';
  }

  /** The display's weather icon and word. */
  weatherNow() {
    const w = this.weather, night = (this.day?.daylight ?? 1) < 0.15;
    if (w && w.rain > 0.15) return w.storm ? ['storm', 'Åska'] : w.kind === 'snow' ? ['snow', 'Snö'] : w.kind === 'hail' ? ['hail', 'Hagel'] : ['rain', 'Regn'];
    if (w && (w.overcast ?? 0) > 0.4) return ['cloud', 'Molnigt'];
    return night ? ['moon', 'Klart'] : ['sun', 'Sol'];
  }

  /** Pick an answer for speaker `sp` (not the last one given), or the one with `key` (tests). */
  choose(sp, key = null) {
    const all = this.answers(sp);
    const pool = key ? all.filter((a) => a.key === key) : all.filter((a) => a.key !== this.last);
    let r = Math.random() * pool.reduce((s, a) => s + a.weight, 0);
    for (const a of pool) if ((r -= a.weight) <= 0) return a;
    return pool[pool.length - 1];
  }

  /** E on a speaker: wake, chime, then the answer. Returns the answer. */
  press(sp, key = null) {
    const a = this.choose(sp, key);
    this.last = a.key;
    try { this.synthesis?.cancel?.(); } catch { /* none here */ }
    for (const o of this.speakers) if (o !== sp && o.talking) { o.talkT = o.chimeT = 0; }
    sp.answer = a;
    sp.chimeT = N.chime;
    sp.talkT = 0;
    sfx.nest(sp.pos(), 'wake');
    this.onAnswer?.(sp, a);
    return a;
  }

  get synthesis() { return this.synth !== undefined ? this.synth : window.speechSynthesis; }

  /** Say `text` from speaker `sp` (volume by distance). */
  speak(sp, text) {
    const S = this.synthesis;
    if (!S || isMuted() || typeof SpeechSynthesisUtterance === 'undefined') return false;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'sv-SE';
    if (this.voices.length) u.voice = this.voices[0];
    u.pitch = 1.05; u.rate = 1.02;
    u.volume = THREE.MathUtils.clamp(1.3 - sp.pos().distanceTo(this.camera.position) / 8, 0.25, 1);
    try { S.speak(u); this.spoken.push(text); return true; } catch { return false; }
  }

  /** Is any speaker talking (or about to) within `near` m of p? (The Sonos is ducked meanwhile.) */
  talkingNear(p, near = N.near) { return this.speakers.some((s) => s.talking && s.pos().distanceTo(p) < near); }
  get talking() { return this.speakers.some((s) => s.talking); }

  /** F hides them: quiet at once. */
  hush() {
    for (const s of this.speakers) { s.talkT = s.chimeT = 0; s.wake = 0; }
    try { this.synthesis?.cancel?.(); } catch { /* none here */ }
    this.bubble.hidden = true;
  }

  update(dt) {
    this.idle += dt;
    let bubbleFor = null;
    for (const s of this.speakers) {
      s.t += dt;
      if (s.chimeT > 0 && (s.chimeT -= dt) <= 0) { // the chime is over: talk
        const a = s.answer;
        if (a.sound) { sfx.nest(s.pos(), a.sound); s.talkT = a.sound === 'drumroll' ? 2.2 : a.sound === 'fanfare' ? 1.9 : 0.9; } else {
          this.speak(s, a.text);
          s.talkT = N.talk.min + a.text.length * N.talk.perChar;
        }
      } else if (s.talkT > 0 && (s.talkT -= dt) <= 0) s.talkT = 0;
      s.wake = THREE.MathUtils.clamp(s.wake + (s.talking ? dt * 5 : -dt * 1.5), 0, 1);
      if (s.dots) s.dots.forEach((d, i) => {
        const pulse = s.talkT > 0 ? 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(s.t * 7 - i * 0.9)) : 1;
        d.material.opacity = s.wake * pulse;
      });
      if (s.type === 'hub') this.draw(s, dt);
      else if (s.talkT > 0 || s.chimeT > 0) bubbleFor = s;
    }
    this.placeBubble(bubbleFor);
  }

  /** The round speaker's words over it, on screen. */
  placeBubble(s) {
    const b = this.bubble;
    if (!s || !s.answer || s.chimeT > 0 || !this.camera) { b.hidden = true; this.bubbleText = null; return; }
    if (this.bubbleText !== s.answer.text) { b.textContent = s.answer.text; this.bubbleText = s.answer.text; b.hidden = false; }
    tmp.copy(s.pos()).add({ x: 0, y: 0.1, z: 0 }).project(this.camera);
    const off = tmp.z > 1 || Math.abs(tmp.x) > 1.1 || Math.abs(tmp.y) > 1.1;
    b.style.visibility = off ? 'hidden' : 'visible';
    b.style.transform = `translate(${((tmp.x + 1) / 2) * window.innerWidth}px, ${((1 - tmp.y) / 2) * window.innerHeight}px) translate(-50%, -100%)`;
  }

  /** Redraw the display when what it shows changed (the clock about once a minute of game time, the talk at ~10 fps). */
  draw(s, dt) {
    const d = this.day, talk = s.talkT > 0 && s.answer, waking = s.chimeT > 0;
    const photoOk = this.photo.complete && this.photo.naturalWidth > 0;
    const cyc = this.idle % (N.photoEvery + N.photoFor), photo = photoOk && cyc > N.photoEvery;
    const mode = talk ? 'talk' : waking ? 'wake' : photo ? 'photo' : 'clock';
    const clock = d ? hhmm(d.hour) : '--:--';
    const [weather, weatherText] = this.weatherNow();
    let date = '';
    if (d) { const dd = new Date(d.year, d.month - 1, d.date); date = `${WEEKDAYS[dd.getDay()]} ${d.date} ${MONTHS[d.month - 1]}`; }
    const stamp = `${mode}|${clock}|${weather}|${date}|${talk ? s.answer.key : ''}`;
    s.drawAcc += dt;
    if (stamp !== s.stamp || (mode === 'talk' && s.drawAcc > 0.1)) {
      drawHub(s, { mode, clock, date, weather, weatherText, caption: talk ? s.answer.text : '', t: s.t, photo: this.photo });
      s.texture.needsUpdate = true;
      s.stamp = stamp; s.drawAcc = 0;
      s.draws = (s.draws ?? 0) + 1;
    }
    // dim by night (not while it talks): the screen's colour, no redraw
    const k = s.wake > 0 ? 1 : THREE.MathUtils.lerp(N.night, 1, d?.daylight ?? 1);
    s.screen.material.color.setScalar(Math.max(k, s.wake));
  }
}

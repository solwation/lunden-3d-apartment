import * as THREE from 'three';
import { DAY, WEATHER, GARAGE, LIGHTING, SKYLAYER } from './config.js';

// Day and night: a whole day passes in DAY.minutes real minutes (24 × 60 = real time, #1145: the clock follows the
// visitor's own clock; the wall clock's spool / pause become an offset from it). The sun follows its real path
// for the date at Kv. Lunden (rises north-east in summer, south-east in winter; the house is
// turned, see DAY.planNorth); at night a full moon takes its place. Drives the sun light, the
// ambient light, fog and a shader sky with sunset glow, stars and the moon. The wall clock can
// pause and spool the time (wallclock.js).

const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
const RAD = Math.PI / 180;

/** Solar declination (radians) on day `doy` (1–365). */
const declination = (doy) => 23.44 * RAD * Math.sin((2 * Math.PI * (284 + doy)) / 365);

/** Swedish summer time (CEST), roughly the last Sunday of March … of October. */
const summerTime = (doy) => doy >= 87 && doy < 300;

/** Equation of time in minutes (sundial − clock), Spencer's short form. */
function equationOfTime(doy) {
  const b = (2 * Math.PI * (doy - 81)) / 364;
  return 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
}

/** Local solar time (hours) for clock time `hour` on day `doy`. */
const solarHour = (hour, doy) => hour - (summerTime(doy) ? 2 : 1) + DAY.lon / 15 + equationOfTime(doy) / 60;

/** Direction (unit) to a body with declination `dec` at solar hour `solar`; below the horizon at
 * night. In plan axes (y up): the plan's "north" (−z) really points DAY.planNorth degrees east of
 * true north, so the geographic east/south components are rotated into plan x/z. */
function skyDirection(solar, dec, out) {
  const lat = DAY.lat * RAD, h = (solar - 12) * 15 * RAD; // hour angle, + = afternoon
  const sinEl = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(h);
  const el = Math.asin(sinEl);
  const az = Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat)); // from south, + = west
  const e = -Math.cos(el) * Math.sin(az), s = Math.cos(el) * Math.cos(az); // geographic east, south
  const b = DAY.planNorth * RAD, cb = Math.cos(b), sb = Math.sin(b);
  return out.set(e * cb + s * sb, sinEl, s * cb - e * sb).normalize();
}

/** Direction (unit) to the sun at clock time `hour` on day of year `doy`. */
export function sunDirection(hour, doy, out = new THREE.Vector3()) {
  return skyDirection(solarHour(hour, doy), declination(doy), out);
}

/** Clock times [rise, set] of the sun on day `doy` (null when it never sets / never rises). */
export function sunTimes(doy) {
  const lat = DAY.lat * RAD, dec = declination(doy);
  const c = (Math.sin(-0.83 * RAD) - Math.sin(lat) * Math.sin(dec)) / (Math.cos(lat) * Math.cos(dec));
  if (Math.abs(c) > 1) return null;
  const half = Math.acos(c) / (15 * RAD);
  const noon = 12 - (solarHour(12, doy) - 12);
  return [noon - half, noon + half];
}

/** Day of year (1–365) of the 15th of `month` (1–12). */
export const midMonth = (month) => [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349][month - 1];

/** Days in `month` (1–12) of `year`. */
export const daysIn = (year, month) => new Date(year, month, 0).getDate();
/** Day of year (1…366) of a date. */
export const dayOfYear = (year, month, date) => Math.round((Date.UTC(year, month - 1, date) - Date.UTC(year, 0, 0)) / 864e5);

const skyVert = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * p;
    gl_Position.z = gl_Position.w; // always at the far plane
  }`;

const skyFrag = /* glsl */`
  uniform vec3 uSun, uMoon, uZenith, uHorizon, uGlow;
  uniform float uNight, uGlowAmt, uOvercast, uFlash, uWhite, uAbove;
  uniform vec3 uCloudCol;
  uniform sampler2D uClouds;
  varying vec3 vDir;
  float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  void main() {
    vec3 d = normalize(vDir);
    float h = max(d.y, 0.0);
    vec3 col = mix(uHorizon, uZenith, pow(h, 0.55));
    // sunrise / sunset glow around the sun near the horizon
    float s = max(dot(d, uSun), 0.0);
    col += uGlow * uGlowAmt * pow(s, 6.0) * (1.0 - h);
    // sun and moon discs
    col = mix(col, vec3(1.0, 0.97, 0.88), smoothstep(0.9993, 0.9997, s) * step(-0.05, uSun.y));
    float m = max(dot(d, uMoon), 0.0);
    col = mix(col, vec3(0.92, 0.94, 1.0), smoothstep(0.9994, 0.9997, m) * step(-0.05, uMoon.y) * (0.3 + 0.7 * uNight));
    col += vec3(0.25, 0.28, 0.35) * pow(m, 400.0) * uNight;
    // stars
    vec3 q = floor(d * 260.0);
    float star = step(0.9975, hash(q)) * uNight * smoothstep(0.02, 0.2, d.y);
    col += vec3(star) * (0.6 + 0.4 * hash(q + 1.0));
    // clouds (equirectangular alpha map), lit by day, dark at night, tinted at sunset
    vec2 uv = vec2(atan(d.x, d.z) / 6.2831853 + 0.5, 0.5 - asin(clamp(d.y, -1.0, 1.0)) / 3.1415927);
    float c = max(texture2D(uClouds, uv).a, uOvercast * (0.85 + 0.15 * texture2D(uClouds, uv * vec2(3.0, 2.0)).a)) * smoothstep(0.0, 0.08, d.y);
    vec3 cloud = mix(vec3(0.95), vec3(0.16, 0.18, 0.24), uNight) + uGlow * uGlowAmt * 0.35;
    cloud = mix(cloud, mix(vec3(0.5, 0.53, 0.57), vec3(0.08, 0.09, 0.11), uNight), uOvercast * 0.8); // rain clouds (#248)
    col = mix(col, cloud, c * 0.85 * (1.0 - uAbove)); // #1368: these clouds are below us above the deck
    col += vec3(0.75, 0.78, 0.95) * uFlash; // lightning
    col = mix(col, uCloudCol, uWhite); // flying through the cloud deck (#1251): all one colour
    // below the horizon: fade into the horizon colour (fog takes over)
    col = mix(uHorizon, col, smoothstep(-0.02, 0.02, d.y));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;

// The cloud deck (#1251): one flat quad at the layer's base / top that follows the eye; procedural noise (no texture), seen from
// below as a grey ceiling, from above as a white sunlit sea. Flight approach forms a deck even in fair weather (#1368).
const deckVert = /* glsl */`
  varying vec3 vW;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const deckFrag = /* glsl */`
  uniform float uCover, uDay, uOver, uAlpha, uRadius, uScale, uTime, uGlowAmt, uAbove;
  uniform vec3 uEye, uGlow, uHorizon;
  varying vec3 vW;
  float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vn(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  void main() {
    vec2 p = vW.xz * uScale + vec2(uTime, uTime * 0.4);
    float n = 0.5 * vn(p) + 0.28 * vn(p * 2.1 + 7.3) + 0.14 * vn(p * 4.3 + 3.1) + 0.08 * vn(p * 8.7 + 1.7);
    float thr = 0.8 - uCover * 0.9;
    float d = smoothstep(thr, thr + 0.2, n);
    float dist = distance(vW.xz, uEye.xz);
    // #1368: retain noise in the colour, but seal holes and the faded rim from above.
    float edge = 1.0 - smoothstep(uRadius * 0.4, uRadius, dist);
    float a = mix(d * edge, 1.0, uAbove) * uAlpha;
    float lit = 0.12 + 0.88 * uDay, k = smoothstep(thr, thr + 0.5, n);
    float sh = smoothstep(0.4, 0.62, n);
    vec3 top = mix(vec3(0.66, 0.71, 0.8), vec3(1.0, 1.0, 0.98), sh) * lit;
    vec3 under = mix(vec3(0.62, 0.65, 0.7), vec3(0.42, 0.45, 0.5), k) * (0.2 + 0.8 * uDay) * (1.0 - 0.25 * uOver);
    vec3 col = uEye.y < vW.y ? under : top;
    col += uGlow * uGlowAmt * 0.3;
    col = mix(col, uHorizon, uAbove * (1.0 - edge)); // atmospheric colour fade remains opaque
    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
  }`;

const DAY_ZENITH = new THREE.Color(0x4f8fd0), DAY_HORIZON = new THREE.Color(0xcfe0ec);
const NIGHT_ZENITH = new THREE.Color(0x04070f), NIGHT_HORIZON = new THREE.Color(0x10182a);
const DUSK_HORIZON = new THREE.Color(0xe8a070), GLOW = new THREE.Color(0xff8a3c);
const OVERCAST = new THREE.Color(0x8d969f), FLASH = new THREE.Color(0xdfe4ff), tmpC = new THREE.Color();
const SUN_LOW = new THREE.Color(0xffb070), SUN_HIGH = new THREE.Color(0xfff1dc), MOON = new THREE.Color(0x9fb4ff);

export class DayCycle {
  /** lights: { sun, hemi, ambient, fill } from main.js; clouds: canvas texture with alpha; renderer (optional): its exposure follows the sky (#1073). */
  constructor({ scene, camera, lights, clouds, startHour, month, date = 15, year = new Date().getFullYear(), renderer = null }) {
    Object.assign(this, { scene, camera, lights, renderer, hour: startHour, month, date, year, paused: false, spool: 0, overcast: 0, flash: 0, dim: 0, under: 0, lit: 0 }); // overcast, flash: weather.js (#248); dim: the blinds (#273)
    this.fogFar = scene.fog.far; this.fogNear = scene.fog.near;
    this.base = { hemi: 0, ambient: 0, fill: 0, sun: 0, exposure: 1 }; // LIGHTING.sky blended overcast → clear each update (#1073)
    this.uniforms = {
      uSun: { value: new THREE.Vector3() }, uMoon: { value: new THREE.Vector3() },
      uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGlow: { value: GLOW.clone() },
      uNight: { value: 0 }, uGlowAmt: { value: 0 }, uClouds: { value: clouds }, uOvercast: { value: 0 }, uFlash: { value: 0 }, uWhite: { value: 0 }, uAbove: { value: 0 }, uCloudCol: { value: new THREE.Color(0.9, 0.92, 0.95) },
    };
    this.deckUniforms = {
      uCover: { value: 0 }, uDay: { value: 1 }, uOver: { value: 0 }, uAlpha: { value: 1 }, uRadius: { value: SKYLAYER.radius }, uScale: { value: SKYLAYER.scale },
      uTime: { value: 0 }, uEye: { value: new THREE.Vector3() }, uGlow: { value: GLOW.clone() }, uGlowAmt: { value: 0 },
      uAbove: this.uniforms.uAbove, uHorizon: this.uniforms.uHorizon,
    };
    this.deck = new THREE.Mesh(new THREE.PlaneGeometry(SKYLAYER.radius * 2, SKYLAYER.radius * 2).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      uniforms: this.deckUniforms, vertexShader: deckVert, fragmentShader: deckFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, fog: false,
    }));
    this.deck.frustumCulled = false; this.deck.visible = false; this.deck.raycast = () => {}; this.deck.renderOrder = 5;
    scene.add(this.deck);
    this.above = 0; // 0 = under the cloud deck … 1 = clearly above it (#1251): weather.js hides the rain then
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false, fog: false,
    }));
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;
    scene.add(this.sky);
    scene.background = null;
    this.realAt = Date.now(); // (catch-up: dt is capped and stops in a hidden tab, the real clock does not, #1145)
    this.sunDir = new THREE.Vector3();
    this.moonDir = new THREE.Vector3();
    this.update(0);
  }

  /** 0 = full night … 1 = full day. */
  get daylight() { return smooth(-0.08, 0.18, this.sunDir.y); }

  /** The date's day of year (the day of month clamped to the month, e.g. after a month change). */
  get doy() { return dayOfYear(this.year, this.month, Math.min(this.date, daysIn(this.year, this.month))); }

  /** Move the date by `n` days (past midnight while the clock runs or spools, #95). */
  addDays(n) {
    const d = new Date(this.year, this.month - 1, Math.min(this.date, daysIn(this.year, this.month)) + n);
    this.year = d.getFullYear(); this.month = d.getMonth() + 1; this.date = d.getDate();
  }

  /** Is the normal pace the real one (DAY.minutes = a whole day, #1145)? */
  get real() { return DAY.minutes >= 24 * 60; }

  /** The game's local date and time as a timestamp (ms, like Date.now()). */
  get stamp() { return new Date(this.year, this.month - 1, Math.min(this.date, daysIn(this.year, this.month))).getTime() + this.hour * 36e5; }

  /** Set the game's date and time from a timestamp (ms). */
  setStamp(ms) {
    const d = new Date(ms);
    Object.assign(this, { year: d.getFullYear(), month: d.getMonth() + 1, date: d.getDate(), hour: d.getHours() + d.getMinutes() / 60 + (d.getSeconds() + d.getMilliseconds() / 1000) / 3600 });
  }

  /** Back to the visitor's own time and date, running (the wall clock's "Nu", #1145). */
  toNow() { this.setStamp(Date.now()); Object.assign(this, { paused: false, spool: 0, realAt: Date.now() }); this.update(0); }

  /** Advance the clock: normal pace, stopped while paused, or spooled (−1 / +1) by the wall clock. At the normal pace
   * the real time since the last update counts when it is longer than `dt` (capped frames, a hidden tab, #1145). */
  update(dt) {
    const now = Date.now(), real = Math.max(0, (now - this.realAt) / 1000);
    this.realAt = now;
    const rate = this.spool ? this.spool * DAY.spool : this.paused ? 0 : 24 / (DAY.minutes * 60);
    const h = this.hour + (this.spool || this.paused ? dt : Math.max(dt, real)) * rate;
    if (h >= 24 || h < 0) this.addDays(Math.floor(h / 24)); // midnight: the next / previous day (or more after a long sleep)
    this.hour = ((h % 24) + 24) % 24;
    sunDirection(this.hour, this.doy, this.sunDir);
    // full moon: opposite the sun (12 h later, opposite declination)
    skyDirection(solarHour(this.hour, this.doy) + 12, -declination(this.doy), this.moonDir);
    const day = this.daylight, night = 1 - day;
    const low = 1 - smooth(0.0, 0.35, Math.abs(this.sunDir.y)); // sunrise/sunset band
    const u = this.uniforms;
    u.uSun.value.copy(this.sunDir);
    u.uMoon.value.copy(this.moonDir);
    u.uNight.value = night;
    u.uGlowAmt.value = low * smooth(-0.15, 0.05, this.sunDir.y);
    u.uZenith.value.copy(NIGHT_ZENITH).lerp(DAY_ZENITH, day);
    u.uHorizon.value.copy(NIGHT_HORIZON).lerp(DAY_HORIZON, day).lerp(DUSK_HORIZON, u.uGlowAmt.value * 0.6);
    // weather (#248): grey under rain clouds, the fog closer, lightning lights it all up for a moment
    // the cloud deck (#1251): above it the sky is clear and the sun strong whatever the weather below; inside it the view whites out
    const L = SKYLAYER, cy = this.camera.position.y;
    // The high-flight experience has a cloud sea in every weather; ground-level weather is untouched.
    const cover = Math.max(smooth(L.cloudy, L.full, this.overcast), smooth(L.base - L.approach, L.base, cy));
    const above = this.above = smooth(L.top, L.top + L.fade, cy);
    u.uAbove.value = above;
    const inside = smooth(L.base - 15, L.base + 15, cy) * (1 - smooth(L.top - 15, L.top + 15, cy)) * cover;
    const oc = this.overcast * (1 - above), flash = this.flash * (1 - above);
    u.uOvercast.value = oc; u.uFlash.value = flash;
    u.uZenith.value.lerp(tmpC.copy(OVERCAST).multiplyScalar(0.15 + 0.85 * day), oc * 0.85);
    u.uHorizon.value.lerp(tmpC.copy(OVERCAST).multiplyScalar(0.2 + 0.8 * day), oc * 0.7);
    this.scene.fog.color.copy(u.uHorizon.value).lerp(FLASH, Math.min(1, flash * 0.5));
    this.scene.fog.far = this.fogFar + (WEATHER.fogFar - this.fogFar) * oc;
    u.uCloudCol.value.setRGB(0.93, 0.94, 0.96).lerp(tmpC.setRGB(0.6, 0.63, 0.67), this.overcast * 0.8).multiplyScalar(0.1 + 0.9 * day);
    u.uWhite.value = inside;
    if (inside > 0) {
      this.scene.fog.color.lerp(u.uCloudCol.value, inside);
      this.scene.fog.near = this.fogNear + (L.near - this.fogNear) * inside;
      this.scene.fog.far += (L.far - this.scene.fog.far) * inside;
    } else this.scene.fog.near = this.fogNear;
    const D = this.deckUniforms, up = cy > (L.base + L.top) / 2;
    this.deck.visible = cover > 0.01 && (up || cy > L.base - L.approach) && inside < 0.999;
    if (this.deck.visible) {
      this.deck.position.set(this.camera.position.x, up ? L.top : L.base, this.camera.position.z);
      // Above, cover every possible ground fragment within the camera far plane, without a transparent outer ring.
      D.uRadius.value = up ? Math.max(L.radius, this.camera.far) : L.radius;
      this.deck.scale.setScalar(D.uRadius.value / L.radius);
      D.uEye.value.copy(this.camera.position);
      D.uCover.value = cover; D.uDay.value = day; D.uOver.value = this.overcast; D.uGlowAmt.value = u.uGlowAmt.value;
      D.uAlpha.value = (up ? 1 : 1 - smooth(0, L.approach, L.base - cy)) * (1 - inside);
      D.uTime.value = performance.now() / 1000 * 0.01; // drifting (small numbers: shader floats lose the fraction of big ones)
    }
    this.sky.position.copy(this.camera.position);

    // the sun by day, the moon by night: one shadow-casting light either way
    const { sun, hemi, ambient, fill } = this.lights;
    // a clear sky by day: a stronger sun against a darker shade side (#1073); rain clouds, night and the garage keep the even light
    const clear = day * (1 - oc) * (1 - this.under), { overcast: o, clear: c } = LIGHTING.sky, b = this.base;
    for (const k in b) b[k] = o[k] + (c[k] - o[k]) * clear;
    if (this.renderer) this.renderer.toneMappingExposure = b.exposure;
    const useMoon = this.sunDir.y < -0.02;
    const dir = useMoon ? this.moonDir : this.sunDir;
    sun.position.copy(sun.target.position).addScaledVector(dir, 30);
    sun.intensity = (useMoon ? DAY.moonlight * smooth(0.0, 0.2, this.moonDir.y) : this.base.sun * smooth(-0.02, 0.12, this.sunDir.y)) * (1 - WEATHER.sunCut * oc) * (1 - this.under); // (under the courtyard: none, #357)
    if (useMoon) sun.color.copy(MOON);
    else sun.color.copy(SUN_LOW).lerp(SUN_HIGH, smooth(0.05, 0.4, this.sunDir.y));
    // the visitor's room's blinds (#273) take away a share of the daylight that reaches it (not the night's)
    const inDay = day * (1 - this.dim) * (1 - this.under); // under: the garage under the courtyard (#357)
    hemi.intensity = (this.base.hemi * inDay + DAY.nightAmbient) * (1 - 0.3 * oc) + WEATHER.flash.light * flash;
    hemi.color.setHex(0xeaf3ff).lerp(new THREE.Color(0x6b7da8), night);
    ambient.intensity = (this.base.ambient * inDay + DAY.nightAmbient * 0.5) * (1 - 0.25 * oc) + WEATHER.flash.light * 0.4 * flash + this.lit * GARAGE.lights.carLight; // lit: the garage's tubes while the visitor is down there (#440)
    fill.intensity = this.base.fill * inDay;
  }

  /** "HH:MM" for the HUD. */
  get clock() { return formatHour(this.hour); }
}

/** "HH:MM" for an hour 0–24. */
export function formatHour(hour) {
  const t = Math.floor((((hour % 24) + 24) % 24) * 60);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

import * as THREE from 'three';
import { DAY } from './config.js';

// Day and night: a whole day passes in DAY.minutes real minutes. The sun follows its real path
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
  uniform float uNight, uGlowAmt;
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
    float c = texture2D(uClouds, uv).a * smoothstep(0.0, 0.08, d.y);
    vec3 cloud = mix(vec3(0.95), vec3(0.16, 0.18, 0.24), uNight) + uGlow * uGlowAmt * 0.35;
    col = mix(col, cloud, c * 0.85);
    // below the horizon: fade into the horizon colour (fog takes over)
    col = mix(uHorizon, col, smoothstep(-0.02, 0.02, d.y));
    gl_FragColor = vec4(col, 1.0);
  }`;

const DAY_ZENITH = new THREE.Color(0x4f8fd0), DAY_HORIZON = new THREE.Color(0xcfe0ec);
const NIGHT_ZENITH = new THREE.Color(0x04070f), NIGHT_HORIZON = new THREE.Color(0x10182a);
const DUSK_HORIZON = new THREE.Color(0xe8a070), GLOW = new THREE.Color(0xff8a3c);
const SUN_LOW = new THREE.Color(0xffb070), SUN_HIGH = new THREE.Color(0xfff1dc), MOON = new THREE.Color(0x9fb4ff);

export class DayCycle {
  /** lights: { sun, hemi, ambient, fill } from main.js; clouds: canvas texture with alpha. */
  constructor({ scene, camera, lights, clouds, startHour, month, date = 15, year = new Date().getFullYear() }) {
    Object.assign(this, { scene, camera, lights, hour: startHour, month, date, year, paused: false, spool: 0 });
    this.base = { hemi: lights.hemi.intensity, ambient: lights.ambient.intensity, fill: lights.fill.intensity, sun: lights.sun.intensity };
    this.uniforms = {
      uSun: { value: new THREE.Vector3() }, uMoon: { value: new THREE.Vector3() },
      uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGlow: { value: GLOW.clone() },
      uNight: { value: 0 }, uGlowAmt: { value: 0 }, uClouds: { value: clouds },
    };
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false, fog: false,
    }));
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;
    scene.add(this.sky);
    scene.background = null;
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

  /** Advance the clock: normal pace, stopped while paused, or spooled (−1 / +1) by the wall clock. */
  update(dt) {
    const rate = this.spool ? this.spool * DAY.spool : this.paused ? 0 : 24 / (DAY.minutes * 60);
    const h = this.hour + dt * rate;
    if (h >= 24) this.addDays(1); else if (h < 0) this.addDays(-1); // midnight: the next / previous day
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
    this.scene.fog.color.copy(u.uHorizon.value);
    this.sky.position.copy(this.camera.position);

    // the sun by day, the moon by night: one shadow-casting light either way
    const { sun, hemi, ambient, fill } = this.lights;
    const useMoon = this.sunDir.y < -0.02;
    const dir = useMoon ? this.moonDir : this.sunDir;
    sun.position.copy(sun.target.position).addScaledVector(dir, 30);
    sun.intensity = useMoon ? DAY.moonlight * smooth(0.0, 0.2, this.moonDir.y) : this.base.sun * smooth(-0.02, 0.12, this.sunDir.y);
    if (useMoon) sun.color.copy(MOON);
    else sun.color.copy(SUN_LOW).lerp(SUN_HIGH, smooth(0.05, 0.4, this.sunDir.y));
    hemi.intensity = this.base.hemi * day + DAY.nightAmbient;
    hemi.color.setHex(0xeaf3ff).lerp(new THREE.Color(0x6b7da8), night);
    ambient.intensity = this.base.ambient * day + DAY.nightAmbient * 0.5;
    fill.intensity = this.base.fill * day;
  }

  /** "HH:MM" for the HUD. */
  get clock() { return formatHour(this.hour); }
}

/** "HH:MM" for an hour 0–24. */
export function formatHour(hour) {
  const t = Math.floor((((hour % 24) + 24) % 24) * 60);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

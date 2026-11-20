// #2176: the shared snow cover. A depth (cm) builds with the real hourly snowfall and melts above 0 °C (degree-hour model, extra melt
// from rain on snow); `snowCover` 0…1 = depth / SNOW_COVER.full. Every reader that used to ask the calendar (SEASON.snowMonths) asks
// `snowLies(month)` (binary, with hysteresis) or reads `snowState.cover` / `snowUniform` (continuous). Without real data for the hour
// the calendar stays in charge (cover 1 in the snow months, else 0), and until the driver (SnowCover) has run once the readers see the
// calendar too. Pure helpers first (headless-tested in tools/snowcovertest.mjs), then the driver.
import { SNOW_COVER as P, SEASON } from './config.js';

/** One hour of snow depth (cm): + snowfall, − melt above zero (degree-hours) and − more with rain on it. */
export function snowStep(depth, { temp = 0, snowCm = 0, rainMm = 0 } = {}, dh = 1, C = P) {
  if (!(dh > 0)) return depth;
  let d = depth + Math.max(0, snowCm) * dh;
  if (temp > 0) d -= (C.melt * temp + C.rain * Math.max(0, rainMm) * temp) * dh;
  return Math.min(C.max, Math.max(0, d));
}
/** Depth after a series of hourly records { temp, snowCm, rainMm } (null = no data: no change). */
export function snowSeries(records, depth = 0, C = P) {
  for (const r of records) if (r) depth = snowStep(depth, r, 1, C);
  return depth;
}
/** Depth cm → cover 0…1. */
export const coverOf = (depth, C = P) => Math.min(1, Math.max(0, depth / C.full));
/** The calendar's cover (the fallback): 1 in the snow months. */
export const calendarCover = (month) => (SEASON.snowMonths.includes(month) ? 1 : 0);
/** The binary reading with hysteresis: was it lying, and the cover now. */
export const lyingNow = (was, cover, C = P) => (was ? cover > C.gone : cover >= C.lies);

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** The cover a surface needs before snow lies on it at a spot: its class `hold`, spread by `n` (0…1 noise), lowered by `shelter` (0…1:
 * under a crown, against a north facade) and by `ridge` (0…1, the ploughed kerb ridge). Asphalt holds most, grass least. */
export function snowHold(cls, { n = 0.5, shelter = 0, ridge = 0 } = {}, C = P) {
  const h = C.hold[cls] + (n - 0.5) * C.noise - shelter * C.shelter - ridge * C.ridge.hold;
  return Math.min(0.9, Math.max(0, h));
}
/** How white a spot is at `cover` (JS twin of the shader's step): 0…1. */
export function snowWhite(cover, cls, spot, C = P) {
  if (!(cover > 0)) return 0;
  const h = snowHold(cls, spot, C);
  return smooth(h - 0.04, h + 0.05, cover);
}

/** The shared state every reader sees. `driven` after the driver's first update. */
export const snowState = { cover: 0, lies: false, driven: false, source: 'calendar' };
/** The continuous cover for the shaders (one object, every snow-patched material shares it). */
export const snowUniform = { value: 0 };
/** Do the binary readers see snow now? Calendar until the driver runs. `month` is the reader's own month (the calendar fallback). */
export const snowLies = (month) => (snowState.driven ? snowState.lies : SEASON.snowMonths.includes(month));
/** Number of changes of the binary reading (seasons.js re-runs its hooks when it moves). */
export const snowKey = (month) => (snowLies(month) ? 1 : 0);

/** The driver: integrates the depth on the game clock from the real weather (realweather.js rawAt) and writes snowState. */
const HOUR = 3.6e6;
const gameHours = (d) => new Date(d.year, d.month - 1, d.date).getTime() / HOUR + d.hour;
export class SnowCover {
  constructor(weather, day, C = P) {
    Object.assign(this, { weather, day, C, depth: 0, t: null, version: -1, known: false, shown: null, force: null });
  }

  /** The raw hour at absolute game hour `t`: { temp, snowCm, rainMm } or null. */
  rawAt(t) {
    const real = this.weather.real;
    if (!real?.rawAt) return null;
    const dt = new Date(t * HOUR), y = dt.getFullYear(), m = dt.getMonth() + 1, d = dt.getDate();
    return real.rawAt(y, m, d, Math.floor((t * HOUR - new Date(y, m - 1, d).getTime()) / HOUR + 1e-6));
  }

  spinUp(now) {
    const hour = Math.floor(now);
    let depth = 0;
    for (let t = hour - this.C.spin; t < hour; t++) { const r = this.rawAt(t); if (r) depth = snowStep(depth, r, 1, this.C); }
    this.depth = depth; this.t = hour;
  }

  /** After Weather.update: the cover for the clock now (`dt` real s eases the shown value towards it). */
  update(dt = 0) {
    const w = this.weather, d = this.day, S = snowState;
    let target, source;
    if (this.force != null) { target = this.force; source = 'forced'; }
    else if (!w.real || w.force) { target = calendarCover(d.month); source = 'calendar'; } // (forced weather: no history to read)
    else {
      const now = gameHours(d), hour = Math.floor(now), here = this.rawAt(hour);
      if (w.real.months) { // the history months: the weather asks for the current and the next one; the earlier ones too
        const pm = d.month === 1 ? 12 : d.month - 1, py = d.month === 1 ? d.year - 1 : d.year;
        if (d.date <= 14) w.real.want?.(py, pm);
      }
      const ver = w.real.version;
      if (this.t === null || hour < this.t || hour - this.t > 48 || ver !== this.version) { this.version = ver; this.spinUp(now); }
      else { for (let t = this.t; t < hour; t++) { const r = this.rawAt(t); if (r) this.depth = snowStep(this.depth, r, 1, this.C); } this.t = hour; }
      this.known = !!here;
      if (here) { target = coverOf(this.depth, this.C); source = 'real'; } else { target = calendarCover(d.month); source = 'calendar'; }
    }
    if (this.shown === null || source !== 'real' || S.source !== 'real') this.shown = target;
    else this.shown += (target - this.shown) * Math.min(1, dt / this.C.ease);
    S.cover = this.shown; S.source = source; S.driven = true;
    S.lies = lyingNow(S.lies, S.cover, this.C);
    snowUniform.value = S.cover;
    return S;
  }
}

// #2147: the outer layer (jacket / coat) of an avatar: when it is worn, and the look the geometry is built from. Pure helpers (headless-testable);
// numbers AVATAR_OUTERWEAR in config.js. The chosen look (`outer`, `outerMode`) travels in the look code; whether it is worn right now is derived
// locally from the weather and whether the figure is outdoors (src/avatarweather.js `wetEnv`), so no network field exists for it.
import { AVATAR_OUTERWEAR as O, outerValue } from './config.js';

/** The top model number the geometry uses for an outer layer: 3 jacket, 4 coat (0: none). */
export const outerCut = (lk) => { const o = outerValue(lk?.outer); return o ? 2 + o : 0; };

/** Does the weather ask for the layer? Cold (`temp` °C below the threshold; with `wasWorn` the threshold's hysteresis) or anything falling. */
export function outerWeather({ temp = 15, rain = 0, snow = 0, kind = null } = {}, wasWorn = false) {
  const fall = kind && (rain > O.rainMin || snow > O.rainMin);
  return !!fall || (Number.isFinite(temp) && temp < (wasWorn ? O.warmAbove : O.coldBelow));
}

/** A fresh per-figure state: not worn, no indoor time. */
export const newOuter = () => ({ worn: false, indoor: 0 });

/** Advances `s` by `dt` s: `look` the chosen look, `outdoors`, `env` { temp, rain, snow, kind }, `preview` (the customizer is open: show the layer
 * regardless). Mode 'always' wears it everywhere; automatic puts it on in the open when the weather asks for it, takes it off after
 * `takeOffDelay` s indoors (a doorway does not flicker) or when it has warmed up and dried. Returns whether it is worn. */
export function stepOuter(s, dt, look, outdoors, env, preview = false) {
  if (!outerValue(look?.outer)) return (s.worn = false, s.indoor = 0, false);
  if (preview || look.outerMode === 1) return (s.worn = true, s.indoor = 0, true);
  if (!outdoors) {
    s.indoor += Math.min(Math.max(dt, 0), 1);
    if (s.indoor >= O.takeOffDelay) s.worn = false;
  } else {
    s.indoor = 0;
    s.worn = outerWeather(env, s.worn);
  }
  return s.worn;
}

/** The look the body is built from: the chosen one, or with the outer layer on (the top model 3 / 4, long sleeves; the jacket's colour comes
 * from `outerColour` in the geometry). Returns `lk` itself when nothing is worn. */
export function wornLook(lk, worn) {
  const c = outerCut(lk);
  return worn && c ? { ...lk, cut: c, sleeves: 1 } : lk;
}

/** The colour of a worn layer: one of the model's palette, picked by the top's colour so a figure keeps the same jacket. */
export function outerColour(lk) {
  const set = (outerValue(lk?.outer) === 2 ? O.colours.coat : O.colours.jacket), t = Number(lk?.top) || 0;
  return set[Math.abs(Math.imul(t ^ (t >>> 11), 2654435761)) % set.length];
}

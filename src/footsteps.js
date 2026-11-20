import { FOOTSTEPS as F } from './config.js';

/** #2193: the profile key for a step from the underfoot class (`stepInfo` in stepsurface.js: surface, where = 'ground' | 'exposed' |
 * 'core' | 'indoor', road, stairs) and the ambient state `env` ({ snow 0…1, wet 0…1, temp °C, month }). Pure; called once per audible
 * step. Priority: stair, snow (not on a ploughed road), wet hard ground, autumn leaves on soft ground, else the plain surface. */
export function pickStep(info, env = {}, P = F) {
  const { surface = 'wood', where = 'indoor', road = false, stairs = false } = info ?? {};
  if (stairs && where === 'core') return 'stair';
  if (where === 'ground' && !road && (env.snow ?? 0) >= P.snowMin) return (env.temp ?? 0) <= P.squeakTemp ? 'snowCold' : 'snow';
  if ((where === 'ground' || where === 'exposed') && surface === 'hard' && (env.wet ?? 0) >= P.wetMin) return 'wet';
  if (where === 'ground' && (surface === 'grass' || surface === 'gravel') && P.leafMonths.includes(env.month)) return 'leaves';
  return surface;
}

/** A rounded sole contact plus a filtered scuff, shared by self and positional peers. */
export function synthFootstep(ctx, noiseBuffer, dest, surface = 'wood', random = Math.random) {
  const p = F.profiles[surface] ?? F.profiles[surface === 'outside' ? 'hard' : 'wood'];
  const t = ctx.currentTime, variation = 1 + (random() * 2 - 1) * F.variation;
  const tone = ctx.createOscillator(), noise = ctx.createBufferSource(), filter = ctx.createBiquadFilter();
  tone.type = 'sine'; tone.frequency.setValueAtTime(p.hz * variation, t);
  tone.frequency.exponentialRampToValueAtTime(p.endHz, t + p.duration);
  noise.buffer = noiseBuffer; filter.type = 'lowpass'; filter.frequency.value = p.cutoff; filter.Q.value = F.noiseQ;
  const envelope = (source, peak, grain = 0) => {
    const gain = ctx.createGain(); gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak * variation, t + F.attack);
    gain.gain.exponentialRampToValueAtTime(F.releaseFloor, t + p.duration);
    gain.gain.linearRampToValueAtTime(0, t + p.duration + F.sourceTail);
    if (grain) { // crackle: a second gain stage whose value curve flickers (snow crunch, leaf rustle) - one node, no extra source
      const flicker = ctx.createGain(), c = new Float32Array(grain * 2);
      for (let i = 0; i < c.length; i++) c[i] = i % 2 ? 1 : F.grainFloor + random() * (1 - F.grainFloor);
      flicker.gain.setValueCurveAtTime(c, t, p.duration); source.connect(flicker).connect(gain).connect(dest); return;
    }
    source.connect(gain).connect(dest);
  };
  envelope(tone, p.body); noise.connect(filter); envelope(filter, p.noise, p.grain);
  if (p.partial) { // a short extra sine: the cold-snow squeak, the stairwell's ring
    const q = p.partial, o = ctx.createOscillator(), g = ctx.createGain(), hz = q.hz * variation;
    o.type = 'sine'; o.frequency.setValueAtTime(hz, t); o.frequency.linearRampToValueAtTime(q.endHz * variation, t + q.duration);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(q.gain, t + F.attack); g.gain.linearRampToValueAtTime(0, t + q.duration);
    o.connect(g).connect(dest); o.start(t); o.stop(t + q.duration + F.sourceTail);
  }
  tone.start(t); noise.start(t, random());
  tone.stop(t + p.duration + F.sourceTail); noise.stop(t + p.duration + F.sourceTail);
}

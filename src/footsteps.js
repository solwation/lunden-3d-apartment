import { FOOTSTEPS as F } from './config.js';

/** A rounded sole contact plus a filtered scuff, shared by self and positional peers. */
export function synthFootstep(ctx, noiseBuffer, dest, surface = 'wood', random = Math.random) {
  const p = F.profiles[surface] ?? F.profiles[surface === 'outside' ? 'hard' : 'wood'];
  const t = ctx.currentTime, variation = 1 + (random() * 2 - 1) * F.variation;
  const tone = ctx.createOscillator(), noise = ctx.createBufferSource(), filter = ctx.createBiquadFilter();
  tone.type = 'sine'; tone.frequency.setValueAtTime(p.hz * variation, t);
  tone.frequency.exponentialRampToValueAtTime(p.endHz, t + p.duration);
  noise.buffer = noiseBuffer; filter.type = 'lowpass'; filter.frequency.value = p.cutoff; filter.Q.value = F.noiseQ;
  const envelope = (source, peak) => {
    const gain = ctx.createGain(); gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak * variation, t + F.attack);
    gain.gain.exponentialRampToValueAtTime(F.releaseFloor, t + p.duration);
    gain.gain.linearRampToValueAtTime(0, t + p.duration + F.sourceTail);
    source.connect(gain).connect(dest);
  };
  envelope(tone, p.body); noise.connect(filter); envelope(filter, p.noise);
  tone.start(t); noise.start(t, random());
  tone.stop(t + p.duration + F.sourceTail); noise.stop(t + p.duration + F.sourceTail);
}

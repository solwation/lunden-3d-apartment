// Sound effects, synthesised with Web Audio (no sound files). Positional: each effect can be
// given a world position and is panned/attenuated relative to the camera.
// The AudioContext can only start after a user gesture — call initAudio() from a click.

let ctx = null, master = null, noiseBuf = null;
let muted = false;

export function initAudio() {
  if (ctx) { ctx.resume?.(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.8;
  master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

export function toggleMuted() {
  muted = !muted;
  if (master) master.gain.setTargetAtTime(muted ? 0 : 0.8, ctx.currentTime, 0.05);
  return muted;
}
export const isMuted = () => muted;
/** The running AudioContext, its master gain and the shared noise buffer (music, sonos.js), or null before initAudio. */
export const audioParts = () => (ctx ? { ctx, master, noiseBuf } : null);

/** Keep the listener on the camera. */
export function updateListener(camera) {
  if (!ctx) return;
  const l = ctx.listener, p = camera.position;
  const f = { x: -Math.sin(camera.rotation.y), z: -Math.cos(camera.rotation.y) };
  if (l.positionX) {
    l.positionX.value = p.x; l.positionY.value = p.y; l.positionZ.value = p.z;
    l.forwardX.value = f.x; l.forwardY.value = 0; l.forwardZ.value = f.z;
    l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
  } else {
    l.setPosition(p.x, p.y, p.z);
    l.setOrientation(f.x, 0, f.z, 0, 1, 0);
  }
}

/** Output node for one effect: positional panner (if pos given) → master. */
function out(pos, gain = 1) {
  const g = ctx.createGain();
  g.gain.value = gain;
  if (pos) {
    const p = ctx.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = 1.2;
    p.rolloffFactor = 1.2;
    p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
    g.connect(p).connect(master);
  } else {
    g.connect(master);
  }
  return g;
}

function noise(t0, dur, dest, { type = 'bandpass', freq = 1000, q = 1, gain = 1, attack = 0.005 } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(dest);
  src.start(t0, Math.random());
  src.stop(t0 + dur + 0.05);
  return { f, g };
}

function tone(t0, dur, dest, { type = 'sine', from = 440, to = from, gain = 0.5 } = {}) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(from, t0);
  o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(dest);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

const ready = () => ctx && !muted && ctx.state !== 'closed';

function latch(t, dest, gain = 0.5) {
  noise(t, 0.03, dest, { type: 'highpass', freq: 2500, gain });
  tone(t, 0.05, dest, { from: 1900, to: 1500, gain: gain * 0.25 });
}

function thump(t, dest, gain = 0.8) {
  tone(t, 0.16, dest, { from: 95, to: 45, gain });
  noise(t, 0.09, dest, { type: 'lowpass', freq: 700, gain: gain * 0.6 });
}

export const sfx = {
  /** Handle + latch, then the leaf swinging through the air. */
  doorOpen(pos) {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(pos);
    latch(t, d);
    noise(t + 0.05, 0.5, d, { freq: 380, q: 0.7, gain: 0.12, attack: 0.15 });
    // a faint hinge creak
    const o = ctx.createOscillator(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(210, t + 0.08);
    o.frequency.linearRampToValueAtTime(170, t + 0.45);
    bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 9;
    g.gain.setValueAtTime(0, t + 0.08);
    g.gain.linearRampToValueAtTime(0.05, t + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(bp).connect(g).connect(d);
    o.start(t + 0.08); o.stop(t + 0.55);
  },
  /** Swing shut, then the leaf hits the frame and the latch catches (after `delay` s). */
  doorClose(pos, delay = 0.5) {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(pos);
    noise(t, delay, d, { freq: 380, q: 0.7, gain: 0.1, attack: delay * 0.7 });
    thump(t + delay, d);
    latch(t + delay + 0.015, d, 0.4);
  },
  /** Sliding door / wardrobe panel rolling on its track. */
  slide(pos, { dur = 0.5, wardrobe = false } = {}) {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(pos);
    const { f } = noise(t, dur, d, { freq: wardrobe ? 1500 : 900, q: 0.9, gain: wardrobe ? 0.18 : 0.25, attack: 0.08 });
    f.frequency.linearRampToValueAtTime(wardrobe ? 1100 : 650, t + dur);
    noise(t + dur - 0.03, 0.06, d, { type: 'highpass', freq: 1800, gain: 0.25 });
    tone(t + dur - 0.03, 0.08, d, { from: wardrobe ? 260 : 160, to: 90, gain: 0.25 });
  },
  /** "Mi-aa-ow": sawtooth voice through moving formants. pitch ~1 = average cat. */
  /** Meow. `voice` (rare breeds): 'trill' = soft rolling mrrrp that rises at the end (perser),
   * 'rasp' = long, loud, hoarse and insistent (sphynx); 'kitten' (#363) = a short, high, thin squeak; null = the ordinary meow. */
  meow(pos, pitch = 1, voice = null) {
    if (!ready()) return;
    const kit = voice === 'kitten';
    const t = ctx.currentTime, d = out(pos, voice === 'rasp' ? 1.15 : voice === 'trill' ? 0.75 : kit ? 0.6 : 0.9);
    const dur = voice === 'rasp' ? 0.95 + Math.random() * 0.35 : kit ? 0.28 + Math.random() * 0.14 : 0.55 + Math.random() * 0.35;
    const f0 = 480 * pitch * (kit ? 1.75 : 1);
    const o = ctx.createOscillator();
    o.type = voice === 'trill' ? 'triangle' : 'sawtooth';
    if (voice === 'trill') { // low rolling start, then a questioning rise
      o.frequency.setValueAtTime(f0 * 0.7, t);
      o.frequency.linearRampToValueAtTime(f0 * 0.85, t + dur * 0.45);
      o.frequency.linearRampToValueAtTime(f0 * 1.45, t + dur);
    } else {
      o.frequency.setValueAtTime(f0 * 0.9, t);
      o.frequency.linearRampToValueAtTime(f0 * (voice === 'rasp' ? 1.15 : 1.3), t + dur * 0.3);
      o.frequency.linearRampToValueAtTime(f0 * 0.75, t + dur);
    }
    const vib = ctx.createOscillator(), vg = ctx.createGain();
    vib.frequency.value = voice === 'rasp' ? 9 : 6; vg.gain.value = f0 * (voice === 'rasp' ? 0.05 : 0.02);
    vib.connect(vg).connect(o.frequency);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.35, t + 0.05);
    env.gain.setValueAtTime(0.35, t + dur * 0.6);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let src = o;
    if (voice === 'trill') { // the rolled r: amplitude flutter over the first half
      const am = ctx.createGain(), fl = ctx.createOscillator(), fd = ctx.createGain();
      am.gain.value = 0.6;
      fl.frequency.value = 28; fd.gain.setValueAtTime(0.45, t); fd.gain.linearRampToValueAtTime(0, t + dur * 0.5);
      fl.connect(fd).connect(am.gain);
      o.connect(am);
      src = am;
      fl.start(t); fl.stop(t + dur + 0.05);
    }
    src.connect(env);
    if (voice === 'rasp') noise(t, dur, d, { type: 'bandpass', freq: 2600, q: 1.5, gain: 0.12, attack: 0.05 }); // hoarse
    // formants i → a → o
    const fk = kit ? 1.6 : 1; // a kitten's small mouth: the formants higher too
    for (const [a, b, c, q, gain] of [[350, 900, 550, 6, 1], [2300, 1400, 900, 8, 0.6], [3200, 2800, 2500, 10, 0.25]]) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.Q.value = q;
      bp.frequency.setValueAtTime(a * fk, t);
      bp.frequency.linearRampToValueAtTime(b * fk, t + dur * 0.35);
      bp.frequency.linearRampToValueAtTime(c * fk, t + dur);
      const g = ctx.createGain(); g.gain.value = gain;
      env.connect(bp).connect(g).connect(d);
    }
    o.start(t); vib.start(t);
    o.stop(t + dur + 0.05); vib.stop(t + dur + 0.05);
  },
  /** Toilet lid: a soft porcelain clack when it lands (on the seat, or nearly against the tank). */
  lid(p, opening) {
    if (!ready()) return;
    const t = ctx.currentTime + 0.4, d = out({ x: p.x, y: p.y + 0.5, z: p.z }, 0.8);
    noise(t, 0.04, d, { type: 'highpass', freq: 1800, gain: opening ? 0.2 : 0.35 });
    tone(t, 0.06, d, { from: 900, to: 600, gain: opening ? 0.08 : 0.14 });
  },
  /** Purring for `dur` seconds: a ~26 Hz pulse train through a low formant, breathing in and out.
   * `voice` 'trill' (perser) adds little mrrp chirps, 'rasp' (sphynx) purrs deeper, rougher, louder, 'kitten' (#363)
   * purrs quieter, faster and higher. */
  purr(pos, dur = 4, pitch = 1, voice = null) {
    if (!ready()) return;
    if (voice === 'kitten') pitch *= 1.45;
    const t = ctx.currentTime, d = out(pos, voice === 'rasp' ? 1.4 : voice === 'kitten' ? 0.7 : 1.1);
    if (voice === 'trill') {
      for (let c = 0.6; c < dur - 0.3; c += 1.1 + Math.random() * 0.5) {
        tone(t + c, 0.14, d, { type: 'triangle', from: 560 * pitch, to: 880 * pitch, gain: 0.07 });
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = (voice === 'rasp' ? 420 : 260) * pitch;
    const am = ctx.createGain();
    am.gain.value = 0.5;
    const lfo = ctx.createOscillator(), depth = ctx.createGain();
    lfo.type = voice === 'rasp' ? 'square' : 'sawtooth';
    lfo.frequency.value = (voice === 'rasp' ? 21 : 26) * pitch; depth.gain.value = 0.5;
    lfo.connect(depth).connect(am.gain);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    // inhale (quieter) / exhale (louder), ~1.6 s per breath
    for (let b = 0; b * 1.6 < dur; b++) {
      const t0 = t + b * 1.6;
      env.gain.linearRampToValueAtTime(0.5, t0 + 0.15);
      env.gain.linearRampToValueAtTime(0.25, t0 + 0.75);
      env.gain.linearRampToValueAtTime(0.9, t0 + 0.95);
      env.gain.linearRampToValueAtTime(0.35, t0 + 1.55);
    }
    env.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(lp).connect(am).connect(env).connect(d);
    src.start(t); lfo.start(t);
    src.stop(t + dur + 0.1); lfo.stop(t + dur + 0.1);
  },
  /** Coffee brewing for `dur` s: a hissing, gurgling heater (filtered noise with bubble pops) and
   * drips into the jug; stop() fades it out early. */
  brew(pos, dur = 18) {
    if (!ready()) return null;
    const t = ctx.currentTime, d = out(pos, 0.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1, t + 1.5);
    g.gain.setValueAtTime(1, t + dur - 1.5);
    g.gain.linearRampToValueAtTime(0, t + dur);
    g.connect(d);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 900;
    const hiss = ctx.createGain();
    hiss.gain.value = 0.08;
    src.connect(lp).connect(hiss).connect(g);
    src.start(t, Math.random());
    src.stop(t + dur + 0.1);
    for (let k = 0.6; k < dur - 0.4; k += 0.05 + Math.random() * 0.22) { // bubbles in the heater
      tone(t + k, 0.035, g, { from: 180 + Math.random() * 260, to: 90 + Math.random() * 80, gain: 0.05 + Math.random() * 0.06 });
    }
    for (let k = 2.5; k < dur - 0.6; k += 0.35 + Math.random() * 0.5) { // drips into the jug
      tone(t + k, 0.05, g, { from: 1500 + Math.random() * 700, to: 700, gain: 0.03 });
    }
    return {
      stop() {
        const t1 = ctx.currentTime;
        g.gain.cancelScheduledValues(t1);
        g.gain.setValueAtTime(g.gain.value, t1);
        g.gain.linearRampToValueAtTime(0, t1 + 0.3);
        src.stop(t1 + 0.35);
      },
    };
  },
  /** Running water until stop() is called: looping filtered noise (a hiss), louder for showers. */
  water(pos, shower = false) {
    if (!ready()) return null;
    const t = ctx.currentTime, d = out(pos, shower ? 1.0 : 0.7);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = shower ? 1600 : 2600; bp.Q.value = shower ? 0.35 : 0.7;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 350;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(shower ? 0.5 : 0.32, t + 0.25);
    src.connect(bp).connect(hp).connect(g).connect(d);
    src.start(t, Math.random());
    return {
      stop() {
        const t1 = ctx.currentTime;
        g.gain.cancelScheduledValues(t1);
        g.gain.setValueAtTime(g.gain.value, t1);
        g.gain.linearRampToValueAtTime(0, t1 + 0.25);
        src.stop(t1 + 0.3);
      },
    };
  },
  /** A toilet flush (#155): a rushing gurgle that drains away, then the tank refilling (a thin hiss) for `refill` s. */
  flush(pos, refill = 6) {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(pos, 0.9);
    const rush = ctx.createBufferSource(), fill = ctx.createBufferSource();
    rush.buffer = fill.buffer = noiseBuf; rush.loop = fill.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 2;
    lp.frequency.setValueAtTime(1800, t); lp.frequency.exponentialRampToValueAtTime(260, t + 2.4);
    const g1 = ctx.createGain();
    g1.gain.setValueAtTime(0, t); g1.gain.linearRampToValueAtTime(0.55, t + 0.15); g1.gain.exponentialRampToValueAtTime(0.001, t + 2.8);
    rush.connect(lp).connect(g1).connect(d);
    for (let i = 0; i < 6; i++) tone(t + 1.2 + i * 0.22 + Math.random() * 0.1, 0.12, d, { from: 220 + Math.random() * 120, to: 90, gain: 0.12 }); // gurgles
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 1.2;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0, t + 1.5); g2.gain.linearRampToValueAtTime(0.08, t + 2.2);
    g2.gain.setValueAtTime(0.08, t + refill - 0.6); g2.gain.linearRampToValueAtTime(0, t + refill);
    fill.connect(bp).connect(g2).connect(d);
    rush.start(t, Math.random()); rush.stop(t + 3);
    fill.start(t + 1.5, Math.random()); fill.stop(t + refill + 0.1);
  },
  /** Wind through an open window until stop(): looping low noise, gusting slowly (an LFO on the filter and gain). */
  wind(pos) {
    if (!ready()) return null;
    const t = ctx.currentTime, d = out(pos, 0.6);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16, t + 1.2);
    const lfo = ctx.createOscillator(), depth = ctx.createGain(), gust = ctx.createGain();
    lfo.frequency.value = 0.13; depth.gain.value = 260; gust.gain.value = 0.07;
    lfo.connect(depth).connect(lp.frequency);
    lfo.connect(gust).connect(g.gain);
    src.connect(lp).connect(g).connect(d);
    src.start(t, Math.random());
    lfo.start(t);
    return {
      stop() {
        const t1 = ctx.currentTime;
        g.gain.cancelScheduledValues(t1);
        g.gain.setValueAtTime(g.gain.value, t1);
        g.gain.linearRampToValueAtTime(0, t1 + 0.4);
        src.stop(t1 + 0.45); lfo.stop(t1 + 0.45);
      },
    };
  },
  /** Rain (#248): a looping hiss whose level and muffling are set every frame (`set(gain, cutoff)`); null before audio. */
  rain() {
    if (!ctx) return null;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 400;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7000;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(hp).connect(lp).connect(g).connect(master);
    src.start();
    return {
      set(gain, cutoff) {
        const t = ctx.currentTime;
        g.gain.setTargetAtTime(gain, t, 0.3);
        lp.frequency.setTargetAtTime(cutoff, t, 0.3);
      },
    };
  },
  /** Thunder (#248) `delay` s from now: a crack if it is near (`near` 0…1), then a long rolling rumble; `inside` muffles. */
  thunder(delay, near, inside = false) {
    if (!ready()) return;
    const t = ctx.currentTime + delay, d = out(null, inside ? 0.45 : 1);
    if (near > 0.6) noise(t, 0.35, d, { type: 'highpass', freq: 900, gain: 0.5 * near, attack: 0.002 });
    const dur = 3.5 + 3 * (1 - near) + Math.random() * 2;
    noise(t, dur, d, { type: 'lowpass', freq: inside ? 160 : 260 + 300 * near, q: 0.7, gain: 0.55 + 0.35 * near, attack: 0.08 + 0.4 * (1 - near) });
    for (let k = 0; k < 3; k++) noise(t + 0.4 + Math.random() * dur * 0.6, 1.2 + Math.random() * 1.5, d, { type: 'lowpass', freq: 140, q: 1, gain: 0.35, attack: 0.15 });
  },
  /** "Iiiiih!" — a startled shriek (cold shower): voiced sawtooth through the formants of [i]. */
  shriek() {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(null, 0.9), dur = 1.1;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(380, t);
    o.frequency.exponentialRampToValueAtTime(620, t + 0.18);
    o.frequency.linearRampToValueAtTime(560, t + dur);
    const vib = ctx.createOscillator(), vg = ctx.createGain();
    vib.frequency.value = 7; vg.gain.value = 14;
    vib.connect(vg).connect(o.frequency);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.4, t + 0.05);
    env.gain.setValueAtTime(0.4, t + dur * 0.7);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(env);
    for (const [f, q, gain] of [[300, 5, 0.7], [2400, 9, 1], [3100, 10, 0.5]]) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      const g = ctx.createGain(); g.gain.value = gain;
      env.connect(bp).connect(g).connect(d);
    }
    o.start(t); vib.start(t);
    o.stop(t + dur + 0.05); vib.stop(t + dur + 0.05);
  },
  /** Fridge door: the seal letting go (opening) or a soft thud (closing). */
  fridge(pos, opening) {
    if (!ready()) return;
    const t = ctx.currentTime + (opening ? 0 : 0.55), d = out(pos, 0.9);
    noise(t, opening ? 0.12 : 0.08, d, { type: 'lowpass', freq: opening ? 900 : 500, gain: 0.35 });
    tone(t, 0.1, d, { from: opening ? 140 : 90, to: 60, gain: 0.2 });
  },
  /** Light switch click. */
  /** A car door (#250): opening, the handle's click and the seal letting go; closing, a solid low "chunk" after `delay` s. */
  carDoor(pos, opening, delay = 0.45) {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(pos, 0.9);
    if (opening) { latch(t, d, 0.35); noise(t + 0.03, 0.12, d, { type: 'lowpass', freq: 600, gain: 0.25 }); return; }
    noise(t, delay, d, { freq: 300, q: 0.7, gain: 0.05, attack: delay * 0.8 });
    tone(t + delay, 0.18, d, { from: 110, to: 55, gain: 0.7 });
    noise(t + delay, 0.12, d, { type: 'lowpass', freq: 450, gain: 0.6 });
    latch(t + delay + 0.01, d, 0.25);
  },
  /** Car key remote (lock button): the car answers with two short beeps. */
  carBeep(pos) {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(pos, 0.8);
    tone(t, 0.03, d, { type: 'square', from: 3200, gain: 0.04 }); // the button's own chirp
    for (const k of [0, 1]) tone(t + 0.12 + k * 0.2, 0.11, d, { type: 'square', from: 2050, gain: 0.12 });
  },
    /** Oven door: a spring creak while it drops (or lifts), a soft thunk at the end. */
  ovenDoor(pos, opening) {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(pos, 0.9);
    tone(t, 0.32, d, { type: 'sawtooth', from: opening ? 340 : 260, to: opening ? 220 : 380, gain: 0.025 });
    noise(t + 0.38, 0.06, d, { type: 'lowpass', freq: 700, gain: 0.3 });
    tone(t + 0.38, 0.08, d, { from: 120, to: 70, gain: 0.18 });
  },
  /** Microwave door: the latch click when it opens, a plasticky clack when it shuts. */
  microDoor(pos, opening) {
    if (!ready()) return;
    const t = ctx.currentTime + (opening ? 0 : 0.42), d = out(pos, 0.8);
    noise(t, 0.025, d, { type: 'highpass', freq: 2200, gain: 0.35 });
    tone(t, 0.04, d, { type: 'square', from: opening ? 1400 : 900, to: 600, gain: 0.05 });
  },
    /** Parasol: a fabric rustle as the canopy folds or unfolds, a click of the runner at the end. */
  parasol(pos, opening) {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(pos, 0.9);
    noise(t, 0.35, d, { type: 'bandpass', freq: opening ? 1800 : 1300, q: 0.8, gain: 0.18, attack: 0.08 });
    noise(t + 0.38, 0.02, d, { type: 'highpass', freq: 3000, gain: 0.3 });
    tone(t + 0.38, 0.03, d, { type: 'square', from: 1200, to: 800, gain: 0.04 });
  },
    /** TV on/off: a soft relay click, and a short rising (on) or falling (off) tone. */
  /** A cabinet door: the soft-close hinge's whisper and a muffled knock when it shuts. */
  cupboard(pos, opening) {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(pos, 0.8);
    noise(t, 0.12, d, { type: 'bandpass', freq: opening ? 1400 : 900, q: 0.8, gain: 0.06, attack: 0.03 });
    if (!opening) { noise(t + 0.32, 0.05, d, { type: 'lowpass', freq: 600, gain: 0.25 }); tone(t + 0.32, 0.06, d, { from: 160, to: 90, gain: 0.12 }); }
  },
  /** A TV changing channel: a short burst of static. */
  tvStatic(pos) {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(pos, 0.7);
    noise(t, 0.3, d, { type: 'highpass', freq: 2200, gain: 0.08, attack: 0.01 });
  },
  tvClick(pos, on) {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(pos, 0.7);
    noise(t, 0.015, d, { type: 'highpass', freq: 2500, gain: 0.25 });
    tone(t + 0.03, 0.18, d, { from: on ? 520 : 780, to: on ? 780 : 520, gain: 0.05 });
  },
  /** One step of the laptop's short-video beat (#283): 'kick', 'snare', 'hat' or a 'blip' at `freq` Hz, quiet (`gain`). */
  beat(pos, kind, gain = 0.12, freq = 440) {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(pos, gain);
    if (kind === 'kick') tone(t, 0.18, d, { from: 140, to: 45, gain: 0.9 });
    else if (kind === 'snare') { noise(t, 0.12, d, { type: 'bandpass', freq: 1800, q: 0.8, gain: 0.5 }); tone(t, 0.08, d, { type: 'triangle', from: 220, to: 160, gain: 0.25 }); }
    else if (kind === 'hat') noise(t, 0.035, d, { type: 'highpass', freq: 7000, gain: 0.25 });
    else tone(t, 0.14, d, { type: 'square', from: freq, to: freq * 0.98, gain: 0.12 });
  },
    /** Sitting down / lying down / getting up: a soft fabric rustle and a creak of the cushion. */
  rustle(pos) {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(pos, 0.8);
    noise(t, 0.4, d, { type: 'bandpass', freq: 900, q: 0.7, gain: 0.16, attack: 0.1 });
    tone(t + 0.15, 0.2, d, { type: 'triangle', from: 140, to: 95, gain: 0.04 });
  },
    /** PC fans: a soft steady whoosh until stop(). */
  /** A bicycle bell (#114): two quick metallic dings. */
  bell(pos) {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(pos, 0.7);
    for (const k of [0, 0.16]) { tone(t + k, 0.5, d, { from: 2350, gain: 0.12 }); tone(t + k, 0.35, d, { from: 3520, gain: 0.05 }); }
  },
  /** An electric car going by (#173): a soft rising whine + tyre noise; move(pos, speed) each frame, stop(). */
  evHum(pos) {
    if (!ready()) return null;
    const t = ctx.currentTime, g = ctx.createGain(), p = ctx.createPanner();
    Object.assign(p, { panningModel: 'equalpower', distanceModel: 'inverse', refDistance: 3, rolloffFactor: 1 });
    p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 0.8);
    g.connect(p).connect(master);
    const whine = ctx.createOscillator(), wg = ctx.createGain();
    whine.type = 'sine'; whine.frequency.value = 300; wg.gain.value = 0.025;
    whine.connect(wg).connect(g);
    const src = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), ng = ctx.createGain();
    src.buffer = noiseBuf; src.loop = true; lp.type = 'lowpass'; lp.frequency.value = 500; ng.gain.value = 0.05;
    src.connect(lp).connect(ng).connect(g);
    whine.start(t); src.start(t, Math.random());
    return {
      move(q, speed) {
        const now = ctx.currentTime;
        p.positionX.setTargetAtTime(q.x, now, 0.05); p.positionY.setTargetAtTime(q.y, now, 0.05); p.positionZ.setTargetAtTime(q.z, now, 0.05);
        whine.frequency.setTargetAtTime(220 + speed * 70, now, 0.2);
        ng.gain.setTargetAtTime(0.01 + speed * 0.012, now, 0.2);
      },
      stop() { const t1 = ctx.currentTime; g.gain.cancelScheduledValues(t1); g.gain.setValueAtTime(g.gain.value, t1); g.gain.linearRampToValueAtTime(0, t1 + 0.6); whine.stop(t1 + 0.7); src.stop(t1 + 0.7); },
    };
  },
  pcFan(pos) {
    if (!ready()) return null;
    const t = ctx.currentTime, d = out(pos, 0.5);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.08, t + 1);
    src.connect(lp).connect(g).connect(d);
    src.start(t, Math.random());
    return { stop() { const t1 = ctx.currentTime; g.gain.cancelScheduledValues(t1); g.gain.setValueAtTime(g.gain.value, t1); g.gain.linearRampToValueAtTime(0, t1 + 0.4); src.stop(t1 + 0.5); } };
  },
  /** The induction hob's faint hum while it is on (#158): a soft high whine over a little filtered noise. */
  hobHum(pos) {
    if (!ready()) return null;
    const t = ctx.currentTime, d = out(pos, 0.4);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 1180;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3000; bp.Q.value = 2;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.025, t + 0.8);
    const gn = ctx.createGain(); gn.gain.value = 0.6;
    o.connect(g); src.connect(bp).connect(gn).connect(g); g.connect(d);
    o.start(t); src.start(t, Math.random());
    return { stop() { const t1 = ctx.currentTime; g.gain.cancelScheduledValues(t1); g.gain.setValueAtTime(g.gain.value, t1); g.gain.linearRampToValueAtTime(0, t1 + 0.3); o.stop(t1 + 0.35); src.stop(t1 + 0.35); } };
  },
  /** Game sounds from the PC speakers: a laser 'pew' or an explosion 'boom'. */
  game(pos, kind) {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(pos, 0.6);
    if (kind === 'boom') {
      noise(t, 0.45, d, { type: 'lowpass', freq: 500, gain: 0.3, attack: 0.005 });
      tone(t, 0.35, d, { from: 120, to: 40, gain: 0.18 });
    } else {
      tone(t, 0.12, d, { type: 'square', from: 1800, to: 300, gain: 0.05 });
    }
  },
    /** Lightsaber ignition: a snap and a rising hiss into the hum. */
  saberOn(pos) {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(pos, 0.9);
    noise(t, 0.05, d, { type: 'highpass', freq: 2500, gain: 0.3 });
    tone(t, 0.35, d, { type: 'sawtooth', from: 80, to: 140, gain: 0.12 });
    noise(t + 0.02, 0.3, d, { type: 'bandpass', freq: 1800, q: 1, gain: 0.15, attack: 0.05 });
  },
  /** Lightsaber off: a falling hiss. */
  saberOff(pos) {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(pos, 0.9);
    tone(t, 0.3, d, { type: 'sawtooth', from: 140, to: 50, gain: 0.1 });
    noise(t, 0.25, d, { type: 'bandpass', freq: 1200, q: 1, gain: 0.1 });
  },
  /** The hum while it is lit; set(0…1) bends it with the movement. */
  saberHum(pos) {
    if (!ready()) return null;
    const t = ctx.currentTime, d = out(pos, 0.7);
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o1.type = 'sawtooth'; o1.frequency.value = 90; o2.type = 'sawtooth'; o2.frequency.value = 92.5;
    lp.type = 'lowpass'; lp.frequency.value = 420;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.06, t + 0.3);
    o1.connect(lp); o2.connect(lp); lp.connect(g).connect(d);
    o1.start(t); o2.start(t);
    return {
      set(k) { const now = ctx.currentTime; o1.frequency.setTargetAtTime(90 + 40 * k, now, 0.05); o2.frequency.setTargetAtTime(92.5 + 42 * k, now, 0.05); g.gain.setTargetAtTime(0.06 + 0.06 * k, now, 0.05); },
      stop() { const now = ctx.currentTime; g.gain.cancelScheduledValues(now); g.gain.setValueAtTime(g.gain.value, now); g.gain.linearRampToValueAtTime(0, now + 0.2); o1.stop(now + 0.25); o2.stop(now + 0.25); },
    };
  },
  /** A swing: a whoosh, louder and higher with the speed (0…1). */
  saberSwing(pos, k = 0.5) {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(pos, 0.9);
    noise(t, 0.28, d, { type: 'bandpass', freq: 500 + 900 * k, q: 1.2, gain: 0.12 + 0.18 * k, attack: 0.06 });
    tone(t, 0.25, d, { type: 'sawtooth', from: 110 + 60 * k, to: 80, gain: 0.05 + 0.05 * k });
  },
    /** The blade burning into something: a crackling, frying hiss. */
  sizzle(pos) {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(pos, 0.9);
    noise(t, 0.45, d, { type: 'highpass', freq: 3200, gain: 0.22, attack: 0.01 });
    noise(t, 0.2, d, { type: 'bandpass', freq: 900, q: 0.8, gain: 0.18 });
    for (let i = 0; i < 6; i++) noise(t + Math.random() * 0.35, 0.02, d, { type: 'highpass', freq: 2000, gain: 0.3 + Math.random() * 0.2, attack: 0.001 });
  },
    /** A foam dart hitting something with paint: a wet little splat. */
  splat(pos) {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(pos, 0.8);
    noise(t, 0.12, d, { type: 'lowpass', freq: 1400, gain: 0.35, attack: 0.002 });
    tone(t, 0.08, d, { type: 'sine', from: 320, to: 90, gain: 0.15 });
  },
    /** A gulp: a soft throat-click and a short low swallow (beer, coffee). */
  gulp(pos) {
    if (!ready()) return;
    const t = ctx.currentTime + 0.25, d = out(pos, 0.9);
    tone(t, 0.12, d, { type: 'sine', from: 180, to: 90, gain: 0.25 });
    noise(t, 0.08, d, { type: 'lowpass', freq: 600, gain: 0.25 });
    tone(t + 0.18, 0.1, d, { type: 'sine', from: 150, to: 80, gain: 0.15 });
  },
  /** The cooker hood's fan (#194): a low, steady whoosh until stopped. */
  fan(pos) {
    if (!ready()) return null;
    const t = ctx.currentTime, d = out(pos, 0.6);
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18, t + 1.2);
    src.connect(lp).connect(g).connect(d); src.start(t, Math.random());
    return { stop() { const t1 = ctx.currentTime; g.gain.cancelScheduledValues(t1); g.gain.setValueAtTime(g.gain.value, t1); g.gain.linearRampToValueAtTime(0, t1 + 0.8); src.stop(t1 + 0.85); } };
  },
  /** Lighting the grill (#204): a whoomp as the fire catches. */
  ignite(pos) {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(pos, 1);
    noise(t, 0.7, d, { type: 'lowpass', freq: 500, gain: 0.5, attack: 0.08 });
    tone(t, 0.4, d, { type: 'sine', from: 70, to: 45, gain: 0.3 });
  },
  /** A fire's steady roar (#204) until stopped. */
  fire(pos) {
    if (!ready()) return null;
    const t = ctx.currentTime, d = out(pos, 0.9);
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 380; bp.Q.value = 0.6;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.22, t + 1.5);
    src.connect(bp).connect(g).connect(d); src.start(t, Math.random());
    return { stop() { const t1 = ctx.currentTime; g.gain.cancelScheduledValues(t1); g.gain.setValueAtTime(g.gain.value, t1); g.gain.linearRampToValueAtTime(0, t1 + 1.5); src.stop(t1 + 1.6); } };
  },
  /** A few crackling pops of burning wood / charcoal (#204). */
  crackle(pos) {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(pos, 0.9);
    const n = 1 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) noise(t + Math.random() * 0.12, 0.006 + Math.random() * 0.012, d, { type: 'highpass', freq: 1500 + Math.random() * 2500, gain: 0.25 + Math.random() * 0.35, attack: 0.001 });
  },
  /** The smoke alarm (#194): a loud, shrill beep-beep-beep until stopped. */
  alarm(pos) {
    if (!ready()) return null;
    const t = ctx.currentTime, d = out(pos, 1.2);
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 3150;
    const g = ctx.createGain(); g.gain.value = 0;
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 2.2; // on/off a couple of times a second
    const lg = ctx.createGain(); lg.gain.value = 0.06;
    const bias = ctx.createConstantSource(); bias.offset.value = 0.06;
    lfo.connect(lg).connect(g.gain); bias.connect(g.gain);
    o.connect(g).connect(d);
    o.start(t); lfo.start(t); bias.start(t);
    return { stop() { const t1 = ctx.currentTime + 0.05; o.stop(t1); lfo.stop(t1); bias.stop(t1); } };
  },
  /** The fridge/freezer door alarm (#288): two short soft beeps. */
  /** The jetpack's roar (#359): low rumble + hiss; `set(k)` follows the thrust (0…1). On your own back: `pos` null =
   * right at the listener (a world position for one heard from afar). */
  jetRoar(pos = null) {
    if (!ready()) return null;
    const t = ctx.currentTime, d = out(pos, 1);
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const hp = ctx.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 2400; hp.Q.value = 0.7;
    const g = ctx.createGain(), gh = ctx.createGain(); g.gain.value = 0; gh.gain.value = 0;
    src.connect(lp).connect(g).connect(d); src.connect(hp).connect(gh).connect(d);
    const rum = ctx.createOscillator(), rg = ctx.createGain(); rum.type = 'sawtooth'; rum.frequency.value = 48; rg.gain.value = 0;
    rum.connect(rg).connect(d);
    src.start(t, Math.random()); rum.start(t);
    return {
      set(k) {
        const now = ctx.currentTime;
        g.gain.setTargetAtTime(0.32 * k, now, 0.06); gh.gain.setTargetAtTime(0.07 * k, now, 0.06); rg.gain.setTargetAtTime(0.05 * k, now, 0.08);
        lp.frequency.setTargetAtTime(500 + 900 * k, now, 0.1);
      },
      stop() { const t1 = ctx.currentTime; for (const x of [g, gh, rg]) { x.gain.cancelScheduledValues(t1); x.gain.setTargetAtTime(0, t1, 0.08); } src.stop(t1 + 0.6); rum.stop(t1 + 0.6); },
    };
  },
  /** The jetpack running hot (#359): a quick high double beep. */
  jetWarn() {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(null, 0.5);
    for (let i = 0; i < 2; i++) tone(t + i * 0.12, 0.08, d, { type: 'square', from: 2100, gain: 0.04 });
  },
  fridgeBeep(pos) {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(pos, 0.6);
    for (let i = 0; i < 2; i++) tone(t + i * 0.18, 0.12, d, { type: 'square', from: 1650, gain: 0.05 });
  },
  /** A frightened cat (#288): a hoarse hiss, then a short low growl. */
  hiss(pos, pitch = 1) {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(pos, 1);
    noise(t, 0.9, d, { type: 'highpass', freq: 2800, gain: 0.35, attack: 0.04 });
    noise(t, 0.7, d, { type: 'bandpass', freq: 5200, q: 2, gain: 0.2, attack: 0.03 });
    tone(t + 0.55, 0.45, d, { type: 'sawtooth', from: 210 * pitch, to: 160 * pitch, gain: 0.08 });
  },
  /** The air fryer is done (#287): `n` short high beeps. */
  fryerBeep(pos, n = 3) {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(pos, 0.7);
    for (let i = 0; i < n; i++) tone(t + i * 0.32, 0.18, d, { type: 'square', from: 2350, gain: 0.07 });
  },
  /** The toaster (#401): the lever pushed down and caught by its latch — a springy clack. */
  toasterDown(pos) {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(pos, 0.8);
    noise(t, 0.06, d, { type: 'bandpass', freq: 1800, q: 1.5, gain: 0.25 });
    tone(t, 0.08, d, { type: 'triangle', from: 700, to: 300, gain: 0.08 });
    latch(t + 0.07, d, 0.35);
  },
  /** The toaster heating (#401): a quiet tick of its timer over a faint element hum, until stop(). */
  toasterHum(pos) {
    if (!ready()) return null;
    const t = ctx.currentTime, d = out(pos, 0.5);
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 180; bp.Q.value = 3;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 0.6);
    src.connect(bp).connect(g).connect(d); src.start(t, Math.random());
    const tick = setInterval(() => { if (ready()) noise(ctx.currentTime, 0.012, d, { type: 'highpass', freq: 4000, gain: 0.07, attack: 0.001 }); }, 500);
    return { stop() { clearInterval(tick); const t1 = ctx.currentTime; g.gain.cancelScheduledValues(t1); g.gain.setValueAtTime(g.gain.value, t1); g.gain.linearRampToValueAtTime(0, t1 + 0.15); src.stop(t1 + 0.2); } };
  },
  /** The toaster done (#401): the spring lets go with a pop, then a small "pling". */
  toasterPop(pos) {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(pos, 0.9);
    noise(t, 0.05, d, { type: 'bandpass', freq: 1200, q: 1, gain: 0.35, attack: 0.002 });
    tone(t, 0.12, d, { type: 'triangle', from: 260, to: 520, gain: 0.12 });
    tone(t + 0.08, 0.6, d, { type: 'sine', from: 1760, gain: 0.06 });
    tone(t + 0.08, 0.5, d, { type: 'sine', from: 2640, gain: 0.025 });
  },
  /** A bite of something crispy (a fish finger, #162): a crunch, then a few soft chews. `k` = loudness. */
  chew(pos, k = 1) {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(pos, 0.8 * k);
    noise(t, 0.06, d, { type: 'bandpass', freq: 2600, q: 0.7, gain: 0.3, attack: 0.002 });
    for (let i = 0; i < 6; i++) noise(t + 0.03 + i * 0.012, 0.012, d, { type: 'highpass', freq: 2200, gain: 0.25 * Math.random(), attack: 0.001 });
    for (let i = 0; i < 3; i++) noise(t + 0.25 + i * 0.22, 0.09, d, { type: 'lowpass', freq: 500, gain: 0.18, attack: 0.02 });
  },
  /** Frozen fries poured from their bag into the air fryer's basket (#301): a plastic crinkle, then a rattle of sticks. */
  pourFries(pos) {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(pos, 0.8);
    noise(t, 0.7, d, { type: 'bandpass', freq: 3200, q: 0.6, gain: 0.08, attack: 0.05 });
    for (let i = 0; i < 26; i++) noise(t + 0.15 + Math.random() * 0.6, 0.02, d, { type: 'bandpass', freq: 1400 + Math.random() * 1800, q: 2, gain: 0.08 + 0.12 * Math.random(), attack: 0.001 });
  },
    /** A foam blaster: a springy thunk and a soft whoosh. */
  /** A rifle shot (#196): a sharp crack, a low thump and a short room tail — loud, not deafening. */
  gunshot(pos) {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(pos, 0.9);
    noise(t, 0.04, d, { type: 'highpass', freq: 1800, gain: 0.7, attack: 0.001 });
    noise(t, 0.12, d, { type: 'lowpass', freq: 700, gain: 0.6, attack: 0.002 });
    tone(t, 0.1, d, { type: 'sine', from: 140, to: 45, gain: 0.45 });
    noise(t + 0.03, 0.35, d, { type: 'bandpass', freq: 500, q: 0.7, gain: 0.08, attack: 0.03 });
  },
  /** The empty magazine pulled out, and a fresh one clicked in (#196). */
  magOut(pos) {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(pos, 0.7);
    noise(t, 0.05, d, { type: 'bandpass', freq: 2600, q: 3, gain: 0.25 });
    tone(t + 0.02, 0.04, d, { type: 'square', from: 900, to: 600, gain: 0.05 });
  },
  magIn(pos) {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(pos, 0.8);
    noise(t, 0.03, d, { type: 'bandpass', freq: 3200, q: 4, gain: 0.35 });
    noise(t + 0.09, 0.03, d, { type: 'bandpass', freq: 2400, q: 4, gain: 0.3 });
    tone(t + 0.09, 0.03, d, { type: 'square', from: 1400, to: 900, gain: 0.05 });
  },
  /** A magazine landing on the floor. */
  clatter(pos) {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(pos, 0.6);
    for (const k of [0, 0.07, 0.12]) noise(t + k, 0.05, d, { type: 'bandpass', freq: 1800 + k * 4000, q: 2, gain: 0.25 - k });
  },
  /** Glass (or china) shot to pieces (#263): a crack, then shards tinkling down. */
  shatter(pos, glass = true) {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(pos, 1);
    noise(t, 0.09, d, { type: 'highpass', freq: glass ? 2500 : 1200, gain: 0.7, attack: 0.001 });
    noise(t, 0.05, d, { type: 'lowpass', freq: glass ? 1200 : 700, gain: 0.35, attack: 0.001 });
    for (let i = 0; i < 14; i++) {
      const k = t + 0.02 + Math.random() * 0.45 * (i / 14 + 0.3);
      if (glass) tone(k, 0.05 + Math.random() * 0.08, d, { type: 'sine', from: 2800 + Math.random() * 4500, to: 2600 + Math.random() * 4000, gain: 0.05 + Math.random() * 0.06 });
      noise(k, 0.03, d, { type: 'bandpass', freq: (glass ? 4000 : 2200) + Math.random() * 3000, q: 4, gain: glass ? 0.2 : 0.3 });
    }
  },
  /** A basketball bouncing: a hollow thump, louder the harder (k 0..1). */
  bounce(pos, k = 1) {
    if (!ready() || k < 0.05) return;
    const t = ctx.currentTime, d = out(pos, 0.9);
    tone(t, 0.14, d, { type: 'sine', from: 150, to: 75, gain: 0.4 * k });
    noise(t, 0.04, d, { type: 'lowpass', freq: 700, gain: 0.3 * k, attack: 0.001 });
  },
  /** The ball through the net: a soft swish. */
  swish(pos) {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(pos, 0.9);
    noise(t, 0.35, d, { type: 'bandpass', freq: 2600, q: 0.7, gain: 0.3, attack: 0.04 });
    noise(t + 0.05, 0.25, d, { type: 'highpass', freq: 4000, gain: 0.12, attack: 0.03 });
  },
  nerf(pos) {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(pos, 0.8);
    noise(t, 0.05, d, { type: 'lowpass', freq: 900, gain: 0.35 });
    tone(t, 0.07, d, { type: 'triangle', from: 260, to: 120, gain: 0.12 });
    noise(t + 0.03, 0.2, d, { type: 'bandpass', freq: 1600, q: 1, gain: 0.08, attack: 0.02 });
  },
  /** A plush toy taken or put down (#269): a soft fabric whump. */
  plush(pos) {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(pos, 0.8);
    noise(t, 0.16, d, { type: 'lowpass', freq: 900, gain: 0.18, attack: 0.02 });
    tone(t, 0.1, d, { type: 'sine', from: 140, to: 80, gain: 0.08 });
  },
  /** Pingping hugged (#269): the plush squeezed, then a happy little squeak — two rising chirps. */
  squeak(pos) {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(pos, 0.9);
    noise(t, 0.3, d, { type: 'lowpass', freq: 700, gain: 0.16, attack: 0.08 });
    const p = 0.92 + Math.random() * 0.16;
    tone(t + 0.12, 0.11, d, { type: 'triangle', from: 950 * p, to: 1500 * p, gain: 0.09 });
    tone(t + 0.26, 0.16, d, { type: 'triangle', from: 1150 * p, to: 1900 * p, gain: 0.08 });
  },
  /** A magic pling: a few bright bell tones going up. */
  pling(pos, pitch = 1) {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(pos, 0.8);
    [1, 1.26, 1.5, 2].forEach((m, i) => tone(t + i * 0.05, 0.35, d, { type: 'sine', from: 880 * pitch * m, gain: 0.06 }));
  },
  /** A smart speaker (#325): 'wake' = two soft rising notes, 'sleep' = the same falling; 'fanfare', 'drumroll', 'boop' =
   * its answers without words. */
  nest(pos, kind = 'wake') {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(pos, 0.8);
    if (kind === 'wake' || kind === 'sleep') {
      const [a, b] = kind === 'wake' ? [659, 988] : [784, 523];
      tone(t, 0.25, d, { from: a, gain: 0.08 }); tone(t + 0.13, 0.4, d, { from: b, gain: 0.08 });
    } else if (kind === 'fanfare') {
      [[523, 0, 0.14], [523, 0.15, 0.14], [523, 0.3, 0.14], [659, 0.45, 0.3], [523, 0.78, 0.16], [784, 0.96, 0.7]].forEach(([f, dt, len]) => {
        tone(t + dt, len, d, { type: 'sawtooth', from: f, gain: 0.05 }); tone(t + dt, len, d, { type: 'square', from: f * 2, gain: 0.015 });
      });
    } else if (kind === 'drumroll') {
      for (let i = 0; i < 34; i++) noise(t + i * 0.045, 0.06, d, { type: 'bandpass', freq: 1700, q: 0.7, gain: 0.12 + 0.25 * (i / 34) });
      noise(t + 1.6, 0.5, d, { type: 'highpass', freq: 5000, gain: 0.35 }); tone(t + 1.6, 0.25, d, { from: 150, to: 50, gain: 0.6 }); // the cymbal + kick
    } else tone(t, 0.22, d, { from: 520, to: 260, gain: 0.12 }); // boop
  },
    /** Pouring into a cup or a glass: a trickle that rises in pitch as it fills (`secs` long). */
  pour(pos, secs = 1.2) {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(pos, 0.7);
    noise(t, secs, d, { type: 'bandpass', freq: 1300, q: 1.5, gain: 0.12, attack: 0.08 });
    tone(t, secs, d, { type: 'sine', from: 420, to: 900, gain: 0.03 });
  },
  /** Ground coffee off a wooden scoop (#334): a soft dry hiss with a few grains (`fill` = into the jar: shorter). */
  scoop(pos, fill = false) {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(pos, 0.6), len = fill ? 0.25 : 0.45;
    noise(t, len, d, { type: 'bandpass', freq: 2400, q: 0.7, gain: 0.07, attack: 0.04 });
    for (let i = 0; i < 10; i++) noise(t + Math.random() * len, 0.015, d, { type: 'highpass', freq: 3000, gain: 0.05 * Math.random(), attack: 0.001 });
  },
    /** A crayon on paper: a short dry scratch, louder with the speed (0…1). */
  crayon(pos, k = 0.5) {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(pos, 0.6);
    noise(t, 0.12, d, { type: 'bandpass', freq: 2800 + 1500 * k, q: 0.9, gain: 0.05 + 0.08 * k, attack: 0.01 });
  },
    click(pos) {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(pos, 0.6);
    noise(t, 0.02, d, { type: 'highpass', freq: 3000, gain: 0.4 });
    tone(t, 0.03, d, { from: 2400, to: 1800, gain: 0.08 });
  },
  /** Paper rustle (taking the note off the freezer). */
  paper(pos) {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(pos, 0.7);
    for (let i = 0; i < 4; i++) noise(t + i * 0.05 + Math.random() * 0.03, 0.07, d, { freq: 3000 + Math.random() * 2500, q: 0.8, gain: 0.12 });
  },
  /** Tape torn off the roll and pressed on (#176): a short rip, then four little pats. */
  tape(pos) {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(pos, 0.7);
    noise(t, 0.16, d, { type: 'highpass', freq: 2500, gain: 0.14, attack: 0.01 });
    for (let i = 0; i < 4; i++) noise(t + 0.22 + i * 0.09, 0.03, d, { type: 'lowpass', freq: 900, gain: 0.18 });
  },
  /** A sheet crumpled into a ball (#177): a burst of crackles. */
  crumple(pos) {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(pos, 0.8);
    for (let i = 0; i < 14; i++) noise(t + i * 0.04 + Math.random() * 0.03, 0.05, d, { freq: 1800 + Math.random() * 4000, q: 0.9, gain: 0.1 + Math.random() * 0.08 });
  },
  /** A paper ball landing (#177). */
  ballBounce(pos, k = 1) {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(pos, 0.6);
    noise(t, 0.04, d, { freq: 1500, q: 0.7, gain: 0.08 * k });
  },
  /** Landing after a fall (#361): a body thud, `k` 0..1 (soft knee-bend … a hard fall). */
  landing(k = 1) {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(null, 0.4 + 0.6 * k);
    tone(t, 0.12 + 0.2 * k, d, { from: 90 + 30 * (1 - k), to: 35, gain: 0.5 + 0.5 * k });
    noise(t, 0.08 + 0.15 * k, d, { type: 'lowpass', freq: 500 + 400 * k, gain: 0.3 + 0.5 * k });
    if (k > 0.5) noise(t + 0.02, 0.25, d, { freq: 1800, q: 0.6, gain: 0.12 * k }); // gravel / clothes
  },
  /** "Aj!" — hurt (#361): a voiced sawtooth gliding from the formants of [a] to [j] ([i]), falling in pitch. */
  ouch() {
    if (!ready()) return;
    const t = ctx.currentTime + 0.12, d = out(null, 0.9), dur = 0.55;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(260, t);
    o.frequency.linearRampToValueAtTime(330, t + 0.07);
    o.frequency.exponentialRampToValueAtTime(190, t + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.45, t + 0.03);
    env.gain.setValueAtTime(0.4, t + dur * 0.55);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(env);
    // [a] (F1 ~800, F2 ~1300) → [j] (F1 ~300, F2 ~2300)
    for (const [f0, f1, q, gain] of [[800, 300, 5, 1], [1300, 2300, 8, 0.8], [2600, 3000, 10, 0.35]]) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.Q.value = q;
      bp.frequency.setValueAtTime(f0, t);
      bp.frequency.setValueAtTime(f0, t + dur * 0.4);
      bp.frequency.linearRampToValueAtTime(f1, t + dur * 0.75);
      const g = ctx.createGain(); g.gain.value = gain;
      env.connect(bp).connect(g).connect(d);
    }
    o.start(t);
    o.stop(t + dur + 0.05);
  },
  /** A soft footstep; `surface` 'wood' | 'stair' | 'outside'. */
  step(surface = 'wood') {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(null, 0.5);
    const v = 0.8 + Math.random() * 0.4;
    if (surface === 'outside') {
      noise(t, 0.09, d, { freq: 2200, q: 0.6, gain: 0.12 * v });
    } else {
      noise(t, 0.06, d, { type: 'lowpass', freq: surface === 'stair' ? 900 : 600, gain: 0.22 * v });
      tone(t, 0.08, d, { from: surface === 'stair' ? 140 : 110, to: 60, gain: 0.18 * v });
    }
  },
};

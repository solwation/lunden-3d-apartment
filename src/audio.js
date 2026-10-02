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
   * 'rasp' = long, loud, hoarse and insistent (sphynx); null = the ordinary meow. */
  meow(pos, pitch = 1, voice = null) {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(pos, voice === 'rasp' ? 1.15 : voice === 'trill' ? 0.75 : 0.9);
    const dur = voice === 'rasp' ? 0.95 + Math.random() * 0.35 : 0.55 + Math.random() * 0.35;
    const f0 = 480 * pitch;
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
    for (const [a, b, c, q, gain] of [[350, 900, 550, 6, 1], [2300, 1400, 900, 8, 0.6], [3200, 2800, 2500, 10, 0.25]]) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.Q.value = q;
      bp.frequency.setValueAtTime(a, t);
      bp.frequency.linearRampToValueAtTime(b, t + dur * 0.35);
      bp.frequency.linearRampToValueAtTime(c, t + dur);
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
   * `voice` 'trill' (perser) adds little mrrp chirps, 'rasp' (sphynx) purrs deeper, rougher, louder. */
  purr(pos, dur = 4, pitch = 1, voice = null) {
    if (!ready()) return;
    const t = ctx.currentTime, d = out(pos, voice === 'rasp' ? 1.4 : 1.1);
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

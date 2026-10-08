import { setIcon } from './hudicons.js';
import * as THREE from 'three';
import { audioParts, isMuted } from './audio.js';
import { sonosLed } from './furniture.js';
import { SONOS as S, CAR } from './config.js';
import { MusicFile } from './music.js';
export { trackSrc, failedFiles } from './music.js';

// Music in all the SYMFONISK speakers (#187, #416). Six channels of CC0 recordings. The original generated
// channels (lofi, jazz, children's songs, synthwave, Bach, rain and a fire) remain as fallbacks, each scheduling
// a bar at a time a short way ahead (`SONOS.lookahead`), with few oscillators per note (the Surface Pro). One mix
// feeds a panner per speaker, so it is loudest close to one; main.js passes how muffled each one is (walls, the
// other floor). E on a speaker starts the music and opens #sonos-panel (⏮ ⏭ songs, ⏯, volume); E / Esc closes the
// panel and the music plays on. F (the bare flat) stops it. The status lights glow white while it plays.
// Real music (#416): a channel with `tracks` in SONOS.channels plays those files instead, loaded only when the channel
// starts (an <audio> element through a MediaElementAudioSourceNode into the channel's sub-mix, so the panners, the
// muffling, the ducking and mute work as before), one track after another; a file that fails to load or play falls
// back to the channel's generated music — never silence. The panel / the car's screen show "title – artist".

const midi = (n) => 440 * 2 ** ((n - 69) / 12);

/** One sound: an oscillator through a gain envelope (attack, exponential decay) into `dest`. */
function note(A, dest, t, n, dur, { type = 'sine', gain = 0.2, attack = 0.005, cutoff = 0, detune = 0 } = {}) {
  const { ctx } = A;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = midi(n); o.detune.value = detune;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = o;
  if (cutoff) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; o.connect(f); node = f; }
  node.connect(g).connect(dest);
  o.start(t); o.stop(t + dur + 0.05);
}
/** A burst of filtered noise (drums, crackle). */
function hiss(A, dest, t, dur, { type = 'highpass', freq = 6000, q = 0.7, gain = 0.1 } = {}) {
  const { ctx, noiseBuf } = A;
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(dest);
  src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
}
function kick(A, dest, t, gain = 0.5) {
  const { ctx } = A, o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  o.connect(g).connect(dest); o.start(t); o.stop(t + 0.35);
}
const snare = (A, d, t, gain = 0.12) => hiss(A, d, t, 0.16, { type: 'bandpass', freq: 1800, q: 0.6, gain });
const hat = (A, d, t, gain = 0.05) => hiss(A, d, t, 0.04, { freq: 7500, gain });
/** An electric-piano chord (two sines per note, a soft bell on top). */
function rhodes(A, d, t, notes, dur, gain = 0.06) {
  for (const n of notes) { note(A, d, t, n, dur, { gain, attack: 0.01 }); note(A, d, t, n + 12, dur * 0.4, { gain: gain * 0.25 }); }
}

// --- the channels: { bar: beats per bar, beat: seconds, play(A, dest, t, i) schedules bar i at time t } ---
const LOFI_CHORDS = [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]]; // Fmaj7 Em7 Dm7 Cmaj7
const JAZZ = [[[55, 58, 62, 65], 43], [[52, 55, 58, 62], 48], [[53, 57, 60, 64], 41], [[50, 53, 57, 60], 38]]; // Gm7 C7 Fmaj7 Dm7
// children's songs (public domain): Blinka lilla stjärna (4/4) and Imse vimse spindel (6/8), [midi, beats] per bar
const TWINKLE = [[[60, 1], [60, 1], [67, 1], [67, 1]], [[69, 1], [69, 1], [67, 2]], [[65, 1], [65, 1], [64, 1], [64, 1]], [[62, 1], [62, 1], [60, 2]],
  [[67, 1], [67, 1], [65, 1], [65, 1]], [[64, 1], [64, 1], [62, 2]], [[67, 1], [67, 1], [65, 1], [65, 1]], [[64, 1], [64, 1], [62, 2]]];
const TWINKLE_SONG = [...TWINKLE.slice(0, 4), ...TWINKLE.slice(4), ...TWINKLE.slice(0, 4)];
const TWINKLE_BASS = [48, 53, 53, 55, 48, 48, 48, 55, 48, 53, 53, 55];
const IMSE = [[[60, 2], [60, 1], [60, 2], [62, 1]], [[64, 3], [64, 2], [64, 1]], [[62, 2], [60, 1], [62, 2], [64, 1]], [[60, 6]],
  [[64, 3], [64, 2], [65, 1]], [[67, 6]], [[67, 2], [65, 1], [64, 2], [65, 1]], [[67, 3], [64, 3]],
  [[60, 3], [60, 2], [62, 1]], [[64, 6]], [[64, 2], [62, 1], [60, 2], [62, 1]], [[64, 3], [60, 3]],
  [[55, 2], [55, 1], [60, 2], [60, 1]], [[60, 2], [62, 1], [64, 2], [64, 1]], [[64, 2], [62, 1], [60, 2], [62, 1]], [[60, 6]]];
const IMSE_BASS = [48, 48, 55, 48, 48, 43, 43, 48, 48, 48, 55, 48, 43, 48, 55, 48];
const SYNTH = [57, 53, 48, 55]; // Am F C G (roots)
const BACH = [[60, 64, 67, 72, 76], [60, 62, 69, 74, 77], [59, 62, 67, 74, 77], [60, 64, 67, 72, 76], [60, 64, 69, 76, 81], [60, 62, 66, 69, 74],
  [59, 62, 67, 74, 79], [59, 60, 64, 67, 72], [57, 60, 64, 67, 72], [50, 57, 62, 66, 72], [55, 59, 62, 67, 71], [55, 58, 64, 67, 73],
  [53, 57, 62, 69, 74], [53, 56, 62, 65, 71], [52, 55, 60, 67, 72], [52, 53, 57, 60, 65], [50, 53, 57, 60, 65], [43, 50, 55, 59, 65], [48, 52, 55, 60, 64]];

export const CHANNELS = { // exported for the offline render in tools/sonostest.html
  lofi: { bar: 4, beat: 0.8, play(A, d, t, i) {
    const b = this.beat, ch = LOFI_CHORDS[i % 4];
    rhodes(A, d, t, ch, b * 2.2); rhodes(A, d, t + b * 2.5, ch.slice(1), b * 1.4, 0.045);
    note(A, d, t, ch[0] - 12, b * 1.8, { gain: 0.22, attack: 0.02 }); note(A, d, t + b * 2, ch[0] - 12, b * 1.5, { gain: 0.18, attack: 0.02 });
    kick(A, d, t, 0.35); kick(A, d, t + b * 2.5, 0.25); snare(A, d, t + b, 0.07); snare(A, d, t + b * 3, 0.07);
    for (let k = 0; k < 8; k++) hat(A, d, t + b * (k / 2 + (k % 2 ? 0.08 : 0)), 0.02);
    for (let k = 0; k < 6; k++) hiss(A, d, t + Math.random() * b * 4, 0.01, { freq: 3000, gain: 0.03 }); // vinyl crackle
  } },
  jazz: { bar: 4, beat: 0.5, play(A, d, t, i) {
    const b = this.beat, [ch, root] = JAZZ[i % 4], sw = b * 0.66;
    [0, 7, 3, 5].forEach((iv, k) => note(A, d, t + k * b, root + iv - (k === 3 ? 1 : 0), b * 0.95, { type: 'triangle', gain: 0.22, attack: 0.01, cutoff: 900 })); // walking bass
    rhodes(A, d, t + b + sw - b * 0.66, ch, b * 0.6, 0.045); rhodes(A, d, t + 3 * b, ch, b * 0.5, 0.04);
    for (let k = 0; k < 4; k++) { hiss(A, d, t + k * b, 0.25, { freq: 5000, gain: 0.025 }); if (k % 2) hiss(A, d, t + k * b + sw, 0.15, { freq: 5000, gain: 0.018 }); }
    if (i % 2) for (const [k, n] of [[0, ch[3] + 12], [1.66, ch[2] + 12], [2.5, ch[1] + 12]]) note(A, d, t + k * b, n, b * 0.8, { type: 'triangle', gain: 0.06 }); // a little right-hand line
  } },
  kids: { bar: 4, beat: 0.55, play(A, d, t, i) {
    const total = TWINKLE_SONG.length + IMSE.length, k = i % total;
    const imse = k >= TWINKLE_SONG.length, j = imse ? k - TWINKLE_SONG.length : k;
    const bar = imse ? IMSE[j] : TWINKLE_SONG[j], unit = imse ? this.beat * 4 / 6 : this.beat; // 6/8: six eighths in the same bar length
    let at = t;
    for (const [n, len] of bar) { note(A, d, at, n + 12, len * unit * 0.95, { type: 'triangle', gain: 0.12, attack: 0.01 }); at += len * unit; }
    const root = imse ? IMSE_BASS[j] : TWINKLE_BASS[j];
    note(A, d, t, root, this.beat * 1.8, { type: 'triangle', gain: 0.15 }); note(A, d, t + this.beat * 2, root + 7, this.beat * 1.8, { type: 'triangle', gain: 0.12 });
  } },
  synth: { bar: 4, beat: 0.6, play(A, d, t, i) {
    const b = this.beat, r = SYNTH[i % 4];
    for (let k = 0; k < 8; k++) note(A, d, t + k * b / 2, r - 12 + (k % 2 ? 12 : 0), b * 0.45, { type: 'sawtooth', gain: 0.07, cutoff: 700 });
    const third = r === 57 ? 3 : 4;
    [0, third, 7, 12, 7, third].forEach((iv, k) => note(A, d, t + k * b * 4 / 6, r + 12 + iv, b * 0.5, { type: 'square', gain: 0.025, cutoff: 2500 }));
    note(A, d, t, r, b * 4, { type: 'sawtooth', gain: 0.03, attack: 0.4, cutoff: 1200, detune: 7 }); note(A, d, t, r + 7, b * 4, { type: 'sawtooth', gain: 0.025, attack: 0.4, cutoff: 1200, detune: -7 });
    for (let k = 0; k < 4; k++) kick(A, d, t + k * b, 0.4);
    snare(A, d, t + b, 0.12); snare(A, d, t + 3 * b, 0.12);
    for (let k = 0; k < 8; k++) hat(A, d, t + (k + 0.5) * b / 2, 0.025);
  } },
  bach: { bar: 4, beat: 0.75, play(A, d, t, i) {
    const ch = BACH[i % BACH.length], s = this.beat / 4; // sixteenths: 1 2 3 4 5 3 4 5, twice
    const order = [0, 1, 2, 3, 4, 2, 3, 4];
    for (let k = 0; k < 16; k++) {
      const n = ch[order[k % 8]], held = k % 8 < 2; // the two low notes ring on
      note(A, d, t + k * s, n, held ? s * (8 - k % 8) : s * 2.5, { type: 'triangle', gain: held ? 0.09 : 0.075, attack: 0.004 });
    }
  } },
  rain: { bar: 4, beat: 0.5, continuous(A, d) { // a steady rain: looped noise, low and soft
    const { ctx, noiseBuf } = A, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf; src.loop = true; f.type = 'lowpass'; f.frequency.value = 1400; g.gain.value = 0.18;
    src.connect(f).connect(g).connect(d); src.start();
    return () => src.stop();
  }, play(A, d, t) {
    for (let k = 0; k < 14; k++) hiss(A, d, t + Math.random() * 2, 0.015 + Math.random() * 0.03, { type: 'bandpass', freq: 1500 + Math.random() * 2500, q: 1, gain: 0.05 + Math.random() * 0.12 }); // the fire
    if (Math.random() < 0.4) hiss(A, d, t + Math.random() * 2, 0.4, { type: 'lowpass', freq: 300, gain: 0.08 }); // a log settling
  } },
};

/** What the SYMFONISK speakers and the car's radio (#268) share: a channel's sub-mix into `this.bus.mix`, and composing
 * a bar at a time ahead — or, for a channel with `tracks` (#416), streaming its files into that sub-mix. */
class Composer {
  /** The channel's stable genre name (#462). */
  get name() {
    return S.channels[this.channel].name;
  }

  /** The currently playing track and artist, or null if generated (#462). */
  get trackName() {
    const t = this.file?.track;
    return t ? `${t.title} – ${t.artist}` : null;
  }

  /** A fresh sub-mix for the channel (the old one fades out with what it had scheduled). */
  startChannel(A) {
    this.stopChannel();
    const g = A.ctx.createGain(); g.gain.value = 1; g.connect(this.bus.mix);
    this.ch = g;
    this.barNo = 0; this.nextBar = A.ctx.currentTime + 0.08;
    this.songStart = performance.now();
    this.trackNo = 0;
    if (!this.startTrack(A)) this.startGenerated(A);
  }

  /** The channel's generated music (also the fallback when its files fail). */
  startGenerated(A) {
    this.nextBar = Math.max(this.nextBar, A.ctx.currentTime + 0.05);
    const c = CHANNELS[S.channels[this.channel].id];
    this.stopCont = c.continuous?.(A, this.ch) ?? null;
  }

  /** Start the channel's selected recording, rotating after ended; false for a generated-only channel. */
  startTrack(A) {
    const tracks = S.channels[this.channel].tracks ?? [];
    if (!tracks.length) return false;
    const k = this.trackNo % tracks.length, track = tracks[k];
    this.trackNo = k;
    // Queue callbacks so even a track with no playable formats is assigned before fallback runs.
    const after = (bad) => queueMicrotask(() => {
      if (this.file !== file) return;
      this.dropFile();
      if (bad) { this.startGenerated(A); }
      else { this.trackNo = k + 1; this.startTrack(A); }
      this.onTrack?.();
    });
    const file = new MusicFile(A, this.ch, track, { ended: () => after(false), failed: () => after(true) });
    this.file = file;
    this.songStart = performance.now();
    return true;
  }

  dropFile() {
    this.file?.stop(); this.file = null;
  }

  stopChannel() {
    const A = audioParts();
    if (this.ch && A) { const g = this.ch, t = A.ctx.currentTime; g.gain.setTargetAtTime(0, t, 0.05); setTimeout(() => g.disconnect(), 1500); }
    this.dropFile();
    this.stopCont?.(); this.stopCont = null;
    this.ch = null;
  }

  /** Schedule the bars up to `lookahead` ahead (not while muted: the master is silent; not while a file plays). */
  compose(A) {
    if (!this.ch) this.startChannel(A); // the context came up after play()
    const t = A.ctx.currentTime;
    if (isMuted() || this.file) { this.nextBar = Math.max(this.nextBar, t); return; } // silent master / a file plays
    const c = CHANNELS[S.channels[this.channel].id], len = c.bar * c.beat;
    if (this.nextBar < t - 1) this.nextBar = t + 0.05; // a long stall (a hidden tab): start afresh
    while (this.nextBar < t + S.lookahead) { c.play(A, this.ch, this.nextBar, this.barNo++); this.nextBar += len; }
  }
}

export class Sonos extends Composer {
  /** speakers: the furniture targets of kind 'speaker'; panel: #sonos-panel. */
  constructor(speakers, panel) {
    super();
    Object.assign(this, { speakers, panel, playing: false, channel: 0, volume: S.start, bus: null, ch: null, nextBar: 0, barNo: 0, stopCont: null });
    const self = this;
    for (const t of speakers) Object.defineProperty(t, 'verb', { get: () => (self.playing ? 'styra musiken på' : 'spela musik på') });
    this.nameEl = panel.querySelector('.name');
    this.trackEl = panel.querySelector('.track');
    this.volEl = panel.querySelector('.vol');
    this.playBtn = panel.querySelector('[data-act=play]');
    this.onTrack = () => this.render(); // a file started, ended or fell back (#416): its name in the panel
    const act = { prev: () => this.next(-1), next: () => this.next(1), play: () => this.toggle(), down: () => this.setVolume(this.volume - 1), up: () => this.setVolume(this.volume + 1) };
    for (const [k, fn] of Object.entries(act)) panel.querySelector(`[data-act=${k}]`)?.addEventListener('click', fn);
    this.render();
  }

  get open() { return !this.panel.hidden; }
  show(v) { this.panel.hidden = !v; this.render(); }

  /** Build the mix → one gain + panner per speaker, once the AudioContext runs. */
  ensureBus() {
    const A = audioParts();
    if (!A || this.bus) return A;
    const { ctx, master } = A;
    const mix = ctx.createGain(); mix.gain.value = this.gain; // (0 unless it already plays: resumed after a reload)
    const outs = this.speakers.map((t) => {
      const p = t.object.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.15, 0));
      const g = ctx.createGain(), pan = ctx.createPanner();
      pan.panningModel = 'equalpower'; pan.distanceModel = 'inverse'; pan.refDistance = 1.0; pan.rolloffFactor = 1.1;
      pan.positionX.value = p.x; pan.positionY.value = p.y; pan.positionZ.value = p.z;
      mix.connect(g).connect(pan).connect(master);
      return { g, pan, pos: p, level: t.level ?? 0 };
    });
    this.bus = { mix, outs };
    return A;
  }

  /** The level the mix should be at (volume steps). */
  get gain() { return this.playing ? S.gain * (this.volume / S.steps) ** 1.5 * (this.duck ?? 1) : 0; }

  /** Turn the speakers down to `f` of their volume while something else plays (the Kaffeturbo tune, #217). */
  setDuck(f) {
    if ((this.duck ?? 1) === f) return;
    this.duck = f;
    const A = audioParts();
    if (A && this.bus) this.bus.mix.gain.setTargetAtTime(this.gain, A.ctx.currentTime, 0.3);
  }

  play() {
    const A = this.ensureBus();
    this.onPlay?.(this.channel); // statistics and points (#197): each channel once
    this.playing = true;
    if (A) { this.startChannel(A); this.bus.mix.gain.setTargetAtTime(this.gain, A.ctx.currentTime, 0.05); }
    this.render();
  }

  pause() {
    this.playing = false;
    const A = audioParts();
    if (A && this.bus) this.bus.mix.gain.setTargetAtTime(0, A.ctx.currentTime, 0.08);
    this.stopChannel();
    this.render();
  }

  toggle() { if (this.playing) this.pause(); else this.play(); }
  stop() { if (this.playing) this.pause(); this.show(false); }

  next(d) {
    this.channel = (this.channel + d + S.channels.length) % S.channels.length;
    if (this.playing) { const A = audioParts(); if (A) this.startChannel(A); this.onPlay?.(this.channel); }
    this.render();
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(S.steps, v));
    const A = audioParts();
    if (A && this.bus) this.bus.mix.gain.setTargetAtTime(this.gain, A.ctx.currentTime, 0.05);
    this.render();
  }

  /** Keys while the panel is open (main.js); true when used. */
  key(code) {
    if (code === 'KeyA' || code === 'ArrowLeft') this.next(-1);
    else if (code === 'KeyD' || code === 'ArrowRight') this.next(1);
    else if (code === 'KeyW' || code === 'ArrowUp') this.setVolume(this.volume + 1);
    else if (code === 'KeyS' || code === 'ArrowDown') this.setVolume(this.volume - 1);
    else if (code === 'Space') this.toggle();
    else return false;
    return true;
  }

  /** Each frame: schedule ahead, and how loud each speaker is where the visitor stands. `muffled(i)` = through a wall? */
  update(level, muffled) {
    const A = this.playing ? this.ensureBus() : audioParts(); // (playing since before the audio ran: after a reload, #277)
    sonosLed.color.setHex(this.playing ? 0xffffff : 0x4a4a4a);
    if (!A || !this.playing || !this.bus) return;
    const t = A.ctx.currentTime;
    this.bus.outs.forEach((o) => {
      const k = (o.level !== level ? S.floor : 1) * (muffled(o.pos) ? S.wall : 1);
      if (o.k !== k) { o.k = k; o.g.gain.setTargetAtTime(k, t, 0.15); } // o.k: where it is heading (tests read it)
    });
    this.compose(A);
  }

  render() {
    this.nameEl.textContent = this.name;
    if (this.trackEl) {
      const t = this.trackName;
      this.trackEl.textContent = t ? `Spelas nu: ${t}` : '';
      this.trackEl.hidden = !t;
    }
    this.volEl.style.setProperty('--v', `${(this.volume / S.steps) * 100}%`);
    this.volEl.setAttribute('aria-label', `Volym ${this.volume} av ${S.steps}`);
    setIcon(this.playBtn,this.playing?'pause':'play',this.playing?'Pausa':'Spela');
    this.playBtn.setAttribute('aria-label', this.playing ? 'Pausa' : 'Spela');
  }
}

/** Music in our Renault (#268): the same channels from one panner at the dashboard. E / a click on the centre screen
 * while you sit in a front seat starts and stops it (its ⏮ ⏭ change song); `CAR.music` says how loud and how muffled
 * outside the car (doors shut / a door open). It plays on when you get out, until it is switched off, the car drives
 * away or F. The car's screen shows `nowPlaying`. */
export class CarRadio extends Composer {
  constructor() {
    super();
    Object.assign(this, { playing: false, channel: 0, bus: null, ch: null, nextBar: 0, barNo: 0, stopCont: null, duck: 1, songStart: 0, k: null });
  }

  ensureBus() {
    const A = audioParts();
    if (!A || this.bus) return A;
    const { ctx, master } = A, M = CAR.music;
    const mix = ctx.createGain(); mix.gain.value = this.gain;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = M.inside.cutoff;
    const out = ctx.createGain(); out.gain.value = 1;
    const pan = ctx.createPanner();
    pan.panningModel = 'equalpower'; pan.distanceModel = 'inverse'; pan.refDistance = M.ref; pan.rolloffFactor = M.rolloff;
    mix.connect(lp).connect(out).connect(pan).connect(master);
    this.bus = { mix, lp, out, pan };
    return A;
  }

  get gain() { return this.playing ? CAR.music.gain * this.duck : 0; }

  setDuck(f) {
    if (this.duck === f) return;
    this.duck = f;
    const A = audioParts();
    if (A && this.bus) this.bus.mix.gain.setTargetAtTime(this.gain, A.ctx.currentTime, 0.3);
  }

  play() {
    const A = this.ensureBus();
    this.onPlay?.(this.channel); // statistics and points: each song once (#268)
    this.playing = true;
    if (A) { this.startChannel(A); this.bus.mix.gain.setTargetAtTime(this.gain, A.ctx.currentTime, 0.05); }
    else this.songStart = performance.now();
  }

  stop() {
    if (!this.playing) return;
    this.playing = false;
    const A = audioParts();
    if (A && this.bus) this.bus.mix.gain.setTargetAtTime(0, A.ctx.currentTime, 0.08);
    this.stopChannel();
  }

  toggle() { if (this.playing) this.stop(); else this.play(); }

  next(d) {
    this.channel = (this.channel + d + S.channels.length) % S.channels.length;
    if (!this.playing) { this.play(); return; } // ⏮ ⏭ on a silent screen: that song
    const A = audioParts(); if (A) this.startChannel(A); else this.songStart = performance.now();
    this.onPlay?.(this.channel);
  }

  /** For the screen: song, progress through a nominal song length, the time. */
  get nowPlaying() {
    const d = this.file?.el?.duration, real = Number.isFinite(d) && d > 0; // a real track: its own length (#416)
    const L = real ? d : CAR.music.songLength;
    const e = real ? Math.min(this.file.el.currentTime, d) : ((performance.now() - this.songStart) / 1000) % L;
    const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    return { name: this.name, track: this.trackName, playing: this.playing, progress: e / L, time: `${mmss(e)} / ${mmss(L)}` };
  }

  /** Each frame: where the dashboard is, and how the visitor hears it: `inside` (sitting in the car), else through the
   * shut doors or an open one. */
  update(pos, inside, doorOpen) {
    if (!this.playing) return;
    const A = this.ensureBus(); // (the context may have come up after play())
    if (!A) return;
    const t = A.ctx.currentTime, { pan, lp, out } = this.bus, M = CAR.music;
    pan.positionX.setTargetAtTime(pos.x, t, 0.05); pan.positionY.setTargetAtTime(pos.y, t, 0.05); pan.positionZ.setTargetAtTime(pos.z, t, 0.05);
    const k = inside ? M.inside : doorOpen ? M.open : M.shut;
    if (this.k !== k) { this.k = k; lp.frequency.setTargetAtTime(k.cutoff, t, 0.1); out.gain.setTargetAtTime(k.gain, t, 0.1); } // this.k: tests read it
    this.compose(A);
  }
}

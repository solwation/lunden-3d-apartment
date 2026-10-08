import { setIcon } from './hudicons.js';
import * as THREE from 'three';
import { audioParts } from './audio.js';
import { sonosLed } from './furniture.js';
import { SONOS as S, CAR } from './config.js';
import { MusicFile } from './music.js';
export { trackSrc, failedFiles } from './music.js';

// Six channels of licensed recordings (#500), shared by room speakers and the car radio.
// Files stream through the existing positional/muffled/ducked master graph. Failed formats try
// the next recording once; if the whole channel fails it stays quiet with a visible status.
// No generated music can restore the retired chiptune/MIDI sound on an offline visit.

/** What the SYMFONISK speakers and the car's radio (#268) share: a channel's sub-mix into `this.bus.mix`, and composing
 * a bar at a time ahead — or, for a channel with `tracks` (#416), streaming its files into that sub-mix. */
class Composer {
  /** The channel's stable genre name (#462). */
  get name() {
    return S.channels[this.channel].name;
  }

  /** The currently playing track and artist, or a load status (#500) (#462). */
  get trackName() {
    const t = this.file?.track;
    return t ? `${t.title} – ${t.artist}` : this.unavailable ? 'Musiken kunde inte laddas' : null;
  }

  /** A fresh sub-mix for the channel (the old one fades out with what it had scheduled). */
  startChannel(A) {
    this.stopChannel();
    const g = A.ctx.createGain(); g.gain.value = 1; g.connect(this.bus.mix);
    this.ch = g;
    this.barNo = 0;
    this.songStart = performance.now();
    this.trackNo = 0;
    this.failures=0;this.unavailable=false;
    if (!this.startTrack(A)) this.unavailable=true;
  }

  /** Start the channel's selected recording, rotating after ended; false if no recordings are configured. */
  startTrack(A) {
    const tracks = S.channels[this.channel].tracks ?? [];
    if (!tracks.length) return false;
    const k = this.trackNo % tracks.length, track = tracks[k];
    this.trackNo = k;
    // Queue callbacks so even a track with no playable formats is assigned before the failure callback runs.
    const after = (bad) => queueMicrotask(() => {
      if (this.file !== file) return;
      this.dropFile();
      if(bad&&++this.failures>=tracks.length)this.unavailable=true;
      else {if(!bad)this.failures=0;this.trackNo=k+1;this.startTrack(A);}
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
    this.ch = null;
  }

  /** Bring up the lazy transport after the sound context is activated. */
  compose(A) { if (!this.ch) this.startChannel(A); }

}

export class Sonos extends Composer {
  /** speakers: the furniture targets of kind 'speaker'; panel: #sonos-panel. */
  constructor(speakers, panel) {
    super();
    Object.assign(this, { speakers, panel, playing: false, channel: 0, volume: S.start, bus: null, ch: null, barNo: 0 });
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
    Object.assign(this, { playing: false, channel: 0, bus: null, ch: null, barNo: 0, duck: 1, songStart: 0, k: null });
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

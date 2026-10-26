import { initAudio, audioParts } from './audio.js';
import { MusicFile } from './music.js';
import { MUSIC, SONOS, DANCE } from './config.js';

// #1621: the DJ bench plays any shipped track; the list is the Sonos channels' tracks in order.
export const PLAYROOM_TRACKS = SONOS.channels.flatMap((c) => c.tracks);

// Local clubhouse transport. Media is created only by a visitor's play action.
export class PlayroomMusic {
  constructor() {
    this.active = false; this.state = 'off'; this.volume = SONOS.start; this.generation = 0; this.index = 0; this.mixing = null; this.dancing = false; this.danceAt = null;
    this.net = null; this.remote = null; // #1624: { ready(), send(msg) } set by main.js; a room state that arrived before we were inside
    this.hidden = () => { if (document.hidden) this.stopLocal(); };
    this.leave = () => this.stopLocal();
    document.addEventListener('visibilitychange', this.hidden);
    window.addEventListener('pagehide', this.leave);
    this.target = { kind: 'playroomMusic', name: 'biljardrummets högtalare', options: () => this.options() };
  }
  options() {
    return [
      { label: this.state === 'playing' ? 'Pausa musiken' : this.state === 'paused' ? 'Fortsätt musiken' : 'Spela musik', run: () => this.state === 'playing' ? this.pause() : this.play() },
      ...(this.state === 'off' ? [] : [{ label: 'Stäng av musiken', run: () => this.stop() }]),
      ...(this.state === 'off' ? [] : [
        { label: 'Nästa låt', reason: this.mixing ? 'Mixar redan' : '', run: () => this.next(false) },
        { label: 'Mixa till nästa låt', reason: this.mixing ? 'Mixar redan' : '', run: () => this.next(true) },
      ]),
      { label: `Volym − (${this.volume}/${SONOS.steps})`, reason: this.volume === 0 ? 'Lägsta volym' : '', run: () => this.setVolume(this.volume - 1) },
      { label: `Volym + (${this.volume}/${SONOS.steps})`, reason: this.volume === SONOS.steps ? 'Högsta volym' : '', run: () => this.setVolume(this.volume + 1) },
      // #1622: the floss is offered only while the music plays (not paused or off)
      ...(this.state === 'playing' || this.dancing ? [{ label: this.dancing ? 'Sluta dansa' : 'Dansa floss', run: () => this.dancing ? this.stopDance() : this.startDance() }] : []),
    ];
  }
  /** #1622: the dance is sent as `dn: 1` in the player state (main.js); it ends with the music, a pause, leaving or walking away. */
  startDance() { if (this.state === 'playing') { this.dancing = true; this.danceAt = null; } }
  stopDance() { this.dancing = false; this.danceAt = null; }
  /** Each frame while inside: `pos` the player's {x, z}. */
  tick(pos) {
    if (!this.dancing) return;
    if (this.state !== 'playing') { this.stopDance(); return; }
    this.danceAt ??= { x: pos.x, z: pos.z };
    if (Math.hypot(pos.x - this.danceAt.x, pos.z - this.danceAt.z) > DANCE.stepAway) this.stopDance();
  }
  setVolume(n) {
    this.volume = Math.max(0, Math.min(SONOS.steps, n));
    if (this.mix) this.mix.gain.value = SONOS.gain * (this.volume / SONOS.steps) ** 1.5;
  }
  /** #1624: a user action goes to the room when connected (the room answers everybody inside, us too, and `sync` applies it); else it is local as before. */
  command(k) {
    if (!this.active || !this.net?.ready()) return false;
    initAudio();
    return !!this.net.send({ t: 'mus', k, ...(k === 'n' || k === 'm' ? { ix: this.index } : {}) });
  }
  play() { if (this.active && !this.command('p')) this.playLocal(); }
  playLocal() {
    if (!this.active) return;
    initAudio(); const A = audioParts(); if (!A) return;
    if (this.file?.el) {
      this.state = 'playing';
      this.file.resume(); this.mixing?.incoming.file.resume(); this.mixing?.outgoing.file.resume();
      return;
    }
    this.begin(A, { ix: this.index, pos: 0 });
  }
  /** Start the decks from the beginning, or (room state) from `pos` ms with a crossfade `mx` { to, el } already running. */
  begin(A, { ix, pos, mx }) {
    const generation = this.generation, failed = () => queueMicrotask(() => { if (generation === this.generation) this.stopLocal(); });
    this.mix = A.ctx.createGain(); this.setVolume(this.volume); this.mix.connect(A.master);
    this.state = 'playing'; this.index = ix;
    const t = mx ? Math.min(1, mx.el / 1000 / MUSIC.crossfade) : 0;
    this.deck = this.makeDeck(A, PLAYROOM_TRACKS[ix], Math.cos(t * Math.PI / 2), failed, pos / 1000);
    this.file = this.deck.file;
    if (!mx) return;
    const incoming = this.makeDeck(A, PLAYROOM_TRACKS[mx.to], Math.sin(t * Math.PI / 2), () => queueMicrotask(() => {
      if (generation !== this.generation || this.mixing?.incoming !== incoming) return;
      this.endMix(false); this.index = ix;
    }), mx.el / 1000);
    this.index = mx.to;
    this.mixing = { incoming, outgoing: this.deck, t, last: performance.now() };
    this.mixTimer = setInterval(() => this.tickMix(), 50);
  }
  /** #1624: the room's transport { st, ix, pos, mx? } (ms elapsed). Idempotent: nothing changes when we already play that track in that state. */
  sync(m, arrived = performance.now()) {
    const tracks = PLAYROOM_TRACKS.length, ok = (i) => Number.isInteger(i) && i >= 0 && i < tracks;
    if (!m || !['off', 'playing', 'paused'].includes(m.st) || !ok(m.ix) || !Number.isFinite(m.pos) || m.pos < 0
      || (m.mx !== undefined && !(ok(m.mx?.to) && Number.isFinite(m.mx.el) && m.mx.el >= 0))) return;
    if (!this.active) { this.remote = { m, arrived }; return; }
    this.remote = null;
    if (m.st === 'off') { if (this.state !== 'off') this.stopLocal(); this.index = m.ix; return; }
    const late = m.st === 'playing' ? Math.max(0, performance.now() - arrived) : 0, mx = m.mx ? { to: m.mx.to, el: m.mx.el + late } : undefined;
    const target = mx ? mx.to : m.ix;
    if (this.state === 'off' || this.index !== target || (mx && !this.mixing)) {
      initAudio(); const A = audioParts(); if (!A) return;
      if (this.state !== 'off') this.stopLocal();
      this.begin(A, { ix: m.ix, pos: m.pos + late, mx });
    }
    if (m.st === 'paused' && this.state === 'playing') this.pauseLocal();
    else if (m.st === 'playing' && this.state === 'paused') this.playLocal();
  }
  /** A deck is one track through its own fader into the shared volume gain, so two decks can overlap. */
  makeDeck(A, track, level, failed, offset = 0) {
    const fade = A.ctx.createGain(); fade.gain.value = level; fade.connect(this.mix);
    const deck = { fade, file: null };
    deck.file = new MusicFile(A, fade, track, { loop: true, failed });
    const el = deck.file.el; // #1624: join a running track at its position (loops, so wrap by the length once known)
    if (el && offset > 0) { const seek = () => { if (el.duration > 0) el.currentTime = offset % el.duration; }; if (el.readyState >= 1) seek(); else el.addEventListener('loadedmetadata', seek, { once: true }); }
    return deck;
  }
  killDeck(deck) { if (!deck) return; deck.file.stop(); deck.fade.disconnect(); }
  /** Next track: a hard cut, or (mix) an equal-power crossfade over MUSIC.crossfade seconds. */
  next(mix) {
    if (this.state === 'off' || this.mixing || this.command(mix ? 'm' : 'n')) return;
    this.nextLocal(mix);
  }
  nextLocal(mix) {
    if (this.state === 'off' || this.mixing) return;
    const A = audioParts(); if (!A) return;
    this.index = (this.index + 1) % PLAYROOM_TRACKS.length;
    const generation = this.generation;
    if (this.state === 'paused' || !mix) { // cut: the new track replaces the old one at once (and starts playing)
      this.killDeck(this.deck); this.state = 'playing';
      this.deck = this.makeDeck(A, PLAYROOM_TRACKS[this.index], 1, () => queueMicrotask(() => { if (generation === this.generation) this.stopLocal(); }));
      this.file = this.deck.file; return;
    }
    const incoming = this.makeDeck(A, PLAYROOM_TRACKS[this.index], 0, () => queueMicrotask(() => {
      if (generation !== this.generation || this.mixing?.incoming !== incoming) return;
      this.endMix(false); // the new track will not load: keep the old one, step the index back
      this.index = (this.index + PLAYROOM_TRACKS.length - 1) % PLAYROOM_TRACKS.length;
    }));
    this.mixing = { incoming, outgoing: this.deck, t: 0, last: performance.now() };
    this.mixTimer = setInterval(() => this.tickMix(), 50);
  }
  tickMix() {
    const m = this.mixing; if (!m) return;
    const now = performance.now(), dt = (now - m.last) / 1000; m.last = now;
    if (this.state !== 'playing') return; // paused: the fade waits
    m.t = Math.min(1, m.t + dt / MUSIC.crossfade);
    m.outgoing.fade.gain.value = Math.cos(m.t * Math.PI / 2); m.incoming.fade.gain.value = Math.sin(m.t * Math.PI / 2);
    if (m.t >= 1) this.endMix(true);
  }
  endMix(done) {
    const m = this.mixing; if (!m) return; clearInterval(this.mixTimer); this.mixing = null;
    this.killDeck(done ? m.outgoing : m.incoming);
    if (done) { this.deck = m.incoming; this.file = this.deck.file; }
  }
  pause() { if (this.state === 'playing' && !this.command('z')) this.pauseLocal(); }
  pauseLocal() {
    if (this.state !== 'playing' || !this.file?.el) return;
    this.file.pause(); this.mixing?.incoming.file.pause(); this.mixing?.outgoing.file.pause(); this.state = 'paused';
  }
  stop() { if (!this.command('o')) this.stopLocal(); }
  stopLocal() {
    this.generation++; clearInterval(this.mixTimer);
    if (this.mixing) { this.killDeck(this.mixing.incoming); this.killDeck(this.mixing.outgoing); this.mixing = null; }
    this.killDeck(this.deck); this.mix?.disconnect();
    this.file = this.mix = this.deck = null; this.state = 'off'; this.stopDance();
  }
  setInside(on) {
    this.active = on;
    if (!on) { this.remote = null; this.stopLocal(); }
    else if (this.remote) { const { m, arrived } = this.remote; this.sync(m, arrived); }
  }
  dispose() {
    this.stopLocal(); document.removeEventListener('visibilitychange', this.hidden);
    window.removeEventListener('pagehide', this.leave);
  }
}

import { initAudio, audioParts } from './audio.js';
import { MusicFile } from './music.js';
import { MUSIC, SONOS, DANCE } from './config.js';

// #1621: the DJ bench plays any shipped track; the list is the Sonos channels' tracks in order.
export const PLAYROOM_TRACKS = SONOS.channels.flatMap((c) => c.tracks);

// Local clubhouse transport. Media is created only by a visitor's play action.
export class PlayroomMusic {
  constructor() {
    this.active = false; this.state = 'off'; this.volume = SONOS.start; this.generation = 0; this.index = 0; this.mixing = null; this.dancing = false; this.danceAt = null;
    this.hidden = () => { if (document.hidden) this.stop(); };
    this.leave = () => this.stop();
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
  play() {
    if (!this.active) return;
    initAudio(); const A = audioParts(); if (!A) return;
    const generation = this.generation;
    if (this.file?.el) {
      this.state = 'playing';
      this.file.resume(); this.mixing?.incoming.file.resume(); this.mixing?.outgoing.file.resume();
      return;
    }
    this.mix = A.ctx.createGain(); this.setVolume(this.volume); this.mix.connect(A.master);
    this.state = 'playing';
    this.deck = this.makeDeck(A, PLAYROOM_TRACKS[this.index], 1, () => queueMicrotask(() => { if (generation === this.generation) this.stop(); }));
    this.file = this.deck.file;
  }
  /** A deck is one track through its own fader into the shared volume gain, so two decks can overlap. */
  makeDeck(A, track, level, failed) {
    const fade = A.ctx.createGain(); fade.gain.value = level; fade.connect(this.mix);
    const deck = { fade, file: null };
    deck.file = new MusicFile(A, fade, track, { loop: true, failed });
    return deck;
  }
  killDeck(deck) { if (!deck) return; deck.file.stop(); deck.fade.disconnect(); }
  /** Next track: a hard cut, or (mix) an equal-power crossfade over MUSIC.crossfade seconds. */
  next(mix) {
    if (this.state === 'off' || this.mixing) return;
    const A = audioParts(); if (!A) return;
    this.index = (this.index + 1) % PLAYROOM_TRACKS.length;
    const generation = this.generation;
    if (this.state === 'paused' || !mix) { // cut: the new track replaces the old one at once (and starts playing)
      this.killDeck(this.deck); this.state = 'playing';
      this.deck = this.makeDeck(A, PLAYROOM_TRACKS[this.index], 1, () => queueMicrotask(() => { if (generation === this.generation) this.stop(); }));
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
  pause() {
    if (this.state !== 'playing' || !this.file?.el) return;
    this.file.pause(); this.mixing?.incoming.file.pause(); this.mixing?.outgoing.file.pause(); this.state = 'paused';
  }
  stop() {
    this.generation++; clearInterval(this.mixTimer);
    if (this.mixing) { this.killDeck(this.mixing.incoming); this.killDeck(this.mixing.outgoing); this.mixing = null; }
    this.killDeck(this.deck); this.mix?.disconnect();
    this.file = this.mix = this.deck = null; this.state = 'off'; this.stopDance();
  }
  setInside(on) { this.active = on; if (!on) this.stop(); }
  dispose() {
    this.stop(); document.removeEventListener('visibilitychange', this.hidden);
    window.removeEventListener('pagehide', this.leave);
  }
}

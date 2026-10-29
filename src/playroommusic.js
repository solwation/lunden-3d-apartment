import { freshDJ, cleanDJ, validDJ, applyDJ, djLevel } from './djstate.js';
import { initAudio, audioParts } from './audio.js';
import { MusicFile } from './music.js';
import { MUSIC, SONOS, DANCE, PLAYROOM, PLAYROOM_TRACKS } from './config.js';

// #1621, #1659: the DJ bench plays any shipped clubhouse track
export { PLAYROOM_TRACKS };

// Local clubhouse transport. Media is created only by a visitor's play action.
export class PlayroomMusic {
  constructor() {
    this.active = false; this.state = 'off'; this.volume = SONOS.start; this.generation = 0; this.index = 0; this.mixing = null; this.dancing = false; this.danceAt = null;
    this.shuffle = false; this.deckSide = 0; // #1659: shuffle mode and active turntable deck (0: left, 1: right)
    this.net = null; this.remote = null; // #1624: { ready(), send(msg) } set by main.js; a room state that arrived before we were inside
    this.hidden = () => { if (document.hidden) this.stopLocal(); };
    this.leave = () => this.stopLocal();
    document.addEventListener('visibilitychange', this.hidden);
    window.addEventListener('pagehide', this.leave);
    this.target = { kind: 'playroomMusic', name: 'biljardrummets högtalare', options: () => this.options() };
  }
  isDeckSpinning(side) {
    if (this.dj) return this.dj.on[side];
    if (this.state !== 'playing') return false;
    if (this.mixing) return true;
    return this.deckSide === side;
  }
  /** Manual controls use the same authoritative room transport, with no frame traffic. */
  get djState() { return this.dj ?? freshDJ(this.volume); }
  djAction(action) {
    const a = cleanDJ(action, PLAYROOM_TRACKS.length, SONOS.steps); if (!a || !this.active) return false;
    initAudio();
    if (this.net?.ready() && this.net.send({ t: 'mus', k: 'd', ...a })) return true;
    if (!this.dj) {
      const d = freshDJ(this.volume); d.ix[0] = this.index;
      if (this.state !== 'off') { d.on[0] = this.state === 'playing'; d.pos[0] = (this.file?.el?.currentTime ?? 0)*1000; d.at[0] = performance.now()-d.pos[0]; }
      this.stopLocal(); this.dj = d;
    }
    applyDJ(this.dj, a, performance.now()); this.applyManual(this.dj); return true;
  }
  changeDJTrack(side, direction) {
    const d = this.djState, cur = d.ix[side], n = PLAYROOM_TRACKS.length;
    const to = d.shuffle ? (cur + 1 + Math.floor(Math.random()*(n-1)))%n : (cur+direction+n)%n;
    return this.djAction({ c:'track', s:side, v:to });
  }
  applyManual(d, late = 0) {
    if (!this.dj) this.stopLocal();
    this.dj = structuredClone(d); this.shuffle = d.shuffle; this.volume = d.volume;
    this.manualDecks ??= [null,null];
    const A = audioParts();
    if (!this.mix && d.on.some(Boolean) && A) { this.mix = A.ctx.createGain(); this.setVolume(d.volume); this.routeMix(A); }
    this.setVolume(d.volume);
    for (let s=0;s<2;s++) {
      let deck = this.manualDecks[s];
      if (deck && (deck.ix !== d.ix[s] || (!d.on[s] && d.pos[s] === 0))) { this.killDeck(deck); deck = this.manualDecks[s] = null; }
      if (!deck && d.on[s] && A) {
        const generation=this.generation;
        deck = this.makeDeck(A, PLAYROOM_TRACKS[d.ix[s]], djLevel(d,s), () => queueMicrotask(() => {
          if (generation!==this.generation || this.manualDecks?.[s]!==deck) return;
          const next=structuredClone(this.dj);next.on[s]=false;next.pos[s]=0;this.applyManual(next);
        }), (d.pos[s]+late)/1000);
        deck.ix = d.ix[s]; this.manualDecks[s] = deck;
      }
      if (deck) { deck.fade.gain.value = djLevel(d,s); if (d.on[s]) { if (deck.file.paused) deck.file.resume(); } else deck.file.pause(); }
    }
    this.state = d.on.some(Boolean) ? 'playing' : this.manualDecks.some(Boolean) ? 'paused' : 'off';
    this.index = d.ix[d.cross > .5 ? 1 : 0]; this.deckSide = d.cross > .5 ? 1 : 0;
    if (this.state !== 'playing') this.stopDance();
    if (!d.on.some(Boolean) && d.pos.every(p=>p===0)) {
      this.mix?.disconnect(); this.room?.disconnect(); this.share?.disconnect(); this.panners?.forEach(n=>n.disconnect());
      this.mix = this.room = this.share = null; this.panners=[];
    }
  }
  /** #1667: a shared activity lamp, without changing anybody else's individual dance toggle. */
  get danceActive() {
    if (this.dancing) return true;
    if (this.state !== 'playing') return false;
    for (const g of this.peers?.() ?? []) {
      const p=g.feet;
      if (g.dance && p && Math.abs(p.x-PLAYROOM.x)<PLAYROOM.w/2 && Math.abs(p.z-PLAYROOM.z)<PLAYROOM.d/2) return true;
    }
    return false;
  }
  toggleShuffle() {
    this.shuffle = !this.shuffle;
    return this.shuffle;
  }
  pickNextIndex() {
    const total = PLAYROOM_TRACKS.length;
    if (total <= 1) return 0;
    if (!this.shuffle) return (this.index + 1) % total;
    const offset = 1 + Math.floor(Math.random() * (total - 1));
    return (this.index + offset) % total;
  }
  options() {
    const cur = PLAYROOM_TRACKS[this.index];
    return [
      { label: this.state === 'playing' ? 'Pausa musiken' : this.state === 'paused' ? 'Fortsätt musiken' : 'Spela musik', run: () => this.state === 'playing' ? this.pause() : this.play() },
      ...(this.state === 'off' ? [] : [{ label: 'Stäng av musiken', run: () => this.stop() }]),
      ...(this.state === 'off' ? [] : [
        { label: 'Nästa låt', reason: this.mixing ? 'Mixar redan' : '', run: () => this.next(false) },
        { label: 'Mixa till nästa låt', reason: this.mixing ? 'Mixar redan' : '', run: () => this.next(true) },
        { label: this.shuffle ? 'Slumpad låtordning: På' : 'Slumpad låtordning: Av', run: () => this.toggleShuffle() },
      ]),
      { label: `Volym − (${this.volume}/${SONOS.steps})`, reason: this.volume === 0 ? 'Lägsta volym' : '', run: () => this.setVolume(this.volume - 1) },
      { label: `Volym + (${this.volume}/${SONOS.steps})`, reason: this.volume === SONOS.steps ? 'Högsta volym' : '', run: () => this.setVolume(this.volume + 1) },
      // #1622: the floss is offered only while the music plays (not paused or off)
      ...(this.state === 'playing' || this.dancing ? [{ label: this.dancing ? 'Sluta dansa' : 'Dansa floss', run: () => this.dancing ? this.stopDance() : this.startDance() }] : []),
      ...(this.state === 'off' || !cur ? [] : [{ label: `Låt: ${cur.title} (${cur.artist})`, reason: `${this.index + 1}/${PLAYROOM_TRACKS.length}`, run: () => {} }]),
    ];
  }
  /** #1622: the dance is sent as `dn: 1` in the player state (main.js); it ends with the music, a pause, leaving or walking away. */
  /** #1636: the dance button/key (main.js) is offered to everybody inside while the music plays (or while they are already dancing, to stop). */
  get canDance() { return this.active && (this.state === 'playing' || this.dancing); }
  toggleDance() { if (!this.canDance) return false; if (this.dancing) this.stopDance(); else this.startDance(); return true; }
  startDance() { if (this.state === 'playing') { this.dancing = true; this.danceAt = null; } }
  stopDance() { this.dancing = false; this.danceAt = null; }
  /** #1645: the four ceiling speakers' world positions; the mix then reaches the master through one positional (panner) source per speaker. */
  setSpeakers(positions) { this.speakers = positions; }
  routeMix(A) {
    this.panners = [];
    this.room = A.ctx.createGain(); this.room.gain.value = this.roomLevel ?? 1; this.mix.connect(this.room);
    if (!this.speakers?.length || !A.ctx.createPanner) { this.room.connect(A.master); return; }
    const S = PLAYROOM.speakers, share = A.ctx.createGain(); share.gain.value = 1 / this.speakers.length ** .5; // power-wise four sources sum to one
    this.room.connect(share);
    for (const p of this.speakers) {
      const n = A.ctx.createPanner(); n.panningModel = 'equalpower'; n.distanceModel = 'inverse'; n.refDistance = S.ref; n.rolloffFactor = S.rolloff;
      if (n.positionX) { n.positionX.value = p.x; n.positionY.value = p.y; n.positionZ.value = p.z; } else n.setPosition?.(p.x, p.y, p.z);
      share.connect(n); n.connect(A.master); this.panners.push(n);
    }
    this.share = share;
  }
  /** #1645: each frame inside, the Web Audio listener follows the camera (position + facing); only these panners use it. */
  listen(camera) {
    this.hear(camera.position);
    const L = audioParts()?.ctx.listener; if (!L || !this.panners?.length) return;
    const p = camera.position, e = camera.matrixWorld.elements, fx = -e[8], fy = -e[9], fz = -e[10];
    if (L.positionX) { L.positionX.value = p.x; L.positionY.value = p.y; L.positionZ.value = p.z; L.forwardX.value = fx; L.forwardY.value = fy; L.forwardZ.value = fz; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; }
    else { L.setPosition?.(p.x, p.y, p.z); L.setOrientation?.(fx, fy, fz, 0, 1, 0); }
  }
  /** The music belongs to BILJARD: full there, quieter in the hall, silent in BIO and SPEL (whose own film/game sound plays). */
  static roomLevel(pos) {
    const x = pos.x - PLAYROOM.x, z = pos.z - PLAYROOM.z, B = PLAYROOM.speakers.bounds, L = PLAYROOM.speakers.rooms;
    if (z > PLAYROOM.clubhouse.front) return L.hall;
    return x >= B.x0 && x <= B.x1 ? 1 : L.other;
  }
  hear(pos) {
    const level = PlayroomMusic.roomLevel(pos), changed = level !== this.roomLevel; this.roomLevel = level;
    const g = this.room?.gain; if (!g || !changed) return;
    const ctx = audioParts()?.ctx;
    if (ctx && g.setTargetAtTime) { g.cancelScheduledValues?.(ctx.currentTime); g.setTargetAtTime(level, ctx.currentTime, PLAYROOM.speakers.rooms.fade); } else g.value = level;
  }
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
  /** #1624, #1659: a user action goes to the room when connected (the room answers everybody inside, us too, and `sync` applies it); else it is local as before. */
  command(k, to) {
    if (!this.active || !this.net?.ready()) return false;
    initAudio();
    return !!this.net.send({ t: 'mus', k, ...(k === 'n' || k === 'm' ? { ix: this.index, ...(to !== undefined ? { to } : {}) } : {}) });
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
    this.mix = A.ctx.createGain(); this.setVolume(this.volume); this.routeMix(A);
    this.state = 'playing'; this.index = ix;
    this.deckSide = ix % 2;
    const t = mx ? Math.min(1, mx.el / 1000 / MUSIC.crossfade) : 0;
    this.deck = this.makeDeck(A, PLAYROOM_TRACKS[ix], Math.cos(t * Math.PI / 2), failed, pos / 1000);
    this.file = this.deck.file;
    if (!mx) return;
    const incoming = this.makeDeck(A, PLAYROOM_TRACKS[mx.to], Math.sin(t * Math.PI / 2), () => queueMicrotask(() => {
      if (generation !== this.generation || this.mixing?.incoming !== incoming) return;
      this.endMix(false); this.index = ix;
    }), mx.el / 1000);
    this.index = mx.to;
    this.deckSide = 1 - this.deckSide;
    this.mixing = { incoming, outgoing: this.deck, t, last: performance.now() };
    this.mixTimer = setInterval(() => this.tickMix(), 50);
  }
  /** #1624: the room's transport { st, ix, pos, mx? } (ms elapsed). Idempotent: nothing changes when we already play that track in that state. */
  sync(m, arrived = performance.now()) {
    if (m?.dj !== undefined) {
      if (!validDJ(m.dj, PLAYROOM_TRACKS.length, SONOS.steps)) return;
      if (!this.active) { this.remote = {m,arrived}; return; }
      this.remote = null; initAudio(); this.applyManual(m.dj, Math.max(0,performance.now()-arrived)); return;
    }
    const tracks = PLAYROOM_TRACKS.length, ok = (i) => Number.isInteger(i) && i >= 0 && i < tracks;
    if (!m || !['off', 'playing', 'paused'].includes(m.st) || !ok(m.ix) || !Number.isFinite(m.pos) || m.pos < 0
      || (m.mx !== undefined && !(ok(m.mx?.to) && Number.isFinite(m.mx.el) && m.mx.el >= 0))) return;
    if (this.dj) this.stopLocal();
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
    if (el && offset > 0) { const seek = () => { if (el.duration > 0) el.currentTime = offset % el.duration; }; if (el.readyState >= 1) seek(); else el.addEventListener('loadedmetadata', seek, { once: true, signal: deck.file.ac?.signal }); } // the element is reused (music.js): the file's signal drops this with it
    return deck;
  }
  killDeck(deck) { if (!deck) return; deck.file.stop(); deck.fade.disconnect(); }
  /** Next track: a hard cut, or (mix) an equal-power crossfade over MUSIC.crossfade seconds. */
  next(mix, targetIndex) {
    if (this.state === 'off' || this.mixing) return;
    const to = targetIndex !== undefined ? targetIndex : (this.shuffle ? this.pickNextIndex() : undefined);
    if (this.command(mix ? 'm' : 'n', to)) return;
    this.nextLocal(mix, to);
  }
  nextLocal(mix, to) {
    if (this.state === 'off' || this.mixing) return;
    const A = audioParts(); if (!A) return;
    const prev = this.index;
    this.index = to !== undefined ? to : (this.shuffle ? this.pickNextIndex() : (this.index + 1) % PLAYROOM_TRACKS.length);
    this.deckSide = 1 - this.deckSide;
    const generation = this.generation;
    if (this.state === 'paused' || !mix) { // cut: the new track replaces the old one at once (and starts playing)
      this.killDeck(this.deck); this.state = 'playing';
      this.deck = this.makeDeck(A, PLAYROOM_TRACKS[this.index], 1, () => queueMicrotask(() => { if (generation === this.generation) this.stopLocal(); }));
      this.file = this.deck.file; return;
    }
    const incoming = this.makeDeck(A, PLAYROOM_TRACKS[this.index], 0, () => queueMicrotask(() => {
      if (generation !== this.generation || this.mixing?.incoming !== incoming) return;
      this.endMix(false); // the new track will not load: keep the old one, step the index back
      this.index = prev;
      this.deckSide = 1 - this.deckSide;
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
    else { this.deckSide = 1 - this.deckSide; }
  }
  pause() { if (this.state === 'playing' && !this.command('z')) this.pauseLocal(); }
  pauseLocal() {
    if (this.state !== 'playing' || !this.file?.el) return;
    this.file.pause(); this.mixing?.incoming.file.pause(); this.mixing?.outgoing.file.pause(); this.state = 'paused';
  }
  stop() { if (!this.command('o')) this.stopLocal(); }
  stopLocal() {
    this.generation++; clearInterval(this.mixTimer);
    this.manualDecks?.forEach(d=>this.killDeck(d)); this.manualDecks = null; this.dj = null;
    if (this.mixing) { this.killDeck(this.mixing.incoming); this.killDeck(this.mixing.outgoing); this.mixing = null; }
    this.killDeck(this.deck); this.mix?.disconnect(); this.room?.disconnect(); this.share?.disconnect(); this.panners?.forEach((n) => n.disconnect()); this.panners = []; this.share = this.room = null;
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

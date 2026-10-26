import { audioParts } from './audio.js';
import { MUSIC } from './config.js';

// Shared lazy media transport (#416). No Audio element or request until start().
const TYPES = { ogg: 'audio/ogg; codecs="opus"', opus: 'audio/ogg; codecs="opus"', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav' };
export function trackSrc(track, canPlay = (type) => new Audio().canPlayType(type)) {
  return (track.files ?? []).find((f) => {
    const type = TYPES[/\.(\w+)(?:[?#].*)?$/.exec(f)?.[1]?.toLowerCase()];
    return !type || canPlay(type);
  }) ?? null;
}
export const failedFiles = new Set();

// #1629: Chrome keeps a MediaElementAudioSourceNode, and with it the element and its listeners, alive for as long as its AudioContext
// lives, even after disconnect() and a removed src; an element can also feed only one source node. A fresh Audio per track therefore
// leaked one element + node per start (+2 per DJ track change, measured with queryObjects). Released slots are reused instead.
const idleSlots = new WeakMap(); // AudioContext -> [{ el, node }]
const leaseSlot = (ctx) => idleSlots.get(ctx)?.pop() ?? (() => { const el = new Audio(); return { el, node: ctx.createMediaElementSource(el) }; })();
const releaseSlot = (ctx, slot) => { const free = idleSlots.get(ctx) ?? []; idleSlots.set(ctx, free); if (!free.includes(slot)) free.push(slot); };

export class MusicFile {
  constructor(A, dest, track, { loop = false, ended = () => {}, failed = () => {} } = {}) {
    Object.assign(this, { A, dest, track, loop, ended, failed, el: null, node: null, src: null, stopped: false, paused: false, playGeneration: 0 });
    this.start();
  }
  start() {
    const src = trackSrc({ files: this.track.files.filter((f) => !failedFiles.has(f)) });
    if (!src) { this.failed(); return; }
    const slot = leaseSlot(this.A.ctx), { el, node } = slot, ac = new AbortController(), { signal } = ac;
    Object.assign(this, { el, node, src, slot, ac });
    node.connect(this.dest); el.preload = 'auto'; el.loop = this.loop;
    const bad = (remember = true) => {
      if (this.stopped || this.el !== el) return;
      if (remember) failedFiles.add(src);
      this.drop();
      if (remember) this.start(); // try MP3 too if Opus failed to load/decode
      else this.failed(); // autoplay refusal is not a corrupt file
    };
    const arm = () => {
      if (this.stopped || this.paused || this.el !== el) return;
      clearTimeout(this.timer); this.timer = setTimeout(() => bad(), MUSIC.loadTimeout);
    };
    el.addEventListener('error', () => bad(), { signal });
    el.addEventListener('playing', () => clearTimeout(this.timer), { signal });
    el.addEventListener('waiting', arm, { signal });
    el.addEventListener('ended', () => { if (!this.stopped && this.el === el) this.ended(); }, { signal });
    this.run = () => {
      const generation = ++this.playGeneration;
      arm();
      el.play()?.catch((e) => {
        // pause/stop can reject an earlier play() with AbortError: it is not a bad file.
        if (generation !== this.playGeneration) return;
        bad(e?.name !== 'NotAllowedError');
      });
    };
    el.src = src; el.load();
    if (!this.paused) this.run();
  }
  pause() { this.paused = true; this.playGeneration++; clearTimeout(this.timer); this.el?.pause(); }
  resume() { if (!this.stopped && this.el) { this.paused = false; this.run(); } }
  drop() {
    this.playGeneration++;
    clearTimeout(this.timer);
    const el = this.el; this.el = null;
    this.ac?.abort(); this.ac = null;
    if (el) { el.pause(); el.removeAttribute('src'); el.load(); }
    this.node?.disconnect(); this.node = null;
    if (this.slot) { releaseSlot(this.A.ctx, this.slot); this.slot = null; }
  }
  stop() { this.stopped = true; this.drop(); }
}

// A looping track at an appliance, through the same master/mute as sound effects.
// update returns false on failure; callers keep their visual/game flow running without generated music.
export class MusicLoop {
  constructor(gain) { this.gain = gain; }
  update(track, pos = null, rate = 1) {
    const A = audioParts();
    if (!A) return false;
    if (this.track !== track) {
      this.stop(); this.track = track; this.bad = false;
      this.mix = A.ctx.createGain(); this.mix.gain.value = this.gain;
      if (pos) {
        this.pan = A.ctx.createPanner();
        this.pan.panningModel = 'equalpower'; this.pan.distanceModel = 'inverse';
        this.pan.refDistance = 1.2; this.pan.rolloffFactor = 1.2;
        this.mix.connect(this.pan).connect(A.master);
      } else this.mix.connect(A.master);
      this.file = new MusicFile(A, this.mix, track, { loop: true, failed: () => { this.bad = true; } });
    }
    if (this.pan && pos) {
      this.pan.positionX.value = pos.x; this.pan.positionY.value = pos.y; this.pan.positionZ.value = pos.z;
    }
    if (this.file?.el) this.file.el.playbackRate = rate;
    return !this.bad;
  }
  stop() {
    this.file?.stop(); this.mix?.disconnect(); this.pan?.disconnect();
    this.file = this.mix = this.pan = this.track = null;
  }
}

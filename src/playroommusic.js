import { initAudio, audioParts } from './audio.js';
import { MusicFile } from './music.js';
import { MUSIC, SONOS } from './config.js';

// Local clubhouse transport. Media is created only by a visitor's play action.
export class PlayroomMusic {
  constructor() {
    this.active = false; this.state = 'off'; this.volume = SONOS.start; this.generation = 0;
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
      { label: `Volym − (${this.volume}/${SONOS.steps})`, reason: this.volume === 0 ? 'Lägsta volym' : '', run: () => this.setVolume(this.volume - 1) },
      { label: `Volym + (${this.volume}/${SONOS.steps})`, reason: this.volume === SONOS.steps ? 'Högsta volym' : '', run: () => this.setVolume(this.volume + 1) },
    ];
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
      this.file.resume();
      return;
    }
    this.mix = A.ctx.createGain(); this.setVolume(this.volume); this.mix.connect(A.master);
    this.state = 'playing';
    this.file = new MusicFile(A, this.mix, MUSIC.lofi[0], { loop: true, failed: () => queueMicrotask(() => { if (generation === this.generation) this.stop(); }) });
  }
  pause() {
    if (this.state !== 'playing' || !this.file?.el) return;
    this.file.pause(); this.state = 'paused';
  }
  stop() {
    this.generation++; this.file?.stop(); this.mix?.disconnect();
    this.file = this.mix = null; this.state = 'off';
  }
  setInside(on) { this.active = on; if (!on) this.stop(); }
  dispose() {
    this.stop(); document.removeEventListener('visibilitychange', this.hidden);
    window.removeEventListener('pagehide', this.leave);
  }
}

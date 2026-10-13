import { HUD_FPS } from './config.js';

// Pure #884 counter: callers report only completed ordinary main-view draws, never renderer subpasses.
export class FrameRate {
  constructor(everyMs = HUD_FPS.everyMs) { this.everyMs = everyMs; this.reset(); }
  reset() { this.active = false; this.frames = 0; this.at = null; this.value = null; }
  sample(now, drawn, active) {
    if (!active || !Number.isFinite(now) || (this.at !== null && now < this.at)) { this.reset(); return this.value; }
    // The first completed frame establishes the wall-time baseline; no elapsed interval is credited yet.
    if (!this.active) { this.active = true; this.at = now; this.frames = 0; return this.value; }
    if (drawn) this.frames++;
    const elapsed = now - this.at;
    if (elapsed >= this.everyMs) {
      this.value = Math.round(this.frames * 1000 / elapsed);
      this.frames = 0; this.at = now;
    }
    return this.value;
  }
}

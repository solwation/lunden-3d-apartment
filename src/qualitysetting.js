import { QUALITY } from './config.js';

// Graphics choice in the settings dialog (#1509): Auto or one of the named current levels, plus a 30/60 FPS target.
// Reads and writes only through Quality (src/quality.js); a URL/test/shot lock disables the buttons and says so.
export class QualitySetting {
  constructor(quality, { level, fps, note }, { pinned = false } = {}) {
    Object.assign(this, { quality, level, fps, note, pinned });
    const options = [['auto', 'Auto'], ...QUALITY.names.slice(0, quality.top + 1).map((n, i) => [i, n])]; // Ultra only where allowed (#1512)
    this.buttons = options.map(([value, text]) => {
      const b = document.createElement('button');
      Object.assign(b, { type: 'button', textContent: text }); b.setAttribute('role', 'radio'); b.dataset.value = String(value);
      b.addEventListener('click', () => { quality.choose(value === 'auto' ? 'auto' : +value); this.refresh(); });
      level.append(b); return b;
    });
    for (const b of fps.querySelectorAll('button')) b.addEventListener('click', () => { quality.setTarget(+b.dataset.fps); this.refresh(); });
    quality.onChange(() => this.refresh());
    this.refresh();
  }
  refresh() {
    const q = this.quality, locked = q.locked || this.pinned;
    for (const b of this.buttons) {
      b.disabled = locked;
      b.setAttribute('aria-checked', String(!locked && (b.dataset.value === 'auto' ? q.mode === 'auto' : q.mode === 'manual' && +b.dataset.value === q.manualLevel)));
    }
    for (const b of this.fps.querySelectorAll('button')) { b.disabled = locked; b.setAttribute('aria-checked', String(!locked && +b.dataset.fps === q.target)); }
    const name = QUALITY.names[q.level] ?? q.level;
    this.note.textContent = locked ? `Grafiken är låst av webbadressen (nivå ${name}); ditt sparade val ändras inte.`
      : q.mode === 'auto' ? `Auto: just nu ${name}. Bildmålet styr hur mycket Auto belastar enheten, det är inget löfte.`
        : `Fast nivå: ${name}. Auto ändrar den inte.`;
  }
}

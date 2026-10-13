import { COMBAT } from './config.js';

/** A short receipt from the room, never a prediction from the local shot. */
export class HitMarker {
  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'hit-marker';
    this.el.hidden = true;
    this.el.setAttribute('role', 'status');
    this.el.setAttribute('aria-live', 'polite');
    this.el.setAttribute('aria-atomic', 'true');
    Object.assign(this.el.style, { position: 'fixed', left: '50%', top: `calc(50% - ${COMBAT.hitMarker.offsetPx}px)`,
      transform: 'translate(-50%, -100%)', zIndex: 20, pointerEvents: 'none', whiteSpace: 'nowrap',
      font: '700 16px system-ui, -apple-system, "Segoe UI", sans-serif', color: '#fff',
      background: 'rgba(18, 22, 30, 0.85)', border: '1px solid rgba(255,255,255,.6)',
      padding: '4px 10px', borderRadius: '8px', textShadow: '0 1px 2px #000' });
    document.body.append(this.el);
  }

  show(receipt) {
    clearTimeout(this.timer);
    const text = receipt.head === true ? 'Huvudträff!' : 'Träff!';
    // Repeated identical hits extend the marker without rewriting the live region.
    if (this.el.textContent !== text) this.el.textContent = text;
    this.el.hidden = false;
    this.until = performance.now() + COMBAT.hitMarker.lifeMs;
    this.timer = setTimeout(() => this.clear(), COMBAT.hitMarker.lifeMs);
  }

  update() { if (!this.el.hidden && performance.now() >= this.until) this.clear(); }
  clear() { clearTimeout(this.timer); this.el.hidden = true; this.until = 0; }
}

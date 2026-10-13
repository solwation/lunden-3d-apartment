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
    // Geometry is sampled only for receipts/viewport changes, never Combat.update's frame loop.
    const resized = () => { if (!this.el.hidden) this.schedulePlacement(); };
    window.addEventListener('resize', resized);
    window.visualViewport?.addEventListener('resize', resized);
    // Compass publishes its center after row layout; observe that resize too before placing the receipt.
    this.layoutObserver = new ResizeObserver(resized);
    for (const element of [document.getElementById('compass')?.parentElement, document.getElementById('lives')])
      if (element) this.layoutObserver.observe(element);
  }

  show(receipt) {
    clearTimeout(this.timer);
    const text = receipt.head === true ? 'Huvudträff!' : 'Träff!';
    // Repeated identical hits extend the marker without rewriting the live region.
    if (this.el.textContent !== text) this.el.textContent = text;
    this.el.hidden = false;
    this.place();
    this.schedulePlacement();
    this.until = performance.now() + COMBAT.hitMarker.lifeMs;
    this.timer = setTimeout(() => this.clear(), COMBAT.hitMarker.lifeMs);
  }

  schedulePlacement() {
    if (this.layoutFrame) return;
    this.layoutFrame = requestAnimationFrame(() => { this.layoutFrame = 0; this.place(); });
  }

  place() {
    this.el.style.marginLeft = '0px'; // normal centered lane, including a shorter subsequent receipt
    const lives = document.getElementById('lives');
    if (this.el.hidden || !lives || lives.hidden) return;
    const marker = this.el.getBoundingClientRect(), life = lives.getBoundingClientRect();
    if (Math.min(marker.right, life.right) > Math.max(marker.left, life.left)
      && Math.min(marker.bottom, life.bottom) > Math.max(marker.top, life.top)) {
      this.el.style.marginLeft = `${life.left - COMBAT.hitMarker.livesGapPx - marker.right}px`;
    }
  }

  update() { if (!this.el.hidden && performance.now() >= this.until) this.clear(); }
  clear() { clearTimeout(this.timer); cancelAnimationFrame(this.layoutFrame); this.layoutFrame = 0; this.el.hidden = true; this.until = 0; this.el.style.marginLeft = '0px'; }
}

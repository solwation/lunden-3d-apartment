// Interactive statistics (#886): release the mouse, isolate gameplay input and keep Tab-hold/T-pin distinct.
export class StatsPanel {
  constructor({ el, body, render, opened = () => {}, closed = () => {}, changed = () => {} }) {
    Object.assign(this, { el, body, render, opened, closed, changed, pinned: false, held: false });
    body.tabIndex = 0;
    el.querySelector('#stats-close').addEventListener('click', () => this.close());
    // Bubble containment leaves native scrolling and button activation intact.
    for (const type of ['mousedown', 'mouseup', 'click', 'wheel']) el.addEventListener(type, e => e.stopPropagation(), { passive: type === 'wheel' });
    document.addEventListener('keydown', e => this.key(e), true);
  }
  get open() { return !this.el.hidden; }
  show(show) {
    const was = this.open;
    if (show && !was) this.render();
    this.el.hidden = !show;
    this.changed(show);
    if (show && !was) { this.opened(); this.body.focus({ preventScroll: true }); }
    else if (!show && was) this.closed();
  }
  toggle() { this.pinned = !this.pinned; this.show(this.pinned || this.held); }
  hold(down) { this.held = down; this.show(down || this.pinned); }
  close() { this.pinned = this.held = false; this.show(false); }
  key(e) {
    if (!this.open) return;
    // An independent dialog keeps its own editing/close keys.
    if (!this.el.contains(e.target) && e.target.closest?.('#player-dialog, #leaderboard-dialog, #privacy-dialog')) return;
    e.stopImmediatePropagation(); // no movement, weapon, focus choice or other gameplay key underneath
    if (e.code === 'Escape') { e.preventDefault(); this.close(); return; }
    if (e.code === 'KeyT') { e.preventDefault(); if (!e.repeat) this.toggle(); return; }
    if (e.code === 'Tab') {
      e.preventDefault();
      if (this.held) return; // repeats while holding Tab must not steal focus
      const items = [...this.el.querySelectorAll('button, a[href], input, select, textarea, [tabindex]')]
        .filter(el => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length);
      const i = items.indexOf(document.activeElement), n = items.length;
      if (n) items[(i + (e.shiftKey ? -1 : 1) + n) % n].focus();
      return;
    }
    if (e.target.closest?.('button, a[href], input, select, textarea')) return; // native Enter/Space button activation
    const page = this.body.clientHeight * .8;
    const scroll = { ArrowDown: 40, ArrowUp: -40, PageDown: page, PageUp: -page, Space: e.shiftKey ? -page : page };
    if (e.code in scroll) { e.preventDefault(); this.body.scrollTop += scroll[e.code]; }
    else if (e.code === 'Home' || e.code === 'End') { e.preventDefault(); this.body.scrollTop = e.code === 'Home' ? 0 : this.body.scrollHeight; }
    else e.preventDefault();
  }
}

import { SECRET } from './config.js';
import { sfx } from './audio.js';

// The secret drawer in the secretary (#183): every time it is opened (closed → open) a new little thing lies in
// it, drawn by weight from SECRET.items and never the same twice in a row. All of them are built (furniture.js,
// SECRETS) and are Trinkets (things.js); only the current one is shown at home. One that was taken out and left
// somewhere stays there, at most SECRET.keep of them; the oldest beyond that goes home (out of sight). Rare ones
// pling. `&secret=i` picks the first one (screenshots).

export class SecretDrawer {
  /** items: the Trinkets with `secret`, drawer: the drawer's E target, onFind(item, rare): stats. */
  constructor(items, drawer, { first = null, onFind } = {}) {
    this.keepFirst = first != null;
    Object.assign(this, { items, drawer, onFind, out: [], rand: Math.random, current: null, last: null });
    const weights = new Map(SECRET.items.map((s) => [s.key, s]));
    for (const t of items) {
      t.info = weights.get(t.secret);
      const home = t.goHome.bind(t);
      t.goHome = () => { home(); this.out = this.out.filter((o) => o !== t); t.model.visible = t === this.current; };
      const place = t.placeAt.bind(t);
      t.placeAt = (p) => { place(p); this.leftOut(t); };
    }
    this.show(items[first] ?? items.find((t) => t.secret === 'star') ?? items[0]);
    const toggle = drawer.toggle.bind(drawer);
    drawer.toggle = () => { toggle(); if (drawer.isOpen) this.reveal(); };
  }

  /** Show `t` in the drawer as the current surprise. */
  show(t) {
    const prev = this.current;
    this.current = t;
    if (prev && prev !== t && !prev.held && !prev.placed) prev.model.visible = false; // still at home: out of sight
    for (const o of this.items) if (!o.held && !o.placed) o.model.visible = o === t;
    t.goHome();
  }

  /** A weighted draw, never the current one. */
  pick() {
    const pool = this.items.filter((t) => t !== this.current && !t.held && !t.placed);
    let r = this.rand() * pool.reduce((s, t) => s + (t.info?.weight ?? 1), 0);
    for (const t of pool) if ((r -= t.info?.weight ?? 1) <= 0) return t;
    return pool.at(-1);
  }

  /** The drawer was just opened: a new surprise (the first open with `&secret` keeps the chosen one). */
  reveal(force = null) {
    const next = force ?? (this.keepFirst ? this.current : this.pick());
    this.keepFirst = false;
    if (!next) return;
    if (next !== this.current || !this.current.model.visible) this.show(next);
    this.onFind?.(next, !!next.info?.rare);
    if (next.info?.rare) sfx.pling(next.where(), 1.3);
  }

  /** A surprise was put down outside the drawer: keep at most SECRET.keep lying around. */
  leftOut(t) {
    this.out = [...this.out.filter((o) => o !== t), t];
    while (this.out.length > SECRET.keep) this.out[0].goHome(); // goHome takes it off the list (and hides it)
  }
}

/** The secret drawer's controller, if the secretary is there. */
export function buildSecret(things, opts) {
  const items = things.filter((t) => t.secret);
  return items.length ? new SecretDrawer(items, items[0].drawer, opts) : null;
}


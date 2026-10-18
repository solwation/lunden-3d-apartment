import { CAT_CARD as C } from './config.js';

// The cat card binder's browse UI (#1255, part 2 of #1249): one page per breed (CAT_CARD.breeds, Miele last), then a page
// with the old board photos that belong to no breed, when there are any. A page shows the card (name, points, weight, facts,
// counters) and one place per card slot (C.max): a photo of where the cat was found, or an empty place. A breed that has not
// been found is a "?" placeholder. Pure DOM + CatCards (src/catcards.js); keys: ← → (A / D) turn the page, Home / End jump,
// E / Esc close (main.js). Rarity visuals (#1256): a card gets `fx-N` (CAT_CARD.fx level by tier) and decorative layers
// (foil, shine, glitter, holo, ★ sparkles) drawn by CSS in index.html; pointer / touch movement tilts it and moves the holo
// sheen (not under prefers-reduced-motion). Photo menu (#1257): every photo has Spara / Sparad (toggle: a saved card is never rotated
// out) and Kasta (asks first); tapping a photo, or the card's "Visa foton" button, opens it enlarged (#binder-view .viewer, ‹ ›
// browse the page's photos, same buttons). `.confirm` is the throw-away question. Esc / E close the topmost layer first
// (`back()`), a new find's "rotated out" / "full" notice is shown by main.js (#cat-notice) and the page says what the next find does.

const fmtTime = (t) => new Date(t).toLocaleString('sv-SE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const kg = (n) => n.toLocaleString('sv-SE', { maximumFractionDigits: 1 });
const weight = ([a, b]) => `ca ${a === b ? kg(a) : `${kg(a)}–${kg(b)}`} kg`;
const times = (n) => (n === 1 ? '1 gång' : `${n} gånger`);

export class BinderPanel {
  /** `cards`: the CatCards; `el`: #binder-view. */
  constructor(cards, el) {
    Object.assign(this, { cards, el, open: false, index: 0 });
    this.body = el.querySelector('.page');
    this.dots = el.querySelector('.dots');
    this.title = el.querySelector('.count');
    this.viewer = el.querySelector('.viewer');
    this.confirm = el.querySelector('.confirm');
    this.view = null; // { ids, i }: the enlarged photo and the photos of its page
    this.asking = null; // id of the card the throw-away question is about
    el.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]');
      if (a) { this.act(a.dataset.act, a.dataset.id); return; }
      const b = e.target.closest('button[data-nav]');
      if (!b) return;
      const v = b.dataset.nav;
      if (v === 'prev') this.turn(-1); else if (v === 'next') this.turn(1); else this.go(Number(v));
    });
    // a swipe sideways turns the page (touch)
    let x0 = null;
    el.addEventListener('touchstart', (e) => { x0 = e.touches.length === 1 ? e.touches[0].clientX : null; }, { passive: true });
    el.addEventListener('touchend', (e) => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) <= 60 || this.asking) return;
      if (this.view) this.step(dx < 0 ? 1 : -1); else this.turn(dx < 0 ? 1 : -1); // (an enlarged photo swipes between photos)
    }, { passive: true });
  }

  /** The pages in order: the breeds, then the legacy page if the old photos left any. */
  get pages() {
    const p = this.cards.slots().map((s) => ({ slot: s }));
    const old = this.cards.legacy();
    if (old.length) p.push({ legacy: old });
    return p;
  }

  show(show, index = null) {
    this.open = show;
    this.el.hidden = !show;
    this.view = this.asking = null;
    this.viewer.hidden = this.confirm.hidden = true;
    if (show) { this.index = index ?? this.firstFound(); this.render(); }
  }

  /** E / Esc: close the topmost layer (question, then enlarged photo). True if one was closed, false: close the whole panel. */
  back() {
    if (this.asking) { this.ask(null); return true; }
    if (this.view) { this.look(null); return true; }
    return false;
  }

  act(a, id) {
    if (a === 'save') this.save(id);
    else if (a === 'throw') this.ask(id);
    else if (a === 'yes') this.throwAway();
    else if (a === 'no') this.ask(null);
    else if (a === 'look') this.look(id);
    else if (a === 'photos') this.look(this.current().ids.at(-1) ?? null);
    else if (a === 'vprev') this.step(-1);
    else if (a === 'vnext') this.step(1);
    else if (a === 'vclose') this.look(null);
  }

  /** The photos of the current page, oldest first (the same order the cards are stored in). */
  current() { const p = this.pages[this.index]; return { ids: (p?.legacy ?? p?.slot?.cards ?? []).map((c) => c.id) }; }
  card(id) { return this.cards.cards.find((c) => c.id === id) ?? null; }

  async save(id) {
    const done = this.cards.toggleSave(id); // the flag flips at once, the store write follows
    this.render();
    this.focusOn(`[data-act=save][data-id="${id}"]`);
    await done;
  }

  ask(id) {
    this.asking = id;
    this.confirm.hidden = !id;
    if (!id) { this.focusOn(this.view ? '.viewer [data-act=throw]' : `[data-act=throw][data-id="${this.last}"]`); return; }
    this.last = id;
    const c = this.card(id);
    this.confirm.querySelector('.q').textContent = `Kasta fotot${c ? ` av ${c.name} (${fmtTime(c.time)})` : ''}?`;
    this.confirm.querySelector('.sub').textContent = c?.saved ? 'Fotot är sparat. Det försvinner för gott och går inte att ångra.' : 'Det försvinner för gott och går inte att ångra.';
    this.focusOn('.confirm [data-act=no]'); // the safe answer has focus
  }

  async throwAway() {
    const id = this.asking, i = this.view ? this.view.i : 0;
    this.asking = null; this.confirm.hidden = true;
    if (!id) return;
    const ids = this.view?.ids ?? [];
    await this.cards.discard(id);
    if (this.view) {
      const rest = ids.filter((x) => x !== id);
      this.view = rest.length ? { ids: rest, i: Math.min(i, rest.length - 1) } : null;
    }
    this.render();
    this.focusOn(this.view ? '.viewer [data-act=throw]' : '.card [data-act=photos], .pager [data-nav=next]');
  }

  /** Open a photo enlarged (null closes it). */
  look(id) {
    if (!id) {
      const was = this.view && this.view.ids[this.view.i];
      this.view = null; this.viewer.hidden = true;
      this.focusOn(`[data-act=look][data-id="${was}"]`);
      return;
    }
    const ids = this.current().ids.slice().reverse(); // newest first, like the page
    this.view = { ids, i: Math.max(0, ids.indexOf(id)) };
    this.render();
    this.focusOn('.viewer [data-act=vclose]');
  }
  step(d) {
    if (!this.view) return;
    const n = this.view.ids.length;
    this.view.i = (this.view.i + d + n) % n;
    this.renderViewer();
  }

  focusOn(sel) { try { (this.el.querySelector(sel) ?? this.el.querySelector('.dialog-close'))?.focus({ preventScroll: true }); } catch { /* UI only */ } }

  renderViewer() {
    const v = this.viewer;
    if (!this.view) { v.hidden = true; return; }
    const c = this.card(this.view.ids[this.view.i]);
    if (!c) { this.view = null; v.hidden = true; return; }
    const n = this.view.ids.length;
    v.hidden = false;
    const img = v.querySelector('img');
    img.src = c.data; img.alt = `${c.name}, ${fmtTime(c.time)}`;
    v.querySelector('.cap').replaceChildren(el('b', '', c.kitten ? `${c.name} (kattunge)` : c.name), el('span', '', `${fmtTime(c.time)} · foto ${this.view.i + 1} av ${n}`),
      el('span', c.saved ? 'st on' : 'st', c.saved ? 'Sparad: byts aldrig ut' : this.out(c) ? 'Osparad: byts ut först av nästa fynd' : 'Osparad'));
    const sv = v.querySelector('[data-act=save]'), th = v.querySelector('[data-act=throw]');
    sv.dataset.id = th.dataset.id = c.id;
    sv.textContent = c.saved ? '★ Sparad' : '☆ Spara'; sv.setAttribute('aria-pressed', String(c.saved));
    v.querySelector('[data-act=vprev]').disabled = v.querySelector('[data-act=vnext]').disabled = n < 2;
  }
  /** Is this the card the next find of its breed would push out? */
  out(c) { return !c.legacy && this.cards.nextOut(c.breed)?.id === c.id; }

  /** The binder opens at the first page with a card, else the first one. */
  firstFound() { const i = this.pages.findIndex((p) => p.slot?.has); return i < 0 ? 0 : i; }

  go(i) { const n = this.pages.length; this.index = Math.max(0, Math.min(n - 1, i)); this.render(); }
  turn(d) { this.go(this.index + d); }

  /** A key while the panel is open; true if it was used. */
  key(code) {
    if (this.asking) return true; // the question takes no paging keys (Tab / Enter / Space still reach its buttons)
    if (this.view) {
      if (code === 'ArrowRight' || code === 'KeyD') this.step(1); else if (code === 'ArrowLeft' || code === 'KeyA') this.step(-1); else return false;
      return true;
    }
    if (code === 'ArrowRight' || code === 'KeyD' || code === 'PageDown') this.turn(1);
    else if (code === 'ArrowLeft' || code === 'KeyA' || code === 'PageUp') this.turn(-1);
    else if (code === 'Home') this.go(0);
    else if (code === 'End') this.go(this.pages.length - 1);
    else return false;
    return true;
  }

  render() {
    const pages = this.pages;
    this.index = Math.min(this.index, pages.length - 1);
    const page = pages[this.index];
    this.title.textContent = `${this.cards.collected()} av ${C.breeds.length} katter hittade`;
    this.body.replaceChildren(page.legacy ? this.legacyPage(page.legacy) : this.breedPage(page.slot, this.index));
    this.dots.replaceChildren(...pages.map((p, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.nav = String(i);
      b.className = `dot${i === this.index ? ' on' : ''}${p.slot && !p.slot.has ? ' empty' : ''}${p.slot?.tier?.id === 'legendary' ? ' star' : ''}`;
      b.setAttribute('aria-label', p.legacy ? 'Äldre foton' : `Sida ${i + 1}: ${p.slot.has ? p.slot.label : 'ej hittad'}`);
      if (i === this.index) b.setAttribute('aria-current', 'page');
      return b;
    }));
    this.el.querySelector('[data-nav=prev]').disabled = this.index === 0;
    this.el.querySelector('[data-nav=next]').disabled = this.index === pages.length - 1;
    this.el.dataset.page = String(this.index);
    this.renderViewer();
  }

  breedPage(s, i) {
    const wrap = el('div', 'spread');
    const card = el('div', `card tier-${s.tier.id}${s.has ? '' : ' unknown'}`);
    if (s.has) decorate(card, C.tiers.indexOf(s.tier), !!C.breeds.find((b) => b.key === s.key)?.star);
    card.append(el('small', 'no', `Plats ${i + 1} av ${C.breeds.length}`));
    if (!s.has) {
      card.append(el('h3', '', '???'), el('p', 'qm', '?'), el('p', 'note', 'Ingen katt av den här sorten har hittats än. Klappa en katt så får du ett kort!'));
    } else {
      card.append(el('h3', '', s.label), el('span', 'tier', `${s.tier.label} · ${s.points} poäng`));
      const dl = el('dl', 'facts');
      dl.append(...row('Vikt', weight(s.weightKg)), ...row('Hittad', times(s.found)), ...row('Klappad', times(s.pets)), ...row('Kramad', times(s.hugs)));
      card.append(dl);
      const ul = el('ul', 'lore');
      ul.append(...s.facts.map((f) => el('li', '', f)));
      card.append(ul);
      card.append(el('p', `slotline${this.cards.isFull(s.key) ? ' full' : ''}`, this.slotLine(s)));
      const pb = el('button', 'photosbtn', `Visa foton (${s.cards.length} av ${C.max})`);
      pb.type = 'button'; pb.dataset.act = 'photos'; pb.disabled = !s.cards.length;
      card.append(pb);
    }
    const photos = el('div', 'photos');
    photos.setAttribute('aria-label', 'Foton av var katten hittats');
    const cards = [...s.cards].reverse(); // newest first
    for (let k = 0; k < C.max; k++) photos.append(cards[k] ? this.photoEl(cards[k]) : el('div', 'photo empty', s.has ? 'Tom plats' : ''));
    wrap.append(card, photos);
    return wrap;
  }

  /** What the next find of this breed will do, in words (#1257). */
  slotLine(s) {
    const sv = `Sparade: ${s.saved} av ${C.max}. `;
    if (this.cards.isFull(s.key)) return `${sv}Alla platser är sparade, så nya fynd läggs inte till. Avmarkera eller kasta ett foto för att få plats.`;
    const out = this.cards.nextOut(s.key);
    if (out) return `${sv}Nästa fynd byter ut det äldsta osparade fotot (${out.name}).`;
    return `${sv}Spara de foton du vill behålla.`;
  }

  photoEl(c) {
    const f = el('figure', `photo${c.saved ? ' saved' : ''}${this.out(c) ? ' next-out' : ''}`);
    const open = el('button', 'pic'); open.type = 'button'; open.dataset.act = 'look'; open.dataset.id = c.id;
    open.setAttribute('aria-label', `Visa fotot av ${c.name}, ${fmtTime(c.time)}, större`);
    const img = document.createElement('img');
    img.alt = ''; img.src = c.data;
    open.append(img);
    const cap = el('figcaption', '', '');
    cap.append(el('b', '', c.kitten ? `${c.name} (kattunge)` : c.name), el('span', '', fmtTime(c.time)));
    f.append(open, cap);
    if (c.saved) f.append(el('i', 'badge', 'Sparad'));
    else if (this.out(c)) f.append(el('i', 'badge out', 'Byts ut först'));
    const acts = el('div', 'acts');
    const sv = el('button', `save${c.saved ? ' on' : ''}`, c.saved ? '★ Sparad' : '☆ Spara');
    sv.type = 'button'; sv.dataset.act = 'save'; sv.dataset.id = c.id; sv.setAttribute('aria-pressed', String(c.saved));
    const th = el('button', 'throw', 'Kasta'); th.type = 'button'; th.dataset.act = 'throw'; th.dataset.id = c.id;
    th.setAttribute('aria-label', `Kasta fotot av ${c.name}`);
    acts.append(sv, th);
    f.append(acts);
    return f;
  }

  legacyPage(list) {
    const wrap = el('div', 'spread legacy');
    const card = el('div', 'card');
    card.append(el('small', 'no', 'Extra sida'), el('h3', '', 'Äldre foton'),
      el('p', 'note', 'Bilder från den gamla anslagstavlan i köket där rasen inte sparades.'));
    const photos = el('div', 'photos many');
    for (const c of [...list].reverse()) photos.append(this.photoEl(c));
    wrap.append(card, photos);
    return wrap;
  }
}

/** Rarity layers (#1256): level / ★ count / tilt from CAT_CARD.fx by tier index; Miele (`star`) adds `miele` + extra ★. */
function decorate(card, t, star) {
  const F = C.fx, level = F.level[t] ?? 0;
  card.classList.add(`fx-${level}`);
  if (star) card.classList.add('miele');
  card.dataset.fx = String(level);
  if (level < 2) return;
  for (const c of ['foil', 'shine', ...(level >= 3 ? ['glitter', 'holo'] : [])]) { const l = el('span', `fx ${c}`); l.setAttribute('aria-hidden', 'true'); card.append(l); }
  const n = (F.stars[t] ?? 0) + (star ? F.starExtra : 0);
  for (let i = 0; i < n; i++) {
    const s = el('span', 'fx star-fx', '★');
    s.setAttribute('aria-hidden', 'true');
    // a golden-angle spread around the card's edge band, sizes and twinkle phases vary
    const a = i * 2.39996, x = 50 + 46 * Math.cos(a), y = 50 + 46 * Math.sin(a);
    s.style.cssText = `left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;font-size:${10 + (i * 7) % 9}px;animation-delay:${(-(i * 0.55) % 3).toFixed(2)}s`;
    card.append(s);
  }
  const tilt = F.tilt[t] ?? 0;
  if (!tilt || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const move = (e) => {
    const r = card.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    card.style.setProperty('--ry', `${((px - 0.5) * 2 * tilt).toFixed(1)}deg`);
    card.style.setProperty('--rx', `${((0.5 - py) * 2 * tilt).toFixed(1)}deg`);
    card.style.setProperty('--mx', `${Math.round(px * 100)}%`);
    card.style.setProperty('--my', `${Math.round(py * 100)}%`);
  };
  const rest = () => { for (const v of ['--rx', '--ry', '--mx', '--my']) card.style.removeProperty(v); };
  card.addEventListener('pointermove', move);
  card.addEventListener('pointerleave', rest);
  card.addEventListener('pointercancel', rest);
}

function el(tag, cls = '', text = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}
function row(k, v) { return [el('dt', '', k), el('dd', '', v)]; }

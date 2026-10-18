import { CAT_CARD as C } from './config.js';

// The cat card binder's browse UI (#1255, part 2 of #1249): one page per breed (CAT_CARD.breeds, Miele last), then a page
// with the old board photos that belong to no breed, when there are any. A page shows the card (name, points, weight, facts,
// counters) and one place per card slot (C.max): a photo of where the cat was found, or an empty place. A breed that has not
// been found is a "?" placeholder. Pure DOM + CatCards (src/catcards.js); keys: ← → (A / D) turn the page, Home / End jump,
// E / Esc close (main.js). Rarity visuals (#1256) and the photo menu with keep / throw away (#1257) come later: the tier is
// shown as plain text and the photos are read-only here.

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
    el.addEventListener('click', (e) => {
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
      if (Math.abs(dx) > 60) this.turn(dx < 0 ? 1 : -1);
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
    if (show) { this.index = index ?? this.firstFound(); this.render(); }
  }

  /** The binder opens at the first page with a card, else the first one. */
  firstFound() { const i = this.pages.findIndex((p) => p.slot?.has); return i < 0 ? 0 : i; }

  go(i) { const n = this.pages.length; this.index = Math.max(0, Math.min(n - 1, i)); this.render(); }
  turn(d) { this.go(this.index + d); }

  /** A key while the panel is open; true if it was used. */
  key(code) {
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
  }

  breedPage(s, i) {
    const wrap = el('div', 'spread');
    const card = el('div', `card tier-${s.tier.id}${s.has ? '' : ' unknown'}`);
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
    }
    const photos = el('div', 'photos');
    photos.setAttribute('aria-label', 'Foton av var katten hittats');
    const cards = [...s.cards].reverse(); // newest first
    for (let k = 0; k < C.max; k++) photos.append(cards[k] ? photoEl(cards[k]) : el('div', 'photo empty', s.has ? 'Tom plats' : ''));
    wrap.append(card, photos);
    return wrap;
  }

  legacyPage(list) {
    const wrap = el('div', 'spread legacy');
    const card = el('div', 'card');
    card.append(el('small', 'no', 'Extra sida'), el('h3', '', 'Äldre foton'),
      el('p', 'note', 'Bilder från den gamla anslagstavlan i köket där rasen inte sparades.'));
    const photos = el('div', 'photos many');
    for (const c of [...list].reverse()) photos.append(photoEl(c));
    wrap.append(card, photos);
    return wrap;
  }
}

function photoEl(c) {
  const f = el('figure', `photo${c.saved ? ' saved' : ''}`);
  const img = document.createElement('img');
  img.alt = `${c.name}, ${fmtTime(c.time)}`;
  img.src = c.data;
  const cap = el('figcaption', '', '');
  cap.append(el('b', '', c.kitten ? `${c.name} (kattunge)` : c.name), el('span', '', fmtTime(c.time)));
  f.append(img, cap);
  if (c.saved) f.append(el('i', 'badge', 'Sparad'));
  return f;
}

function el(tag, cls = '', text = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}
function row(k, v) { return [el('dt', '', k), el('dd', '', v)]; }

// Own touch layout (#1090, part 4 of #1082, the CoD Mobile model): from the pause menu the player drags each touch
// button and the stick hint, resizes them (pinch or the size slider), sets their opacity and can mirror the whole
// layout for left-handers. Stored per device in localStorage; the default stays the #1089 thumb arc.
//
// A customised control keeps its CSS slot (src/hudicons.css) and its IDs/listeners: the layout only adds an offset
// (in units of the screen's short side, so it scales with the screen), `scale` and `opacity` as inline styles. The
// offset is re-measured against the slot on every resize/rotation and whenever a control appears (equipment, choices),
// and the final position is clamped inside the safe area, below the top badges (#score / #hud-top).

import { TOUCH } from './config.js';

const KEY = 'lunden.touchLayout';
const STICK = 'stick-hint';
/** Customisable controls, in the order the editor lists them, with their Swedish names. */
export const TOUCH_CONTROLS = [
  ['action', 'Handling'], ['jump-btn', 'Hoppa'], ['crouch-btn', 'Huka'], ['stand-btn', 'Res dig'], ['bell-btn', 'Ringklocka'], ['dance-btn', 'Dansa'], ['react-toggle', 'Känslor'], ['react-cry', 'Gråta'], ['react-laugh', 'Skratta'], ['react-scream', 'Skrika'],
  ['measure-btn', 'Mät'], ['power-btn', 'Extra (TV/boll)'], ['turn-btn', 'Vrid'], ['web-btn', 'Nät'],
  ['jet-up', 'Jetpack upp'], ['jet-down', 'Jetpack ner'], [STICK, 'Spaken'],
];
const NAMES = new Map(TOUCH_CONTROLS);
const DEFAULT = () => ({ mirror: false, c: {} });
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const scaleRange = (id) => (id === STICK ? TOUCH.custom.stickScale : TOUCH.custom.buttonScale);

/** A clean layout from whatever was stored (unknown ids, NaN and out-of-range values are dropped or clamped). */
export function normalizeLayout(raw) {
  const out = DEFAULT();
  if (!raw || typeof raw !== 'object') return out;
  out.mirror = raw.mirror === true;
  for (const [id] of TOUCH_CONTROLS) {
    const e = raw.c?.[id];
    if (!e || typeof e !== 'object') continue;
    const num = (v, d) => (Number.isFinite(v) ? v : d);
    const [s0, s1] = scaleRange(id), [o0, o1] = TOUCH.custom.opacity, m = TOUCH.custom.maxOffset;
    const n = { x: clamp(num(e.x, 0), -m, m), y: clamp(num(e.y, 0), -m, m), s: clamp(num(e.s, 1), s0, s1), o: clamp(num(e.o, 1), o0, o1) };
    if (Math.abs(n.x) > 1e-4 || Math.abs(n.y) > 1e-4 || n.s !== 1 || n.o !== 1) out.c[id] = n;
  }
  return out;
}
export function loadLayout() {
  try { return normalizeLayout(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch { return DEFAULT(); }
}
function storeLayout(layout) {
  try {
    if (!layout.mirror && !Object.keys(layout.c).length) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(layout));
    return true;
  } catch { return false; } // private window / blocked storage: the layout still holds for this visit
}

let saved = loadLayout();
let draft = null; // the layout being edited (null outside the editor)
const shown = () => draft || saved;
const entry = (l, id) => l.c[id] || { x: 0, y: 0, s: 1, o: 1 };

/** What touch.js needs for the floating stick: the stick side, its size factor and opacity. */
export function stickLayout() {
  const l = shown(), e = entry(l, STICK);
  return { mirror: l.mirror, scale: e.s, opacity: e.o };
}

const applied = new WeakMap(); // element → the translate (px) written last, so the slot centre can be recovered
const effective = {};          // id → the clamped offset actually shown, in stored (unmirrored, short-side) units

/** The safe area minus the top badges, in CSS px. */
function region() {
  const probe = document.getElementById('touch-safe-probe') || Object.assign(document.createElement('div'), { id: 'touch-safe-probe' });
  if (!probe.isConnected) {
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:fixed;left:var(--sl,0px);right:var(--sr,0px);top:var(--st,0px);bottom:var(--sb,0px);visibility:hidden;pointer-events:none;';
    document.body.append(probe);
  }
  const r = probe.getBoundingClientRect(), m = TOUCH.custom.margin;
  let top = r.top + m;
  for (const id of ['score', 'hud-top']) {
    const b = document.getElementById(id)?.getBoundingClientRect();
    if (b && b.height > 0) top = Math.max(top, b.bottom + m);
  }
  return { l: r.left + m, r: r.right - m, t: top, b: r.bottom - m, side: Math.min(r.width, r.height) || 1 };
}

/** Write the shown layout onto the controls (call after any change, resize or a control appearing). */
export function applyTouchLayout() {
  const l = shown();
  const plain = !draft && !l.mirror && !Object.keys(l.c).length;
  const ids = [...TOUCH_CONTROLS.map(([id]) => id), 'choices', 'stick'];
  const els = ids.map((id) => [id, document.getElementById(id)]).filter(([, el]) => el);
  if (plain) { // the default #1089 layout: no inline styles at all
    for (const [, el] of els) { el.style.translate = el.style.scale = el.style.opacity = ''; applied.delete(el); }
    return;
  }
  const R = region();
  const writes = [];
  for (const [id, el] of els) {
    const e = id === 'choices' ? { ...entry(l, 'action'), s: 1, o: 1 } : id === 'stick' ? { x: 0, y: 0, s: 1, o: entry(l, STICK).o } : entry(l, id);
    const o = id === STICK ? TOUCH.hintOpacity * e.o : e.o;
    if (id === 'stick' || !el.offsetWidth) { writes.push([el, null, 1, o]); continue; } // the floating stick sits under the thumb; hidden controls wait
    const prev = applied.get(el) || { x: 0, y: 0 }, b = el.getBoundingClientRect();
    const cx = (b.left + b.right) / 2 - prev.x, cy = (b.top + b.bottom) / 2 - prev.y; // the slot centre (scale keeps the centre)
    const s = id === STICK ? 1 : e.s; // the stick's size comes from --stick-travel (touch.js)
    const hw = el.offsetWidth * s / 2, hh = el.offsetHeight * s / 2;
    let x = cx + e.x * R.side, y = cy + e.y * R.side;
    if (l.mirror) x = R.l + R.r - x;
    x = R.r - R.l < 2 * hw ? (R.l + R.r) / 2 : clamp(x, R.l + hw, R.r - hw);
    y = R.b - R.t < 2 * hh ? R.b - hh : clamp(y, R.t + hh, R.b - hh);
    if (id !== 'choices') effective[id] = { x: ((l.mirror ? R.l + R.r - x : x) - cx) / R.side, y: (y - cy) / R.side };
    writes.push([el, { x: x - cx, y: y - cy }, s, o]);
  }
  for (const [el, t, s, o] of writes) { // all reads first, then all writes: one layout pass
    if (t) {
      applied.set(el, t);
      el.style.translate = Math.abs(t.x) < 0.01 && Math.abs(t.y) < 0.01 ? '' : `${t.x.toFixed(1)}px ${t.y.toFixed(1)}px`;
    }
    el.style.scale = s === 1 ? '' : String(s);
    el.style.opacity = o === 1 && el.id !== STICK ? '' : String(+o.toFixed(3));
  }
}

const changed = () => { window.dispatchEvent(new Event('touchlayoutchange')); applyTouchLayout(); }; // touch.js resizes the stick first

export function setupTouchLayout() {
  const settle = () => { applyTouchLayout(); requestAnimationFrame(applyTouchLayout); setTimeout(applyTouchLayout, 450); };
  window.addEventListener('resize', settle);
  window.addEventListener('orientationchange', settle);
  // Controls appear and disappear (equipment, seated, choices): place them before the next paint. main.js sets the
  // same `hidden` value every frame, so only real changes count.
  const cluster = document.getElementById('touch-controls');
  if (cluster) {
    new MutationObserver((recs) => {
      if (recs.some((r) => (r.oldValue === null) !== !r.target.hasAttribute(r.attributeName))) applyTouchLayout();
    }).observe(cluster, { subtree: true, attributes: true, attributeFilter: ['hidden'], attributeOldValue: true });
  }
  const choicesEl = document.getElementById('choices'); // three or more rows make the corner band taller
  if (choicesEl) new MutationObserver(() => { if (!choicesEl.hidden) applyTouchLayout(); }).observe(choicesEl, { childList: true });
  const hud = document.getElementById('hud');
  if (hud) new MutationObserver(() => { if (!hud.hidden) requestAnimationFrame(applyTouchLayout); }).observe(hud, { attributes: true, attributeFilter: ['hidden'] });
  changed();

  let ui = null, onClose = null, sel = 'action', wasTouch = false;
  const pointers = new Map(); // pointerId → {x, y}
  let drag = null;            // { id, pointerId, x0, y0, ex, ey, s0, dist0 }

  function build() {
    const root = document.createElement('div');
    root.id = 'touch-edit';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Anpassa touchknappar');
    root.hidden = true;
    root.innerHTML = `
      <div class="te-bar">
        <button type="button" class="te-cancel" title="Avbryt utan att spara (Esc)">✕ Avbryt</button>
        <b class="te-name" aria-live="polite"></b>
        <label class="te-slider">Storlek <input type="range" class="te-size" min="0" max="100" step="1"></label>
        <label class="te-slider">Opacitet <input type="range" class="te-opacity" min="0" max="100" step="1"></label>
        <label class="te-mirror"><input type="checkbox" class="te-mirror-box"> Spegla för vänsterhänta</label>
        <button type="button" class="te-reset">Återställ standard</button>
        <button type="button" class="te-save">Spara</button>
      </div>
      <p class="te-help">Dra en knapp eller spaken för att flytta den · nyp med två fingrar eller använd reglaget för storlek</p>`;
    document.body.append(root);
    const q = (c) => root.querySelector(c);
    ui = { root, bar: q('.te-bar'), name: q('.te-name'), size: q('.te-size'), opacity: q('.te-opacity'), mirror: q('.te-mirror-box'), help: q('.te-help') };
    q('.te-cancel').addEventListener('click', () => close(false));
    q('.te-save').addEventListener('click', () => close(true));
    q('.te-reset').addEventListener('click', () => { draft = DEFAULT(); changed(); refresh(); });
    ui.mirror.addEventListener('change', () => { draft.mirror = ui.mirror.checked; changed(); });
    ui.size.addEventListener('input', () => { const [a, b] = scaleRange(sel); setEntry(sel, { s: a + (b - a) * ui.size.value / 100 }); });
    ui.opacity.addEventListener('input', () => { const [a, b] = TOUCH.custom.opacity; setEntry(sel, { o: a + (b - a) * ui.opacity.value / 100 }); });
    root.addEventListener('pointerdown', down);
    root.addEventListener('pointermove', move);
    root.addEventListener('pointerup', up);
    root.addEventListener('pointercancel', up);
    root.addEventListener('lostpointercapture', up);
  }
  function setEntry(id, patch) {
    draft.c[id] = { ...entry(draft, id), ...patch };
    changed();
  }
  function refresh() {
    for (const [id] of TOUCH_CONTROLS) document.getElementById(id)?.classList.toggle('te-sel', id === sel);
    const e = entry(draft, sel), [a, b] = scaleRange(sel), [o0, o1] = TOUCH.custom.opacity;
    ui.name.textContent = NAMES.get(sel);
    ui.size.value = String(Math.round((e.s - a) / (b - a) * 100));
    ui.opacity.value = String(Math.round((e.o - o0) / (o1 - o0) * 100));
    ui.size.setAttribute('aria-label', `Storlek: ${NAMES.get(sel)}`);
    ui.opacity.setAttribute('aria-label', `Opacitet: ${NAMES.get(sel)}`);
    ui.mirror.checked = draft.mirror;
  }
  /** The control under a point: the smallest box containing it (buttons win over the larger stick). */
  function hit(x, y) {
    let best = null, area = Infinity;
    for (const [id] of TOUCH_CONTROLS) {
      const el = document.getElementById(id), b = el?.getBoundingClientRect();
      if (!b || !b.width) continue;
      const pad = 6;
      if (x >= b.left - pad && x <= b.right + pad && y >= b.top - pad && y <= b.bottom + pad && b.width * b.height < area) { best = id; area = b.width * b.height; }
    }
    return best;
  }
  function down(e) {
    if (e.target.closest('.te-bar')) return;
    e.preventDefault();
    e.stopPropagation(); // never reaches the game's own listeners
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { ui.root.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
    if (drag && pointers.size === 2) { // second finger: pinch the selected control
      const [p, q] = [...pointers.values()];
      drag.s0 = entry(draft, drag.id).s; drag.dist0 = Math.hypot(p.x - q.x, p.y - q.y) || 1;
      return;
    }
    if (drag) return;
    const id = hit(e.clientX, e.clientY);
    if (!id) return;
    sel = id; refresh();
    const en = entry(draft, id);
    drag = { id, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, ex: en.x, ey: en.y, dist0: 0 };
    ui.root.classList.add('te-dragging');
  }
  function move(e) {
    if (!pointers.has(e.pointerId) || !drag) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2 && drag.dist0) {
      const [p, q] = [...pointers.values()], [a, b] = scaleRange(drag.id);
      setEntry(drag.id, { s: clamp(drag.s0 * Math.hypot(p.x - q.x, p.y - q.y) / drag.dist0, a, b) });
    } else if (e.pointerId === drag.pointerId) {
      const side = region().side, sign = draft.mirror ? -1 : 1;
      setEntry(drag.id, { x: drag.ex + sign * (e.clientX - drag.x0) / side, y: drag.ey + (e.clientY - drag.y0) / side });
    }
    refresh();
  }
  function up(e) {
    if (!pointers.delete(e.pointerId)) return;
    if (drag && pointers.size === 0) {
      const eff = effective[drag.id]; // drop any overshoot past the edge: the stored offset is what is shown
      if (eff) draft.c[drag.id] = { ...entry(draft, drag.id), x: eff.x, y: eff.y };
      drag = null;
      ui.root.classList.remove('te-dragging');
      ui.help.hidden = true;
      changed(); refresh();
    } else if (drag && e.pointerId === drag.pointerId) {
      drag = null; ui.root.classList.remove('te-dragging'); // the pinch finger stays down; a new touch starts over
    }
  }
  function key(e) {
    if (!draft) return;
    if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(false); return; }
    if (!e.target.closest?.('#touch-edit')) e.stopImmediatePropagation(); // no game keys while editing
  }
  window.addEventListener('keydown', key, true);

  function close(keep) {
    if (!draft) return;
    if (keep) { saved = normalizeLayout(draft); storeLayout(saved); }
    draft = null; drag = null; pointers.clear();
    ui.root.hidden = true;
    document.body.classList.remove('touch-editing');
    document.body.classList.toggle('touch', wasTouch);
    for (const [id] of TOUCH_CONTROLS) document.getElementById(id)?.classList.remove('te-sel');
    changed();
    const cb = onClose; onClose = null;
    cb?.(keep);
  }

  return {
    get editing() { return !!draft; },
    get layout() { return normalizeLayout(shown()); },
    /** Open the editor over the paused HUD; `done(saved)` runs when it closes. */
    open(done) {
      if (draft) return;
      if (!ui) build();
      onClose = done;
      draft = normalizeLayout(saved);
      wasTouch = document.body.classList.contains('touch');
      document.body.classList.add('touch', 'touch-editing');
      ui.root.hidden = false; ui.help.hidden = false;
      sel = 'action'; refresh();
      changed();
      requestAnimationFrame(applyTouchLayout);
      ui.root.querySelector('.te-save').focus({ preventScroll: true });
    },
    cancel: () => close(false),
    save: () => close(true),
  };
}

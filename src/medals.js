import { MEDALS, bonusFor, levelsOfStats, counterValue, thresholdOf, levelOf, MAX_LEVEL } from './medalcatalog.js';
// Medals with levels (#1711, part of #1709): the grid in Meny → Medaljer, the spinning medal in the middle of the screen on a
// new level, and the bonus points. State lives in stats.medals ({ id: { l: level, t: [time of level 1, 2 …] } }, localStorage
// with the other statistics) and the Worker keeps the same per player id (cloudflare/boards.js: derived from validated counters).
//
// Rules (decided in #1711):
//  - A level is reached live (a counter crosses its threshold while playing): the medal spins, bonus bonusFor(level) goes
//    through the ordinary score (stats.medalPoints, SCORE.each), exactly once per level: the level is written to
//    stats.medals before the points are added, and an upgrade from the server never pays.
//  - Starting levels (first run of this feature with old counters, or levels restored from the server on a new device) are
//    unlocked silently with NO bonus and at most one summary badge. The score is per device and the earlier levels were paid
//    where they were earned.
//  - The first check waits for the server's answer (restore, max RESTORE_WAIT ms; offline = no wait), so a new device never pays
//    for a level the server already knows.
//  - Display: a CSS-animated element (compositor only, pointer-events none), ~2.6 s, one at a time from a queue, only while
//    `canShow()` (not in the menu, a dialog or the film); it is dropped if that stops being true, and a watchdog removes it.
const SHOW_MS = 2600, WATCHDOG_MS = 4200, CHECK_MS = 1500, RESTORE_WAIT = 6000, MAX_QUEUE = 6;
const fmt = (n) => Number(n).toLocaleString('sv-SE');
const day = (t) => new Date(t).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' });

/** Make sure stats.medals has the right shape (a reset, an old save or odd data). */
export function medalState(stats) {
  if (!stats.medals || typeof stats.medals !== 'object' || Array.isArray(stats.medals)) stats.medals = {};
  for (const [id, m] of Object.entries(stats.medals)) {
    if (!MEDALS.some((x) => x.id === id) || !m || !Number.isInteger(m.l) || m.l < 1 || m.l > MAX_LEVEL) delete stats.medals[id];
    else m.t = Array.from({ length: m.l }, (_, i) => (Number.isFinite(m.t?.[i]) ? m.t[i] : Date.now()));
  }
  return stats.medals;
}

/**
 * Compare the stats with the saved medals. `seeded` false = first run: everything is silent. Returns { gained, silent }.
 * gained: [{ id, level, bonus }] (one per medal, its top new level, the bonus is the sum of the new levels); pure apart from
 * writing stats.medals / paying through `pay(points)`. Pay happens after the level is written, so it cannot be paid twice.
 */
export function evaluate(stats, { seeded, pay, now = Date.now() }) {
  const medals = medalState(stats), gained = []; let silent = 0;
  for (const [id, level] of Object.entries(levelsOfStats(stats))) {
    const have = medals[id]?.l ?? 0;
    if (level <= have) continue;
    const t = medals[id]?.t ?? [];
    for (let l = have + 1; l <= level; l++) t[l - 1] = now;
    medals[id] = { l: level, t };
    if (!seeded) { silent += level - have; continue; }
    let bonus = 0;
    for (let l = have + 1; l <= level; l++) bonus += bonusFor(l);
    pay?.(bonus);
    gained.push({ id, level, bonus });
  }
  return { gained, silent };
}

/** Take the levels the server knows ({ id: [times] }): silent, never pays; keeps the earliest time of each level. Returns the number of new levels. */
export function mergeServer(stats, server) {
  const medals = medalState(stats); let added = 0;
  for (const [id, times] of Object.entries(server && typeof server === 'object' ? server : {})) {
    if (!MEDALS.some((x) => x.id === id) || !Array.isArray(times)) continue;
    const level = Math.min(MAX_LEVEL, times.length), cur = medals[id] ?? { l: 0, t: [] };
    if (level < 1) continue;
    const t = Array.from({ length: Math.max(level, cur.l) }, (_, i) => {
      const a = cur.t[i], b = Number(times[i]);
      return Number.isFinite(a) && Number.isFinite(b) ? Math.min(a, b) : Number.isFinite(a) ? a : Number.isFinite(b) ? b : Date.now();
    });
    added += Math.max(0, level - cur.l);
    medals[id] = { l: Math.max(level, cur.l), t };
  }
  return added;
}

/** What the grid shows for one medal: { medal, level, time, have, next, shown } (shown false = a secret still locked). */
export function medalView(stats, medal) {
  const value = counterValue(stats, medal.counter), saved = stats.medals?.[medal.id];
  const level = Math.max(saved?.l ?? 0, levelOf(medal, value));
  return { medal, level, time: saved?.t?.[level - 1] ?? null, have: value, next: thresholdOf(medal, Math.min(MAX_LEVEL, level + 1)), shown: !(medal.secret && level === 0), maxed: level >= MAX_LEVEL };
}

export class Medals {
  /** o: stats, boards (src/boards.js, has .on/.restore()), pay(points), canShow(), sound(), badge(text), save(), pop (element), dialog/grid/count (elements). */
  constructor(o) {
    Object.assign(this, o, { queue: [], showing: null, ready: false, seeded: false });
    medalState(this.stats);
    this.seeded = !!this.stats.medalsSeeded;
    this.timer = setInterval(() => this.tick(), CHECK_MS);
    const start = () => { if (this.ready) return; this.ready = true; this.check(); };
    if (this.boards?.on && this.boards.restore) {
      const wait = setTimeout(start, RESTORE_WAIT);
      setTimeout(() => this.boards.restore().then((m) => { if (m) this.take(m); }).finally(() => { clearTimeout(wait); start(); }), 1500);
    } else setTimeout(start, 500);
  }

  /** The Worker's answer ({ id: [times] }) to a sync or a restore. */
  take(m) {
    if (mergeServer(this.stats, m)) { this.save?.(); if (this.dialog && !this.dialog.hidden) this.render(); }
  }

  check() {
    const { gained, silent } = evaluate(this.stats, { seeded: this.seeded, pay: (p) => this.pay?.(p) });
    if (!this.seeded) {
      this.seeded = this.stats.medalsSeeded = true;
      if (silent) this.badge?.(`🏅 ${silent} ${silent === 1 ? 'medaljnivå' : 'medaljnivåer'} från ditt tidigare spelande`);
    }
    if (gained.length || silent) this.save?.();
    for (const g of gained) {
      if (this.queue.length >= MAX_QUEUE) { this.badge?.(`🏅 ${MEDALS.find((m) => m.id === g.id).name} nivå ${g.level} · +${g.bonus}`); continue; }
      this.queue.push(g);
    }
  }

  tick() {
    if (!this.ready) return;
    this.check();
    if (this.showing) {
      if (!this.canShow() || performance.now() - this.showing.at > WATCHDOG_MS) this.hide(this.canShow() ? false : true);
    } else if (this.queue.length && this.canShow()) this.show(this.queue.shift());
    if (this.dialog && !this.dialog.hidden) this.render();
  }

  show(g) {
    const medal = MEDALS.find((m) => m.id === g.id), el = this.pop; if (!medal || !el) return;
    el.querySelector('.medal-icon').textContent = medal.icon;
    el.querySelector('.medal-level').textContent = `Nivå ${g.level}`;
    el.querySelector('.medal-name').textContent = medal.name;
    el.querySelector('.medal-bonus').textContent = `+${fmt(g.bonus)} poäng`;
    el.hidden = false; el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
    this.showing = { g, at: performance.now(), end: setTimeout(() => this.hide(false), SHOW_MS) };
    this.sound?.();
  }

  /** Remove the medal; `requeue` puts an interrupted one back (the menu opened while it spun). */
  hide(requeue) {
    const s = this.showing; if (!s) return;
    clearTimeout(s.end); this.showing = null;
    this.pop.classList.remove('go'); this.pop.hidden = true;
    if (requeue) this.queue.unshift(s.g);
  }

  open() { this.dialog.hidden = false; this.render(); }
  close() { this.dialog.hidden = true; }

  /** The grid: unlocked medals first (level and date), then locked with a progress bar x / next, secrets as ???. */
  render() {
    const views = MEDALS.map((m) => medalView(this.stats, m)), got = views.filter((v) => v.level > 0).length;
    if (this.count) this.count.textContent = `${got} av ${MEDALS.length} medaljer`;
    const order = [...views].sort((a, b) => (b.level > 0) - (a.level > 0) || (a.medal.secret ? 1 : 0) - (b.medal.secret ? 1 : 0));
    this.grid.replaceChildren(...order.map((v) => {
      const li = document.createElement('li'); li.className = `medal-card${v.level > 0 ? ' got' : ''}${v.shown ? '' : ' secret'}`;
      const icon = document.createElement('span'); icon.className = 'mc-icon'; icon.textContent = v.shown ? v.medal.icon : '❔';
      const name = document.createElement('b'); name.textContent = v.shown ? v.medal.name : '???';
      const sub = document.createElement('span'); sub.className = 'mc-sub';
      sub.textContent = !v.shown ? 'Hemlig medalj' : v.level > 0 ? `Nivå ${v.level}${v.time ? ` · ${day(v.time)}` : ''}` : 'Låst';
      li.append(icon, name, sub);
      if (v.shown && !v.maxed) {
        const bar = document.createElement('span'); bar.className = 'mc-bar';
        const from = thresholdOf(v.medal, v.level), fill = document.createElement('i');
        fill.style.width = `${Math.min(100, Math.max(0, ((v.have - from) / (v.next - from)) * 100)).toFixed(0)}%`;
        bar.append(fill);
        const txt = document.createElement('span'); txt.className = 'mc-prog'; txt.textContent = `${fmt(v.have)} / ${fmt(v.next)} ${v.medal.unit}`;
        li.append(bar, txt);
      }
      return li;
    }));
  }
}

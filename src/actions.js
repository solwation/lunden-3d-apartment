// What you can do with the thing you look at (#367, LIFE-003): one shared function computes the allowed actions for
// (what is in the hand, the target, their states), so every life-sim thing and tool works the same way and a new one is
// a definition, not a special case in main.js. Plain logic (tools/actiontest.html, tools/itemtest.html test it).
//
// An action definition:
//   id        a stable name ('take', 'putOn', 'open' …)
//   label     the Swedish text after "Tryck E för att …" / on the touch button: a string or (ctx) => string
//   applies   (ctx) => bool: does it belong in the list at all (a knife on a cucumber: yes; a knife on the milk: no)
//   check     (ctx) => null | reason: why it can't be done now ("Öppna kylen först", "Brädan är full", "Fel verktyg …")
//   run       (ctx) => void: do it (the instant ones); a timed one goes through the runner (#372)
//   consumes / result  plain text for the docs and the tests: what it uses up, what it makes
//   duration  seconds of game time (0 = at once); interrupt: what an interruption does ('release' = nothing used, #372)
//   order     smaller first (the first allowed one is what E does)
//   quiet     (ctx) => bool: when blocked, the menu leaves this row out if there are others ("Ta …" while the hand is full)
// ctx = { held (the instance in the hand or null), heldView (any Holdable in the hand), target (an instance, or a
//   { store } / { surface } target), items (items.js), life, distance, reach }.

export class ActionSet {
  constructor() { this.defs = []; }

  /** Add an action definition (see above); returns it. */
  define(def) {
    if (!def?.id || typeof def.run !== 'function') throw new Error('an action needs an id and run()');
    this.defs = this.defs.filter((d) => d.id !== def.id);
    this.defs.push({ order: 50, applies: () => true, check: () => null, duration: 0, interrupt: 'release', ...def });
    this.defs.sort((a, b) => a.order - b.order);
    return def;
  }

  /** The actions for `ctx`, in order: [{ id, label, reason (null = allowed), run() }]. Blocked ones stay in the list with
   * their reason, so the menu can say why. */
  list(ctx) {
    const out = [];
    for (const d of this.defs) {
      let ok = false;
      try { ok = !!d.applies(ctx); } catch { ok = false; }
      if (!ok) continue;
      let reason = null;
      if (ctx.reach !== undefined && ctx.distance > ctx.reach) reason = 'För långt bort';
      else { try { reason = d.check(ctx) ?? null; } catch (e) { reason = 'Det går inte nu'; console.warn('action check', d.id, e); } }
      const label = typeof d.label === 'function' ? d.label(ctx) : d.label;
      const quiet = !!reason && (typeof d.quiet === 'function' ? !!d.quiet(ctx) : !!d.quiet); // a blocked row the menu may leave out
      out.push({ id: d.id, label, reason, quiet, def: d, run: () => (reason ? false : (d.run(ctx), true)) });
    }
    return out;
  }
}

/** The rows a menu shows: blocked `quiet` ones only when nothing else is there. */
export const shownRows = (list) => (list.some((a) => !a.quiet) ? list.filter((a) => !a.quiet) : list);

/** The first allowed action of a list, or null. */
export const firstAllowed = (list) => list.find((a) => !a.reason) ?? null;

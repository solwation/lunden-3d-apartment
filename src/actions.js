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
    if (!def?.id || (typeof def.run !== 'function' && !(def.duration > 0 && typeof def.commit === 'function'))) throw new Error('an action needs an id and run() (or a duration and commit())');
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
      const run = () => {
        if (reason) return false;
        if (d.duration > 0) { const j = ctx.life.runner.start(d, ctx); if (typeof j === 'string') { ctx.life.say?.(j); return false; } return true; } // a timed one (#372)
        d.run(ctx);
        return true;
      };
      out.push({ id: d.id, label, reason, quiet, def: d, run });
    }
    return out;
  }
}

/** The rows a menu shows: blocked `quiet` ones only when nothing else is there. */
export const shownRows = (list) => (list.some((a) => !a.quiet) ? list.filter((a) => !a.quiet) : list);

/** The first allowed action of a list, or null. */
export const firstAllowed = (list) => list.find((a) => !a.reason) ?? null;

/**
 * Timed actions (#372, LIFE-008): cutting, spreading, a bite, pouring — anything that takes a moment runs through one
 * Runner, after the plan's "atomic cutting action":
 *   1. validate  the action's check(ctx) (tool in the hand, the target in place, enough left, a free spot for the result);
 *   2. reserve   its inputs are locked (items.js `lock`: no move, no second job) and its output places promised
 *                (items.reserved), so a double press can never start the same job twice or give its spot to another;
 *   3. animate   `animate(ctx, k)` over `duration` s of game time (main.js step(dt): it stops with the page, never frames);
 *   4. commit    at `commitAt` (fraction, default 1) the check runs again, then the locks are released and `commit(ctx, job)`
 *                consumes and creates in one synchronous step (e.g. the cucumber −10 g and exactly one 10 g slice);
 *   5. interrupt before the commit: everything released, nothing used (`cancel`); after it: the result stays.
 * Saving mid-action stores the stable state (locks and reservations are never saved). A job is interrupted when the hand
 * changes, the visitor walks off, sits down, F, or its check fails — it never leaves anything locked.
 * An action with `duration > 0` starts a job instead of running at once; its def gives `reserve(ctx)` → { inputs: [items],
 * outputs: [places] } and `commit(ctx, job)` (and may give `animate`, `cancel`, `done`, `commitAt`).
 */
export class Runner {
  constructor(items) { Object.assign(this, { items, job: null, n: 0, log: [] }); }

  get busy() { return !!this.job; }

  /** Start the timed action `def` in `ctx`: the job, or the Swedish reason it can't start (nothing is touched then). */
  start(def, ctx) {
    if (this.job) return this.job.def === def ? 'Du håller redan på' : 'Gör klart det du håller på med först';
    const why = def.check(ctx);
    if (why) return why;
    const { inputs = [], outputs = [] } = def.reserve?.(ctx) ?? {};
    const id = `job${++this.n}`;
    for (const it of inputs) if (it.lock && it.lock !== id) { const nm = this.items.name(it); return `${nm[0].toUpperCase()}${nm.slice(1)} används just nu`; }
    for (const p of outputs) if (this.items.isReserved(p)) return 'Platsen är upptagen';
    for (const it of inputs) it.lock = id;
    const keys = outputs.map((p) => this.items.placeKey(p)).filter(Boolean);
    for (const k of keys) this.items.reserved.set(k, id);
    const job = { id, def, ctx, inputs, outputs, keys, label: typeof def.label === 'function' ? def.label(ctx) : def.label, t: 0, duration: Math.max(0, def.duration ?? 0), commitAt: def.commitAt ?? 1, committed: false, result: null };
    this.job = job;
    this.log.push(`start ${def.id}`);
    if (job.duration === 0) this.update(0);
    return job;
  }

  /** Free the job's locks and promised places. */
  release(job) {
    for (const it of job.inputs) if (it.lock === job.id) delete it.lock;
    for (const k of job.keys) if (this.items.reserved.get(k) === job.id) this.items.reserved.delete(k);
  }

  /** Move the job on by `dt` s of game time. */
  update(dt) {
    const job = this.job;
    if (!job) return;
    job.t += dt;
    const k = job.duration ? Math.min(1, job.t / job.duration) : 1;
    job.def.animate?.(job.ctx, k, job);
    if (!job.committed && k >= job.commitAt) {
      this.release(job); // (its own check must not see its own locks / promises as someone else's)
      const why = job.def.check(job.ctx, { committing: true, job });
      if (why) { this.finish(job, why); return; }
      job.result = job.def.commit(job.ctx, job) ?? true;
      job.committed = true;
      this.log.push(`commit ${job.def.id}`);
    }
    if (k >= 1) this.finish(job);
  }

  /** Stop the running job (`why` for the log). Before the commit nothing is used; after it the result stays. */
  interrupt(why = 'avbrutet') { if (this.job) this.finish(this.job, why); }

  finish(job, why = null) {
    this.release(job);
    if (this.job === job) this.job = null;
    if (!job.committed) { job.def.cancel?.(job.ctx, job, why); this.log.push(`cancel ${job.def.id}${why ? `: ${why}` : ''}`); } else { job.def.done?.(job.ctx, job, why); this.log.push(`done ${job.def.id}`); }
  }
}

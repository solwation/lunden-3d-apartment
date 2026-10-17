import { LIGHT_MODES as M } from './config.js';

// Light modes from the smart speakers (#1176, part of #1155): at a Nest the choice menu offers Prata (the old random
// answer), Ljuslägen … (allt på, extrabelysning, fönsterlampor), Myslägen … (mys, kvällsmys) and, while one is on,
// Avsluta ljusläget. A mode switches the existing ceiling lamps and small lamps (Lights.preset) and holds the small lamps
// against the dusk; ending it puts back what it changed (Lights.restore), but never what the visitor switched meanwhile.
// A power cut, F (the furniture hidden) or a reset release the mode: the lamps stay as they are and the dusk takes over
// again. Nothing here is saved: the lamps' on / off are saved as before (keep.js), the mode itself is not.

export class LightModes {
  constructor(lights, modes = M.modes) {
    Object.assign(this, { lights, modes, active: null, before: null, applied: null, page: 'top' });
  }

  get mode() { return this.modes.find((m) => m.id === this.active) ?? null; }

  /** Turn mode `id` on (another one may be on: the state from before the first one is kept). */
  start(id) {
    const m = this.modes.find((x) => x.id === id);
    if (!m) return false;
    const L = this.lights;
    if (!this.active) this.before = L.snapshot();
    const lamp = m.lamps === true ? (f) => !m.skip?.includes(f.name)
      : m.lamps === 'window' ? (f) => L.onWindowBoard(f, M.windowReach)
      : (f) => (m.lamps ?? []).includes(f.name);
    this.applied = L.preset(() => m.rooms === true, lamp);
    this.active = id;
    L.held = true;
    return true;
  }

  /** End the mode: back to how it was before, except what the visitor changed. */
  end() {
    if (!this.active) return false;
    this.lights.restore(this.before, this.applied);
    this.release();
    return true;
  }

  /** Let go without putting anything back (a power cut, F, a reset). */
  release() {
    Object.assign(this, { active: null, before: null, applied: null, page: 'top' });
    this.lights.held = false;
  }

  /** The speaker's menu rows for the page shown: [{ id, label, run }]. `talk()` = the old random answer, `say(text)` =
   * the speaker's reply. */
  rows(talk, say) {
    const T = M.menu, row = (id, label, run) => ({ id, label, reason: null, run });
    const go = (page) => () => { this.page = page; };
    if (this.page !== 'top') {
      return [
        ...this.modes.filter((m) => m.page === this.page).map((m) => row(`mode-${m.id}`, `${m.label}${m.id === this.active ? T.on : ''}`, () => {
          this.start(m.id); this.page = 'top'; say(m.say, `mode-${m.id}`);
        })),
        row('back', T.back, go('top')),
      ];
    }
    const out = [row('talk', T.talk, talk), row('light', T.light, go('light')), row('cozy', T.cozy, go('cozy'))];
    if (this.active) out.push(row('end', T.end, () => { this.end(); say(M.ended, 'mode-end'); }));
    return out;
  }
}

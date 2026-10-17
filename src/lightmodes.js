import { LIGHT_MODES as M, SONOS } from './config.js';

// Light modes from the smart speakers (#1176, part of #1155): at a Nest the choice menu offers Prata (the old random
// answer), Ljuslägen … (allt på, extrabelysning, fönsterlampor), Myslägen … (mys, kvällsmys) and, while one is on,
// Avsluta ljusläget. A mode switches the existing ceiling lamps and small lamps (Lights.preset) and holds the small lamps
// against the dusk; ending it puts back what it changed (Lights.restore), but never what the visitor switched meanwhile.
// A power cut, F (the furniture hidden) or a reset release the mode: the lamps stay as they are and the dusk takes over
// again. Nothing here is saved: the lamps' on / off are saved as before (keep.js), the mode itself is not.
// The disco (#1177, Myslägen …) is such a mode and more: its lamps change colour on a beat (Lights tint: never their
// saved colour) and the SYMFONISK speakers play, if they were quiet. Whatever ends it (Avsluta, another mode, a power
// cut, F) puts the colours back, except on a lamp the visitor recoloured meanwhile; Avsluta and another mode also put the
// music back as it was, but only while it is still the disco's (no play / pause / channel change since).

export class LightModes {
  constructor(lights, modes = M.modes, sonos = null) {
    Object.assign(this, { lights, modes, sonos, active: null, before: null, applied: null, page: 'top', disco: null });
  }

  get mode() { return this.modes.find((m) => m.id === this.active) ?? null; }

  /** Turn mode `id` on (another one may be on: the state from before the first one is kept). */
  start(id) {
    const m = this.modes.find((x) => x.id === id);
    if (!m) return false;
    const L = this.lights;
    this.stopDisco(true);
    if (!this.active) this.before = L.snapshot();
    const lamp = m.lamps === true ? (f) => !m.skip?.includes(f.name)
      : m.lamps === 'window' ? (f) => L.onWindowBoard(f, M.windowReach)
      : (f) => (m.lamps ?? []).includes(f.name);
    this.applied = L.preset(() => m.rooms === true, lamp);
    this.active = id;
    L.held = true;
    if (m.disco) this.startDisco();
    return true;
  }

  /** The disco's colours and music on (#1177). */
  startDisco() {
    const D = M.disco, S = this.sonos;
    this.disco = { colors: this.lights.colorSnapshot(), t: 0, step: 0, music: null };
    if (S && !S.playing) {
      const was = S.channel, ch = SONOS.channels.findIndex((c) => c.id === D.channel);
      if (ch >= 0) S.channel = ch;
      S.play();
      this.disco.music = { channel: was, rev: S.rev };
    }
    this.tintAll();
  }

  /** Every small lamp its colour of this beat; not one the visitor recoloured since the disco began. */
  tintAll() {
    const D = M.disco, d = this.disco, n = D.colors.length;
    this.lights.floorLamps.forEach((f, i) => {
      if ((f.colorRev ?? 0) !== d.colors.get(f)?.rev) return;
      f.tint(D.colors[(d.step + i * D.spread) % n]);
    });
  }

  /** Each frame (main.js): the next colours on the beat. */
  update(dt) {
    const d = this.disco;
    if (!d) return;
    d.t += dt;
    if (d.t < M.disco.beat) return;
    d.t %= M.disco.beat;
    d.step++;
    this.tintAll();
  }

  /** The disco's colours off (their own colours back); `music`: also the music back as it was, while it is still ours. */
  stopDisco(music) {
    const d = this.disco, S = this.sonos;
    if (!d) return;
    this.disco = null;
    this.lights.restoreColors(d.colors);
    if (music && d.music && S && S.rev === d.music.rev) {
      S.pause();
      S.channel = d.music.channel;
      S.render?.();
    }
  }

  /** End the mode: back to how it was before, except what the visitor changed. */
  end() {
    if (!this.active) return false;
    this.stopDisco(true);
    this.lights.restore(this.before, this.applied);
    this.release();
    return true;
  }

  /** Let go without putting anything back (a power cut, F, a reset) — but a disco's passing colours (#1177). */
  release() {
    this.stopDisco(false); // (the colours back; the music: a power cut / F stop it themselves)
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

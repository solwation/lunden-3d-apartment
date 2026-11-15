import { ThingLedger } from './thingsync.js';

// #1975 (part of #1964): the loose things the players share, tied to the real things of the game. The room's protocol and the ledger
// are src/thingsync.js; this file watches each registered thing (a Holdable) and tells the room when WE take it, put it down or send it
// home, and moves the thing when the room says somebody ELSE did:
//   - held by another player: it is gone here (hidden at its home, not takeable; their avatar shows it in the hand);
//   - lying where another player put it: it lies there here too and can be taken with E as any put-down thing;
//   - home again (put back, or its holder left): back at its home.
// What we do is noticed by comparing each thing's state from frame to frame (in the hand or carried in the inventory = 'held', put
// down = 'world', else 'home'), so every way a thing moves is covered: E, the inventory, F, a reload's restore. A thing in the
// inventory is still held, so swapping places sends nothing. Before the room's welcome, and offline, nothing is sent: each player's
// own save (keep.js) decides, as before. No three.js import (vectors are made from the thing's own), so a node test runs it.

export class ThingShare {
  /** scene; connected(): the room's connection is up; send(m): false when it cannot be sent; me(): our connection's id;
   *  hand: { held(): the thing in the hand, drop(): empty the hand, stowed(item): carried (inventory / the bicycle's hand) };
   *  say(text): a badge. */
  constructor({ scene, connected = () => false, send = () => false, me = () => '', hand, say = () => {}, cfg }) {
    Object.assign(this, { scene, connected, me, hand, say, items: new Map(), live: false });
    this.ledger = new ThingLedger({ send, me, cfg, hooks: { change: (s, was, why) => { const e = this.items.get(s.i); if (e) this.apply(e, s, why); } } });
  }
  /** `item` is thing `id` (the same id for the same thing in every client). `opt` (#1976), for things that are more than a model at a
   *  place: mode(item, usual): its state here when the usual rule is not enough (a ball in the air is still ours); away(item): after
   *  it went home because somebody else holds it; lie(item): after it was laid where somebody else put it; home(item): after it came
   *  home. */
  register(id, item, opt = {}) {
    const e = { id, item, opt, last: null };
    this.items.set(id, e); (this.byItem ??= new Map()).set(item, opt);
    const take = item.take.bind(item);
    item.take = (...a) => {
      if (this.ledger.heldByOther(id)) { this.say('Någon annan har den just nu'); return undefined; }
      return take(...a);
    };
    return e;
  }
  /** Where the thing is here: 'held' (in the hand or carried), 'world' (put down) or 'home'. */
  mode(item, opt = this.byItem?.get(item)) {
    const usual = this.hand.held() === item || item.held || this.hand.stowed(item) ? 'held' : item.placed ? 'world' : 'home';
    return opt?.mode ? opt.mode(item, usual) : usual;
  }
  /** Out of our hand without putting it anywhere (the room says it is not ours). */
  release(item) {
    if (this.hand.held() === item) { item.held = false; item.trigger?.(false); item.relax?.(); this.hand.drop(); item.onPut?.(); }
    item.held = false;
  }
  /** The room's word about a thing, applied to the real one. */
  apply(e, s, why) {
    const it = e.item, mine = s.by === this.me();
    if (s.m === 'held') {
      if (mine) return; // (our own take, echoed; or refused while we hold it anyway)
      const had = this.mode(it) === 'held';
      this.release(it); it.goHome(); e.opt.away?.(it); it.model.visible = false; e.last = 'home';
      if (had) this.say('Någon annan hann före'); // (we had it in the hand: both took it at once and the room gave it to them)
    } else if (s.m === 'world') {
      if (mine && why === 'room') return; // (our own put, echoed)
      this.release(it);
      it.goHome(); // (out of the inventory / a holder; then to where it lies)
      this.scene.add(it.model); it.model.position.set(...s.p); it.model.quaternion.set(...s.q); it.model.visible = true; it.placed = true; e.opt.lie?.(it); e.last = 'world';
    } else {
      if (mine && why === 'room') return; // (our own putting back, echoed)
      if (why === 'reset' && this.mode(it) !== 'home') return; // the connection dropped: what we hold or see lying stays as it is
      if (this.mode(it) === 'held' && why !== 'refused') return; // (it is in our hand: our take is on its way)
      this.release(it); it.goHome(); it.model.visible = true; e.opt.home?.(it); e.last = 'home';
    }
  }
  /** The room's welcome: `list` = the things that are not at home. After it our own changes are sent. */
  welcome(list) {
    this.ledger.welcome(list);
    for (const e of this.items.values()) {
      e.last = this.mode(e.item);
      if (e.last === 'held' && this.ledger.get(e.id).m !== 'held') this.ledger.request(e.id, 'take'); // what we carry in: ours
    }
    this.live = true;
  }
  /** A `th` message from the room. */
  receive(m) { return this.ledger.receive(m); }
  /** Per frame. */
  update() {
    if (!this.connected()) { if (this.live) { this.live = false; this.ledger.reset(); } return; }
    if (!this.live) return;
    for (const e of this.items.values()) {
      const it = e.item;
      if (this.ledger.heldByOther(e.id)) { if (it.model.visible) it.model.visible = false; continue; } // (a box's lid or a season may show it again)
      const m = this.mode(it);
      if (m === e.last) continue;
      e.last = m;
      if (m === 'held') this.ledger.request(e.id, 'take');
      else if (m === 'home') this.ledger.request(e.id, 'home');
      else {
        it.model.updateWorldMatrix?.(true, false);
        const p = it.model.getWorldPosition(new it.model.position.constructor()), q = it.model.getWorldQuaternion(new it.model.quaternion.constructor());
        this.ledger.request(e.id, 'put', [p.x, p.y, p.z], [q.x, q.y, q.z, q.w]);
      }
    }
  }
  state() { return { live: this.live, things: [...this.items.values()].map((e) => ({ id: e.id, local: this.mode(e.item), room: this.ledger.get(e.id).m, by: this.ledger.get(e.id).by })), pending: this.ledger.pending.size }; }
}

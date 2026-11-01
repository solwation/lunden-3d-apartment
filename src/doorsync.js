import { DOOR_SYNC } from './config.js';

/**
 * #1775: doors opened and closed by one player are seen by the others (the room: cloudflare/doors.js, which documents the protocol).
 * Every door that others can see is `register`ed under its id (group letter + index, see DOOR_SYNC); its own `toggle` is wrapped so a LOCAL
 * open / close sends { t: 'dr', i, o }. The room answers everybody (the sender too) with { t: 'dr', i, o, at, by } and the welcome lists the
 * doors standing open; `receive` flips a door whose state differs through its ORIGINAL toggle (so a door that plays its own sound still does,
 * a swing / sliding door gets `sound(open)` from main.js), without sending anything back. A remotely opened door is the same door object, so
 * its collision segment follows the leaf and it can be walked through. Locks and the cat stay with the local use code (useDoor), untouched.
 */
export class DoorSync {
  constructor({ send, ready = () => true } = {}) {
    this.send = send; this.ready = ready;
    this.doors = new Map(); // id -> { door, flip, isOpen, sound, at }
    this.applying = false;
  }

  /** `isOpen()` = the door's state as the players see it; `sound(open)` an optional positional sound for a remote change. */
  register(id, door, { isOpen = () => door.isOpen, sound } = {}) {
    if (this.doors.has(id) || !/^[wLABCgq]\d+$/.test(id) || Number(id.slice(1)) >= (DOOR_SYNC.max[id[0]] ?? 0)) return false;
    const flip = door.toggle.bind(door), e = { door, flip, isOpen, sound, at: 0 };
    this.doors.set(id, e);
    door.toggle = (...a) => {
      const r = flip(...a);
      if (!this.applying && this.ready()) this.send?.({ t: 'dr', i: id, o: isOpen() ? 1 : 0 });
      return r;
    };
    return true;
  }

  /** One message from the room: a change { t: 'dr', i, o, at } or the welcome's list { t: 'dr', list: [[id, 1], …] }. */
  receive(m) {
    if (Array.isArray(m?.list)) { for (const [i, o] of m.list) this.apply(i, o, 0, true); return; }
    this.apply(m?.i, m?.o, m?.at ?? 0, false);
  }

  apply(id, o, at, quiet) {
    const e = this.doors.get(id);
    if (!e || (o !== 0 && o !== 1) || at < e.at) return false; // unknown door, malformed, or older than what we have (the room's clock)
    e.at = at;
    if (e.isOpen() === !!o) return false;
    this.applying = true;
    try { e.flip(); } finally { this.applying = false; }
    if (!quiet) e.sound?.(!!o);
    return true;
  }
}

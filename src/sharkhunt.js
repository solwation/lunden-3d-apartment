import { SHARK } from './config.js';
import { riverAt, riverPath, waterYAt } from './riverbridge.js';
import { swimWater } from './farwalk.js';
import { newAttack, attackStep } from './sharkattack.js';

// #1947: the shark and the swimmer in the real river. The rules are src/sharkattack.js (pure); this file gives them the river (where the
// shark may surface, what is open water), hands the attacking shark to src/shark.js to draw with the #1769 fin, shadow and wake
// (`shark.hunter`; no mesh of its own, nothing built before an attack) and reports through the hooks. The shared weekly shark (#1769)
// bites a swimmer who comes within SHARK.attack.shared m of its fin; while it is in the river no local shark turns up (its meshes are busy).
// "In the water" = `player.swim` and not on the way up a bank (`swim.exit`), so diving (#1944) counts and whoever reaches a bank is safe.
// Away from the river the per-frame cost is one comparison.

const A = SHARK.attack;
const chain = [0];
for (let i = 1; i < riverPath.length; i++) chain.push(chain[i - 1] + Math.hypot(riverPath[i][0] - riverPath[i - 1][0], riverPath[i][1] - riverPath[i - 1][1]));
/** The centre line at chainage `s` (riverAt's `along`), or null outside the path. */
function pathPoint(s) {
  if (!(s >= 0 && s <= chain.at(-1))) return null;
  let i = 1;
  while (i < chain.length - 1 && chain[i] < s) i++;
  const k = (s - chain[i - 1]) / (chain[i] - chain[i - 1] || 1), [ax, az] = riverPath[i - 1], [bx, bz] = riverPath[i];
  return { x: ax + (bx - ax) * k, z: az + (bz - az) * k };
}

export class SharkHunt {
  /** shark: the Shark (src/shark.js); player; test: the debug rates (`&shark=attack`); onWarn(st), onBite(at: { x, y, z }, shared), onGone(). */
  constructor({ shark, player, test = false, random = Math.random, onWarn = () => {}, onBite = () => {}, onGone = () => {} }) {
    Object.assign(this, { shark, player, test, random, onWarn, onBite, onGone, st: newAttack(), bitten: false, o: { x: 0, y: 0, z: 0, yaw: 0, speed: 0, show: 0 } });
    const self = this;
    this.w = { dt: 0, swimming: false, x: 0, z: 0, blocked: false, test, random: () => self.random(), water: swimWater,
      centre: (x, z) => riverAt(x, z),
      spawn(sign) { // on the centre line, the warning distance (or three quarters of it near the river's ends) up / down the river
        const s = riverAt(this.x, this.z).along;
        for (const k of [1, 0.75]) { const p = pathPoint(s + sign * A.speed * A.warn * k); if (p && swimWater(p.x, p.z)) return p; }
        return null;
      } };
  }
  /** Per frame while the player moves. */
  update(dt) {
    const p = this.player, st = this.st, swimming = !!p.swim && !p.swim.exit;
    if (!swimming) {
      this.bitten = false;
      if (st.phase === 'idle' && st.cool <= 0 && st.swum === 0) return; // (the ordinary frame on land)
    }
    const w = this.w, shared = !!this.shark.sync.sharkWindow();
    if (swimming && shared && !this.bitten && this.shark.near(p.pos.x, p.pos.z, A.shared).length) return this.bite(true);
    w.dt = dt; w.swimming = swimming && !this.bitten; w.x = p.pos.x; w.z = p.pos.z; w.blocked = shared; w.test = this.test;
    const ev = attackStep(st, w);
    if (st.phase === 'idle') this.shark.hunter = null; else { // (the shared shark's fin, when in sight, has the meshes: shark.js)
      const o = this.o; o.x = st.x; o.z = st.z; o.y = waterYAt(st.x, st.z); o.yaw = st.yaw; o.speed = st.speed; o.show = st.show;
      this.shark.hunter = o;
    }
    if (ev === 'warn') this.onWarn(st); else if (ev === 'gone') this.onGone(); else if (ev === 'bite') this.bite(false);
  }
  bite(shared) {
    const p = this.player.pos;
    this.bitten = true; // (one bite per swim: the death moves the swimmer out of the water)
    this.onBite({ x: p.x, y: waterYAt(p.x, p.z), z: p.z }, shared);
  }
  /** #1953: where the attacking shark's fin is now ({ x, y, z }) while it is up enough to be hit, else null. */
  target() { return this.st.phase === 'warn' && this.st.show > 0.5 ? this.o : null; }
  /** #1953: the harpoon hit it: the attack is over (it sinks; the usual pause before the next one). True when there was one to hit. */
  harpooned() {
    if (this.st.phase !== 'warn') return false;
    this.st.phase = 'leave'; this.st.cool = (this.test ? { ...A, ...A.test } : A).again;
    return true;
  }
  state() { return { ...this.st, bitten: this.bitten, test: this.test, drawn: !!this.shark.hunter && this.shark.finShown }; }
}

// #1767: where an outdoor cat is, as a pure function of the wall clock (no three.js; node-testable, src/outdoorcatroute.test.mjs).
// A cat walks a closed loop of route points at a steady speed and rests at each point (OUTDOOR_CATS in config.js). The lap is the
// clockwise or anticlockwise per wall-clock lap (#1840); what it does while resting (washing, looking about, asleep) is drawn per lap from a hash, so every client agrees.

export const ACTIVITIES = ['wash', 'look', 'sleep'];

/** A small integer hash → [0, 1). */
export function hash01(a, b = 0, c = 0) {
  let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x632be5ab, 0xc2b2ae35) ^ Math.imul((c | 0) + 0x27d4eb2f, 0x165667b1);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** The legs of a loop: leg i walks route[i] → route[i+1] in `walk` s, then rests `rest` s there. */
function makePlan(route, rest, speed) {
  const legs = [];
  let t = 0;
  for (let i = 0; i < route.length; i++) {
    const [ax, az] = route[i], [bx, bz] = route[(i + 1) % route.length], len = Math.hypot(bx - ax, bz - az);
    const leg = { ax, az, bx, bz, len, yaw: Math.atan2(bx - ax, bz - az), t0: t, walk: len / speed, rest: rest[i % rest.length] ?? 10 };
    legs.push(leg);
    t += leg.walk + leg.rest;
  }
  const tick=Math.min(1,...legs.map(g=>g.walk+g.rest).filter(d=>d>0)),slots=new Uint16Array(Math.ceil(t/tick)+1);let leg=0;
  for(let i=0;i<slots.length;i++){while(leg<legs.length-1&&i*tick>=legs[leg+1].t0)leg++;slots[i]=leg;}
  return { legs, period: t, tick, slots };
}

/** Both directions share the same home point, total walking distance and rest budget: no lap-boundary teleport. */
export function routePlan(route, rest, speed, vary = false) {
  const plan=makePlan(route,rest,speed);
  if(vary){const reverse=[route[0],...route.slice(1).reverse()],n=route.length,rests=Array.from({length:n},(_,i)=>plan.legs[(n-i-2+n)%n].rest);plan.reverse=makePlan(reverse,rests,speed);plan.reverse.period=plan.period;}
  return plan;
}
/** Constant-time hash selection: no random state or route building per frame. */
export const lapPlan = (plan,lap,id=0) => plan.reverse && hash01(id,lap,1840)>=.5 ? plan.reverse : plan;

/** Where the cat `id` on `plan` is at `T` s: { x, z, yaw, walking, activity, lap, leg, restLeft }. */
export function catAt(plan, T, id = 0) {
  const lap = Math.floor(T / plan.period);
  const selected=lapPlan(plan,lap,id);
  let u=T-lap*plan.period,i=selected.slots[Math.min(selected.slots.length-1,Math.floor(u/selected.tick))];
  if(i<selected.legs.length-1&&u>=selected.legs[i+1].t0)i++;
  const L=selected.legs[i];
  u -= L.t0;
  if (u < L.walk) {
    const k = L.walk > 0 ? u / L.walk : 1;
    return { x: L.ax + (L.bx - L.ax) * k, z: L.az + (L.bz - L.az) * k, yaw: L.yaw, walking: true, activity: 'walk', direction:selected===plan?1:-1, lap, leg: i, restLeft: 0 };
  }
  const r = hash01(id, lap, i), activity = L.rest >= 20 && r > 0.7 ? 'sleep' : r > 0.4 ? 'look' : 'wash';
  return { x: L.bx, z: L.bz, yaw: L.yaw, walking: false, activity, direction:selected===plan?1:-1, lap, leg: i, restLeft: L.walk + L.rest - u };
}

/** Points every `step` m along the loop (for the route checks). */
export function routeSamples(route, step = 0.5) {
  const out = [];
  for (let i = 0; i < route.length; i++) {
    const [ax, az] = route[i], [bx, bz] = route[(i + 1) % route.length], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    for (let k = 0; k < n; k++) out.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]);
  }
  return out;
}

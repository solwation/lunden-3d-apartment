// #1820: a shared, DOM-free target relocation rule. The room chooses from inspected open grass spots,
// rather than importing renderer/physics modules or trusting a client-supplied destination.
import { TARGET as T } from './config.js';
export const initialTarget = () => ({ x: T.x, z: T.z, rot: T.rot * Math.PI / 180, points: 0, v: 0 });
export const facesShooter = (x, z, from) => Math.atan2(x - from[0], z - from[2]); // board front is local -z
export function chooseTargetSpot(old, from, random = Math.random, spots = T.moveSpots) {
  const choices = spots.filter(([x, z]) => Math.abs(Math.hypot(x - old.x, z - old.z) - T.moveDist) <= T.moveSlack);
  // A uniform choice has no persistent direction/cycle; bounded work even when every direction is blocked.
  const [x, z] = choices.length ? choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))] : [T.x, T.z];
  return { x, z, rot: facesShooter(x, z, from) };
}
export function advanceTarget(old, pts, from, random = Math.random) {
  const points = old.points + pts;
  return points < T.moveEvery ? { ...old, points } : { ...chooseTargetSpot(old, from, random), points: 0, v: old.v + 1 };
}
export function validTargetState(s) {
  return s && [s.x,s.z,s.rot,s.points,s.v].every(Number.isFinite) && Number.isSafeInteger(s.v) && s.v >= 0
    && Number.isInteger(s.points) && s.points >= 0 && s.points < T.moveEvery && Math.abs(s.rot) <= Math.PI
    && ((s.x === T.x && s.z === T.z) || T.moveSpots.some(([x,z]) => x === s.x && z === s.z));
}
export class TargetSync {
  constructor(move, net = null) { this.move = move; this.net = net; this.state = initialTarget(); this.n = 0; }
  hit(pts, from) {
    if (this.net?.ready()) { this.net.send({ t:'tg', pts, v:this.state.v, n:++this.n }); return; }
    this.apply(advanceTarget(this.state, pts, [from.x,from.y,from.z]));
  }
  receive(m, welcome = false) {
    if (!validTargetState(m) || (!welcome && m.v < this.state.v)) return false;
    this.apply(m, welcome); return true;
  }
  apply(s, quiet = false) {
    const changed = s.x !== this.state.x || s.z !== this.state.z || s.rot !== this.state.rot;
    this.state = { x:s.x,z:s.z,rot:s.rot,points:s.points,v:s.v };
    if (changed) this.move(this.state, quiet);
  }
}

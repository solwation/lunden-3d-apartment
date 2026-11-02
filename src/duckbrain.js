// #1815: small local flock; pure state, terrain and food supplied by the caller.
import { DUCKS } from './config.js';
export { DUCKS };
export class DuckBrain {
  constructor({ home, habitat, seed = 1 }) {
    Object.assign(this, { home, habitat, seed, x: home.x, z: home.z, yaw: 0, phase: 0, cooldown: 0, eating: 0, quack: DUCKS.quackFirst[0] + seed * DUCKS.quackFirst[1], mode: 'swim', goal: null });
    this.y = habitat.surface(this.x, this.z).y;
  }
  random() { this.seed = this.seed * 16807 % 2147483647; return this.seed / 2147483647; }
  feed() { if (this.cooldown > 0) return false; this.eating = DUCKS.eat; this.cooldown = DUCKS.cooldown; return true; }
  update(dt, food = null) {
    dt = Math.min(Math.max(dt, 0), DUCKS.maxStep); this.cooldown = Math.max(0, this.cooldown - dt);
    this.eating = Math.max(0, this.eating - dt); this.quack -= dt;
    const sound = this.quack <= 0;
    if (sound) this.quack = DUCKS.quackInterval[0] + this.random() * DUCKS.quackInterval[1];
    let goal = this.goal;
    // Only lure within the local river/shore reach, never up the valley wall.
    if (food && this.habitat.contains(food.x, food.z) && Math.hypot(food.x-this.x, food.z-this.z) < DUCKS.lureReach) goal = food;
    else if (!goal || Math.hypot(goal.x-this.x, goal.z-this.z) < DUCKS.goalReach) {
      this.mode = this.mode === 'swim' ? 'walk' : 'swim';
      this.goal = goal = this.habitat.goal(this.mode, this.random(), this.random());
    }
    const dx=goal.x-this.x, dz=goal.z-this.z, d=Math.hypot(dx,dz), surface=this.habitat.surface(this.x,this.z);
    this.swimming=surface.water; this.moving=d>DUCKS.stopReach && !this.eating;
    if(this.moving){
      const stride=dt*(surface.water?DUCKS.swimSpeed:DUCKS.speed); let step=Math.min(d,stride);
      // Slow on the actual bank slope; keep the feet on its surface rather than interpolating through it.
      for(let i=0;i<5;i++){const y=this.habitat.surface(this.x+dx/d*step,this.z+dz/d*step).y,travel=Math.hypot(step,y-this.y);if(travel<=stride+1e-6)break;step*=stride/travel*.98;}
      if(Math.hypot(step,this.habitat.surface(this.x+dx/d*step,this.z+dz/d*step).y-this.y)>stride+1e-6)step=0;
      this.x+=dx/d*step;this.z+=dz/d*step;this.yaw=Math.atan2(dx,dz);this.phase+=step*(surface.water?DUCKS.phaseSwim:DUCKS.phaseWalk);
    }
    this.y=this.habitat.surface(this.x,this.z).y;
    return sound;
  }
}

/** Consume one real held portion through Items, retaining normal view/save/remove notifications. */
export function heldBread(life, held) {
  const it=held?.item;
  return held?.life===life && held.held && it?.type==='breadSlice' && it.place.at==='hand' && life.items.get(it.id)===it && it.amount>0 && !it.parts.length && !life.runner.job ? it : null;
}
export function feedBread(life, held) {
  const it=heldBread(life,held); if(!it)return false;
  const d=life.items.def(it), got=life.items.consume(it,d.amount/d.bites);
  if(life.items.isEmpty(it))life.items.remove(it);
  return got>0;
}

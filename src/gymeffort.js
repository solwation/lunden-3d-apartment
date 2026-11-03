// #1836: transient input effort only. Time, input and thresholds are explicit for deterministic checks.
import { OUTDOOR_GYM } from './config.js';
export class GymEffort {
  constructor(cfg=OUTDOOR_GYM.effort){this.cfg=cfg;this.reset();}
  reset(){this.level=0;this.peaked=false;this.cooldown=0;}
  push(){
    if(this.cooldown>1e-9)return false;
    this.cooldown=this.cfg.pulseGap;
    this.level=Math.min(1,this.level+this.cfg.gain);
    if(this.level===1)this.peaked=true;
    return true;
  }
  update(dt){
    if(!Number.isFinite(dt)||dt<=0||dt>this.cfg.maxStep)return 0;
    this.cooldown=Math.max(0,this.cooldown-dt);
    this.level=Math.max(0,this.level-this.cfg.decay*dt);
    if(this.level===0&&this.peaked){this.peaked=false;return 1;}
    return 0;
  }
}
/** Credit a reversal only after a real stroke from its extreme, never jitter or one-way travel. */
export class GymStroke {
  constructor(distance=OUTDOOR_GYM.effort.stroke){this.distance=distance;this.reset();}
  reset(){this.extreme=null;this.direction=0;}
  begin(y){this.extreme=Number.isFinite(y)?y:null;this.direction=0;}
  move(y){
    if(this.extreme===null||!Number.isFinite(y))return false;
    if(!this.direction){if(Math.abs(y-this.extreme)>=this.distance){this.direction=Math.sign(y-this.extreme);this.extreme=y;}return false;}
    if((y-this.extreme)*this.direction>0){this.extreme=y;return false;}
    if((this.extreme-y)*this.direction<this.distance)return false;
    this.direction=-this.direction;this.extreme=y;return true;
  }
}

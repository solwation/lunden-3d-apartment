import { PLAYROOM as R } from './config.js';
import { sfx } from './audio.js';

/** Local, positional billiard impact sounds. No timers, media downloads or network events. */
export class PlayroomSound {
  constructor(effects=sfx) {
    this.effects=effects;this.active=false;this.time=0;this.hits=new Map();
  }
  setInside(on) { this.active=on;this.hits.clear(); }
  // The disco lamp is silent: its synth drum loop (#1330) ticked whenever no music played, so only the DJ/speaker music remains.
  update(dt) { this.time+=Math.max(0,dt); }
  hit(kind,position,speed) {
    const C=R.sound;
    // A ball falling into a pocket makes a drop even if it barely reached the lip.
    if(!this.active||document.hidden||!Number.isFinite(speed)||(kind!=='pocket'&&speed<C.minSpeed)||this.time-(this.hits.get(kind)??-Infinity)<C.hitInterval)return;
    const strength=kind==='pocket'?1:Math.sqrt(Math.min(1,Math.max(0,speed)/R.billiards.strokeSpeed));
    this.hits.set(kind,this.time);this.effects.billiard(position,kind,strength);
  }
}

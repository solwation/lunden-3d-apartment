import { PLAYROOM as R } from './config.js';
import { sfx } from './audio.js';

/** Local, positional synth sounds. No timers, media downloads or network events. */
export class PlayroomSound {
  constructor(effects=sfx) {
    this.effects=effects;this.active=false;this.time=0;this.next=0;this.step=0;this.hits=new Map();
    const p=R.furniture.ball;this.position={x:R.x+p.x,y:p.y,z:R.z+p.z};
  }
  setInside(on) { this.active=on;this.next=0;this.step=0;this.hits.clear(); }
  update(dt,disco,manualMusic=false) {
    this.time+=Math.max(0,dt);
    if(!this.active||document.hidden||!disco||manualMusic){this.next=0;this.step=0;return;}
    this.next-=dt;if(this.next>0)return;
    // One step per frame at most: a slow/background frame never replays missed beats.
    const C=R.sound,n=this.step++%C.steps;this.next=C.beat;
    this.effects.beat(this.position,n%4===0?'kick':n%4===2?'snare':'hat',C.musicGain);
    if(n%2===0)this.effects.beat(this.position,'blip',C.melodyGain,C.notes[Math.floor(n/2)%C.notes.length]);
  }
  hit(kind,position,speed) {
    const C=R.sound;
    // A ball falling into a pocket makes a drop even if it barely reached the lip.
    if(!this.active||document.hidden||!Number.isFinite(speed)||(kind!=='pocket'&&speed<C.minSpeed)||this.time-(this.hits.get(kind)??-Infinity)<C.hitInterval)return;
    const strength=kind==='pocket'?1:Math.sqrt(Math.min(1,Math.max(0,speed)/R.billiards.strokeSpeed));
    this.hits.set(kind,this.time);this.effects.billiard(position,kind,strength);
  }
}

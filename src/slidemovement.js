// #1414: transient guided travel along the existing ladder, deck and chute. No scene geometry or score.
import { COURTYARD, PLAYER } from './config.js';
const mix=(a,b,t)=>a+(b-a)*t, smooth=t=>t*t*(3-2*t), distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const point=(x,y,z)=>({x,y,z});
export function slideLayout(L=COURTYARD.slide){
  const xe=L.x+.28+Math.sqrt(L.len*L.len-(L.h-.32)**2);
  return {ladder:point(L.x-.75,0,L.z),top:point(L.x-.3,L.h+.05,L.z),deck:point(L.x+.28,L.h,L.z),bottom:point(xe,.32,L.z),runout:point(xe+.38,.28,L.z),end:xe+.4};
}
/** Sample the piecewise path without a render or frame-rate dependency. */
export function slideSample(nodes,elapsed){
  let start=nodes[0];for(const end of nodes.slice(1)){if(elapsed<=end.seconds){const t=smooth(Math.max(0,elapsed/end.seconds));return{...point(mix(start.x,end.x,t),mix(start.y,end.y,t),mix(start.z,end.z,t)),eye:mix(start.eye,end.eye,t),phase:end.phase};}elapsed-=end.seconds;start=end;}
  return {...start,done:true};
}
export class SlideRide{
  constructor({player,camera,ground,free,allowed=()=>true,onEnd=()=>{}}){Object.assign(this,{player,camera,ground,free,allowed,onEnd,active:false,standing:null});}
  samePlace(){return this.expected&&distance(this.player.pos,this.expected)<1e-6;}
  savePlace(){return this.active&&this.samePlace()?{...this.standing}:null;}
  clear(preserve=false){this.active=false;if(preserve)return;this.player.keys.clear();this.player.analog.x=this.player.analog.y=0;this.player.jumpPress=false;this.player.crouch=false;this.player.vy=0;}
  exitSpot(L,ignored=[]){
    const B=slideLayout(L),R=L.ride;
    for(const [dx,dz]of[[R.exitGap,0],[R.exitGap,R.exitSide],[R.exitGap,-R.exitSide],[R.exitGap+R.exitSide,0]]){
      const p=point(B.end+PLAYER.radius+dx,this.ground(B.end+PLAYER.radius+dx,L.z+dz),L.z+dz);
      if(!Number.isFinite(p.y)||Math.abs(p.y)>R.maxExitDrop||!this.free(p.x,p.z,[]))continue;
      const n=Math.ceil(Math.hypot(p.x-B.runout.x,p.z-B.runout.z)/R.clearanceStep);
      if(Array.from({length:n+1},(_,i)=>i/n).every(t=>this.free(mix(B.runout.x,p.x,t),mix(B.runout.z,p.z,t),ignored)))return p;
    }return null;
  }
  begin(target){
    const L=target.slide??COURTYARD.slide,R=L.ride,B=slideLayout(L),p=this.player.pos;
    const atop=Math.abs(p.y-L.h)<=PLAYER.stepUp&&Math.abs(p.x-L.x)<=.31&&Math.abs(p.z-L.z)<=.31; // existing .62m deck
    if(this.active||!this.allowed()||(!atop&&(p.x>L.x-.3||Math.hypot(p.x-B.ladder.x,p.z-B.ladder.z)>R.entryReach||Math.abs(p.y-this.ground(p.x,p.z))>PLAYER.stepUp)))return false;
    const exit=this.exitSpot(L,target.slideSegments);if(!exit)return false;
    const n=Math.max(1,Math.ceil(Math.hypot(p.x-B.ladder.x,p.z-B.ladder.z)/R.clearanceStep));
    if(!atop&&!Array.from({length:n+1},(_,i)=>i/n).every(t=>this.free(mix(p.x,B.ladder.x,t),mix(p.z,B.ladder.z,t),target.slideSegments)))return false;
    const standing=!atop&&this.free(p.x,p.z,[])?point(p.x,p.y,p.z):exit;
    this.standing={...standing,yaw:this.camera.rotation.y,pitch:this.camera.rotation.x};
    const eye=PLAYER.eye,seat=R.eye*eye/1.62;
    this.nodes=[{...p,eye},...(!atop?[{...B.ladder,eye,seconds:R.approach,phase:'approach'},{...B.top,eye,seconds:R.climb,phase:'climb'}]:[]),{...B.deck,eye:seat,seconds:R.settle,phase:'sit'},{...B.bottom,eye:seat,seconds:R.slide,phase:'slide'},{...B.runout,eye:seat,seconds:R.runout,phase:'runout'},{...exit,eye,seconds:R.exit,phase:'exit'}];
    this.target=target;this.elapsed=0;this.expected={...point(p.x,p.y,p.z)};this.active=true;this.player.keys.clear();this.player.analog.x=this.player.analog.y=0;this.player.crouch=false;this.player.jumpPress=false;this.player.vy=0;this.player.fall=null; // the checked deck entry replaces ordinary drop tracking
    this.camera.rotation.set?.(R.pitch,-Math.PI/2,0,'YXZ');return true;
  }
  update(dt){
    if(!this.active||!Number.isFinite(dt)||dt<0)return;
    if(!this.samePlace()||!this.allowed()){this.cancel(false);return;} // an external spawn/new mode always wins
    this.elapsed+=Math.max(0,dt);const q=slideSample(this.nodes,this.elapsed);
    if(q.done){this.finish();return;}
    Object.assign(this.player.pos,point(q.x,q.y,q.z));this.expected=point(q.x,q.y,q.z);this.player.eyeY=q.y+q.eye;Object.assign(this.camera.position,point(q.x,this.player.eyeY,q.z));this.phase=q.phase;
  }
  finish(){const L=this.target.slide??COURTYARD.slide,p=this.exitSpot(L,this.target.slideSegments);if(!p){this.cancel();return;}this.clear();this.player.spawn(p.x,p.z,this.camera.rotation.y);this.onEnd('complete');}
  cancel(restore=true){
    if(!this.active)return false;
    const old=this.standing,external=!this.samePlace();
    const p=restore&&!external?(this.free(old.x,old.z,[])?old:this.exitSpot(this.target.slide??COURTYARD.slide,this.target.slideSegments)):null;
    if(restore&&!external&&!p)return false; // like ordinary stand-up: never exit into blocked ground
    this.clear(!restore||external);
    if(p)this.player.spawn(p.x,p.z,this.camera.rotation.y);
    this.onEnd(restore&&!external?'abort':'external');return true;
  }
}

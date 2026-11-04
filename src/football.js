import * as THREE from 'three';
import {FOOTBALL as C} from './config.js';
import {sfx} from './audio.js';
import {footballWorld,footballActor,initialFootball,cloneFootball,advanceFootball} from './footballphysics.js';
import {cleanFootballSnapshot} from './footballwire.js';
import {footballGeometry} from './footballmodel.js';
import {footballDrinking} from './footballlife.js';
/** Two real ball bodies at the feet/on the field; never held models or client-submitted positions. */
export class Football{
 constructor({site,camera,ghosts,life,canPlay=()=>true,spectating=()=>false,onRecord=()=>{},say=()=>{},now=()=>performance.now()}){
  Object.assign(this,{site,camera,ghosts,canPlay,spectating,onRecord,say,now,pending:new Map(),sequence:0,supported:false,receivedAt:0,confirmAt:Infinity,confirmAttempts:0});
  this.offline=!ghosts.on;this.localId='local';this.auth=null;this.pred=null;
  const geometry=footballGeometry(),material=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.75});
  this.balls=[0,1].map(id=>{const root=new THREE.Group(),mesh=new THREE.Mesh(geometry,material);root.name='football-ball-'+id;root.userData.moving=true;root.visible=false;mesh.castShadow=true;mesh.userData.moving=true;mesh.userData.noDistanceCull=true;mesh.name='football-surface-'+id;root.add(mesh);site.object.add(root);const self=this,target={kind:'football',id:'football-'+id,name:`fotboll ${id+1}`,pickable:mesh,
   get verb(){return self.pred?.balls[id]?.owner===self.id?'släppa':'dribbla med';},get blocked(){return !self.available||!self.canPlay()||!!self.pending.get(id)||!!self.pred?.balls[id]?.reset||!!(self.pred?.balls[id]?.owner&&self.pred.balls[id].owner!==self.id);},get blockedText(){return !self.available?'Väntar på delad fotboll':self.pred?.balls[id]?.owner?'Bollen används just nu':'Bollen återställs';},toggle:()=>this.use(id)};mesh.userData.door=target;return{root,mesh,target};});
  this.targets=this.balls.map(b=>b.target);this.control={useLabel:'Sparka fotbollen',use:()=>this.kick(1),useAlt:()=>this.kick(0)};
  this.score=document.createElement('div');this.score.className='football-score';this.score.hidden=true;document.body.append(this.score);
  ghosts.onFootball=(m,welcome)=>this.receive(m,welcome);
  if(this.offline)this.receive({p:1,s:initialFootball(C,'local_'+Date.now().toString(36),Date.now())},true);
  footballDrinking(life,site,()=>this.release());
 }
 get id(){return this.offline?this.localId:this.ghosts.me;}
 get available(){return this.offline||!!(this.ghosts.connected&&this.supported&&this.auth);}
 get interest(){return this.available&&!!(this.controlled||(this.spectating()&&this.pred?.balls.some(b=>b.owner||Math.hypot(...b.vel)>0)));}
 get controlled(){return this.available&&this.pred?.balls.find(b=>b.owner===this.id)||null;}
 actor(id,time){if(id===this.id)return{...this.ghosts.state(),id,at:time};const g=this.ghosts.others.get(id),s=g?.snaps.at(-1);return g&&s?{...s,id,p:g.root.position.toArray(),r:g.root.rotation.y,at:time}:null;}
 receive(m,welcome=false){if(welcome&&!m){this.supported=false;this.auth=this.pred=null;return;}if(m?.p!==1)return;const s=cleanFootballSnapshot(C,m.s);if(!s)return;
  if(!welcome&&this.auth&&(s.epoch!==this.auth.epoch||s.v<this.auth.v))return;
  if(welcome)this.pending.clear();
  const old=this.auth;this.supported=true;this.auth=s;this.pred=cloneFootball(s);this.receivedAt=this.now();this.confirmAt=Infinity;if(!old||old.v!==s.v)this.confirmAttempts=0;
  if(Number.isSafeInteger(m.ack))for(const[id,p]of this.pending)if(p.n<=m.ack)this.pending.delete(id);
  this.onRecord(s,this.id,welcome);if(m.why)this.say(m.why);
 }
 request(kind,id=0,extra={}){if(!this.available||this.pending.has(id))return false;
  if(this.offline){const actor=this.actor(this.id,Date.now());if(advanceFootball(C,this.pred,Date.now(),key=>this.actor(key,Date.now()))){this.auth=cloneFootball(this.pred);this.onRecord(this.auth,this.id,false);}return importOffline(this,actor,id,kind,extra);}
  const m={t:'ft',k:kind,b:id,n:++this.sequence,...extra};if(!this.ghosts.football(m))return false;this.pending.set(id,{n:m.n,at:this.now()});return true;
 }
 use(id){const b=this.pred?.balls[id];if(!b)return false;if(b.owner===this.id)return this.request('drop',id);if(!this.canPlay())return false;return this.request('take',id);}
 release(){const b=this.controlled;return b?this.request('drop',b.id):false;}
 kick(power=1){const b=this.controlled;if(!b||!this.canPlay())return false;const dir=new THREE.Vector3();this.camera.getWorldDirection(dir);const horiz=Math.hypot(dir.x,dir.z),d=horiz>1e-4?[dir.x/horiz,dir.z/horiz]:[-Math.sin(this.camera.rotation.y),-Math.cos(this.camera.rotation.y)];const loft=Math.max(0,Math.min(.85,dir.y));return this.request('kick',b.id,{d,w:power,l:Math.round(loft*1000)/1000});}
 update(playing=true){const near=Math.hypot(this.camera.position.x-C.at[0],this.camera.position.z-C.at[1]);this.site.object.visible=near<C.drawDist;
  if(this.controlled&&!this.canPlay())this.release();
  if(this.pred&&this.available){const time=this.offline?Date.now():this.auth.at+this.now()-this.receivedAt,before=this.pred.balls.map(b=>({reset:b.reset,moving:Math.hypot(...b.vel)>0}));
   const allActors=()=>[this.actor(this.id,time),...[...this.ghosts.others.keys()].map(k=>this.actor(k,time))].filter(Boolean);const actorFn=id=>this.actor(id,time);actorFn.all=allActors;
   const changed=advanceFootball(C,this.pred,time,actorFn,{authoritative:this.offline});
   if(this.offline&&changed){this.auth=cloneFootball(this.pred);this.onRecord(this.auth,this.id,false);}
   if(!this.offline&&this.pred.balls.some((b,i)=>(!!b.reset!==!!before[i].reset)||(before[i].moving&&!b.owner&&!Math.hypot(...b.vel))))this.confirmAt=Math.min(this.confirmAt,this.now()+C.confirmMs);
   if(!this.offline&&this.now()>=this.confirmAt&&this.confirmAttempts<3&&!this.pending.size){if(this.request('q')){this.confirmAttempts++;this.confirmAt=Infinity;}}
  }
  for(const[id,p]of this.pending)if(this.now()-p.at>4000)this.pending.delete(id);
  for(const{root,mesh,target}of this.balls){const b=this.pred?.balls[Number(target.id.at(-1))];root.visible=!!(b&&this.available&&near<C.ballDrawDist);if(!root.visible)continue;const[x,z]=footballWorld(C,...b.p);root.position.set(x,this.site.ground(x,z)+C.ballR+(b.h??0),z);mesh.rotation.x=-b.p[1]/C.ballR;mesh.rotation.z=b.p[0]/C.ballR;if(b.headerAt&&b.headerAt!==b.lastHeaderAt){b.lastHeaderAt=b.headerAt;sfx.bounce(new THREE.Vector3(x,this.site.ground(x,z)+C.ballR+(b.h??1.5),z),1);if(b.last===this.id)this.say('Nick!');}}
  this.score.hidden=!playing||near>C.ballDrawDist;const s=this.auth?.score??[0,0],text=!this.available?(this.ghosts.connected&&!this.supported?'⚽ Fotbollen väntar på speluppdatering':'⚽ Fotboll – väntar på anslutning'):`⚽ ${s[0]} – ${s[1]} · ${this.offline?'Lokalt':'Delat spel'}${this.controlled?' · Dribblar boll '+(this.controlled.id+1):''}`;if(this.score.textContent!==text)this.score.textContent=text;
 }
}
import {footballCommand} from './footballphysics.js';
function importOffline(self,actor,id,kind,extra){if(kind!=='q'&&!footballCommand(C,self.pred,actor,id,kind,{direction:extra.d,power:extra.w,l:extra.l},Date.now()))return false;self.auth=cloneFootball(self.pred);self.onRecord(self.auth,self.id,false);return true;}

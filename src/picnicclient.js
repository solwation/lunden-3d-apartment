import * as T from 'three';
import {heldItem,setHeld,handBusy} from './holdable.js';
import {DRINKS as D,ROOF_PICNIC as C} from './config.js';
import {validPicnic,picnicHome} from './picnicwire.js';
const session=()=>{try{let key=sessionStorage.getItem('lunden.picnic.key');if(!/^[a-f0-9]{32}$/.test(key??'')){key=crypto.randomUUID().replaceAll('-','');sessionStorage.setItem('lunden.picnic.key',key);}return{key,n:Number(sessionStorage.getItem('lunden.picnic.n.'+key))||0}}catch{return{key:crypto.randomUUID().replaceAll('-',''),n:0}}};
export class PicnicClient{
 constructor({picnic,ghosts,rest,enterSeat,stand,say=()=>{},identity=session(),now=()=>performance.now()}){
  Object.assign(this,{picnic,ghosts,rest,enterSeat,stand,say,identity,now,ready:false,supported:false,state:null,pending:null,applying:false});picnic.sync=this;
  const prior=ghosts.onPicnic;ghosts.onPicnic=(m,w)=>{prior?.(m,w);this.receive(m,w)};
  this.items=[...picnic.glasses,picnic.bottle];this.items.forEach((g,i)=>this.attach(g,i));
  picnic.seat.spots.forEach((s,i)=>s.taken=()=>!this.ready||!!(this.state?.seats[i]?.held&&this.state.seats[i].who!==ghosts.me));
 }
 get interest(){return!!this.pending||this.items.some(g=>g.held)||this.rest.target===this.picnic.seat||this.picnic.object.position.distanceTo(this.picnic.glasses[0].camera.position)<C.drawDist;}
 request(k,i,extra={},commit=()=>{}){
  if(!this.ghosts.connected||!this.supported||this.pending||k!=='get'&&!this.ready){this.say('Picknicken väntar på rummet');return false;}
  const n=++this.identity.n;try{sessionStorage.setItem('lunden.picnic.n.'+this.identity.key,String(n))}catch{}
  const m={t:'pc',k,key:this.identity.key,n,r:this.state?.r??0,...(i===undefined?{}:{i}),...extra};
  this.pending={m,commit,at:this.now()};if(!this.ghosts.picnic(m)){this.pending=null;return false;}return true;
 }
 run(fn){this.applying=true;try{return fn()}finally{this.applying=false}}
 attach(g,i){
  g.isSharedPicnic=true;const take=g.take.bind(g),put=g.placeAt.bind(g),home=g.goHome.bind(g),back=g.putBack.bind(g),sip=g.onUse?.bind(g),pour=g.pourFrom?.bind(g);
  g.take=()=>this.applying?take():!handBusy(g)&&this.request('take',i,{},()=>this.run(take));
  g.placeAt=(p,yaw=0)=>{if(this.applying)return put(p,yaw);const pose=new T.Object3D();g.poseAt(pose,p,yaw);return g.held&&this.request('put',i,{p:pose.position.toArray(),q:pose.quaternion.toArray()});};
  // F/back is a normal shared drop at the known home only when in reach; never a private refill/reset.
  g.putBack=()=>this.applying?back():g.held&&this.request('put',i,{p:picnicHome(i),q:[0,0,0,1]});
  g.goHome=()=>this.applying?home():false;
  g.keepState=()=>null;g.loadKeep=()=>{};
  if(sip)g.onUse=()=>this.applying?sip():this.request('sip',i,{},()=>this.run(sip));
  if(pour)g.pourFrom=src=>src===this.picnic.bottle&&this.request('pour',i,{},()=>this.run(()=>pour(src)));
  const descriptor=Object.getOwnPropertyDescriptor(g.takeTarget,'blocked');
  Object.defineProperty(g.takeTarget,'blocked',{configurable:true,get:()=>!this.ready||!!this.pending||!!(this.state?.objects[i].held&&this.state.objects[i].who!==this.ghosts.me)||(descriptor?.get?.call(g.takeTarget)??false)});
  const text=Object.getOwnPropertyDescriptor(g.takeTarget,'blockedText');
  Object.defineProperty(g.takeTarget,'blockedText',{configurable:true,get:()=>!this.ready?'Picknicken väntar på rummet':this.state?.objects[i].held&&this.state.objects[i].who!==this.ghosts.me?'Någon annan håller föremålet':text?.get?.call(g.takeTarget)});
 }
 receive(m,welcome=false){
  if(welcome){this.ready=false;this.supported=m?.v===1&&validPicnic(m);this.pending=null;this.ghosts.outbox=this.ghosts.outbox?.filter(x=>x.t!=='pc')??[];if(!this.supported)return;this.state=m;this.apply();this.request('get',undefined,{},()=>{this.ready=true});return;}
  if(!m?.s||!validPicnic(m.s))return;
  const p=this.pending&&m.n===this.pending.m.n?this.pending:null;
  if(p){this.pending=null;if(m.ok)p.commit();else this.say(m.why??'Picknicken har ändrats – försök igen');}
  if(!this.state||m.s.r>=this.state.r){this.state=m.s;this.apply();}
 }
 apply(){
  if(!this.state)return;const s=this.state;this.picnic.remaining=[...s.food];this.picnic.refresh();
  this.items.forEach((g,i)=>{const o=s.objects[i],own=o.held&&o.who===this.ghosts.me;
   if(i<2){const target=o.ml/D.ml.glass;if(!g.contents.to||Math.abs((g.contents.to.wine??0)-target)>1e-6)g.contents.set('wine',target);g.used=o.used;g.show();}else g.ml=o.ml;
   if(own&&this.ready){if(!g.held&&!handBusy(g))this.run(()=>g.take());g.model.visible=g.held&&heldItem()===g;}
   else{g.held=false;if(heldItem()===g)setHeld(null);g.scene.add(g.model);g.model.position.set(...o.p);g.model.quaternion.set(...o.q);g.model.visible=!o.held;g.placed=true;g.model.updateMatrixWorld(true);}
  });
  const seat=s.seats.findIndex(x=>x.held&&x.who===this.ghosts.me);
  if(this.ready&&seat>=0&&this.rest.target!==this.picnic.seat&&!this.releasing)this.enterSeat(seat);
  else if(this.rest.target===this.picnic.seat&&seat<0)this.stand();
 }
 sit(spot,commit){return this.request('sit',this.picnic.seat.spots.indexOf(spot),{},commit)}
 releaseSeat(){this.releasing=true;}
 update(){
  if(!this.ghosts.connected){this.ready=false;return;}
  if(this.ready)this.items.forEach((g,i)=>{const o=this.state.objects[i];if(o.held&&o.who===this.ghosts.me&&(!g.held||heldItem()!==g)&&!handBusy(g))this.run(()=>g.take())});
  if(this.pending&&this.now()-this.pending.at>1800){this.pending.at=this.now();this.ghosts.picnic(this.pending.m);}
  if(this.ready&&!this.pending&&[...this.state.objects,...this.state.seats].some(x=>x.held&&!x.who)&&this.now()-(this.orphanGet??0)>C.shared.leaseMs/2){this.orphanGet=this.now();this.request('get');}
  if(this.releasing&&this.ready&&!this.pending){if(this.state?.seats.some(x=>x.who===this.ghosts.me&&x.held))this.request('stand',undefined,{},()=>{this.releasing=false});else this.releasing=false;}
 }
}

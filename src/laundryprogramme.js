import * as THREE from 'three';
import { LAUNDRY as P } from './config.js';
import { sfx } from './audio.js';

// Game-time washing/drying: explicit start ids, independent clean/wet state, no elapsed wall time (#551/#552).
export class LaundryProgramme {
  constructor(life,machine) {
    Object.assign(this,{life,machine,door:machine.door,state:'idle',left:0,ids:[],sound:null,lastLabel:null});
    this.kind=machine.kind;this.drying=this.kind==='dryer';
    this.seconds=this.drying?P.drySeconds:P.washSeconds;
    const c=machine.door.laundry.center,C=P.panel;
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=64;
    this.canvas=canvas;this.texture=new THREE.CanvasTexture(canvas);this.texture.colorSpace=THREE.SRGBColorSpace;
    this.panel=new THREE.Mesh(new THREE.PlaneGeometry(C.w,C.h).rotateY(Math.PI/2),new THREE.MeshBasicMaterial({map:this.texture}));
    this.panel.position.set(c[0]+C.offset,c[1]+C.lift,c[2]);life.scene.add(this.panel);
    const pick=new THREE.Mesh(new THREE.BoxGeometry(C.pickDepth,C.h*1.4,C.w),new THREE.MeshBasicMaterial());pick.position.copy(this.panel.position);pick.visible=false;life.scene.add(pick);
    this.target={name:this.drying?'torkprogrammet':'tvättprogrammet',kind:'life',laundryPanel:this,pickable:pick,outlineRoot:this.panel};
    this.target.options=()=>life.options(this.target);this.target.toggle=()=>life.run(this.target);
    Object.defineProperties(this.target,{blocked:{get:()=>!this.target.options().some(a=>!a.reason)},blockedText:{get:()=>this.target.options()[0]?.reason??null}});
    pick.userData.door=this.target;(life.storeTargets??=[]).push(this.target);
    const own=machine.store.refuse;machine.store.refuse=it=>this.busy?`${this.drying?'Torkprogrammet':'Tvättprogrammet'} pågår – vänta tills det är klart`:own?.(it)??null;
    life.actions.define({id:this.drying?'laundryDryStart':'laundryWashStart',order:0,label:this.drying?'starta torkprogrammet':'starta tvättprogrammet',applies:c=>c.raw?.laundryPanel===this&&!this.busy,
      check:()=>this.startReason(),run:()=>this.start(),consumes:'nothing',result:'only start garments still inside are washed or dried'});
    life.actions.define({id:this.drying?'laundryDryStatus':'laundryWashStatus',order:0,label:this.drying?'torkprogrammet':'tvättprogrammet',applies:c=>c.raw?.laundryPanel===this&&this.busy,
      check:()=>this.door.isOpen||this.door.t>0?`Pausad – stäng luckan (${Math.ceil(this.left)} s kvar)`:`${this.drying?'Torkar':'Tvättar'} – ${Math.ceil(this.left)} s kvar`,run:()=>{},consumes:'nothing',result:'status only'});
    this.draw();
  }
  get busy(){return this.state==='running'||this.state==='paused';}
  inside(){return this.life.items.all().filter(i=>i.place.at==='slot'&&i.place.store===this.machine.store.id);}
  startReason(){
    if(this.busy)return this.drying?'Torkprogrammet pågår':'Tvättprogrammet pågår';
    if(this.door.isOpen||this.door.t>0)return 'Stäng luckan först';
    const clothes=this.inside();
    if(!clothes.length)return this.drying?'Torktumlaren är tom':'Tvättmaskinen är tom';
    if(this.drying){
      if(clothes.some(i=>i.clean!=='clean'))return 'Tvätta kläderna först';
      return clothes.some(i=>i.moisture==='wet')?null:'Tvätten är redan torr';
    }
    return clothes.some(i=>i.clean!=='clean')?null:'Tvätten är redan ren';
  }
  start(){
    if(this.startReason())return false;
    this.ids=this.inside().map(i=>i.id);this.left=this.seconds;this.state='running';this.life.dirty=true;
    sfx.click(this.panel.position);this.draw();this.sounds();return true;
  }
  finish(){
    const washed=[];
    for(const i of this.inside())if(this.ids.includes(i.id)){
      if(this.drying){if(i.clean!=='clean'||i.moisture!=='wet')continue;this.life.items.set(i,{moisture:'dry'});}
      else this.life.items.set(i,{clean:'clean',moisture:'wet',machine:{folded:false}});
      washed.push(i.id);
    }
    this.state='done';this.left=0;this.ids=[];this.life.dirty=true;
    this.life.emit(this.drying?'laundryDried':'laundryWashed',this.drying?{dried:washed}:{washed});this.life.say(this.drying?'Tvätten är torr':'Tvätten är klar och våt');sfx.pling(this.panel.position,.8);
  }
  cancel(){this.state='idle';this.left=0;this.ids=[];this.life.dirty=true;this.sounds();this.draw();}
  sounds(){
    if(this.state==='running'&&!this.sound)this.sound=(this.drying?sfx.fan(this.panel.position):sfx.dishwasher(this.panel.position))??null;
    if(this.state!=='running'&&this.sound){this.sound.stop();this.sound=null;}
  }
  draw(){
    const label=this.busy?`${this.state==='paused'?'Paus':this.drying?'Tork':'Tvätt'} ${Math.ceil(this.left)} s`:this.state==='done'?(this.drying?'Klart · torrt':'Klart · vått'):(this.drying?'▶ Torka':'▶ Tvätta');
    if(label===this.lastLabel)return;this.lastLabel=label;
    const g=this.canvas.getContext('2d');g.fillStyle='#263238';g.fillRect(0,0,256,64);g.fillStyle=this.state==='done'?'#98e6aa':this.state==='paused'?'#ffce7d':'#edf3f6';
    g.font='bold 30px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(label,128,32);this.texture.needsUpdate=true;
  }
  update(dt){
    if(this.state==='running'&&(this.door.isOpen||this.door.t>0)){this.state='paused';this.life.dirty=true;}
    else if(this.state==='paused'&&!this.door.isOpen&&this.door.t===0){this.state='running';this.life.dirty=true;}
    if(this.state==='running'&&Number.isFinite(dt)&&dt>0){this.left=Math.max(0,this.left-dt);this.life.dirty=true;if(this.left===0)this.finish();}
    this.sounds();this.draw();
  }
  save(){return {s:this.state,...(this.busy?{left:this.left,ids:[...this.ids]}:{})};}
  load(v){
    this.state=['running','paused','done'].includes(v?.s)?v.s:'idle';
    this.left=this.busy?(Number.isFinite(v?.left)?Math.max(.01,Math.min(this.seconds,v.left)):this.seconds):0;
    this.ids=this.busy&&Array.isArray(v?.ids)?[...new Set(v.ids.filter(id=>typeof id==='string'))]:[];
    this.sounds();this.draw();
  }
}

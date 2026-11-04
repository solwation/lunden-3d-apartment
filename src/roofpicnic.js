import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {ROOF_PICNIC as C,HOLD,DRINKS} from './config.js';
import {Glass} from './things.js';
import {heldItem} from './holdable.js';
import {restTarget} from './rest.js';
import {sfx} from './audio.js';

// #1858 extends actual Glass so ordinary held-category, toast and Keep paths apply.
export class PicnicGlass extends Glass {
 constructor(scene,camera,model,inner,index){
  super(scene,camera,{model,kind:'glass',name:'vinglaset på taket',back:'picknickfilten',inner});
  this.keepName=`roof-picnic-glass-${index}`;this.keepPos=new T.Vector3(index,0,0);this.outdoorPlace=true;
  this.contents.set('wine',C.wine);this.show();
 }
 goHome(){const a=this.contents&&{...this.contents.a},used=this.used;super.goHome();if(a){this.contents.a=a;this.used=used;this.show();}}
 keepState(){return{...super.keepState(),picnic:true,drinks:{...this.contents.a}};}
 loadKeep(s,shared){super.loadKeep(s,shared);if(s?.picnic&&s.drinks&&Object.entries(s.drinks).every(([k,v])=>DRINKS[k]&&Number.isFinite(v)&&v>=0)&&Object.values(s.drinks).reduce((a,b)=>a+b,0)<=1.00001){this.contents.a={...s.drinks};this.show();}}
}
const profile=[[.0001,.001],[.032,0],[.034,.003],[.004,.009],[.003,.078],[.012,.089],[.033,.118],[.035,.138],[.032,.165],[.028,.194],[.026,.194],[.030,.165],[.033,.138],[.031,.118],[.009,.091],[.0001,.088]];
const inner=[[.0001,.089],[.008,.092],[.019,.099],[.0305,.118],[.033,.138],[.0305,.165],[.0262,.190]];
function fabric(){const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');g.fillStyle=C.colors.cloth;g.fillRect(0,0,128,128);for(let i=0;i<128;i+=16){g.fillStyle=i%32?C.colors.accent:C.colors.stripe;g.globalAlpha=.6;g.fillRect(i,0,4,128);g.fillRect(0,i,128,4);}g.globalAlpha=.12;g.fillStyle='#fff';for(let i=0;i<128;i+=2){g.fillRect(i,0,1,128);g.fillRect(0,i,128,1);}const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;}
function glowTexture(){const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d'),r=g.createRadialGradient(32,32,1,32,32,32);r.addColorStop(0,'rgba(255,187,88,.28)');r.addColorStop(1,'rgba(255,150,55,0)');g.fillStyle=r;g.fillRect(0,0,64,64);return new T.CanvasTexture(c);}
export class RoofPicnic {
 constructor({scene,camera,world,life}){
  this.life=life;this.remaining=[C.portions,C.portions];this.object=new T.Group();this.object.name='roof-picnic';
  const roof=world.roofs.under(...C.at);if(!roof)throw Error('Picnic anchor must remain on an existing roof');this.roof=roof.surface;this.y=roof.y;
  this.object.position.set(C.at[0],this.y,C.at[1]);this.object.rotation.y=C.yaw;scene.add(this.object);this.object.updateMatrixWorld(true);
  const point=(x,y,z)=>this.object.localToWorld(new T.Vector3(x,y,z));this.point=point;
  const flat=[],add=(geo,color,list=flat)=>{geo=geo.index?geo.toNonIndexed():geo;geo.deleteAttribute('uv');const c=new T.Color(color),a=new Float32Array(geo.attributes.position.count*3);for(let i=0;i<a.length;i+=3){a[i]=c.r;a[i+1]=c.g;a[i+2]=c.b;}geo.setAttribute('color',new T.BufferAttribute(a,3));list.push(geo);};
  const box=(w,h,d,x,y,z,col,list)=>add(new T.BoxGeometry(w,h,d).translate(x,y+h/2,z),col,list);
  const batch=(list,name,parent=this.object,material=new T.MeshStandardMaterial({vertexColors:true,roughness:.85}))=>{const m=new T.Mesh(mergeGeometries(list),material);m.name=name;m.receiveShadow=true;parent.add(m);for(const g of list)g.dispose();return m;};
  const blanket=new T.Mesh(new T.BoxGeometry(C.blanket[0],C.lift,C.blanket[1]),new T.MeshStandardMaterial({map:fabric(),roughness:1}));blanket.position.y=C.lift/2;blanket.name='picnic-blanket';blanket.receiveShadow=true;this.object.add(blanket);
  // Cushions lift the hips; existing long-sit pose keeps both legs supported on the blanket.
  for(const[x,z]of C.seats)box(C.cushion[0],C.cushion[1],C.cushion[2],x,C.lift,z,C.colors.pillow);
  const [bx,by,bz]=C.board;box(...C.boardSize,bx,C.lift+by,bz,C.colors.wood);
  batch(flat,'picnic-fittings');
  const pick=new T.Mesh(new T.BoxGeometry(...[C.blanket[0],.06,C.blanket[1]]),new T.MeshBasicMaterial());pick.visible=false;pick.position.copy(point(0,C.lift,0));pick.rotation.y=C.yaw;scene.add(pick);
  const look=this.object.worldToLocal(new T.Vector3(C.look[0],this.y+.3,C.look[1]));
  pick.userData.rest={kind:'sit',name:'picknickfilten',verb:'sätta dig på',spots:C.seats.map(([x,z])=>({x,y:C.lift+C.cushion[1],z,legsUp:true,dir:[0,-1],look:[look.x,look.z,look.y]}))};
  this.seat=restTarget(pick,{x:C.at[0],z:C.at[1],level:0},this.y);this.seat.id='roof-picnic-seat';pick.userData.door=this.seat;world.furnitureTargets.push(this.seat);
  this.glasses=C.glasses.map(([x,z],i)=>{const m=new T.Mesh(new T.LatheGeometry(profile.map(([r,y])=>new T.Vector2(r,y)),18),new T.MeshStandardMaterial({color:0xf1f8f8,roughness:.08,transparent:true,opacity:.3,depthWrite:false,side:T.DoubleSide}));m.position.copy(point(x,C.lift+.005,z));scene.add(m);return new PicnicGlass(scene,camera,m,inner,i);});
  this.food=[];this.foodTargets=[];
  for(let k=0;k<2;k++){
   const portions=new T.Group();portions.name=k?'picnic-charcuterie':'picnic-cheese';this.object.add(portions);const cells=[];
   for(let i=0;i<C.portions;i++){const list=[],x=bx+(k?.14:-.14)+(i%3-.8)*.07,z=bz+(Math.floor(i/3)-.5)*.08,y=C.lift+by+C.boardSize[1]+.004;
    if(k){const g=new T.CylinderGeometry(.043,.043,.008,12).translate(x,y+.004,z);add(g,C.colors.salami,list);for(let j=0;j<5;j++)add(new T.CylinderGeometry(.004,.004,.001,5).translate(x+Math.cos(j*2)*.023,y+.0085,z+Math.sin(j*2)*.023),C.colors.fat,list);}
    else{box(.055,.018,.045,x,y,z,C.colors.cheese,list);box(.055,.004,.045,x,y,z,C.colors.rind,list);}
    cells.push(batch(list,`picnic-portion-${k}-${i}`,portions));
   }
   const geometry=mergeGeometries(cells.map(m=>m.geometry)),mesh=new T.Mesh(geometry,cells[0].material);mesh.name=portions.name;portions.add(mesh);
   for(const m of cells){portions.remove(m);m.geometry.dispose();if(m.material!==mesh.material)m.material.dispose();}
   this.food.push({mesh,perPortion:geometry.attributes.position.count/C.portions});
   const at=point(bx+(k?.16:-.16),C.lift+by+.06,bz),p=new T.Mesh(new T.BoxGeometry(.3,.12,.38),new T.MeshBasicMaterial());p.position.copy(at);p.rotation.y=C.yaw;p.visible=false;scene.add(p);
   const target={kind:'life',name:k?'charken på brickan':'osten på brickan',id:`roof-picnic-food-${k}`,pickable:p,position:at};p.userData.door=target;this.foodTargets.push(target);
   life.actions.define({id:`picnicBite${k}`,order:0,duration:C.biteSeconds,label:k?'äta en skiva chark':'äta en bit ost',applies:c=>c.raw===target,
    check:c=>c.heldView?'Lägg ifrån dig glaset först':this.remaining[k]<=0?'Det finns inget kvar':camera.position.distanceTo(at)>HOLD.reach?'För långt bort':null,
    commit:()=>{this.remaining[k]--;this.refresh();life.dirty=true;sfx.chew(at,.7);life.emit('bite',{type:k?'picnicCharcuterie':'picnicCheese',amount:1});return 1;},
    consumes:'one finite picnic portion',result:'one existing bite event; no new score/stat reward'});
   target.options=()=>life.options(target);Object.defineProperties(target,{blocked:{get:()=>!target.options().some(a=>!a.reason)},blockedText:{get:()=>target.options().find(a=>a.reason)?.reason??''}});
  }
  life.keepPart('roofPicnic',{save:()=>({v:1,remaining:[...this.remaining]}),load:s=>{if(s?.v===1&&Array.isArray(s.remaining)&&s.remaining.length===2&&s.remaining.every(n=>Number.isInteger(n)&&n>=0&&n<=C.portions)){this.remaining=[...s.remaining];this.refresh();}}});
  this.night=new T.Group();this.night.name='picnic-night-lanterns';this.object.add(this.night);const metal=[],wax=[];
  for(const[x,z]of C.lanterns){const r=C.lanternRadius,h=C.lanternHeight;box(r*2,.025,r*2,x,0,z,C.colors.metal,metal);box(r*2,.025,r*2,x,h,z,C.colors.metal,metal);for(const a of[-1,1])for(const b of[-1,1])box(.012,h,.012,x+a*r,0,z+b*r,C.colors.metal,metal);add(new T.TorusGeometry(r*.5,.008,4,12).translate(x,h+r*.5,z),C.colors.metal,metal);add(new T.CylinderGeometry(r*.5,r*.5,h*.45,10).translate(x,h*.27,z),C.colors.wax,wax);add(new T.IcosahedronGeometry(.025,1).scale(.5,1,.5).translate(x,h*.55,z),C.colors.glow,wax);}
  batch(metal,'picnic-lantern-cages',this.night);batch(wax,'picnic-candles',this.night,new T.MeshStandardMaterial({vertexColors:true,emissive:C.colors.glow,emissiveIntensity:.85}));
  const gg=new T.PlaneGeometry(C.glowRadius*2,C.glowRadius*2).rotateX(-Math.PI/2),gm=new T.MeshBasicMaterial({map:glowTexture(),transparent:true,depthWrite:false,blending:T.AdditiveBlending});
  for(const[x,z]of C.lanterns){const m=new T.Mesh(gg,gm);m.position.set(x,C.lift+.002,z);this.night.add(m);}
  this.update(1,camera.position);
 }
 refresh(){for(let k=0;k<2;k++)this.food[k].mesh.geometry.setDrawRange(0,this.remaining[k]*this.food[k].perPortion);}
 targets(){return[this.seat,...this.foodTargets,...this.glasses.filter(g=>!g.held).map(g=>g.target)];}
 update(daylight,position){this.object.visible=position.distanceTo(this.object.position)<C.drawDist;this.night.visible=daylight<C.nightAt;}
}

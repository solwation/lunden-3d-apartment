import { BED_CARE as P } from './config.js';
import { heldItem } from './holdable.js';
import { chooseSpot } from './rest.js';

// Original merged geometry stays intact at rest; only marked duvet vertices are
// displaced after lying down. Stable bed/berth ids share Life's normal saved extras.
export class BedCare {
  constructor(life,world,rest,onLie){
    Object.assign(this,{life,rest,units:[],byTarget:new Map()});
    for(const piece of world.furniture.movable.filter(p=>p.object.userData.bedCareCount)){
      const target=piece.object.userData.interact,geos=[];
      piece.object.traverse(m=>{if(m.isMesh&&m.geometry.attributes.bedCare)geos.push({geo:m.geometry,base:m.geometry.attributes.position.array.slice(),norm:m.geometry.attributes.normal.array.slice()});});
      for(let k=0;k<piece.object.userData.bedCareCount;k++){
        const sections=geos.map(s=>({...s,indices:Array.from(s.geo.attributes.bedCare.array).flatMap((v,i)=>v===k+1?[i]:[])})).filter(s=>s.indices.length);
        const zs=sections.flatMap(s=>s.indices.map(i=>s.base[i*3+2])),z0=Math.min(...zs),z1=Math.max(...zs);
        const unit={id:`${piece.id}:bed:${k}`,index:k,made:true,piece,restTarget:target,sections,preview:strength=>{
          for(const {geo,base,norm,indices} of sections){const pos=geo.attributes.position,normal=geo.attributes.normal;for(const i of indices){const x=base[i*3],y=base[i*3+1],z=base[i*3+2],wave=.5+.5*Math.sin(x*P.waveX+z*P.waveZ);
            pos.setXYZ(i,x,y+P.height*wave*strength,z+P.pull*(z1-z)/Math.max(.01,z1-z0)*strength);
            if(!strength)normal.setXYZ(i,norm[i*3],norm[i*3+1],norm[i*3+2]);
            else {const bend=.5*P.height*Math.cos(x*P.waveX+z*P.waveZ)*strength,ny=norm[i*3+1],nx=norm[i*3]-bend*P.waveX*ny,nz=(norm[i*3+2]-bend*P.waveZ*ny)/(1-P.pull/Math.max(.01,z1-z0)*strength),length=Math.hypot(nx,ny,nz);normal.setXYZ(i,nx/length,ny/length,nz/length);}
          }pos.needsUpdate=normal.needsUpdate=true;geo.computeBoundingBox();geo.computeBoundingSphere();}
        }};
        unit.apply=made=>{unit.made=made;unit.preview(made?0:1)};
        const name=piece.object.userData.bedCareCount===2?(k?'överslafen':'underslafen'):target.name,raw=unit.target={kind:'life',name,bedCare:unit,pickable:piece.object,outlineRoot:piece.object};
        raw.options=()=>[...life.options(raw),{id:'bedLie',label:`lägga dig i ${name}`,reason:target.blocked?target.blockedText:null,run:()=>onLie(target)}];raw.toggle=()=>life.run(raw);
        this.units.push(unit);const list=this.byTarget.get(target)??[];list.push(unit);this.byTarget.set(target,list);
      }
    }
    rest.onBegin=(target,spot)=>{if(spot.kind!=='lie')return;const units=this.byTarget.get(target);const unit=units?.length===1?units[0]:units?.find(u=>u.index===target.spots.indexOf(spot));if(unit){unit.apply(false);life.dirty=true;life.emit('bedRumpled',{id:unit.id});}};
    life.keepPart('beds',{save:()=>this.units.filter(u=>!u.made).map(u=>u.id),load:v=>{const ids=new Set(Array.isArray(v)?v:[]);for(const u of this.units)u.apply(!ids.has(u.id));}});
    life.actions.define({id:'makeBed',order:0,duration:P.seconds,label:c=>`bädda ${c.raw.name}`,applies:c=>!!c.raw.bedCare,
      check:c=>heldItem()?'Lägg ifrån dig det du håller':rest.active?'Res dig först':c.raw.bedCare.made?'Sängen är redan bäddad':null,
      animate:(c,k)=>c.raw.bedCare.preview(1-k),commit:c=>{const u=c.raw.bedCare;u.apply(true);life.dirty=true;life.emit('bedMade',{id:u.id});},cancel:c=>c.raw.bedCare.preview(c.raw.bedCare.made?0:1),
      consumes:'nothing',result:'the same marked duvet returns to its original made geometry'});
  }
  aim(target,ray){
    if(heldItem()||this.rest.active)return null;const units=this.byTarget.get(target);if(!units)return null;
    const spot=chooseSpot(target,ray,null);if(spot?.kind!=='lie')return null;
    const unit=units.length===1?units[0]:units.find(u=>u.index===target.spots.indexOf(spot));return unit&&!unit.made?unit.target:null;
  }
}

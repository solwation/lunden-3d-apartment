import test from 'node:test';
import assert from 'node:assert/strict';
import { avatarModelGeometry } from '../src/avatar.js';
import { avatarLook } from '../src/config.js';
import { bindAt } from '../src/olof.js';
const baseline=[[11172,3586212],[11940,3832740],[11532,3701772],[12456,3998376],[16092,5165532]];
test('#2002 all five hairstyles retain bounded resources, normalized weights and semantic head roles',()=>{
 for(let style=0;style<5;style++){
  const g=avatarModelGeometry({...avatarLook('2002-base'),style,facial:0}),a=g.attributes;
  assert(a.position.count/3<=baseline[style][0]*1.1);assert(Object.values(a).reduce((n,v)=>n+v.array.byteLength,0)<=baseline[style][1]*1.1);
  assert.equal(Object.keys(a).length,17,'no additional retained attributes');
  for(let i=0;i<a.position.count;i++){
   assert(Number.isFinite(a.position.getX(i)+a.position.getY(i)+a.position.getZ(i)+a.normal.getX(i)+a.normal.getY(i)+a.normal.getZ(i)));
   assert(Math.abs(a.skinWeight.getX(i)+a.skinWeight.getY(i)+a.skinWeight.getZ(i)+a.skinWeight.getW(i)-1)<1e-5);
   if(a.facePart.getX(i)>0&&a.facePart.getX(i)<18)assert.equal(a.suitRole.getX(i),2);
   assert(a.mouth.getX(i)>=0&&a.mouth.getX(i)<=1);assert(a.pucker.getX(i)>=0&&a.pucker.getX(i)<=1);
  }g.dispose();
 }
});
test('#2002 lips face outward and a real upper/lower opening and pucker survive all beard variants',()=>{
 const hb=bindAt('head');
 for(let facial=0;facial<4;facial++){
  const g=avatarModelGeometry({...avatarLook('2002-mouth'),style:0,facial}),a=g.attributes;let upper=0,lower=0,outward=0;
  for(let i=0;i<a.position.count;i++)if(a.region.getX(i)===6){
   const y=a.position.getY(i)-hb.y;
   if(y>.046&&a.mouth.getX(i)===0)upper++;if(y<.04&&a.mouth.getX(i)>.5)lower++;
   if(a.normal.getZ(i)>.5)outward++;
   assert.equal(a.facePart.getX(i),11,'lip surfaces hide below the suit cowl');
   assert(a.pucker.getX(i)>.9,'the lip surface follows the kiss');
  }
  assert(upper>20&&lower>20&&outward>100,'actual lip surfaces and opening, not only uniforms');g.dispose();
 }
});
test('#2002 both ear surfaces have a recessed concha and an outward folded rim within the accessory envelope',()=>{
 const g=avatarModelGeometry({...avatarLook('2002-ear'),style:0}),a=g.attributes,hb=bindAt('head');
 for(const side of[-1,1]){
  const ear=[];for(let i=0;i<a.position.count;i++)if(a.facePart.getX(i)===5&&Math.sign(a.position.getX(i))===side)ear.push(i);
  const x=ear.map(i=>side*a.position.getX(i));assert(ear.length>100);assert(Math.max(...x)-Math.min(...x)>.014,'folded depth');
  assert(Math.max(...ear.map(i=>a.position.getY(i)-hb.y))<.125);assert(Math.min(...ear.map(i=>a.position.getY(i)-hb.y))>.065);
  assert(ear.some(i=>side*a.normal.getX(i)>.8),'the exposed ear faces outward');
 }g.dispose();
});
test('#2002 kissing lip skin-band outer edge follows the muzzle instead of detaching with the whole lip',()=>{
 const g=avatarModelGeometry({...avatarLook('2002-mouth'),style:0,facial:0}),a=g.attributes;
 const band=[];for(let i=0;i<a.position.count;i++)if(a.region.getX(i)===0&&a.facePart.getX(i)===11)band.push(a.pucker.getX(i));
 assert(band.length>50);assert(band.some(v=>v===1),'inner edge follows the lip');assert(band.some(v=>v<.97),'outer edge follows the face');
 assert(!a.lipFollow,'construction-only follow weights do not add retained attributes');g.dispose();
});
// #2012: finer hair/beard forms stay within +10% of the published #2002 result per variant, and long hair has no join
const v2012=[['s0f0',11700],['s0f1',12056],['s0f2',11724],['s0f3',12052],['s1f0',12428],['s2f0',12060],['s3f0',13096],['s4f0',17012]];
test('#2012 hairstyle and facial-hair variants stay within +10% of the #2002 triangles',()=>{
 for(const[key,tris]of v2012){const style=+key[1],facial=+key[3];
  const g=avatarModelGeometry({...avatarLook('2012-'+style),style,facial,gender:style%2});
  assert(g.attributes.position.count/3<=tris*1.1,`${key}: ${g.attributes.position.count/3} > ${tris}×1.1`);g.dispose();}
});
test('#2012 long hair: the scalp and curtain share one normal wherever they meet (no visible join)',()=>{
 const g=avatarModelGeometry({...avatarLook('2012-long'),style:1,facial:0,gender:1}),a=g.attributes,hb=bindAt('head'),seen=new Map();let shared=0;
 for(let i=0;i<a.position.count;i++){if(a.region.getX(i)!==3)continue;
  const y=a.position.getY(i)-hb.y;if(y>0.17)continue; // below the crown's pole
  const k=[a.position.getX(i),a.position.getY(i),a.position.getZ(i)].map(v=>Math.round(v*1e5)).join(),n=[a.normal.getX(i),a.normal.getY(i),a.normal.getZ(i)];
  const m=seen.get(k);if(!m){seen.set(k,n);continue;}
  const dot=m[0]*n[0]+m[1]*n[1]+m[2]*n[2];if(dot<0)continue; // the curtain's inner (back-facing) surface
  shared++;assert(dot>0.999,`normal break at ${k}: ${dot}`);}
 assert(shared>20,'the curtain joins the scalp at shared positions');g.dispose();
});

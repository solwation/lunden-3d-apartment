import test from 'node:test';
import { teethExtraTriangles } from '../src/avatarteeth.js';
import { glassesExtraTriangles } from '../src/avatarglasses.js'; // #2173
import assert from 'node:assert/strict';
import { avatarModelGeometry } from '../src/avatar.js';
import { avatarLook } from '../src/config.js';
import { bindAt } from '../src/olof.js';
import { AVATAR_FLYAWAY, AVATAR_HAIR, AVATAR_CONTOUR, AVATAR_SURFACE, AVATAR_EAR } from '../src/config.js';
import { isFlyaway } from '../src/avatarflyaway.js';
import { contourRows } from '../src/avatarcontour.js';
import { noseTriangles } from '../src/avatarnose.js';
import { longHairTris } from '../src/avatarlonghair.js';
import { trainerTriangles } from './avatartrainerextra.mjs'; // #2116: #2084's trainer details have their own budget (avatartrainerstest)
import { shortHairTriangles } from '../src/avatarshorthair.js'; // #2055: the locks and the wound bun have their own +10 % head budget (avatarshorthairtest)
// (#2045: the eyes' growth over #2033's 608 triangles has its own budget in tools/avatarlidstest.mjs, so it is left out here like the flyaways)
const eyeExtra=(a)=>{let n=0;for(let i=0;i<a.position.count;i++){const f=a.facePart.getX(i);if(f===3||f===26)n++;}return Math.max(0,n-608*3);};
const flyVerts=(a)=>{let n=0;for(let i=0;i<a.position.count;i++)if(isFlyaway(a,i,7,11))n++;return n+eyeExtra(a);};
// #2043: the head contour's own triangles (its own +10 % head budget below) are left out of the older whole-figure budgets:
// extra head rings and chin rings × 2·headSides, and the 16-sided open neck in place of the 8-sided capped cylinder (32)
const contour2043=(AVATAR_CONTOUR.rings.length+AVATAR_CONTOUR.chin.angles.length)*2*AVATAR_SURFACE.headSides+(AVATAR_CONTOUR.neck.rings.length-1)*2*AVATAR_CONTOUR.neck.sides-32;
// #2047: the formed ears' extra triangles (their own +10 % head budget below) are left out the same way: a fan round the concha and
// (front rings + rolled edge + rim back + back rings − 1) bands per ear, against the 384 of the old folded disc pair
const earTris=AVATAR_EAR.cols*(1+2*(AVATAR_EAR.rings.length+1+AVATAR_EAR.back.length)),ear2047=2*earTris-384;
// #2053: long hair's locks (their own +10 % head budget in tools/avatarlonghairtest.mjs) are left out the same way: the curtain's triangles
// over the sheet pair before it (2 surfaces × 24 columns × 8 rows × 2)
const long2053=(style)=>style===1?longHairTris(24)-4*24*AVATAR_HAIR.long.rows:0;
const nose2048=noseTriangles(contourRows(AVATAR_SURFACE.head,AVATAR_SURFACE.nosePatch.rings)); // #2048: the nose's finer grid has its own +10 % budget (avatarnosetest)
// #2054: curly hair's curl volumes (src/avatarcurls.js) have their own +10 % head budget (avatarcurlstest): their triangles less the 5040 of
// the #1377 tubes they replace are left out the same way (a curl vertex carries its clump's centre, y > 0.5, as its faceAnchor)
const curl2054=(a)=>{let n=0;for(let i=0;i<a.position.count;i++)if(a.facePart.getX(i)===7&&a.faceAnchor.getY(i)>0.5&&a.faceAnchor.getZ(i)<0.5)n++;return n?n/3-5040:0;};
const baseline=[[11172,3586212],[11940,3832740],[11532,3701772],[12456,3998376],[16092,5165532]];
test('#2002 all five hairstyles retain bounded resources, normalized weights and semantic head roles',()=>{
 for(let style=0;style<5;style++){
  const g=avatarModelGeometry({...avatarLook('2002-base'),style,facial:0}),a=g.attributes,keep=1-(flyVerts(a)+3*(contour2043+ear2047+nose2048+long2053(style)+curl2054(a)+shortHairTriangles(style)+trainerTriangles+teethExtraTriangles()+glassesExtraTriangles()))/a.position.count; // (#2040: the flyaways have their own budget below; #2045: the eyes theirs; #2047: the ears theirs; #2048: the nose its)
  assert(a.position.count*keep/3<=baseline[style][0]*1.1);assert(Object.values(a).reduce((n,v)=>n+v.array.byteLength,0)*keep<=baseline[style][1]*1.1);
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
  const own=(g.attributes.position.count-flyVerts(g.attributes))/3-contour2043-ear2047-nose2048-long2053(style)-curl2054(g.attributes)-shortHairTriangles(style)-trainerTriangles-glassesExtraTriangles();assert(own<=tris*1.1,`${key}: ${own} > ${tris}×1.1`);g.dispose();}
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
// #2040: flyaway strands stay within their stated budget, are zero-width ribbons in the bind pose (no CPU raycast/headshot surface), carry the
// hair's / beard's own region and face part, keep a unit tangent as their normal and leave head strands above the hat line hidden under a hat
test('#2040 flyaways: budget, zero-width bind ribbons, roles and the hat flag',()=>{
 const hb=bindAt('head');
 for(const[style,facial,gender]of[[0,0,0],[0,1,0],[0,2,0],[0,3,0],[1,0,1],[2,0,0],[3,0,1],[4,0,0]]){
  const g=avatarModelGeometry({...avatarLook('2040-'+style),style,facial,gender}),a=g.attributes,kinds=new Set();let fly=0;
  for(let i=0;i<a.position.count;i+=3){
   const f=[i,i+1,i+2].map(k=>isFlyaway(a,k,7,11));if(!f[0]&&!f[1]&&!f[2])continue;
   assert(f[0]&&f[1]&&f[2],'whole triangles');fly++;
   const p=[i,i+1,i+2].map(k=>[a.position.getX(k),a.position.getY(k),a.position.getZ(k)]);
   const u=p[1].map((v,j)=>v-p[0][j]),w=p[2].map((v,j)=>v-p[0][j]);
   assert(Math.hypot(u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0])<1e-12,'zero area in the bind pose');
   for(const k of[i,i+1,i+2]){
    const kind=a.faceAnchor.getZ(k),beard=kind===3;kinds.add(kind);
    assert.equal(a.region.getX(k),beard?8:3);assert.equal(a.facePart.getX(k),beard?11:7);
    assert(Math.abs(Math.hypot(a.normal.getX(k),a.normal.getY(k),a.normal.getZ(k))-1)<1e-3,'unit tangent');
    if(kind===2)assert(a.position.getY(k)-hb.y<AVATAR_HAIR.centre[1]-0.05+1e-6,'a strand left visible under a hat stays below the hat line');
   }
  }
  assert(fly<=AVATAR_FLYAWAY.budget,`s${style}f${facial}: ${fly} flyaway triangles > ${AVATAR_FLYAWAY.budget}`);
  if(style!==3)assert(fly>=100,`s${style}f${facial}: only ${fly} flyaway triangles`);else assert.equal(fly,facial?fly:0);
  if(facial===1||facial===3)assert(kinds.has(3),'beard strands');
  if(style===1)assert(kinds.has(2),'long hair keeps strands below a hat');
  g.dispose();
 }
});
// #2043: the smoother head contour stays within +10 % of the head's triangles before it (b5cb5c95, every head-bone part incl. the
// collapsed accessories), the chin's underside is a dome below the authored lowest ring, and the neck is one closed-round smooth column
const head2043=[['s0f0',6604],['s0f1',7492],['s0f3',7568],['s1f0',7524],['s2f0',6940],['s3f0',7632],['s4f0',12220]];
test('#2043 head contour: budget, rounded chin underside and a smooth neck',()=>{
 const hb=bindAt('head');
 for(const[key,tris]of head2043){const style=+key[1],facial=+key[3];
  const g=avatarModelGeometry({...avatarLook('cnt'),style,facial,gender:style%2}),a=g.attributes;let head=0;
  for(let i=0;i<a.position.count;i+=3){const f=a.facePart.getX(i);if(f>0&&f<30)head++;}
  // the +10 % is #2043's own step budget (#2042): later round-4 steps (brows #2046, …) carry their own budgets
  assert(contour2043<=tris*0.1&&head>=tris,`${key}: contour +${contour2043} > ${tris}×0.1 (head ${head})`);g.dispose();}
 const g=avatarModelGeometry({...avatarLook('2043'),style:0,facial:0,gender:0}),a=g.attributes,low=AVATAR_SURFACE.head[0][0];
 let bottom=Infinity,neck=0;const normals=new Map();
 for(let i=0;i<a.position.count;i++){
  const y=a.position.getY(i)-hb.y;
  if(a.rifleSkull.getX(i)&&a.facePart.getX(i)===1){bottom=Math.min(bottom,y);if(y<low-1e-6)assert(a.rifleJaw.getX(i),'the rounded chin is jaw for the rifle');}
  if(a.facePart.getX(i)===2){neck++;const k=[a.position.getX(i),a.position.getY(i),a.position.getZ(i)].map(v=>v.toFixed(5)).join(),n=[a.normal.getX(i),a.normal.getY(i),a.normal.getZ(i)];
   if(normals.has(k)){const m=normals.get(k);assert(m[0]*n[0]+m[1]*n[1]+m[2]*n[2]>0.9999,'one normal per neck vertex (no seam or facet)');}else normals.set(k,n);}
 }
 assert(Math.abs(bottom-(low-AVATAR_CONTOUR.chin.depth))<1e-4,`the chin's underside reaches ${bottom}, not a flat cap at ${low}`);
 assert.equal(neck/3,(AVATAR_CONTOUR.neck.rings.length-1)*2*AVATAR_CONTOUR.neck.sides);g.dispose();
});
// #2047: the formed ear stays within +10 % of the head's triangles before it (1fe1aba1, every head-bone part; later steps such as the
// #2045 eyes grow the head on their own budgets), stands out from the head
// at its upper back (angled out, readable from the front), keeps the old height envelope, and the earrings sit on the lobe's outer face
const head2047=[['s0f0',7268],['s0f1',8156],['s0f3',8232],['s1f0',8188],['s2f0',7604],['s3f0',8296],['s4f0',12884]];
test('#2047 ear: budget, angled out from the head, lobe holds the earrings',()=>{
 for(const[key,tris]of head2047){const style=+key[1],facial=+key[3];
  const g=avatarModelGeometry({...avatarLook('ear'),style,facial,gender:style%2}),a=g.attributes;let head=0,ear=0;
  for(let i=0;i<a.position.count;i+=3){const f=a.facePart.getX(i);if(f>0&&f<30)head++;if(f===5)ear++;}
  assert.equal(ear,2*earTris);assert(ear2047<=tris*0.1&&head-ear2047>=tris,`${key}: ear +${ear2047} > ${tris}×0.1 (head ${head})`);g.dispose();}
 const g=avatarModelGeometry({...avatarLook('ear'),style:0,facial:0,gender:1,earrings:1}),a=g.attributes,hb=bindAt('head');
 for(const side of[-1,1]){
  const ear=[],stud=[];
  for(let i=0;i<a.position.count;i++){const p=[a.position.getX(i)-hb.x,a.position.getY(i)-hb.y,a.position.getZ(i)-hb.z];if(Math.sign(p[0])!==side)continue;
   if(a.facePart.getX(i)===5)ear.push(p);if(a.facePart.getX(i)===21)stud.push(p);}
  const out=(q)=>side*q[0],upperBack=ear.filter(q=>q[1]>.1&&q[2]<-.004),front=ear.filter(q=>q[1]>.08&&q[1]<.11&&q[2]>.008);
  assert(Math.max(...ear.map(out))>.111,'the helix stands well off the head (the old disc reached 0.105)');
  assert(Math.max(...upperBack.map(out))>Math.max(...front.map(out))+.008,'angled out: the upper back stands further out than the front edge');
  assert(Math.min(...ear.map(q=>q[1]))>.065&&Math.max(...ear.map(q=>q[1]))<.125,'the old height envelope (hats, headphones, hair)');
  const c=[0,1,2].map(j=>stud.reduce((n,q)=>n+q[j],0)/stud.length),near=ear.reduce((m,q)=>Math.min(m,Math.hypot(q[0]-c[0],q[1]-c[1],q[2]-c[2])),1);
  assert(near<.0045,`the stud sits on the lobe (${near.toFixed(4)} m from its surface)`);assert(c[1]<.085,'on the lobe, not the concha');
 }g.dispose();
});

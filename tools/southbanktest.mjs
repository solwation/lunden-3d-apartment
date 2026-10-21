import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SOUTH_BANK as S,SITE,SOUTH_PLATEAU} from '../src/config.js';
import {southBankGround,southBankCentre} from '../src/southbank.js';
import {groundY,groundBelowDeckY,buildingPadList} from '../src/surroundings.js';
import {buildRiverBridges,bridgeRecords,deckAt,deckUnderAt} from '../src/riverbridge.js';
const source=JSON.parse(readFileSync(new URL('../docs/references/elevation-hoje-a/point-api-south-road-2026-10-19.json',import.meta.url)));
const near=(a,b,e=1e-8)=>assert(Math.abs(a-b)<e,`${a} versus ${b}`);

test('road and cross-section controls retain the sourced ground values and approximate registration',()=>{
 assert.equal(S.road.length,11);assert.equal(S.cross.length,5);
 for(const[x,z,y]of S.road){const q=source.points.find(p=>p.group==='road'&&p.x===x&&p.z===z);assert(q);near(y,q.response.hojd_m-14.36);}
 for(const[z,c,points]of S.cross)for(const[dx,y]of points){const q=source.points.find(p=>p.group==='cross'&&Math.abs(p.x-c-dx)<1e-7&&p.z===z);assert(q);near(y,q.response.hojd_m-14.36);}
 assert(source.registration.horizontalAccuracyM.includes('3–5'));assert.equal(SITE.bridges.deckY,-3);
});
test('the sampled crest is continuous and rises to the plateau without the former false descent',()=>{
 for(const[x,z,y]of S.road.filter(p=>p[1]>=S.full))near(groundY(x,z),y);
 let last=groundY(southBankCentre(S.start),S.start),step=0;
 for(let z=S.start+.02;z<=S.fade[0];z+=.02){const y=groundY(southBankCentre(z),z);assert(y>=last-1e-6,`descent at ${z}: ${last} to ${y}`);step=Math.max(step,Math.abs(y-last));last=y;}
 assert(step<.014,`walkable continuous road step ${step} per2cm`);
});
test('both actual bank sides are lower than the road, with separately sourced profiles',()=>{
 for(const z of [155,165,180]){const x=southBankCentre(z),top=groundY(x,z),west=groundY(x-20,z),east=groundY(x+20,z);assert(top-west>3);assert(top-east>2);assert(Math.abs(west-east)>.1);}
});
test('the bank is shaped before existing southern building pads and aprons',()=>{
 const pads=new Map(buildingPadList().map(p=>[p.name,p]));let affected=0;
 const inside=(x,z,ring)=>{let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++)if((ring[i][1]>z)!==(ring[j][1]>z)&&x<(ring[j][0]-ring[i][0])*(z-ring[i][1])/(ring[j][1]-ring[i][1])+ring[i][0])yes=!yes;return yes;};
 for(const side of ['west','east','north','south'])for(const b of SITE[side].buildings){
  const pad=pads.get(b.name);if(!pad)continue;const ring=b.polygon.slice(0,-1),xs=ring.map(p=>p[0]),zs=ring.map(p=>p[1]);
  for(let x=Math.min(...xs)+.25;x<=Math.max(...xs);x+=1)for(let z=Math.min(...zs)+.25;z<=Math.max(...zs);z+=1){
   if(!inside(x,z,ring)||Math.abs(southBankGround(x,z,()=>pad.level)-pad.level)<.001)continue;
   affected++;near(groundBelowDeckY(x,z),pad.level,1e-8);
  }
 }
 assert(affected>=100,`sampled all bank-affected source-pad points (${affected})`);
 const padByName=new Map([...SITE.south.buildings].map(b=>[b.name,pads.get(b.name)]));
 for(const name of ['Sankt Lars väg 41','Sankt Lars väg 45']){
  const b=SITE.south.buildings.find(q=>q.name===name),pad=padByName.get(name),ring=b.polygon.slice(0,-1);
  for(let i=0;i<ring.length;i++){const a=ring[i],c=ring[(i+1)%ring.length];for(let k=0;k<=20;k++){const t=k/20,x=a[0]+(c[0]-a[0])*t,z=a[1]+(c[1]-a[1])*t;near(groundBelowDeckY(x,z),pad.level,1e-8);}}
 }
 near(groundY(-35.42,267.93),1.83,1e-8);
});
test('bounded fades and the flat-crest edge have no discrete jumps; unsupported ground stays exact',()=>{
 const base=(x,z)=>Math.sin(x/30)-z/80;
 for(const z of [-100,100,S.start,S.fade[1],400])for(let x=-300;x<300;x+=3)assert.equal(southBankGround(x,z,base),base(x,z));
 for(const z of [150,165,210,248,262,280])for(const dx of [-45,-30,-5,-4,0,4,5,30,45]){const x=southBankCentre(z)+dx;assert(Math.abs(southBankGround(x-1e-6,z,base)-southBankGround(x+1e-6,z,base))<1e-4);}
 for(const[x,z,y]of SOUTH_PLATEAU.points)near(groundY(x,z),y);
});
test('both bridge decks, undersides and concrete/steel geometry retain their explicitly assumed datum',()=>{
 const a=buildRiverBridges(),b=buildRiverBridges(groundY);
 for(const kind of ['concrete','steel','water'])assert.deepEqual(b.getObjectByName('bridges-'+kind).geometry.attributes.position.array,a.getObjectByName('bridges-'+kind).geometry.attributes.position.array);
 for(const r of bridgeRecords){near(deckAt(r.x,r.z),-3);near(deckUnderAt(r.x,r.z),-3-r.slab);assert(groundBelowDeckY(r.x,r.z)<-4);const[x,z]=r.ends[1];near(groundY(x,z),groundY(x,z+.001),.01);}
 const v=b.getObjectByName('bridges-asphalt').geometry.attributes.position;let n=0;
 for(let i=0;i<v.count;i++){const x=v.getX(i),z=v.getZ(i);if(z>147&&z<165&&x<22){n++;near(v.getY(i),groundY(x,z)+.025,1e-5);}}
 assert(n>0,'the actual emitted GC approach follows the terrain');
 for(const g of [a,b])g.traverse(o=>o.geometry?.dispose());
});

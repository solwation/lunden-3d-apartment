// Run from repo root. Real production prototypes; no scene/browser/Worker construction.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
globalThis.addEventListener=()=>{};
globalThis.location={search:''};
const {Combat}=await import('../../../src/combat.js');
const {Ghosts}=await import('../../../src/ghosts.js');
const THREE=await import('three');
const source=fs.readFileSync('tools/combattest.cjs','utf8');
const start=source.indexOf('    const firedBefore =');
const end=source.indexOf('    check(await B.page.evaluate(() => document.getElementById(\'lives\')',start);
assert.ok(start>=0&&end>start);
const run=new Function('A','B','sleep','check',`return (async()=>{${source.slice(start,end)}})()`);
const make=()=>{
 const sent=[],g=Object.assign(Object.create(Ghosts.prototype),{me:'me',outbox:[],shots:12,messages:0,dropped:0,lastSent:-Infinity,sent:'same',prev:'same',sentAv:0,avatarCode:0,stateAt:0,rules:{weapons:{nerf:{range:1}}},others:new Map(),ws:{readyState:1,send:m=>sent.push(JSON.parse(m))}});
 const c=Object.assign(Object.create(Combat.prototype),{ghosts:g,camera:new THREE.PerspectiveCamera(),nerfPending:[],fired:7,hurts:0,seen:0,weapon:()=> 'nerf'});
 const held={cool:1},w={__ghosts:g,__combat:c,__app:{heldItem:()=>held,click:()=>c.fire('nerf')}};
 const page=window=>({evaluate:(fn,arg)=>vm.runInNewContext(`(${fn.toString()})(arg)`,{window,arg})});
 return {g,c,sent,A:{page:page(w)},B:{page:page({__combat:{hurts:0,seen:0}})}};
};
const evidence=[];
// Real no-foes guard rejects fire; real noncombat outbox increases Ghosts.shots during the same assertion window.
{
 const x=make();let got;
 await run(x.A,x.B,async()=>{x.g.outbox.push({t:'sq',k:'s',animals:[]});assert.equal(x.g.sendShot(),true);},ok=>got=ok);
 assert.equal(got,true);assert.equal(x.c.fired,7);assert.equal(x.g.shots,13);assert.equal(x.sent[0].t,'sq');
 evidence.push({case:'unarmed with unrelated animal snapshot',assertion:got,firedBefore:7,firedAfter:x.c.fired,ghostShotsBefore:12,ghostShotsAfter:x.g.shots,packets:x.sent});
 console.log('PASS actual no-foes Combat.fire + Ghosts.sendShot: animal traffic does not cause a combat false alarm');
}
// Keep initial no-foes fire legal, then deliberately allow a real Nerf shot during the settling window.
// This models an illegal outgoing combat shot while B remains unarmed and unharmed.
{
 const x=make();let got;
 await run(x.A,x.B,async()=>{
  x.g.others.set('deliberately-invalid-foe',{h:'saber',root:{visible:true},snaps:[{}]});
  x.c.nerfCandidate=()=>null;
  x.c.fire('nerf',{o:new THREE.Vector3(0,1.5,0),d:new THREE.Vector3(0,0,-1),s:10});
 },ok=>got=ok);
 assert.equal(got,false);assert.equal(x.c.fired,8);assert.equal(x.sent.filter(m=>m.t==='a').length,1);
 evidence.push({case:'negative control: actual combat fire during settle',assertion:got,firedBefore:7,firedAfter:x.c.fired,packets:x.sent});
 console.log('PASS negative control: actual Combat.fire Nerf t:a packet makes the same assertion fail');
}
fs.writeFileSync('docs/verification/2227/result.json',JSON.stringify(evidence,null,2)+'\n');
console.log('ALL PASS 2 source-bound scenarios; B.hurts/seen and production source untouched');
process.exit(0); // stats module has a browser autosave interval; no browser/storage exists in this probe.

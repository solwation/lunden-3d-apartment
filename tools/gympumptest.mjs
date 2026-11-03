import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pumpAt, creditPump, pumpWire, pumpSampler } from '../src/gympump.js';
import { GYM_PUMP as C } from '../src/config.js';
import { Avatar } from '../src/avatar.js';
import { NAMES } from '../src/olof.js';
import { cleanState } from '../cloudflare/players.js';

const now = 1700000000000, hour = 3600000;
test('pump: completed reps, saturation, linear offline decay, save roundtrip and invalid anchors', () => {
  let p = null;
  for (let n = 0; n < C.repsToFull; n++) p = creditPump(p, 1, now);
  assert.equal(p.value, 1); assert.equal(creditPump(p, 10, now).value, 1);
  p = JSON.parse(JSON.stringify(p));
  assert.equal(pumpAt(p, now + 36 * hour), .5);
  assert.equal(pumpAt(p, now + 72 * hour), 0);
  assert.equal(pumpAt(p, now + 90 * hour), 0);
  assert.equal(creditPump(p, 1, now + 36 * hour).value, .51);
  for (const bad of [null, {}, {value:1,at:now+1}, {value:NaN,at:now}, {value:1,at:-1}]) assert.equal(pumpAt(bad,now),0);
  for (const n of [0,-1,NaN,1.5,'1']) assert.equal(creditPump(null,n,now).value,0);
  let t = now, record = null; const sample=pumpSampler(()=>record,()=>t);
  assert.equal(sample(),0); record=creditPump(null,50,now); assert.equal(sample(),0);
  t+=C.sampleMs; assert.equal(sample(),.5);
  record=creditPump(record,50,t); assert.equal(sample(),.5); t+=C.sampleMs; assert.equal(sample(),1);
});

test('avatar: all sleeve/cut variants share immutable buffers but own their pump; only shoulder skin/cloth marked', () => {
  const seed=new Avatar('pump-base'), baseLook=seed.look; seed.dispose();
  for (const gender of [0,1]) for (const cut of [0,1,2]) for (const sleeves of [0,1]) {
    const look={...baseLook,gender,cut,sleeves};
    const a=new Avatar(look), b=new Avatar(look), geometry=a.mesh.geometry, attrs=geometry.attributes;
    const before=attrs.position.array.slice();
    assert.equal(attrs.position,b.mesh.geometry.attributes.position);
    a.setPump(1); assert.equal(a.material.userData.u.uPump.value,1); assert.equal(b.material.userData.u.uPump.value,0);
    assert.deepEqual(attrs.position.array,before); assert.equal(a.mesh.geometry,geometry);
    let skin=0,cloth=0, max=0;
    for(let i=0;i<attrs.position.count;i++) {
      const w=attrs.armPump.getZ(i), d=attrs.armPump.getW(i), bone=NAMES[attrs.skinIndex.getX(i)], region=attrs.bare.getX(i)===1?0:1;
      assert.ok(Number.isFinite(w)&&Number.isFinite(d)&&w>=0&&w<=1);
      if(w>0){assert.match(bone,/^shoulder[LR]$/);assert.ok(region===0||region===1); if(region===0)skin++;else cloth++; max=Math.max(max,w);}
      else if(!/^shoulder/.test(bone))assert.equal(d,0);
    }
    assert.ok(max>.98); assert.ok(skin>0||cloth>0); if(cut!==1)assert.ok(cloth>0,'shirt sleeves grow too');
    assert.equal(a.object.children.filter(x=>x.isMesh).length,1); a.dispose();b.dispose();
  }
});

test('wire: bounded hundredths, old peers clear, Worker retains progress for room snapshots; main keeps score callback', () => {
  const state=bp=>cleanState(JSON.stringify({p:[0,0,0],r:0,bp}));
  assert.equal(state(.517).bp,.52);assert.equal(state(9).bp,1);assert.ok(!('bp'in state(-1)));
  for(const bp of [undefined,null,'1',{},NaN])assert.ok(!('bp'in state(bp)));
  assert.equal(pumpWire(Infinity),0);
  assert.ok(JSON.stringify(state(1)).length<512);
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.match(main,/onRep = n => \{ bump\('gymReps', n\); growGymPump\(n\); \}/);
  assert.match(main,/bp: gymPumpState\(\)/);
});

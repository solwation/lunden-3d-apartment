// #1765: the caught fish's per-species model (src/caughtfish.js, CAUGHT_FISH in config.js): pure geometry checks, no browser.
//   node tools/caughtfishtest.mjs
import { RIVER_FISH, CAUGHT_FISH } from '../src/config.js';
import { caughtFishGeometry } from '../src/caughtfish.js';
let fails = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) fails++; };
for (const { name } of RIVER_FISH.species) {
  const g = caughtFishGeometry(name), tris = g.index.count / 3, b = g.boundingBox, P = g.attributes.position.array, N = g.attributes.normal.array, C = g.attributes.color.array;
  check(!!CAUGHT_FISH.species[name], `${name}: has its own CAUGHT_FISH entry`);
  check(tris <= 900, `${name}: ${tris} triangles (≤ 900, one draw call: no groups = ${g.groups.length === 0})`);
  check(g.groups.length === 0 && caughtFishGeometry(name) === g, `${name}: one shared cached geometry, no material groups`);
  check([...P, ...N, ...C].every(Number.isFinite) && C.every((c) => c >= 0 && c <= 1), `${name}: finite positions / normals, colours within 0…1`);
  check(Math.abs(b.min.z + 0.5) < 0.02 && Math.abs(b.max.z - 0.5) < 0.02, `${name}: one length long, nose at +z (z ${b.min.z.toFixed(3)}…${b.max.z.toFixed(3)})`);
  const s = CAUGHT_FISH.species[name], depth = b.max.y - b.min.y, width = b.max.x - b.min.x;
  check(width < depth && depth > s.depth, `${name}: laterally compressed and finned (w ${width.toFixed(3)} < h ${depth.toFixed(3)})`);
  check(g.userData.lum > 0.1 && g.userData.lum < 0.8, `${name}: skin luminance ${g.userData.lum.toFixed(3)} for the cooking tint`);
}
const h = (n) => { const b = caughtFishGeometry(n).boundingBox; return b.max.y - b.min.y; };
check(h('braxen') > h('mört') && h('ål') < h('gädda') && h('gädda') < h('öring'), 'shapes differ: bream deepest, eel slimmest, pike slimmer than trout');

// The actual shader target format must decode to the correct six source forms,
// rather than merely producing finite data or a nonzero draw count.
const { riverFishGeometry } = await import('../src/riverfishmodel.js');
const { buildFishSurface } = await import('../src/fishsurface.js');
const THREE = await import('three');
const live = riverFishGeometry();
let maximumError=0,minimumNormalDot=1;
for(const [species,{name}] of RIVER_FISH.species.entries()){
  const source=buildFishSurface(name,true),size=source.boundingBox.getSize(new THREE.Vector3()),center=source.boundingBox.getCenter(new THREE.Vector3());
  source.translate(-center.x,-center.y,-center.z);source.scale(1/size.x,1/size.y,1/size.z);
  const target=live.attributes['aFishTarget'+species],p=source.attributes.position,n=source.attributes.normal;
  check(p.count===live.attributes.position.count,name+': common live target topology');
  for(let i=0;i<p.count;i++){
    const actual=species?new THREE.Vector3(target.getX(i)/65535-.5,target.getY(i)/65535-.5,target.getZ(i)/65535-.5):new THREE.Vector3().fromBufferAttribute(live.attributes.position,i);
    maximumError=Math.max(maximumError,actual.distanceTo(new THREE.Vector3().fromBufferAttribute(p,i)));
    const bits=species?target.getW(i):0,oct=species?[bits%256/255*2-1,Math.floor(bits/256)/255*2-1]:[live.attributes.aFishNormal0.getX(i),live.attributes.aFishNormal0.getY(i)];
    const normal=new THREE.Vector3(oct[0],oct[1],1-Math.abs(oct[0])-Math.abs(oct[1]));
    if(normal.z<0){normal.x=(1-Math.abs(oct[1]))*Math.sign(oct[0]||1);normal.y=(1-Math.abs(oct[0]))*Math.sign(oct[1]||1)}
    const expected=new THREE.Vector3().fromBufferAttribute(n,i);if(expected.lengthSq()>.5)minimumNormalDot=Math.min(minimumNormalDot,normal.normalize().dot(expected.normalize()));
  }
  source.dispose();
}
check(maximumError<1.4e-5,`all six packed positions within ${maximumError} normalized units`);
check(minimumNormalDot>.999,`all six oct normals accurate (minimum dot ${minimumNormalDot})`);
const views=g=>[g.index,...Object.values(g.attributes)].filter(Boolean).map(a=>a.array);
const bytes=arrays=>[...new Set(arrays)].reduce((n,a)=>n+a.byteLength,0);
check(live.index.count/3<=900&&bytes(views(live))+18*(16+3+2)*4<=25860,'live full-capacity raw geometry/instance budget');
check(bytes(RIVER_FISH.species.flatMap(s=>views(caughtFishGeometry(s.name))))<=164424,'six caught cache raw budget');
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exitCode=fails?1:0;

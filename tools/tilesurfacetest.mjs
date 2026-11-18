// #2070: metric joints and relief independence, including the half-bond texture seam.
import test from 'node:test';
import assert from 'node:assert/strict';
import { tileSurfaceData } from '../src/tilesurface.js';
import { TILE_SURFACE as S } from '../src/config.js';
const opt = { tw: .2, th: .1, nx: 2, ny: 2, bond: true, grout: 0x999999, joint: .003, ppm: 1000 };
const sample = (s, x, y) => { const i=((s.height-1-y)*s.width+x)*4;return Array.from(s.data.slice(i,i+2)); };
test('shallow joints follow 20x10 cm half-bond, including both texture edges', () => {
 const d=tileSurfaceData(opt,.6);assert.equal(d.width,400);assert.equal(d.height,200);
 assert.equal(sample(d,0,50)[0],0);assert.equal(sample(d,399,50)[0],0);
 assert.equal(sample(d,200,50)[0],0);assert.equal(sample(d,100,150)[0],0);
 assert.equal(sample(d,200,150)[0],255);assert.equal(sample(d,100,50)[0],255);
 assert.equal(sample(d,50,0)[0],0);assert.equal(sample(d,50,199)[0],0);
 assert.equal(sample(d,50,100)[0],0);
 assert.ok(sample(d,2,50)[0]>0&&sample(d,2,50)[0]<255,'soft bevel between joint and flat ceramic');
 assert.equal(sample(d,0,50)[1],Math.round(S.groutRoughness*255));
 assert.equal(sample(d,50,50)[1],Math.round(.6*255));
});
test('relief never follows the colour, seed, mottling or per-tile shade',()=>{
 const a=tileSurfaceData(opt,.75),b=tileSurfaceData({...opt,color:0xff0000,grout:0x000000,vary:.8,mottle:.9,seed:123},.75);
 assert.deepEqual(a,b);assert.ok(S.depth>0&&S.depth<.0015,'visual relief stays shallow, not a displaced floor');
});
test('no-joint surfaces remain flat, repeat deterministically and keep their roughness',()=>{
 const a=tileSurfaceData({...opt,grout:null},.55),b=tileSurfaceData({...opt,grout:null},.55);
 assert.deepEqual(a,b);for(let i=0;i<a.data.length;i+=4){assert.equal(a.data[i],255);assert.equal(a.data[i+1],140);}
});

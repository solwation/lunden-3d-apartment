import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { paintPixels, paintTexture, paintDetailAt, paintSurface, paintDetail } from '../src/paintsurface.js';
import { PAINT_SURFACE as P } from '../src/config.js';
import { vertexCompileSlack } from '../src/vertexcompile.js';

test('one deterministic packed periodic paint map, linear filtered mipmaps, shallow wall/coarser ceiling', () => {
  const a = paintPixels(), b = paintPixels(); assert.deepEqual(a,b);
  assert.equal(a.length, P.size * P.size * 4); assert.ok(P.size>=128 && P.size<=256);
  let sum=0, range=[255,0]; for(let i=0;i<a.length;i+=4){sum+=a[i+1];range[0]=Math.min(range[0],a[i]);range[1]=Math.max(range[1],a[i]);assert.equal(a[i+3],255);}
  assert.ok(range[1]>range[0]);assert.ok(Math.abs(sum/(P.size*P.size*255)-0.5)<0.01);
  const t=paintTexture();assert.equal(t,paintTexture());assert.equal(t.wrapS,THREE.RepeatWrapping);assert.equal(t.wrapT,THREE.RepeatWrapping);assert.equal(t.colorSpace,THREE.NoColorSpace);assert.ok(t.generateMipmaps);
  assert.ok(P.wall.depth>0 && P.wall.depth<0.001);assert.ok(P.ceiling.depth>P.wall.depth && P.ceiling.tile>P.wall.tile);
});
test('distance detail smoothly reaches zero and never inverts or grows with distance',()=>{
  assert.equal(paintDetailAt(0),1);assert.equal(paintDetailAt(P.fade[1]),0);assert.equal(paintDetailAt(100),0);
  let was=1;for(let d=0;d<10;d+=0.02){const k=paintDetailAt(d);assert.ok(k>=0&&k<=was+1e-12);was=k;}
  assert.ok(paintDetailAt((P.fade[0]+P.fade[1])/2)>0);
});
test('native Standard shader chain, same colour/geometry contract, one shared sampler and quality uniform',()=>{
  for(const ceiling of [false,true]){
    const m=new THREE.MeshStandardMaterial({color:0xf1f1ee,roughness:0.85});const color=m.color.clone(),rough=m.roughness;
    paintSurface(m,ceiling);const callback=m.onBeforeCompile;paintSurface(m,ceiling);assert.equal(m.onBeforeCompile,callback);
    assert.ok(m.color.equals(color));assert.equal(m.roughness,rough);assert.equal(vertexCompileSlack(m),0);
    const s={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};m.onBeforeCompile(s,null);
    assert.equal(s.uniforms.uPaintMap.value,paintTexture());assert.equal(s.uniforms.uPaintDetail,paintDetail);
    assert.ok(s.vertexShader.includes('#include <project_vertex>'));assert.ok(s.fragmentShader.includes('textureGrad('));assert.ok(s.fragmentShader.includes('#include <normal_fragment_maps>'));assert.ok(s.fragmentShader.includes('#include <roughnessmap_fragment>'));
    assert.ok(m.customProgramCacheKey().includes(ceiling?'ceiling':'wall'));assert.doesNotThrow(()=>m.clone());
  }
});

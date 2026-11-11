import test from 'node:test';
import assert from 'node:assert/strict';
import { BREEDS, createCatPuppet, loadRiggedCatModel } from '../src/cat.js';
import { registry } from '../src/bestiary.js';
import { execFileSync } from 'node:child_process';

test('corrected cat thumbnails invalidate old generated cat model cache',()=>{
  const cats=registry.list().filter(e=>e.model?.kind==='cat');
  assert.ok(cats.length>=30);assert.ok(cats.every(e=>e.modelVersion===2));
});

test('held/hugging eyes and paws still use the production pose recipe',async()=>{
  await loadRiggedCatModel();
  for(const b of BREEDS){const c=createCatPuppet(b,b.coats[0],false,{held:true});
    c.t=1;c.hugging=true;c.heldBehave(0);c.pose(0);
    assert.ok(c.eyes.every(e=>!e.eye.visible&&e.shut.visible));assert.equal(c.shoulder.rotation.x,-1.15);
    c.hugging=false;c.heldBehave(0);assert.ok(c.eyes.every(e=>e.eye.visible&&!e.shut.visible));
  }
});

test('phone CPU cleanup keeps shared primitive buffers readable for later snapshots',()=>{
  execFileSync(process.execPath,['--input-type=module','-e',`
    import assert from 'node:assert/strict';
    import * as T from 'three';
    Object.defineProperty(globalThis,'navigator',{value:{userAgent:'iPhone'},configurable:true});
    globalThis.location={search:'?lowmem'};
    const L=await import('./src/lowmemory.js'),{catPrimitive}=await import('./src/catmodel.js');
    assert.ok(L.lowMemory);
    for(const geo of [catPrimitive('sphere'),catPrimitive('ear'),catPrimitive('limb',.021,.17),catPrimitive('limb',.019,.09)]){
      const normal=geo.attributes.normal,uv=geo.attributes.uv;
      L.freeSceneGeometryCopies(new T.Mesh(geo));
      normal.onUploadCallback();uv.onUploadCallback();
      assert.equal(geo.attributes.normal,normal);assert.ok(normal.array.length&&uv.array.length);
      assert.ok(geo.clone().attributes.normal.array.length);
    }
  `],{cwd:process.cwd(),stdio:'pipe'});
});

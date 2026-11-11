// #1910: actual geometry and transformed vertices, not file-size/draw promises.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import { BREEDS, VARIANTS, createCatPuppet, loadRiggedCatModel } from '../src/cat.js';
import { installCatModel } from '../src/catmodel.js';
import { prepareClimbContact } from '../src/catclimb.js';

const vertices = object => {
  object.updateMatrixWorld(true);
  const data=[],v=new T.Vector3();
  object.traverseVisible(o=>{if(o.isMesh)for(let i=0;i<o.geometry.attributes.position.count;i++){
    v.fromBufferAttribute(o.geometry.attributes.position,i).applyMatrix4(o.matrixWorld);
    assert.ok(v.toArray().every(Number.isFinite));data.push(...v.toArray());
  }});
  return data;
};
const bounds = object => {
  const data=vertices(object),b=new T.Box3();for(let i=0;i<data.length;i+=3)b.expandByPoint(new T.Vector3(...data.slice(i,i+3)));return b;
};

test('neutral GLB contains original articulated cat, no personal image/foreign skeleton', async()=>{
  const data=fs.readFileSync('models/cat-rigged.glb');assert.equal(data.toString('ascii',0,4),'glTF');assert.equal(data.readUInt32LE(8),data.length);
  const json=JSON.parse(data.subarray(20,20+data.readUInt32LE(12)).toString());
  assert.equal(json.images,undefined);assert.equal(json.skins,undefined);
  const model=await loadRiggedCatModel();assert.ok(installCatModel(model));assert.equal(model.scene.userData.catRecipe,1);
  assert.ok(model.scene.getObjectByName('cat-nose'));
  model.scene.traverse(o=>{if(o.userData.catPrimitive)assert.equal(o.geometry.userData.keepCpu,true,'later snapshots require retained CPU attributes');});
});

test('every breed/coat/kitten keeps exact visible vertices through late GLB and six gait phases',async()=>{
  const model=await loadRiggedCatModel();let forms=0;
  for(const b of BREEDS)for(const coat of b.coats)for(const kitten of b.superRare?[false]:[false,true]){
    const c=createCatPuppet(b,coat,kitten,{loadModel:false});
    const refs=[c.object,c.head,c.shoulder,c.leftShoulder,c.eyes,...c.parts.hips.map(h=>h.foot)];
    for(const stand of [0,1])for(const phase of [0,.5,1,2,3,4]){
      Object.assign(c,{stand,wantStand:stand,gaitPhase:phase,gaitAmp:stand,walked:!!stand});c.pose(0);
      const before=vertices(c.object);c.setupRigged(model);assert.deepEqual(vertices(c.object),before);
      const box=bounds(c.object),size=box.getSize(new T.Vector3());
      assert.ok(box.min.y>-.05&&box.max.y<.8,`${b.name}/${coat.name}/${kitten} ${box.min.y}..${box.max.y}`);
      assert.ok(size.x<.7&&size.z<1.1,`${b.name} finite cat envelope`);
    }
    assert.deepEqual([c.object,c.head,c.shoulder,c.leftShoulder,c.eyes,...c.parts.hips.map(h=>h.foot)],refs);
    assert.ok(c.modelLoaded);forms++;
  }
  assert.ok(forms>=30,`${forms} real forms`);
});

test('Siamese, Maine Coon and kitten retain different ears/body/head/tail proportions',()=>{
  const make=(name,kitten=false)=>{const b=BREEDS.find(b=>b.name===name);return createCatPuppet(b,b.coats[0],kitten,{loadModel:false});};
  const ordinary=make('huskatt'),siamese=make('siames'),maine=make('maine coon'),kitten=make('huskatt',true);
  assert.ok(siamese.parts.ears[0].scale.y>ordinary.parts.ears[0].scale.y);
  assert.ok(bounds(maine.object).getSize(new T.Vector3()).y>bounds(ordinary.object).getSize(new T.Vector3()).y*1.2);
  assert.ok(maine.shape.tail>ordinary.shape.tail);
  assert.ok(bounds(kitten.object).getSize(new T.Vector3()).y<bounds(ordinary.object).getSize(new T.Vector3()).y*.85);
  assert.ok(kitten.shape.head>ordinary.shape.head&&kitten.shape.legs<ordinary.shape.legs);
});

test('clone materials and real eye colours stay independent across a model swap',async()=>{
  const a=createCatPuppet(BREEDS[0],VARIANTS[0]),b=createCatPuppet(BREEDS[1],BREEDS[1].coats[0]);
  const before=a.parts.body.material.color.getHex();b.parts.body.material.color.setHex(0xff0000);
  assert.equal(a.parts.body.material.color.getHex(),before);assert.equal(a.parts.eyes[0].eye.children[0].material.color.getHex(),VARIANTS[0].eye);
  assert.equal(b.parts.eyes[0].eye.children[0].material.color.getHex(),BREEDS[1].coats[0].eye);
  a.setupRigged(await loadRiggedCatModel());assert.equal(a.parts.body.material.color.getHex(),before);
});

test('climbing uses real paws and invalid old import cannot hide or reparent a cat',async()=>{
  const c=createCatPuppet(BREEDS[0],VARIANTS[0]);Object.assign(c,{stand:1,wantStand:1});c.pose(0);
  const contact=prepareClimbContact(c);assert.equal(contact.paws.length,4);
  assert.deepEqual(contact.paws,[c.shoulder.children.at(-1),c.leftShoulder.children.at(-1),...c.parts.hips.map(h=>h.foot)]);
  const refs=c.object.children.slice(),before=vertices(c.object);
  c.setupRigged({scene:new T.Group()});assert.deepEqual(c.object.children,refs);assert.deepEqual(vertices(c.object),before);
  c.object.removeFromParent();c.setupRigged(await loadRiggedCatModel());assert.equal(c.object.parent,null);
});

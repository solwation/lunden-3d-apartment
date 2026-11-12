// Reproduce the native consumer/cache contract; run from the repository root.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {duckModel,duckRigGeometry} from '../../../src/duckmodel.js';
import {Ducks} from '../../../src/ducks.js';
import {createBestiaryModel} from '../../../src/bestiarymodels.js';
import {registry} from '../../../src/bestiary.js';
import {BestiaryImages} from '../../../src/bestiaryimages.js';
const bytes=fs.readFileSync('models/duck-rigged.glb');
const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const hash=g=>{const h=createHash('sha256');for(const[n,a]of[['index',g.index],...Object.entries(g.attributes).filter(([n])=>!['skinIndex','skinWeight'].includes(n))]){h.update(n);h.update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength));}return h.digest('hex');};
const rows=[];
for(const female of[false,true]){
 const fallback=duckModel(female),a={brain:{female},mesh:new T.Mesh(fallback,new T.MeshStandardMaterial())};
 Ducks.prototype.setupRigged.call({},a,gltf);
 const binder=await createBestiaryModel({kind:'duck',female}),h=hash(fallback);
 assert.equal(hash(a.skinnedMesh.geometry),h);assert.equal(hash(binder.object.geometry),h);
 assert.equal(a.skinnedMesh.geometry,duckRigGeometry(female));assert.equal(a.mesh.material.visible,false);
 assert.equal(registry.get(`duck:${female?'female':'male'}`).modelVersion,2);
 a.mesh.updateMatrixWorld(true);assert.ok(a.skinnedMesh.matrixWorld.elements.every(Number.isFinite));
 rows.push({female,triangles:fallback.index.count/3,fallbackLoadedBinderHash:h,actualSetupRigged:true,oneVisibleModel:true,thumbnailVersion:2});
 let released=0;a.skinnedMesh.geometry.addEventListener('dispose',()=>released++);assert.notEqual(binder.object.geometry,a.skinnedMesh.geometry);binder.dispose();assert.equal(released,0);assert.ok(a.skinnedMesh.geometry.attributes.position.array.length>0);
}
const data=new Map(),readKeys=[],writeKeys=[];
for(const sex of['male','female'])for(const size of[96,320])data.set(`duck:${sex}:1:${size}`,{data:'old-v1-sentinel'});
const store=async(name,mode,fn)=>fn({get:key=>{readKeys.push(key);return data.get(key);},put:row=>{writeKeys.push(row.id);data.set(row.id,row);}});
const images=new BestiaryImages({registry,renderer:null,store});let renders=0;
images.render=(object,size)=>{renders++;assert.equal(object.geometry.index.count/3,1312);return`fresh-v2-${renders}-${size}`;};
for(const sex of['male','female'])for(const size of[96,320]){const id=`duck:${sex}`,x=await images.get(id,size);assert.notEqual(x,'old-v1-sentinel');assert.equal(await images.get(id,size),x);}
assert.equal(renders,4);assert.equal(images.hits,4);assert.equal(writeKeys.length,4);assert.ok(readKeys.every(k=>k.includes(':2:')));images.dispose();
const report={rows,cache:{seededOldKeys:4,freshV2Factories:renders,memoryHits:4,readKeys,writeKeys,renderSpy:'Native cache-contract spy inspects actual factory geometry; not a visual renderer. Actual GLB/404/binder images reused from source-identical1921.'},pass:true};
fs.writeFileSync('docs/verification/1931/consumer-parity.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));

import fs from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { RiverFish, loadFishModel } from '../src/riverfish.js';
import { caughtFishGeometry } from '../src/caughtfish.js';
import { RIVER_FISH } from '../src/config.js';

function arrays(g){return[g.index,...Object.values(g.attributes),...Object.values(g.morphAttributes).flat()].filter(Boolean).map(a=>a.isInterleavedBufferAttribute?a.data.array:a.array)}
function bytes(views){return[...new Set(views)].reduce((n,a)=>n+a.byteLength,0)}
const gltf=await loadFishModel(),neutral=[];gltf?.scene.traverse(o=>{if(o.geometry)neutral.push(o.geometry)});
const start=performance.now(),river=new RiverFish({scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera()}),constructionMs=performance.now()-start;
const g=river.fish.geometry,geometryViews=arrays(g).filter(a=>!Object.values(g.attributes).some(attribute=>attribute.isInstancedBufferAttribute&&attribute.array===a));
const instanceViews=[river.fish.instanceMatrix.array,river.fish.instanceColor.array,...Object.values(g.attributes).filter(a=>a.isInstancedBufferAttribute).map(a=>a.array)];
const caught=RIVER_FISH.species.map(({name})=>{const g=caughtFishGeometry(name);return{name,triangles:g.index.count/3,vertices:g.attributes.position.count,bytes:bytes(arrays(g)),bounds:{min:g.boundingBox.min.toArray(),max:g.boundingBox.max.toArray()}}});
const caughtViews=RIVER_FISH.species.flatMap(({name})=>arrays(caughtFishGeometry(name))),neutralViews=neutral.flatMap(arrays);
const files=['src/config.js','src/riverfish.js','src/riverfishmodel.js','src/caughtfish.js','models/fish-generic.glb'];if(fs.existsSync('src/fishsurface.js'))files.push('src/fishsurface.js');
console.log(JSON.stringify({sourceHashes:Object.fromEntries(files.map(p=>[p,createHash('sha256').update(fs.readFileSync(p)).digest('hex')])),constructionMs,
 live:{triangles:g.index.count/3,vertices:g.attributes.position.count,geometryBytes:bytes(geometryViews),instanceBytes:bytes(instanceViews),combinedBytes:bytes([...geometryViews,...instanceViews]),sharesNeutralBasePosition:neutral.some(n=>n.attributes.position===g.attributes.position)},
 caught,caughtTotalBytes:bytes(caughtViews),neutralLoadedGeometryBytes:bytes(neutralViews),allUniqueGeometryAndInstanceBytes:bytes([...geometryViews,...instanceViews,...caughtViews,...neutralViews]),glbBytes:fs.statSync('models/fish-generic.glb').size},null,2));

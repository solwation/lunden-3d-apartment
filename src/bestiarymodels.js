import * as THREE from 'three';
import { PADDOCK, SHARK } from './config.js';
// Recipes use the production geometry and material factories; no gameplay constructors/timers/audio.
export async function createBestiaryModel(recipe) {
 let object, sharedGeometry = false, ownTextures = false;
 const mesh = (g, material = new THREE.MeshStandardMaterial({vertexColors:true,roughness:.85,side:THREE.DoubleSide})) => new THREE.Mesh(g, material);
 switch(recipe.kind) {
  case 'cat': { const m=await import('./cat.js'),b=m.BREEDS.find(b=>b.name===recipe.breed),c=b.coats.find(c=>c.name===recipe.coat); object=m.createCatPuppet(b,c,recipe.kitten).object; break; }
  case 'squirrel': { const [{squirrelGeometry},{SQUIRRELS}]=await Promise.all([import('./squirrels.js'),import('./config.js')]); const s=SQUIRRELS.animals.find(s=>s.name===recipe.name); object=mesh(squirrelGeometry(s).clone()); object.scale.setScalar(s.scale); break; }
  case 'duck': object=mesh((await import('./duckmodel.js')).duckModel(recipe.female)); break;
  case 'fish': case 'shark': { const {caughtFishGeometry}=await import('./caughtfish.js'); object=mesh(caughtFishGeometry(recipe.kind==='shark'?'haj':recipe.name,recipe.kind==='shark'?SHARK.look:null)); sharedGeometry=true; break; }
  case 'pony': { const {ponyGeometry,ponyMaterial}=await import('./paddock.js'),p=PADDOCK.pony.animals.find(p=>p.name===recipe.name),g=ponyGeometry();
   const attr=(name,v,n)=>g.setAttribute(name,new THREE.InstancedBufferAttribute(new Float32Array(v),n));
   attr('aCoat',new THREE.Color(p.coat).toArray(),3);attr('aAccent',new THREE.Color(p.accent).toArray(),3);attr('aMark',[p.star?1:0],1);attr('aAnim',[0,0,0,0],4);attr('aAnim2',[0,0,0,0],4);
   object=new THREE.InstancedMesh(g,ponyMaterial(),1);object.setMatrixAt(0,new THREE.Matrix4()); break; }
  case 'butterfly': object=mesh((await import('./outdoorcats.js')).butterflyGeometry(),new THREE.MeshLambertMaterial({color:recipe.color,side:THREE.DoubleSide}));break;
  case 'magicButterfly': { const {TEXTURES}=await import('./marks.js'); object=mesh(new THREE.PlaneGeometry(1,.7),new THREE.MeshBasicMaterial({map:TEXTURES.butterfly(),transparent:true,side:THREE.DoubleSide}));ownTextures=true;break; }
  case 'gull': { const {birdGeometry}=await import('./birds.js'); const g=birdGeometry(1,{a:new Float32Array(4),b:new Float32Array(2)});g.deleteAttribute('aSeed');g.deleteAttribute('aSeed2');g.instanceCount=1;object=mesh(g,new THREE.MeshBasicMaterial({color:0xe6e6e0,side:THREE.DoubleSide}));break; }
  case 'santa': {const f=(await import('./santa.js')).santaFigure();object=f.object;f.text.material.map.dispose();f.text.material.dispose();ownTextures=true;break;}
  case 'olof': { const {buildOlof}=await import('./olof.js'); object=buildOlof().object;break; }
  case 'pingping': object=(await import('./pingping.js')).pingpingModel();ownTextures=true;break;
  default:throw new Error(`Unknown creature model ${recipe.kind}`);
 }
 object.traverse(o=>{o.castShadow=false;o.receiveShadow=false;});
 return {object,dispose(){const geos=new Set(),mats=new Set(),textures=new Set();object.traverse(o=>{o.skeleton?.dispose();if(o.geometry&&!sharedGeometry)geos.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){mats.add(m);if(ownTextures)for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});for(const g of geos)g.dispose();for(const m of mats)m.dispose();for(const t of textures)t.dispose();}};
}

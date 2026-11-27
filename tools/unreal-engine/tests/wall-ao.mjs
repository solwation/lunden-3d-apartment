// Source-built geometry contract: no browser, renderer, GLB export or Unreal.
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
if (process.env.THREE_DIR) {
  const root = pathToFileURL(process.env.THREE_DIR+'/').href;
  register('data:text/javascript,'+encodeURIComponent(`
    const root=${JSON.stringify(root)};
    export async function resolve(s,c,next) {
      if(s==='three') return {url:root+'build/three.module.js',shortCircuit:true};
      if(s.startsWith('three/addons/')) return {url:root+'examples/jsm/'+s.slice(13),shortCircuit:true};
      return next(s,c);
    }`));
}
const THREE = await import('three');
const { buildWallAO, rectPts } = await import('../../../src/ao.js');
const { AO, LEVELS, WINDOWS, EXTRA_WALLS, OPTIONS } = await import('../../../src/config.js');
const { livingWallCeilingAO } = await import('../export-living-wall-ao.js');
const { validate } = await import('../json-schema.mjs');
const schema = JSON.parse(fs.readFileSync(new URL('../../../shared/schema/measurements.schema.json', import.meta.url)));
const plan = JSON.parse(fs.readFileSync(new URL('../../../data/plan.json', import.meta.url)));

function fixture() {
  // Exercise the real AO builder on real plan solids. Door lintels are unrelated
  // to this unbroken party-wall face. Production copies the full built world.
  const floor = plan.floors[0], y0 = LEVELS[0].floor, y1 = y0+LEVELS[0].ceiling;
  const walls = [...floor.walls, ...EXTRA_WALLS.filter(w=>w.level===0 && OPTIONS[w.option]).map(w=>({outer:rectPts(w)}))];
  const pieces = walls.filter(w=>!w.half).map(w=>({pts:w.outer,y0,y1}));
  const blockers = pieces.map(p=>p.pts);
  for (const opening of floor.windows) {
    const facade=opening.z0<floor.size.z/2?'north':'south', center=(opening.x0+opening.x1)/2;
    const spec=WINDOWS.filter(w=>w.level===0 && w.facade===facade).sort((a,b)=>Math.abs(a.x-center)-Math.abs(b.x-center))[0];
    let r=opening;
    if(spec.width && spec.width<opening.x1-opening.x0) {
      r={...opening,x0:center-spec.width/2,x1:center+spec.width/2};
      pieces.push({pts:rectPts({...opening,x1:r.x0}),y0,y1},{pts:rectPts({...opening,x0:r.x1}),y0,y1});
    }
    pieces.push({pts:rectPts(r),y0,y1:y0+spec.sill},{pts:rectPts(r),y0:y0+spec.head,y1});
    blockers.push(rectPts(opening));
  }
  const mesh=buildWallAO(floor.size,y0,y1,pieces,blockers), object=new THREE.Group();
  object.add(mesh);
  // Bounds are fixed actual painted east-wall vertices, not a crop-dependent fit.
  const wall=[5.5512,7.8,0,12.2337,3];
  return {mesh,world:{object},wall};
}

test('copies actual four source triangles/aDist/uniforms without changing the built web mesh',()=>{
  const {mesh,world,wall}=fixture();
  const before=JSON.stringify({p:[...mesh.geometry.attributes.position.array],d:[...mesh.geometry.attributes.aDist.array],uniforms:mesh.material.uniforms});
  const data=livingWallCeilingAO(world,wall);
  assert.equal(data.triangles.length,4);
  assert.equal(data.bandBottom,2);
  assert.deepEqual(data.coefficients,{floor:[AO.wall.floor.strength,AO.wall.floor.radius],ceil:[AO.wall.ceiling.strength,AO.wall.ceiling.radius],corner:[AO.wall.corner.strength,AO.wall.corner.radius]});
  assert.deepEqual(validate(data,schema.properties.site.properties.livingWallCeilingAO,schema),[]);
  assert.equal(JSON.stringify({p:[...mesh.geometry.attributes.position.array],d:[...mesh.geometry.attributes.aDist.array],uniforms:mesh.material.uniforms}),before);
  const sourcePositions=mesh.geometry.attributes.position, sourceDistances=mesh.geometry.attributes.aDist;
  for(const triangle of data.triangles) for(let k=0;k<3;k++) {
    const at=[...Array(sourcePositions.count).keys()].find(i=>triangle.positions[k].every((v,j)=>v===sourcePositions.getComponent(i,j))
      && triangle.aDist[k].every((v,j)=>v===sourceDistances.getComponent(i,j)));
    assert.notEqual(at,undefined);
    assert.deepEqual(triangle.aDist[k],[0,1,2,3].map(j=>sourceDistances.getComponent(at,j)));
  }
  if(process.env.WALL_AO_FIXTURE_OUT) fs.writeFileSync(process.env.WALL_AO_FIXTURE_OUT,JSON.stringify(data,null,2)+'\n');
});

test('locked 25 target rays receive one source triangle, opposite wall and foreground are excluded',()=>{
  const {world,wall}=fixture(), data=livingWallCeilingAO(world,wall);
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(data.triangles.flatMap(t=>t.positions.flat()),3));
  const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());mesh.updateMatrixWorld(true);
  const camera=new THREE.PerspectiveCamera(72,640/360,.05,1500);camera.position.set(2.5,1.62,8.2);
  camera.rotation.order='YXZ';camera.rotation.set(THREE.MathUtils.degToRad(-4),THREE.MathUtils.degToRad(173),0);camera.updateMatrixWorld();
  const all=JSON.parse(fs.readFileSync(new URL('./pendant-lighting-crops.json',import.meta.url)))['living-room-evening'];
  let count=0;
  for(const name of ['left-wall','upper-left','upper-right','lower-left','lower-right']) {
    const r=all[name];
    for(const [u,v] of [[.5,.5],[.1,.1],[.9,.1],[.1,.9],[.9,.9]]) {
      const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(2*(r[0]+u*(r[2]-r[0]))-1,1-2*(r[1]+v*(r[3]-r[1]))),camera);
      assert.equal(ray.intersectObject(mesh).length,1,name+' must be covered exactly once');count++;
    }
  }
  assert.equal(count,25);
  const ray=new THREE.Raycaster(new THREE.Vector3(2.5,2.5,10),new THREE.Vector3(-1,0,0));
  assert.equal(ray.intersectObject(mesh).length,0);
});

test('changed source depth/attribute contract is rejected rather than silently approximated',()=>{
  const {mesh,world,wall}=fixture();
  mesh.material.depthTest=false;
  assert.throws(()=>livingWallCeilingAO(world,wall),/display\/depth/);
  mesh.material.depthTest=true;mesh.geometry.deleteAttribute('aDist');
  assert.throws(()=>livingWallCeilingAO(world,wall),/attributes/);
});

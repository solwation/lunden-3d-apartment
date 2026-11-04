import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {GroundPlacement} from '../src/groundplacement.js';
import {Roofs} from '../src/roofs.js';
const setup=({x=0,y=7,z=0,slope=0,grid=.1,reach=2}={})=>{
 const root=new T.Group(),floor=new T.Mesh(new T.PlaneGeometry(12,12).rotateX(-Math.PI/2),new T.MeshBasicMaterial());floor.position.set(x,y,z);floor.rotation.z=slope;root.add(floor);
 const camera=new T.PerspectiveCamera();camera.position.set(x,y+1,z+1);
 const player={pos:new T.Vector3(x,y,z+1),outdoors:true,groundAt:(px,pz)=>y+Math.tan(slope)*(px-x)};
 const opts={roots:[root],camera,player,reach,grid,maxSlope:.7,allowed:()=>true,blocked:()=>false,dry:()=>true};
 const picker=new GroundPlacement(opts),aim=(px=x,pz=z)=>new T.Ray(camera.position.clone(),new T.Vector3(px,y+Math.tan(slope)*(px-x),pz).sub(camera.position).normalize());
 return{root,floor,camera,player,picker,aim};
};
test('visible raised ground and sloped roofs keep actual support after snapping, no zero plane',()=>{
 for(const[x,y,slope]of[[0,0,0],[-155,13.1139,0],[230,-2.4,.2]]){const f=setup({x,y,slope});const s=f.picker.spot(f.aim(x+.23));assert(s);assert(Math.abs(s.point.y-(y+Math.tan(slope)*(s.point.x-x)))<1e-5);assert(Math.abs(s.point.x-Math.round((x+.23)/.1)*.1)<1e-7);assert(s.distance<=2);}
});
test('air, unseen/unsupported, water, walls, long reach and steep surfaces cannot place',()=>{
 const f=setup();assert.equal(f.picker.spot(new T.Ray(f.camera.position.clone(),new T.Vector3(0,1,0))),null);
 f.floor.visible=false;assert.equal(f.picker.spot(f.aim()),null);f.floor.visible=true;
 for(const flag of['dry','allowed']){f.picker[flag]=()=>false;assert.equal(f.picker.spot(f.aim()),null);f.picker[flag]=()=>true;}
 f.picker.blocked=()=>true;assert.equal(f.picker.spot(f.aim()),null);f.picker.blocked=()=>false;
 f.player.groundAt=()=>-20;assert.equal(f.picker.spot(f.aim()),null);
 const far=setup({reach:.5});assert.equal(far.picker.spot(far.aim()),null);
 const steep=setup({slope:1});assert.equal(steep.picker.spot(steep.aim()),null);
 for(const state of['unit','inCore','flying','fall']){const a=setup();a.player[state]=true;assert.equal(a.picker.spot(a.aim()),null);}
});
test('snapped edge gaps rejected, first opaque obstruction retained, hidden geometry excluded',()=>{
 const f=setup({grid:2});f.floor.geometry.dispose();f.floor.geometry=new T.PlaneGeometry(.3,.3).rotateX(-Math.PI/2);f.floor.position.x=.7;f.floor.geometry.computeBoundingBox();f.root.updateMatrixWorld(true);f.picker=new GroundPlacement({...f.picker,roots:[f.root]});assert.equal(f.picker.spot(f.aim(.7)),null);
 const a=setup(),wall=new T.Mesh(new T.BoxGeometry(4,4,.1),new T.MeshBasicMaterial());wall.position.set(0,8,.5);a.root.add(wall);a.picker=new GroundPlacement({...a.picker,roots:[a.root]});assert.equal(a.picker.spot(a.aim()),null);
 wall.visible=false;assert(a.picker.spot(a.aim()));
});

test('desktop terrain query master remains valid only with its visible render split',()=>{const f=setup();f.floor.name='site-terrain';f.floor.visible=false;const split=f.floor.clone();split.name='site-terrain-remainder';split.visible=true;split.raycast=()=>{};f.root.add(split);f.picker=new GroundPlacement({...f.picker,roots:[f.root]});assert(f.picker.spot(f.aim()));split.visible=false;assert.equal(f.picker.spot(f.aim()),null);});

test('unchanged aim reuses support but revalidates walls, visibility and moved surfaces',()=>{const f=setup();assert(f.picker.spot(f.aim()));assert(f.picker.spot(f.aim()));assert(f.picker.lastCost.cached);f.picker.blocked=()=>true;assert.equal(f.picker.spot(f.aim()),null);f.picker.blocked=()=>false;assert(f.picker.spot(f.aim()));f.floor.position.y+=1;assert.equal(f.picker.spot(f.aim()),null);});

test('existing registered walkable roofs retain their own slopes instead of the terrain slope ceiling',()=>{const f=setup({slope:1});f.player.world={roofs:new Roofs([{id:'existing-steep-roof',x0:-6,x1:6,z0:-6,z1:6,y:(x,z)=>7+Math.tan(1)*x}])};assert(f.picker.spot(f.aim()));});

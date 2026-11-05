import * as T from 'three';
import { frontSides, nodeMaterial } from './adapt.js';

export function checkAdaptation(renderer) {
  const passed=[];
  const check=(ok,label)=>{if(!ok)throw Error(label);passed.push(label);};
  const source=new T.PlaneGeometry(2,2);
  source.setAttribute('color',new T.Int8BufferAttribute([127,64,0,127,64,0,127,64,0,127,64,0],3,true));
  const before=source.toJSON(), copy=frontSides(source), n=source.attributes.position.count;
  check(JSON.stringify(before)===JSON.stringify(source.toJSON()),'Source geometry is unchanged');
  check(copy.index.count===source.index.count*2,'Both sides retain all source triangles');
  check(copy.attributes.color.getY(n)===Math.fround(source.attributes.color.getY(0)),'Normalized vertex colours survive');
  check(copy.attributes.normal.getZ(n)===-source.attributes.normal.getZ(0),'Back normals are reversed');
  for(const z of [-2,2]) {
    const a=new T.Mesh(source,new T.MeshBasicMaterial({side:T.DoubleSide}));
    const b=new T.Mesh(copy,new T.MeshBasicMaterial({side:T.FrontSide}));
    const ray=new T.Raycaster(new T.Vector3(.3,.2,z),new T.Vector3(0,0,-Math.sign(z)));
    const hitA=ray.intersectObject(a),hitB=ray.intersectObject(b);
    check(hitA.length===1 && hitB.length===1 && hitA[0].point.equals(hitB[0].point),`Same hit from side ${z}`);
    a.material.dispose();b.material.dispose();
  }
  const released=source.clone();released.attributes.color.cpuFreed=true;
  let rejected=false;try{frontSides(released);}catch{rejected=true;}
  check(rejected,'Released CPU data is rejected');
  const custom=new T.MeshStandardMaterial();custom.onBeforeCompile=()=>{};
  rejected=false;try{nodeMaterial(custom,renderer);}catch{rejected=true;}
  check(rejected,'Unknown custom shader is rejected');
  source.dispose();copy.dispose();released.dispose();custom.dispose();
  return passed;
}

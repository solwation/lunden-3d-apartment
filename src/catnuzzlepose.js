import * as THREE from 'three';
// Measure the standing nose from the actual procedural model, including breed head/leg/size transforms.
export function catNoseShape(p){
 const nose=p.head.children.find(o=>o.name==='cat-nose');
 Object.assign(p,{stand:1,wantStand:1,gaitAmp:0,walked:false,hopY:0});p.headOff.set(0,0,0);p.head.rotation.set(0,0,0);p.pose(0);p.object.updateMatrixWorld(true);
 const v=p.object.parent.worldToLocal(nose.getWorldPosition(new THREE.Vector3()));
 return {y:v.y,z:v.z,radius:.006*p.object.scale.x*p.head.scale.x,nose};
}
/** Keep both real nose surfaces together during a small head rub, without moving/overlapping the torsos. */
export function poseCatNuzzle(c,pair,config){
 const p=c.puppet;p.wantStand=1;c.group.updateMatrixWorld(true);
 if(pair.contact<config.settle)return;
 const i=pair.cats.indexOf(c),side=i?1:-1,shape=c.nuzzleShape,t=pair.contact-config.settle;
 p.head.rotation.set(0,side*config.rub*Math.sin(t*config.rubHz[0]),side*config.rub*Math.sin(t*config.rubHz[1]));p.object.updateMatrixWorld(true);
 const target=new THREE.Vector3(pair.point.x+side*pair.unit.x*shape.radius,pair.point.y,pair.point.z+side*pair.unit.z*shape.radius),parent=p.head.parent;
 const current=parent.worldToLocal(shape.nose.getWorldPosition(new THREE.Vector3())),desired=parent.worldToLocal(target);p.head.position.add(desired.sub(current));p.object.updateMatrixWorld(true);
}

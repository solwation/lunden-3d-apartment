// Explicit simple surfaces around the actual VisitUnit/buildMid and Measure implementations (#1999).
import * as T from 'three';
import {VisitUnit} from '../src/visitunit.js';
import {Measure} from '../src/measure.js';
import {updateInstanceLods} from '../src/lod.js';
export function fixture(label={style:{}}) {
 const scene=new T.Scene(),root=new T.Group();scene.add(root);
 const paint=new T.MeshStandardMaterial({color:0x809b85}),shell=new T.MeshStandardMaterial({color:0xcfd5d9});
 const fitting=new T.Mesh(new T.BoxGeometry(2,2,1),paint);fitting.position.set(0,1.4,2);fitting.name='fixed-fitting';root.add(fitting);
 const back=new T.Mesh(new T.BoxGeometry(6,4,.2),shell);back.position.set(0,2,5);back.name='back-wall';root.add(back);
 // Deliberately nearer than the fitting: render-only architecture lines must never win the surface pick.
 const line=new T.LineSegments(new T.BufferGeometry().setFromPoints([new T.Vector3(-1,1.4,.7),new T.Vector3(1,1.4,.7)]),new T.LineBasicMaterial({color:0x284237}));root.add(line);
 const leaf={t:0,object:new T.Group()};root.add(leaf.object);
 const unit=new VisitUnit({id:'fixture',ox:0,object:root,levels:[{floor:0,top:4,rect:{x0:-3,x1:3,z0:0,z1:6}}],built:[{segments:[],wallSegments:[]}],doors:[],lids:[leaf],roomMaps:[],stair:{},shell:[shell]});
 unit.buildMid();
 const camera=new T.PerspectiveCamera(35,1.6,.05,100),measure=new Measure(scene,camera,[root],label);
 const at=(d,away=false)=>{camera.position.set(0,1.4,-d);camera.lookAt(0,1.4,2);camera.updateMatrixWorld(true);unit.cull(camera.position,away);updateInstanceLods(camera);root.updateMatrixWorld(true);return measure.hit();};
 return{T,scene,root,camera,unit,measure,fitting,back,line,leaf,at};
}

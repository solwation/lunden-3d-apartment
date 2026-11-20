import * as T from 'three';
import {Avatar} from '../src/avatar.js';
import {DetailCuller} from '../src/detail.js';
const scene=new T.Scene(),av=new Avatar('me:2211');scene.add(av.object);
const d=new DetailCuller(scene,{W:20,D:20,roof:7,floor1:3,doorHeight:2},{north:[],south:[],walls:[]});
const cam=new T.PerspectiveCamera();cam.position.set(12.5,1.62,26.2);cam.updateMatrixWorld(true);d.update(cam);
const atOrigin=av.mesh.layers.mask;av.object.position.set(12.5,0,26);scene.updateMatrixWorld(true);d.update(cam);const stationary=av.mesh.layers.mask;
cam.position.x+=.7;cam.updateMatrixWorld(true);d.update(cam);
console.log(JSON.stringify({registered:d.items.some(i=>i.o===av.mesh),atOrigin,stationary,afterCameraMove:av.mesh.layers.mask}));av.dispose();

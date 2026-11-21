// #2374: the existing parked meshes, including bicycles baked into rack batches.
// Keep the articulated web models parked; their invisible pick hulls and far LODs are not scenery.
import * as THREE from 'three';
import { GARAGE, PLAYER } from '../../src/config.js';
import { parkingLots } from '../../src/parkinglayout.js';
import { renderedTerrainY } from '../../src/surroundings.js';

const zones = { street: 'omgivning', eastlot: 'omgivning', yard: 'omgivning', courtyard: 'gard', garage: 'kvarteret', storage: 'kvarteret' };
const cmPrecision = p => p.toArray().map(n => +n.toFixed(5));

export function parkedVehicles(world, garage) {
  const meshes = new Map(), vehicles = new Map(), footprints = [];
  const register = (mesh, instance, id, area, feet, start = 0, count = mesh.geometry.attributes.position.count) => {
    if (!count) return;
    if (!vehicles.has(id)) vehicles.set(id, {id, area, zone: zones[area], feet: cmPrecision(feet), parts: []});
    if (!meshes.has(mesh)) meshes.set(mesh, {zone: zones[area], instances: new Map()});
    const entries = meshes.get(mesh).instances;
    if (!entries.has(instance)) entries.set(instance, []);
    entries.get(instance).push({vehicle: vehicles.get(id), start, count});
  };
  const matrix = new THREE.Matrix4();
  const visitCar = mesh => {
    const area = mesh.userData.carBatch;
    if (!mesh.isInstancedMesh || !['street','eastlot','garage'].includes(area)) return;
    for (let i=0; i<mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      if (Math.abs(matrix.determinant()) < 1e-12) continue;
      const feet = new THREE.Vector3().setFromMatrixPosition(matrix).applyMatrix4(mesh.matrixWorld);
      register(mesh, i, `${area}-car-${mesh.userData.carType ?? 'compact'}-${i}`, area, feet);
    }
  };
  world.object.traverse(visitCar);
  garage.carArea.traverse(visitCar);
  for (const [area, bikes] of [['surface',world.bicycles],['garage',garage.bicycles],['storage',garage.storageBicycles]]) {
    bikes.forEach((bike,i) => {
      const location = area === 'surface' ? (bike.components[0].isInstancedMesh ? 'yard' : 'courtyard') : area;
      const id = `${location}-bicycle-${i}`;
      bike.components.forEach((mesh,k) => {
        if (!mesh || (area !== 'surface' && k === 1)) return; // baked basement far LOD
        if (mesh.isInstancedMesh) register(mesh,bike.index,id,location,bike.position);
        else {
          const range = bike.ranges[k];
          if (range) register(mesh,undefined,id,location,bike.position,range.start,range.count);
        }
      });
    });
  }
  const box = (area,kind,foot) => {
    const garageFloor = area === 'garage';
    const heights = foot.map(([x,z]) => garageFloor ? GARAGE.floor : area === 'eastlot' ? renderedTerrainY(x,z) : 0);
    footprints.push({id:`parked_${area}_${kind}_${footprints.length}`, area, zone:zones[area], foot,
      base:Math.min(...heights), top: garageFloor ? GARAGE.ceiling : Math.max(...heights) + PLAYER.headroom});
  };
  world.streetParking.carFootprints.forEach(p => box('street','car',p));
  garage.carPolys.forEach(p => box('garage','car',p));
  parkingLots().cars.forEach(c => box('eastlot','car',c.foot));
  const rack = (area, edges) => box(area,'rack',edges.map(([x,z])=>[x,z]));
  world.streetParking.rackSegments.forEach(r => rack('yard',r));
  const courtyardRack = world.bicycles.find(b => b.id.startsWith('courtyard-'))?.rackSegments;
  if (courtyardRack) rack('courtyard',courtyardRack);
  garage.parkedRackSegments.forEach(r => rack('garage',r));
  // A stored bike returns an empty footprint at its source. Its cage walls/door are existing garage structures.
  return {meshes,vehicles,footprints};
}

export function recordParkedPart(parked, atom, matrix) {
  const rows = parked.meshes.get(atom.object)?.instances.get(atom.instance);
  if (!rows) return;
  const pos = atom.object.geometry.attributes.position;
  for (const {vehicle,start,count} of rows) {
    const anchors = [start, start+Math.floor(count/2), start+count-1].map(index =>
      ({index, web: cmPrecision(new THREE.Vector3().fromBufferAttribute(pos,index).applyMatrix4(matrix))}));
    vehicle.parts.push({node:atom.id, anchors});
  }
}

export function parkedCollision(root, parked, zone) {
  const cube = new THREE.BoxGeometry(), material = new THREE.MeshStandardMaterial({name:'collision',color:0xff00ff});
  let triangles = 0;
  for (const {id,zone:target,foot,base,top} of parked.footprints) {
    if (target !== zone) continue;
    const [a,b,,d] = foot, x=(a[0]+foot[2][0])/2, z=(a[1]+foot[2][1])/2;
    const block = new THREE.Mesh(cube,material);
    block.name = id;
    block.scale.set(Math.hypot(b[0]-a[0],b[1]-a[1]),top-base,Math.hypot(d[0]-a[0],d[1]-a[1]));
    block.position.set(x,(base+top)/2,z);
    block.rotation.y = Math.atan2(a[1]-b[1], b[0]-a[0]);
    block.userData = {id, kind:'collision', zone, source:'Web parked vehicle or rack footprint', materialKeys:['collision'],
      box: {x0:Math.min(...foot.map(p=>p[0])),x1:Math.max(...foot.map(p=>p[0])),
        y0:base,y1:top,z0:Math.min(...foot.map(p=>p[1])),z1:Math.max(...foot.map(p=>p[1]))}};
    root.add(block); triangles += 12;
  }
  return triangles;
}

// glTF baseColorTexture carries alpha in A. The source bike spokes read their alpha from green.
const tintedMaterials = new WeakMap(), spokeMaps = new WeakMap();
export function parkedMaterial(mesh, instance) {
  const base = mesh.material;
  if (!base.alphaMap && !mesh.instanceColor) return base;
  let tints = tintedMaterials.get(base);
  if (!tints) tintedMaterials.set(base,tints = new Map());
  const color = base.color.clone();
  if (mesh.instanceColor) color.multiply(new THREE.Color().fromBufferAttribute(mesh.instanceColor,instance));
  const key = color.getHex();
  if (!tints.has(key)) {
    const m = base.clone();
    m.color.copy(color);
    if (base.alphaMap) {
      let map = spokeMaps.get(base.alphaMap);
      if (!map) {
        const img = base.alphaMap.image, canvas = document.createElement('canvas');
        canvas.width=img.width; canvas.height=img.height;
        const ctx=canvas.getContext('2d'); ctx.drawImage(img,0,0);
        const image=ctx.getImageData(0,0,canvas.width,canvas.height);
        for (let i=0;i<image.data.length;i+=4) {
          image.data[i+3]=image.data[i+1]; image.data[i]=image.data[i+1]=image.data[i+2]=255;
        }
        ctx.putImageData(image,0,0); map=new THREE.CanvasTexture(canvas); map.name='parked-bicycle-spokes';
        spokeMaps.set(base.alphaMap,map);
      }
      m.alphaMap=null; m.map=map;
    }
    tints.set(key,m);
  }
  return tints.get(key);
}

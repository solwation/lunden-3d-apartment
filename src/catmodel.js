import * as THREE from 'three';
import { CAT_SURFACE } from './config.js';

// #1918: authored continuous cat surfaces on the original articulated recipe. These immutable primitive buffers
// may come from the neutral GLB; poses, breed transforms and materials stay local.
export const CAT_RECIPE_VERSION = 2;
const geometries = new Map();
const S = CAT_SURFACE;
const keyOf = (kind, args) => `${kind}:${args.join(',')}`;
export function catPrimitive(kind, ...args) {
  if(kind==='small'||kind==='paw')return catPrimitive('sphere');
  if(kind==='haunch')return catPrimitive('body');
  const key = keyOf(kind, args);
  if (!geometries.has(key)) {
    let geometry;
    if (kind === 'sphere') geometry = new THREE.SphereGeometry(1, ...S.segments.small);
    else if (kind === 'ear') {
      // Curved pinna: a recessed front and rounded back meet at a pointed rim.
      const positions=[], uv=[], indices=[], rows=S.segments.ear[1], cols=S.segments.ear[0];
      for(let face=0;face<2;face++) for(let j=0;j<=rows;j++) for(let i=0;i<=cols;i++) {
        const v=j/rows, u=i/cols*2-1, width=S.ear.width*Math.pow(1-v,S.ear.taper);
        positions.push(u*width, S.ear.base+v*S.ear.height, face ? S.ear.back*(1-v) : S.ear.rim*u*u*(1-v)-S.ear.recess*Math.sin(Math.PI*v)*(1-u*u));
        uv.push(i/cols,v);
      }
      const layer=(rows+1)*(cols+1);
      for(let f=0;f<2;f++)for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
        const a=f*layer+j*(cols+1)+i,b=a+1,c=a+cols+1,d=c+1;
        indices.push(...(f?[a,c,b,b,c,d]:[a,b,c,b,d,c]));
      }
      for(let j=0;j<rows;j++)for(const i of [0,cols]){
        const a=j*(cols+1)+i,c=a+cols+1;indices.push(a,c,a+layer,c,c+layer,a+layer);
      }
      for(let i=0;i<cols;i++)indices.push(i,i+layer,i+1,i+1,i+layer,i+1+layer);
      geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
    }
    else if (kind === 'muzzle') {
      // Broad, shallow whisker-pad silhouette rather than a projecting muzzle ball.
      geometry=new THREE.SphereGeometry(1,...S.segments.muzzle);
      const p=geometry.attributes.position;
      for(let i=0;i<p.count;i++) {
        const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
        p.setXYZ(i,x,y*(S.muzzleHeight[0]+S.muzzleHeight[1]*Math.abs(x)),z*(S.muzzleDepth[0]+S.muzzleDepth[1]*Math.abs(x)));
      }
      geometry.computeVertexNormals();
    }
    else if (['head','body','eye'].includes(kind)) {
      geometry=new THREE.SphereGeometry(1,...(kind==='eye'?S.segments.eye:S.segments.main));
      const p=geometry.attributes.position;
      for(let i=0;i<p.count;i++){
        let x=p.getX(i),y=p.getY(i),z=p.getZ(i);
        if(kind==='head'){x*=S.headWidth[0]+S.headWidth[1]*Math.exp(-Math.pow((y+S.headWidth[2])/S.headWidth[3],2));z*=z>0?S.headFrontDepth:1;}
        if(kind==='body'){x*=S.bodyWidth*(1-S.bodyTaper*y);z=z*S.bodyDepth+S.neckForward*Math.max(0,y)*Math.max(0,z);}
        if(kind==='eye'){y*=Math.pow(Math.max(0,1-x*x),S.eyeProfile[0]);z*=S.eyeProfile[1];}
        p.setXYZ(i,x,y,z);
      }
      geometry.computeVertexNormals();
    }
    else if (kind === 'limb') {
      const [r, len] = args;
      const pts = [[0, -len], [.7*r, -len+.3*r], [.85*r, -len+.9*r], [.8*r, -.62*len], [.95*r, -.42*len],
        [S.limbBulge[0]*r, -.16*len], [S.limbBulge[1]*r, 0], [.75*r, .75*r], [0, r]];
      geometry = new THREE.LatheGeometry(pts.map(([x,y]) => new THREE.Vector2(x,y)), S.segments.limb);
    } else throw Error(`Unknown cat primitive ${kind}`);
    // Collapsed seam/pole vertices have no incident face; give them a finite unit normal
    // before export so the GLB loader and procedural fallback remain identical.
    const normals=geometry.attributes.normal;
    for(let i=0;i<normals.count;i++)if(normals.getX(i)**2+normals.getY(i)**2+normals.getZ(i)**2<1e-12)normals.setXYZ(i,0,1,0);
    geometry.normalizeNormals();
    geometry.userData.catPrimitive = key;
    geometry.userData.keepCpu = true; // later binder/held/outdoor snapshots read/clone these shared buffers.
    geometries.set(key, geometry);
  }
  return geometries.get(key);
}

/** Reject an unrelated/old imported model atomically, retaining the valid fallback. */
export function installCatModel(gltf) {
  if (gltf?.scene?.userData.catRecipe !== CAT_RECIPE_VERSION) return false;
  const required = [...['sphere','head','body','eye','muzzle','ear'].map(k=>catPrimitive(k)), catPrimitive('limb', .021, .17), catPrimitive('limb', .019, .09)];
  const found = new Map();
  gltf.scene.traverse(o => { if (o.isMesh && o.userData.catPrimitive) found.set(o.userData.catPrimitive, o.geometry); });
  for (const source of required) {
    const loaded = found.get(source.userData.catPrimitive);
    for (const name of ['position', 'normal', 'uv']) {
      const a = source.attributes[name], b = loaded?.attributes[name];
      if (!b || a.count !== b.count || a.itemSize !== b.itemSize) return false;
      for (let i=0;i<a.array.length;i++) if (!Number.isFinite(b.array[i]) || Math.abs(a.array[i]-b.array[i]) > 2e-6) return false;
    }
    if (source.index?.count !== loaded.index?.count) return false;
    if (source.index) for (let i=0;i<source.index.count;i++) if (source.index.array[i] !== loaded.index.array[i]) return false;
  }
  for (const source of required) {
    const key = source.userData.catPrimitive, loaded = found.get(key);
    loaded.userData.catPrimitive = key;
    loaded.userData.keepCpu = true;
    geometries.set(key, loaded);
  }
  return true;
}

/** Geometry-only substitution keeps the actual pose/paw/eye/material references. */
export function applyCatModel(object) {
  object.traverse(o => {
    const key = o.geometry?.userData.catPrimitive;
    if (key && geometries.has(key)) {
      const source=geometries.get(key);
      if(o.geometry.attributes.color) {
        // Preserve the shared coat-colour view while replacing only native surface buffers.
        for(const name of ['position','normal','uv']) o.geometry.setAttribute(name,source.attributes[name]);
        o.geometry.setIndex(source.index);
      } else o.geometry=source;
    }
  });
}

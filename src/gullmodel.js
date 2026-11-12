import * as THREE from 'three';
import { GULL_SURFACE as S } from './config.js';

// One immutable unit-span recipe for the real flock and the collection. Art inputs live in config.
const cache = new Map();
export function gullGeometry(near = true) {
  if (cache.has(near)) return cache.get(near);
  const positions=[],normals=[],colors=[],wings=[];
  const palette=Object.fromEntries(Object.entries(S.colors).map(([k,c])=>[k,new THREE.Color(c)]));
  function add(g,color,wing=0){
    const flat=g.index?g.toNonIndexed():g, p=flat.attributes.position,n=flat.attributes.normal;
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),c=wing&&Math.abs(x)>S.wing[2][0]?palette.tip:palette[color];
      positions.push(x,p.getY(i),p.getZ(i));normals.push(n.getX(i),n.getY(i),n.getZ(i));colors.push(c.r,c.g,c.b);wings.push(wing);
    }
    if(flat!==g)flat.dispose();g.dispose();
  }
  function polygon(points,side,color,wing=0,height=0,thick=false){
    const ring=points.map(([x,z])=>new THREE.Vector2(x*side,z));
    const faces=THREE.ShapeUtils.triangulateShape(ring,[]),p=[];
    const point=(i,y)=>[ring[i].x,y,ring[i].y];
    const top=i=>height+(wing?S.wingCamber*(1-Math.abs(ring[i].x)*2):0);
    for(const f of faces){for(const i of f)p.push(...point(i,top(i)));if(thick)for(const i of f.slice().reverse())p.push(...point(i,top(i)-S.wingThickness));}
    if(thick)for(let i=0;i<ring.length;i++){
      const j=(i+1)%ring.length,a=point(i,top(i)),b=point(j,top(j)),c=point(i,top(i)-S.wingThickness),d=point(j,top(j)-S.wingThickness);
      p.push(...a,...c,...b,...b,...c,...d);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.computeVertexNormals();add(g,color,wing);
  }
  if(near){
    for(const part of [S.body,S.head])add(new THREE.SphereGeometry(1,S.sides,S.rings).scale(...part.scale).translate(...part.at),'body');
    for(const side of [-1,1]){
      add(new THREE.SphereGeometry(S.eye.radius,S.eyeSides,S.eyeRings).translate(side*S.eye.at[0],S.eye.at[1],S.eye.at[2]),'eye');
      polygon(S.wing,side,'wing',side,0,true);
    }
    add(new THREE.ConeGeometry(S.bill.radius,S.bill.length,S.billSides).rotateX(Math.PI/2).translate(...S.bill.at),'bill');
    polygon(S.tail,1,'body',0,0,true);
  }else{
    polygon(S.farBody,1,'body');polygon(S.farTail,1,'body');
    for(const side of [-1,1])polygon(S.farWing,side,'wing',side);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setAttribute('aWing',new THREE.Float32BufferAttribute(wings,1));
  g.computeBoundingSphere();cache.set(near,g);return g;
}

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

// #2129: a sparrow-like small bird at unit wingspan (BIRD_LIFE.size m in the world), the same attribute layout as the gull
// (position, normal, color, aWing) so it is drawn by the gulls' own shader material: no new program. Brown back and wings with
// darker tips, a grey-buff belly (by height on the body), a dark bill; ~110 triangles. Shapes and colours *guess* by eye.
let sparrow = null;
export function sparrowGeometry() {
  if (sparrow) return sparrow;
  const positions = [], normals = [], colors = [], wings = [], col = (h) => new THREE.Color(h);
  const C = { back: col(0x7b5b3c), belly: col(0xb9ad98), wing: col(0x6e4b2d), tip: col(0x3a2b1e), head: col(0x6f6458), cheek: col(0xc9c0b0), bill: col(0x2b2622), tail: col(0x5a4330) };
  function add(g, color, wing = 0) {
    const flat = g.index ? g.toNonIndexed() : g, p = flat.attributes.position, n = flat.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), c = typeof color === 'function' ? color(x, y, p.getZ(i)) : color;
      positions.push(x, y, p.getZ(i)); normals.push(n.getX(i), n.getY(i), n.getZ(i)); colors.push(c.r, c.g, c.b); wings.push(wing);
    }
    if (flat !== g) flat.dispose(); g.dispose();
  }
  const sheet = (pts, side, y, color, wing = 0) => { // a two-sided flat polygon in the x/z plane
    const ring = pts.map(([x, z]) => new THREE.Vector2(x * side, z)), p = [];
    for (const f of THREE.ShapeUtils.triangulateShape(ring, [])) { for (const i of f) p.push(ring[i].x, y, ring[i].y); for (const i of f.slice().reverse()) p.push(ring[i].x, y - 0.012, ring[i].y); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.computeVertexNormals(); add(g, color, wing);
  };
  add(new THREE.SphereGeometry(1, 7, 5).scale(0.13, 0.12, 0.27).translate(0, 0, -0.03), (x, y) => (y > -0.01 ? C.back : C.belly));
  add(new THREE.SphereGeometry(1, 6, 4).scale(0.1, 0.1, 0.11).translate(0, 0.08, 0.22), (x, y, z) => (Math.abs(x) > 0.06 && y < 0.09 ? C.cheek : C.head));
  add(new THREE.ConeGeometry(0.03, 0.08, 4).rotateX(Math.PI / 2).translate(0, 0.07, 0.36), C.bill);
  sheet([[-0.05, -0.22], [-0.075, -0.5], [0.075, -0.5], [0.05, -0.22]], 1, 0.04, C.tail);
  for (const side of [-1, 1]) sheet([[0.05, 0.12], [0.24, 0.08], [0.5, -0.04], [0.43, -0.13], [0.22, -0.12], [0.05, -0.14]], side, 0.06, (x) => (Math.abs(x) > 0.36 ? C.tip : C.wing), side);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); g.setAttribute('aWing', new THREE.Float32BufferAttribute(wings, 1));
  g.computeBoundingSphere(); return (sparrow = g);
}

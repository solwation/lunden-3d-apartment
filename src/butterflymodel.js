// Project-authored shared butterfly surfaces and a bounded vertex hinge, with no geometry rebuild per frame.
import * as T from 'three';
import { BUTTERFLY_SURFACE as A } from './config.js';

export function butterflyGeometry({ magic = false } = {}) {
  const positions = [], colors = [], wings = [], uv = [];
  function vertex(p, tint, wing, texture = null) { positions.push(...p); colors.push(tint,tint,tint); wings.push(wing); if (texture) uv.push(...texture); }
  function triangle(points, tint, wing) { points.forEach(p => vertex(p,tint,wing)); }
  if (magic) {
    // Three strips: the body stays still while each painted wing pair hinges independently.
    for (const [left,right,wing] of [[-.5,-A.magic.hinge,1],[-A.magic.hinge,A.magic.hinge,0],[A.magic.hinge,.5,1]]) {
      for (const [x,y] of [[left,-.5],[right,-.5],[right,.5],[left,-.5],[right,.5],[left,.5]]) vertex([x,y,0],1,wing,[x+.5,y+.5]);
    }
  } else {
    const point = (p, side, lift = 0) => [p[0]*A.span*side,A.wingY+lift,p[1]*A.length];
    for (const side of [-1,1]) for (const shape of [A.fore,A.hind]) {
      for (let i=0;i<shape.contour.length;i++) {
        vertex(point(shape.hub,side),A.wingTint,1);
        vertex(point(shape.contour[i],side),A.edgeTint,1);
        vertex(point(shape.contour[(i+1)%shape.contour.length],side),A.edgeTint,1);
      }
      triangle(shape.vein.map(p=>point(p,side,A.markLift)),A.veinTint,1);
      const [x,z,r]=shape.mark;
      for(let i=0;i<A.markSegments;i++) triangle([[x,z],[x+r*Math.cos(i/A.markSegments*Math.PI*2),z+r*Math.sin(i/A.markSegments*Math.PI*2)],[x+r*Math.cos((i+1)/A.markSegments*Math.PI*2),z+r*Math.sin((i+1)/A.markSegments*Math.PI*2)]].map(p=>point(p,side,A.markLift)),A.markTint,1);
    }
    for(const part of A.body) {
      const g=new T.OctahedronGeometry(1),p=g.attributes.position;
      for(let i=0;i<p.count;i++) vertex([p.getX(i)*part.scale[0]+part.at[0],p.getY(i)*part.scale[1]+part.at[1],p.getZ(i)*part.scale[2]+part.at[2]],A.bodyTint,0);
      g.dispose();
    }
    for(const side of [-1,1]) {
      const r=A.antenna.root,e=A.antenna.end,w=A.antenna.width;
      const a=[r[0],r[1],r[2]],b=[e[0]*side,e[1],e[2]],c=[b[0]+w,b[1],b[2]];
      triangle([a,b,c],A.bodyTint,0);
      triangle([a,[a[0]+w,a[1],a[2]],c],A.bodyTint,0);
    }
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.setAttribute('wing',new T.Float32BufferAttribute(wings,1));
  if(magic)g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.computeVertexNormals();return g;
}

export const butterflyFold = t => A.fold.max-(A.fold.max-A.fold.min)*Math.abs(Math.sin(t*A.fold.hz));

export function hingeButterfly(material,{magic=false,instanced=false}={}) {
  material.vertexColors=true;
  const prior=material.onBeforeCompile,priorKey=material.customProgramCacheKey(),fold={value:A.fold.rest};
  material.userData.butterflyFold=fold;
  material.onBeforeCompile=function(shader,renderer) {
    prior.call(this,shader,renderer);shader.uniforms.butterflyFold=fold;
    const input=instanced?'attribute float wingFold;':'uniform float butterflyFold;';
    const angle=instanced?'wingFold':'butterflyFold',plane=magic?'xz':'xy',hinge=magic?A.magic.hinge:A.hinge;
    const setup=`float bfAngle=wing*${angle}*sign(position.x); float bfC=cos(bfAngle),bfS=sin(bfAngle); mat2 bfTurn=mat2(bfC,bfS,-bfS,bfC);`;
    shader.vertexShader=`attribute float wing;\n${input}\n`+shader.vertexShader
      .replace('void main() {',`void main() {\n${setup}`)
      .replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>\nobjectNormal.${plane}=bfTurn*objectNormal.${plane};`)
      .replace('#include <begin_vertex>',`#include <begin_vertex>\nvec2 bfPosition=transformed.${plane}; bfPosition.x-=wing*sign(position.x)*${hinge.toFixed(8)}; bfPosition=bfTurn*bfPosition; bfPosition.x+=wing*sign(position.x)*${hinge.toFixed(8)}; transformed.${plane}=bfPosition;`);
  };
  material.customProgramCacheKey=()=>`${priorKey}:butterfly-hinge-${magic}-${instanced}`;
  return material;
}

/** One 64px authored silhouette, also used by ordinary butterfly marks and collection previews. */
export function paintButterfly(g,n) {
  const P=A.atlas,point=(p,side)=>[(.5+side*p[0]*P.extent)*n,(.5-p[1]*P.extent)*n];
  g.lineWidth=n*P.line;g.lineJoin='round';
  for(const side of [-1,1])for(const shape of [A.fore,A.hind]) {
    g.beginPath();shape.contour.forEach((p,i)=>{const [x,y]=point(p,side);if(i)g.lineTo(x,y);else g.moveTo(x,y)});g.closePath();g.fillStyle='#fff';g.fill();g.strokeStyle=P.edge;g.stroke();
    g.beginPath();const [a,b]=[point(shape.vein[0],side),point(shape.vein[1],side)];g.moveTo(...a);g.lineTo(...b);g.strokeStyle=P.vein;g.stroke();
    const [x,z,r]=shape.mark,[mx,my]=point([x,z],side);g.beginPath();g.arc(mx,my,r*P.extent*n,0,Math.PI*2);g.fillStyle=P.mark;g.fill();
  }
  g.fillStyle=P.body;for(const [x,y,rx,ry]of [P.abdomen,P.thorax]){g.beginPath();g.ellipse(x*n,y*n,rx*n,ry*n,0,0,Math.PI*2);g.fill()}
  g.beginPath();g.arc(P.head[0]*n,P.head[1]*n,P.head[2]*n,0,Math.PI*2);g.fill();g.strokeStyle=P.body;
  for(const [x,y,xx,yy]of P.antenna){g.beginPath();g.moveTo(x*n,y*n);g.lineTo(xx*n,yy*n);g.stroke()}
}

import { creature } from './bestiarymetadata.js';
import * as THREE from 'three';
import { BIRDS, SKYLAYER, GULL_SURFACE as S } from './config.js';
import { gullGeometry } from './gullmodel.js';

// Seeded gull motion stays in the GPU. Two exclusive LOD batches keep distant flock costs tiny.
// A bounded allocation-free CPU pass only chooses each seed's batch; no pose/geometry is built per frame.
const num = x => Number(x).toFixed(6);
const vert = /* glsl */`
  attribute float aWing;
  attribute vec4 aSeed;
  attribute vec2 aSeed2;
  varying vec3 vColor;
  uniform float uTime, uSpan, uFlap, uBank, uFade, uHigh;
  uniform vec3 uCenter;
  vec3 roll(vec3 v,float a){float c=cos(a),s=sin(a);return vec3(v.x*c-v.y*s,v.x*s+v.y*c,v.z);}
  void main(){
    float a=aSeed.x+uTime*aSeed.w;
    vec3 pos=uCenter+vec3(cos(a)*aSeed.y,aSeed.z+sin(uTime*${num(S.bobHz)}+aSeed.x*${num(S.seedPhase)})*${num(S.bobAmplitude)},sin(a)*aSeed.y);
    vec3 fwd=vec3(-sin(a)*sign(aSeed.w),0.,cos(a)*sign(aSeed.w));
    vec3 right=vec3(-fwd.z,0.,fwd.x);
    float glide=smoothstep(${num(S.glideGate[0])},${num(S.glideGate[1])},sin(uTime*${num(S.glideRate)}+aSeed2.x));
    float flap=sin(uTime*uFlap*6.2831853+aSeed2.x)*${num(S.flapAngle)}*glide*aWing;
    vec3 local=position;local.x-=aWing*${num(S.wingRoot)};local=roll(local,flap);local.x+=aWing*${num(S.wingRoot)};
    float bank=-sign(aSeed.w)*uBank+sin(uTime*${num(S.bankRate)}+aSeed.x)*${num(S.bankSway)};
    local=roll(local,bank);
    vec3 n=roll(roll(normal,flap),bank);n=right*n.x+vec3(0.,n.y,0.)+fwd*n.z;
    float scale=uSpan*mix(1.,${num(S.farScale)},smoothstep(${num(S.scaleFrom)},${num(S.scaleTo)},distance(pos,cameraPosition)));
    scale*=mix(1.,${num(S.highScale)},aSeed2.y)*uFade*mix(1.,uHigh,aSeed2.y);
    vec3 world=pos+(right*local.x+vec3(0.,local.y,0.)+fwd*local.z)*scale;
    vColor=color*(${num(S.shade[0])}+${num(S.shade[1])}*max(0.,dot(normalize(n),normalize(vec3(${S.light.map(num).join(',')})))));
    gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);
  }`;
const frag=/* glsl */`
  uniform vec3 uCol;
  varying vec3 vColor;
  void main(){gl_FragColor=vec4(vColor*uCol,1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
const smooth=(a,b,x)=>THREE.MathUtils.smoothstep(x,a,b);

export function birdGeometry(count,seeds,near=false){
  const base=gullGeometry(near),g=new THREE.InstancedBufferGeometry();
  for(const [name,attribute]of Object.entries(base.attributes))g.setAttribute(name,attribute);
  g.setAttribute('aSeed',new THREE.InstancedBufferAttribute(seeds.a,4).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aSeed2',new THREE.InstancedBufferAttribute(seeds.b,2).setUsage(THREE.DynamicDrawUsage));
  g.instanceCount=count;return g;
}

export class Birds {
  /** `center`: {x, z} of the area they circle over; `lowMemory`: fewer on phones. `day`: the DayCycle. */
  constructor({ scene, camera, day, center, lowMemory = false, count = null }) {
    const B = BIRDS, fallback = lowMemory ? B.lowMemoryCount : B.count, requested = count ?? fallback;
    // #1924: debug input cannot make the per-frame partition exceed the configured flock budget.
    const n = Number.isFinite(requested) ? Math.max(0, Math.min(B.count, Math.floor(requested))) : fallback;
    const high = Math.min(B.high, Math.round(n * B.high / B.count));
    Object.assign(this, { camera, day, count: n, time: 0, fade: 0, rain: 0 });
    let s = 1252; // fixed seed: the same flock every visit (mulberry32)
    const rnd = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const lerp = ([a, b], k) => a + (b - a) * k;
    const seeds = { a: new Float32Array(n * 4), b: new Float32Array(n * 2) };
    for (let i = 0; i < n; i++) {
      const isHigh = i >= n - high, speed = lerp(B.speed, rnd()), r = isHigh ? lerp(B.radius, 0.5 + 0.5 * rnd()) * 1.3 : lerp(B.radius, rnd());
      seeds.a.set([(i / n) * Math.PI * 2 + rnd() * 0.8, r, isHigh ? lerp(B.highAlt, rnd()) : lerp(B.alt, rnd()), (rnd() < 0.5 ? -1 : 1) * speed / r], i * 4);
      seeds.b.set([rnd() * 6.283, isHigh ? 1 : 0], i * 2);
    }
    this.seeds=seeds;
    this.lodCounts={near:0,far:n};
    this.lodIDs={near:new Int32Array(n),far:new Int32Array(n)};
    this.batches={near:{a:new Float32Array(n*4),b:new Float32Array(n*2)},far:{a:new Float32Array(n*4),b:new Float32Array(n*2)}};
    this.uniforms = {
      uTime: { value: 0 }, uSpan: { value: B.span }, uFlap: { value: B.flap }, uBank: { value: B.bank }, uFade: { value: 0 }, uHigh: { value: 1 },
      uCenter: { value: new THREE.Vector3(center.x, 0, center.z) }, uCol: { value: new THREE.Color(0.9, 0.9, 0.88) },
    };
    const material=new THREE.ShaderMaterial({uniforms:this.uniforms,vertexShader:vert,fragmentShader:frag,vertexColors:true,side:THREE.DoubleSide,fog:false});
    this.mesh=new THREE.Mesh(birdGeometry(n,this.batches.far),material);
    this.nearMesh=new THREE.Mesh(birdGeometry(0,this.batches.near,true),material);
    this.meshes=[this.mesh,this.nearMesh];
    for(const mesh of this.meshes){
      mesh.frustumCulled=false;mesh.visible=false;mesh.raycast=()=>{};
      mesh.userData.warmDraw=true;mesh.userData.noDetail=true;scene.add(mesh);
    }
  }

  /** Per frame: `rain` = the weather's strength 0…1, `hidden` = underground. No allocations. */
  update(dt, rain = 0, hidden = false) {
    const B = BIRDS, d = this.day, u = this.uniforms, cam = this.camera.position;
    const above = d.above ?? 0, white = d.uniforms.uWhite.value;
    const cover = smooth(SKYLAYER.cloudy, SKYLAYER.full, d.overcast);
    const inArea = Math.hypot(cam.x - u.uCenter.value.x, cam.z - u.uCenter.value.z) < B.far;
    const want = !hidden && inArea && d.daylight >= B.day && rain < B.rain && white < 0.05 ? 1 : 0;
    this.fade += Math.sign(want - this.fade) * Math.min(Math.abs(want - this.fade), dt * B.fade);
    this.mesh.visible = this.nearMesh.visible = this.fade > 0.01;
    if (!this.mesh.visible) return;
    this.time += dt;
    u.uTime.value = this.time;
    u.uFade.value = this.fade;
    u.uHigh.value = cover < 0.01 || above > 0.5 ? 1 : 0; // the high flock is hidden behind the cloud deck in cloudy weather
    u.uCol.value.setRGB(0.97, 0.97, 0.95).multiplyScalar(0.35 + 0.65 * d.daylight);
    let far=0,near=0;
    const a=this.seeds.a,b=this.seeds.b;
    for(let i=0;i<this.count;i++){
      const j=i*4,phase=a[j]+this.time*a[j+3];
      const x=u.uCenter.value.x+Math.cos(phase)*a[j+1],z=u.uCenter.value.z+Math.sin(phase)*a[j+1];
      const y=a[j+2]+Math.sin(this.time*S.bobHz+a[j]*S.seedPhase)*S.bobAmplitude;
      // Same positions as the shader. A single hard boundary selects exactly one batch.
      const close=(x-cam.x)**2+(y-cam.y)**2+(z-cam.z)**2<S.lodNear*S.lodNear;
      const key=close?'near':'far',k=close?near++:far++,target=this.batches[key];
      for(let c=0;c<4;c++)target.a[k*4+c]=a[j+c];
      target.b[k*2]=b[i*2];target.b[k*2+1]=b[i*2+1];this.lodIDs[key][k]=i;
    }
    this.lodCounts.far=far;this.lodCounts.near=near;
    this.mesh.geometry.instanceCount=far;this.nearMesh.geometry.instanceCount=near;
    this.mesh.visible=far>0;this.nearMesh.visible=near>0;
    for(const mesh of this.meshes)if(mesh.visible){
      mesh.geometry.attributes.aSeed.needsUpdate=true;mesh.geometry.attributes.aSeed2.needsUpdate=true;
    }
  }
}

creature({id:'bird:gull',interactive:false,no:50,name:'Mås',family:'birds',modelVersion:2,model:{kind:'gull'},info:{size:`${BIRDS.span??1} m modellvingbredd`,weight:'0,3–0,5 kg (uppskattning)',where:'Himlen över kvarteret',when:'Ljust och uppehåll',likes:'Att glidflyga'},facts:['Flockens vingar och rörelser räknas i samma shader.','De höga fåglarna är samma fågelform, inte en ny art.','Bara sedd: måsen har ingen egen spelarinteraktion.']});

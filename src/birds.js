import { creature } from './bestiarymetadata.js';
import * as THREE from 'three';
import { BIRDS, SKYLAYER, GULL_SURFACE as S, BIRD_LIFE as L, CORVIDS as CV } from './config.js';
import { gullGeometry, sparrowGeometry, corvidGeometry } from './gullmodel.js';
import { collectPerches, gullSpots, SmallFlock, GullRoost } from './birdflock.js';
import { CorvidFlock, CORVID_KINDS, corvidCount, corvidCapacity } from './corvids.js';

// Seeded gull motion stays in the GPU. Two exclusive LOD batches keep distant flock costs tiny.
// A bounded allocation-free CPU pass only chooses each seed's batch; no pose/geometry is built per frame.
// #2129: an instance with aMode.x = 1 takes an explicit pose from the CPU instead (aPose = x, y, z, yaw; aMode = on, flap 0…1,
// fold 0…1, size m; aTurn = bank, pitch, flap Hz, far enlargement 0…1): a landing gull (birdflock.js GullRoost) and the small
// birds (SmallFlock, their own instanced mesh with the sparrow geometry and THIS material, so no new program).
const num = x => Number(x).toFixed(6);
const vert = /* glsl */`
  attribute float aWing;
  attribute vec4 aSeed;
  attribute vec2 aSeed2;
  attribute vec4 aPose, aMode, aTurn;
  varying vec3 vColor;
  uniform float uTime, uSpan, uFlap, uBank, uFade, uHigh;
  uniform vec3 uCenter;
  vec3 roll(vec3 v,float a){float c=cos(a),s=sin(a);return vec3(v.x*c-v.y*s,v.x*s+v.y*c,v.z);}
  vec3 tip(vec3 v,float a){float c=cos(a),s=sin(a);return vec3(v.x,v.y*c-v.z*s,v.y*s+v.z*c);}
  void main(){
    vec3 pos,fwd;float flap,bank,size,enlarge=1.,fold=0.,pitch=0.;
    if(aMode.x>.5){
      pos=aPose.xyz;fwd=vec3(sin(aPose.w),0.,cos(aPose.w));
      flap=sin(uTime*aTurn.z*6.2831853+aSeed2.x)*${num(S.flapAngle)}*aMode.y*aWing;
      bank=aTurn.x;pitch=aTurn.y;fold=aMode.z;size=aMode.w;enlarge=aTurn.w;
    }else{
      float a=aSeed.x+uTime*aSeed.w;
      pos=uCenter+vec3(cos(a)*aSeed.y,aSeed.z+sin(uTime*${num(S.bobHz)}+aSeed.x*${num(S.seedPhase)})*${num(S.bobAmplitude)},sin(a)*aSeed.y);
      fwd=vec3(-sin(a)*sign(aSeed.w),0.,cos(a)*sign(aSeed.w));
      float glide=smoothstep(${num(S.glideGate[0])},${num(S.glideGate[1])},sin(uTime*${num(S.glideRate)}+aSeed2.x));
      flap=sin(uTime*uFlap*6.2831853+aSeed2.x)*${num(S.flapAngle)}*glide*aWing;
      bank=-sign(aSeed.w)*uBank+sin(uTime*${num(S.bankRate)}+aSeed.x)*${num(S.bankSway)};
      size=uSpan;
    }
    vec3 right=vec3(-fwd.z,0.,fwd.x);
    vec3 local=position;
    // folded: the wing lies swept back along the body (its span shrinks to a few cm, the tip goes back over the tail)
    float out_=max(0.,local.x*aWing-${num(S.wingRoot)});local.x-=aWing*out_*(1.-mix(1.,.14,fold));local.z-=out_*.7*fold;local.y+=out_*.12*fold;
    local.x-=aWing*${num(S.wingRoot)};local=roll(local,flap);local.x+=aWing*${num(S.wingRoot)};
    local=roll(tip(local,pitch),bank);
    vec3 n=roll(tip(roll(normal,flap),pitch),bank);n=right*n.x+vec3(0.,n.y,0.)+fwd*n.z;
    float scale=size*mix(1.,mix(1.,${num(S.farScale)},enlarge),smoothstep(${num(S.scaleFrom)},${num(S.scaleTo)},distance(pos,cameraPosition)));
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
const params_noCorvids=()=>typeof location!=='undefined'&&new URLSearchParams(location.search).has('nocorvids'); // debug: &nocorvids (the before view)
/** #2129: an explicit pose into slot k of a batch (`p.on` false: the circling gull, all zero). */
function writePose(t,k,p,size,hz,enlarge){
  const q=k*4;
  if(!p.on){t.mode[q]=0;return;}
  t.pose[q]=p.x;t.pose[q+1]=p.y;t.pose[q+2]=p.z;t.pose[q+3]=p.yaw;
  t.mode[q]=1;t.mode[q+1]=p.flap;t.mode[q+2]=p.fold;t.mode[q+3]=size;
  t.turn[q]=p.bank;t.turn[q+1]=p.pitch;t.turn[q+2]=hz;t.turn[q+3]=enlarge;
}

export function birdGeometry(count,seeds,near=false,base=gullGeometry(near)){
  const g=new THREE.InstancedBufferGeometry(),n=seeds.a.length/4;
  for(const [name,attribute]of Object.entries(base.attributes))g.setAttribute(name,attribute);
  g.setAttribute('aSeed',new THREE.InstancedBufferAttribute(seeds.a,4).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aSeed2',new THREE.InstancedBufferAttribute(seeds.b,2).setUsage(THREE.DynamicDrawUsage));
  // #2129: the explicit pose (all zero = the circling gull of before)
  for(const k of ['pose','mode','turn'])seeds[k]??=new Float32Array(n*4);
  g.setAttribute('aPose',new THREE.InstancedBufferAttribute(seeds.pose,4).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aMode',new THREE.InstancedBufferAttribute(seeds.mode,4).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aTurn',new THREE.InstancedBufferAttribute(seeds.turn,4).setUsage(THREE.DynamicDrawUsage));
  g.instanceCount=count;return g;
}
const DYNAMIC=['aSeed','aSeed2','aPose','aMode','aTurn'];

export class Birds {
  /** `center`: {x, z} of the area they circle over; `lowMemory`: fewer on phones. `day`: the DayCycle.
   * #2129: `sources()` → { crowns, roofs, rails, patches(flock), groundY, groundOk, bank, topAt } (the perches, read once when first
   * shown; without it there are no small birds and the gulls never land), `threats(out)` → [{ x, y, z }] (the eye, cats). */
  constructor({ scene, camera, day, center, lowMemory = false, count = null, sources = null, threats = null, small = true }) {
    const B = BIRDS, fallback = lowMemory ? B.lowMemoryCount : B.count, requested = count ?? fallback;
    // #1924: debug input cannot make the per-frame partition exceed the configured flock budget.
    const n = Number.isFinite(requested) ? Math.max(0, Math.min(B.count, Math.floor(requested))) : fallback;
    const high = Math.min(B.high, Math.round(n * B.high / B.count));
    Object.assign(this, { camera, day, count: n, time: 0, fade: 0, rain: 0, sources, threats, lowMemory, small, life: null, low: n - high });
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
    this.poses=Array.from({length:n},()=>({on:false,x:0,y:0,z:0,yaw:0,flap:0,fold:0,bank:0,pitch:0,standing:false}));
    this.uniforms = {
      uTime: { value: 0 }, uSpan: { value: B.span }, uFlap: { value: B.flap }, uBank: { value: B.bank }, uFade: { value: 0 }, uHigh: { value: 1 },
      uCenter: { value: new THREE.Vector3(center.x, 0, center.z) }, uCol: { value: new THREE.Color(0.9, 0.9, 0.88) },
    };
    const material=new THREE.ShaderMaterial({uniforms:this.uniforms,vertexShader:vert,fragmentShader:frag,vertexColors:true,side:THREE.DoubleSide,fog:false});
    this.mesh=new THREE.Mesh(birdGeometry(n,this.batches.far),material);
    this.nearMesh=new THREE.Mesh(birdGeometry(0,this.batches.near,true),material);
    this.meshes=[this.mesh,this.nearMesh];
    // #2129: the small birds' own batch (kept out of `meshes`: those are the gull LOD pair), same material
    const smallMax=L.flocks.reduce((a,f)=>a+(lowMemory?(f.lowMemory?f.lowMemoryN:0):f.n),0);
    this.smallSeeds={a:new Float32Array(smallMax*4),b:new Float32Array(smallMax*2)};
    for(let i=0;i<smallMax;i++)this.smallSeeds.b[i*2]=rnd()*6.283;
    this.smallMesh=small&&smallMax?new THREE.Mesh(birdGeometry(0,this.smallSeeds,false,sparrowGeometry()),material):null;
    this.smallMesh&&(this.smallMesh.name='small-birds');
    // #2196: corvids, one instanced mesh per species (own geometry colours), a CLONE of the material so the gulls' fade/time uniforms do not
    // drive them (they stay when snow hides the gulls); the clone has the same shader source, so it reuses the same program
    this.corvidMeshes=[];this.ctime=0;this.cfade=0;
    if(small&&!params_noCorvids()){
      this.corvidMaterial=material.clone();
      const cu=this.corvidMaterial.uniforms;cu.uFade.value=1;cu.uHigh.value=1;
      for(const kind of CORVID_KINDS){
        const cap=L.flocks.reduce((a,f)=>a+corvidCapacity(kind,f.name,lowMemory),0);if(!cap)continue;
        const seeds={a:new Float32Array(cap*4),b:new Float32Array(cap*2)};
        for(let i=0;i<cap;i++)seeds.b[i*2]=rnd()*6.283;
        const mesh=new THREE.Mesh(birdGeometry(0,seeds,false,corvidGeometry(kind)),this.corvidMaterial);
        mesh.name='corvids-'+kind;mesh.userData.kind=kind;mesh.userData.seeds=seeds;this.corvidMeshes.push(mesh);
      }
    }
    for(const mesh of [...this.meshes,this.smallMesh,...this.corvidMeshes].filter(Boolean)){
      mesh.frustumCulled=false;mesh.visible=false;mesh.raycast=()=>{};
      mesh.userData.warmDraw=true;mesh.userData.noDetail=true;scene.add(mesh);
    }
  }

  /** #2129: the perches and gull spots, built once from `sources` (the trees, roofs and rails exist by then). */
  setupLife() {
    const src = this.sources?.(); if (!src) return (this.life = { flocks: [], corvids: [], roost: null });
    const R = src.roofs, roofs = R && { surfaces: R.surfaces, topAt: (x, z) => R.topAt(x, z), above: (x, z, y) => R.above(x, z, y), on: R.on ?? R.constructor.on, height: R.height ?? R.constructor.height };
    const flocks = [], corvids = [], month = this.day?.month ?? 6;
    for (const f of L.flocks) {
      const n = this.lowMemory ? (f.lowMemory ? f.lowMemoryN : 0) : f.n;
      const kinds = this.corvidMeshes.map((m) => m.userData.kind).filter((k) => corvidCount(k, f.name, month, this.lowMemory));
      if ((!n || !this.smallMesh) && !kinds.length) continue;
      const groups = collectPerches({ home: f, crowns: src.crowns ?? [], roofs, rails: src.rails ?? [], patches: src.patches?.(f) ?? [], groundY: src.groundY, groundOk: src.groundOk, clear: src.clear, C: L });
      if (groups.length < 2) continue;
      if (n && this.smallMesh) { const flock = new SmallFlock({ groups, n, seed: f.seed, C: L, topAt: src.topAt }); flock.home = f; flocks.push(flock); }
      for (const kind of kinds) { // #2196: the corvids share the perches, each species its own flock (own seed)
        const flock = new CorvidFlock({ kind, groups, n: corvidCount(kind, f.name, month, this.lowMemory), seed: f.seed + CV.species[kind].seed, topAt: src.topAt });
        flock.home = f; corvids.push(flock);
      }
    }
    const c = this.uniforms.uCenter.value, spots = gullSpots({ center: { x: c.x, z: c.z }, roofs, bank: src.bank ?? [], C: L });
    const a = this.seeds.a, circle = (i, t, o) => { const j = i * 4, p = a[j] + t * a[j + 3]; o.x = c.x + Math.cos(p) * a[j + 1]; o.z = c.z + Math.sin(p) * a[j + 1]; o.y = a[j + 2] + Math.sin(t * S.bobHz + a[j] * S.seedPhase) * S.bobAmplitude; return o; };
    const roost = this.low > 0 && spots.length ? new GullRoost({ count: this.low, spots, circle, seed: 1252, C: L }) : null;
    return (this.life = { flocks, corvids, roost, spots, threats: [] });
  }

  /** #2178: the gull flock's running flush count and where the last flush was, for the alarm call. */
  get gullFlushes() { return this.life?.roost?.flushed ?? 0; }
  get gullFlushAt() { return this.life?.roost?.lastFlush ?? null; }

  /** Where gull `i` is now (the bestiary's sighting point): its landing pose or its circle. */
  gullPoint(i, out) {
    const p = this.poses[i];
    if (p?.on) return out.set(p.x, p.y, p.z);
    const a = this.seeds.a, j = i * 4, c = this.uniforms.uCenter.value, t = this.time, ph = a[j] + t * a[j + 3];
    return out.set(c.x + Math.cos(ph) * a[j + 1], a[j + 2] + Math.sin(t * S.bobHz + a[j] * S.seedPhase) * S.bobAmplitude, c.z + Math.sin(ph) * a[j + 1]);
  }

  /** Small birds sitting on the ground now ({ x, y, z }), for anything that would stalk them (#2125 cats: optional hook). */
  groundBirds(out = []) {
    out.length = 0;
    for (const f of this.life?.flocks ?? []) if (f.visible) for (const b of f.groundBirds(f.scratch ??= [])) out.push(b);
    for (const f of this.life?.corvids ?? []) if (f.visible) for (const b of f.groundBirds(f.scratch ??= [])) out.push(b); // #2196: cats may stalk corvids too
    return out;
  }

  /** #2182: small birds sitting in trees, on roofs or rails now ({ x, y, z }), for the cats' chattering. */
  perchedBirds(out = []) {
    out.length = 0;
    for (const f of this.life?.flocks ?? []) if (f.visible) for (const b of f.perchedBirds(f.scratch2 ??= [])) out.push(b);
    for (const f of this.life?.corvids ?? []) if (f.visible) for (const b of f.perchedBirds(f.scratch2 ??= [])) out.push(b);
    return out;
  }

  /** #2196: how many corvids are shown now, and where / which species corvid `i` is (into `out`; returns the species or null). For the calls. */
  corvidTotal() { let n = 0; for (const f of this.life?.corvids ?? []) if (f.visible) n += f.birds.length; return n; }
  corvidAt(i, out) {
    for (const f of this.life?.corvids ?? []) {
      if (!f.visible) continue;
      if (i < f.birds.length) { const b = f.birds[i]; out.x = b.x; out.y = b.y; out.z = b.z; return f.kind; }
      i -= f.birds.length;
    }
    return null;
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
    if (this.smallMesh) this.smallMesh.visible = false;
    // #2196: the corvids need neither the gulls' fine weather nor snow-free ground: daylight and the area only
    this.updateCorvids(dt, !hidden && inArea && d.daylight >= B.day);
    if (!this.mesh.visible) return;
    this.time += dt;
    u.uTime.value = this.time;
    u.uFade.value = this.fade;
    u.uHigh.value = cover < 0.01 || above > 0.5 ? 1 : 0; // the high flock is hidden behind the cloud deck in cloudy weather
    u.uCol.value.setRGB(0.97, 0.97, 0.95).multiplyScalar(0.35 + 0.65 * d.daylight);
    // #2129: landing gulls and small birds (perches read once, on the first shown frame)
    if (!this.life && this.sources) this.setupLife();
    const threats = this.life ? (this.threats?.(this.life.threats) ?? (this.life.threats.length = 0, this.life.threats)) : null;
    const roost = this.life?.roost;
    if (roost && threats.length) roost.flush(this.time, threats, this.flushScratch ??= {});
    let far=0,near=0;
    const a=this.seeds.a,b=this.seeds.b;
    for(let i=0;i<this.count;i++){
      const j=i*4,phase=a[j]+this.time*a[j+3],p=this.poses[i];
      if (roost && i < this.low) roost.pose(i, this.time, p); else p.on = false;
      const x=p.on?p.x:u.uCenter.value.x+Math.cos(phase)*a[j+1],z=p.on?p.z:u.uCenter.value.z+Math.sin(phase)*a[j+1];
      const y=p.on?p.y:a[j+2]+Math.sin(this.time*S.bobHz+a[j]*S.seedPhase)*S.bobAmplitude;
      // Same positions as the shader. A single hard boundary selects exactly one batch.
      const close=(x-cam.x)**2+(y-cam.y)**2+(z-cam.z)**2<S.lodNear*S.lodNear;
      const key=close?'near':'far',k=close?near++:far++,target=this.batches[key];
      for(let c=0;c<4;c++)target.a[k*4+c]=a[j+c];
      target.b[k*2]=b[i*2];target.b[k*2+1]=b[i*2+1];this.lodIDs[key][k]=i;
      writePose(target,k,p,B.span,L.gull.flapHz,1);
    }
    this.lodCounts.far=far;this.lodCounts.near=near;
    this.mesh.geometry.instanceCount=far;this.nearMesh.geometry.instanceCount=near;
    this.mesh.visible=far>0;this.nearMesh.visible=near>0;
    for(const mesh of this.meshes)if(mesh.visible)for(const name of DYNAMIC)mesh.geometry.attributes[name].needsUpdate=true;
    this.updateSmall(dt, threats);
  }

  /** #2196: step and draw the corvid flocks (`on`: daylight, in the area, not underground). One instanced draw per species. */
  updateCorvids(dt, on) {
    if (!this.corvidMeshes.length) return;
    this.cfade += Math.sign((on ? 1 : 0) - this.cfade) * Math.min(Math.abs((on ? 1 : 0) - this.cfade), dt * CV.fadeIn);
    const show = this.cfade > 0.01;
    for (const m of this.corvidMeshes) m.visible = false;
    if (!show) { for (const f of this.life?.corvids ?? []) f.visible = false; return; }
    if (!this.life && this.sources) this.setupLife();
    const flocks = this.life?.corvids; if (!flocks?.length) return;
    this.ctime += dt;
    const cu = this.corvidMaterial.uniforms, d = this.day;
    cu.uTime.value = this.ctime; cu.uFade.value = this.cfade;
    cu.uCol.value.setRGB(0.97, 0.97, 0.95).multiplyScalar(0.35 + 0.65 * d.daylight);
    const threats = this.threats?.(this.life.threats) ?? (this.life.threats.length = 0, this.life.threats), cam = this.camera.position;
    for (const f of flocks) { f.visible = Math.hypot(cam.x - f.home.x, cam.z - f.home.z) < f.home.r + L.wake; if (f.visible) f.step(dt, threats); }
    for (const m of this.corvidMeshes) {
      const kind = m.userData.kind, s = m.userData.seeds, spec = CV.species[kind], q = this.smallPose ??= { on: true };
      let k = 0;
      for (const f of flocks) {
        if (f.kind !== kind || !f.visible) continue;
        for (const bird of f.birds) {
          if (k * 4 >= s.a.length) break;
          q.x = bird.x; q.y = bird.y + spec.standY; q.z = bird.z; q.yaw = bird.yaw; q.flap = bird.flap; q.fold = bird.fold; q.bank = bird.bank; q.pitch = bird.pitch;
          writePose(s, k++, q, spec.size, spec.flapHz, L.farEnlarge);
        }
      }
      m.geometry.instanceCount = k; m.visible = k > 0;
      if (k) for (const name of DYNAMIC) m.geometry.attributes[name].needsUpdate = true;
    }
  }

  /** #2129: step the flocks near the eye and pack their birds into the small-bird batch. */
  updateSmall(dt, threats) {
    const m = this.smallMesh; if (!m) return;
    let k = 0;
    const cam = this.camera.position, s = this.smallSeeds;
    for (const f of this.life?.flocks ?? []) {
      f.visible = Math.hypot(cam.x - f.home.x, cam.z - f.home.z) < f.home.r + L.wake;
      if (!f.visible) continue;
      f.step(dt, threats);
      for (const bird of f.birds) {
        const q = this.smallPose ??= { on: true };
        q.x = bird.x; q.y = bird.y + L.standY; q.z = bird.z; q.yaw = bird.yaw; q.flap = bird.flap; q.fold = bird.fold; q.bank = bird.bank; q.pitch = bird.pitch;
        writePose(s, k++, q, L.size, L.flapHz, L.farEnlarge);
      }
    }
    m.geometry.instanceCount = k; m.visible = k > 0;
    if (k) for (const name of DYNAMIC) m.geometry.attributes[name].needsUpdate = true;
  }
}

creature({id:'bird:gull',interactive:false,no:50,name:'Mås',family:'birds',modelVersion:2,model:{kind:'gull'},info:{size:`${BIRDS.span??1} m modellvingbredd`,weight:'0,3–0,5 kg (uppskattning)',where:'Himlen över kvarteret',when:'Ljust och uppehåll',likes:'Att glidflyga'},facts:['Flockens vingar och rörelser räknas i samma shader.','De höga fåglarna är samma fågelform, inte en ny art.','Bara sedd: måsen har ingen egen spelarinteraktion.']});

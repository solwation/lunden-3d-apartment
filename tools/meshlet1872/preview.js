import * as THREE from 'three';
import { WebGPURenderer, StandardDrawingPipeline } from 'three/webgpu';
import { MeshletDrawingPipeline } from 'three/addons/pipelines/MeshletDrawingPipeline.js';
import { buildSurroundings } from '../../src/surroundings.js';
import { grassMaterial } from '../../src/grass.js';
import { applySeason } from '../../src/seasons.js';
import { finishStartupCaches } from '../../src/startupcache.js';
import { nodeMaterial, frontSides, geometryBytes } from './adapt.js';

const status = document.querySelector('#status'), result = document.querySelector('#result');
const params = new URLSearchParams(location.search);
const report = { revision: THREE.REVISION, scope: 'Actual east-backdrop from buildSurroundings, frozen June/noon, no game/interior renderer', errors: [] };
window.__meshletReport = report;
const setStatus = s => { status.textContent = s; };
const stats = values => { const a = values.toSorted((a,b)=>a-b); return { median: a[Math.floor(a.length/2)], min:a[0], max:a.at(-1), samples: a.length }; };
const nextFrame = () => new Promise(r => requestAnimationFrame(r));

// Requested buffer bytes, not physical VRAM: texture/driver allocations are not included.
function bufferTracker(device) {
  const data = { live:0, peak:0, created:0 }, create = device.createBuffer.bind(device);
  device.createBuffer = descriptor => {
    const buffer = create(descriptor), destroy = buffer.destroy.bind(buffer);
    let live = true; data.live += descriptor.size; data.created++; data.peak = Math.max(data.peak,data.live);
    buffer.destroy = () => { if(live){data.live -= descriptor.size;live=false;} destroy(); };
    return buffer;
  };
  return data;
}

try {
  const forceWebGL = params.has('webgl');
  // Default renderer fallback is deliberately exercised, not inferred from navigator.gpu.
  const gpu = navigator.gpu, adapter = !forceWebGL && gpu ? await gpu.requestAdapter() : null;
  const requestedDevice = adapter ? await adapter.requestDevice({requiredFeatures:['timestamp-query','float32-filterable','core-features-and-limits'].filter(f=>adapter.features.has(f))}) : undefined;
  window.__meshletDeviceLifetime = {gpu,adapter,device:requestedDevice};
  const renderer = new WebGPURenderer({ antialias:false, forceWebGL, trackTimestamp:true, ...(requestedDevice?{device:requestedDevice}:{}) });
  await renderer.init();
  report.backend = renderer.backend.isWebGPUBackend ? 'webgpu' : 'webgl';
  const device = renderer.backend.device;
  report.timestampQueries=!!device?.features.has('timestamp-query');
  report.adapter = device ? { vendor:device.adapterInfo?.vendor, architecture:device.adapterInfo?.architecture,
    device:device.adapterInfo?.device, description:device.adapterInfo?.description, isFallbackAdapter:device.adapterInfo?.isFallbackAdapter } : null;
  const buffers = device ? bufferTracker(device) : null;
  device?.addEventListener('uncapturederror',e => { report.errors.push(e.error.message); setStatus('GPU-fel: '+e.error.message); });
  renderer.setPixelRatio(1); renderer.setSize(800,500);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  document.querySelector('#view').append(renderer.domElement);
  const standard = new StandardDrawingPipeline(), meshlet = new MeshletDrawingPipeline({lodThreshold:1});
  renderer.drawingPipeline = meshlet; // binds the exact release's material eligibility predicate
  setStatus('Bygger verklig områdesgeometri…');
  await nextFrame();
  const builtAt=performance.now(), surroundings=buildSurroundings({grass:grassMaterial()});
  applySeason(6); surroundings.userData.windows.update(12,0);
  finishStartupCaches();
  const source=surroundings.getObjectByName('east-backdrop');
  if(!source)throw Error('Missing actual east-backdrop');
  source.removeFromParent();
  report.buildMs=performance.now()-builtAt;
  report.sourceBytes=geometryBytes(source);
  report.inventory=[];
  const originals = new THREE.Group(), adapted = new THREE.Group();
  const baseMaterials = new Map(), adaptedMaterials = new Map(), doubled = new Map();
  source.updateMatrixWorld(true);
  source.traverse(o => {
    if(!o.isMesh)return;
    if(o.isSkinnedMesh || Array.isArray(o.material))throw Error('Fixture needs explicit support: '+o.type);
    const m=o.material, geometry=o.geometry;
    if(!baseMaterials.has(m))baseMaterials.set(m,nodeMaterial(m,renderer));
    if(!adaptedMaterials.has(m))adaptedMaterials.set(m,nodeMaterial(m,renderer,{vertexNode:true}));
    const native=baseMaterials.get(m), bridge=adaptedMaterials.get(m);
    // Test a clone before changing side; never relax depth bias, transparency or any unknown shader contract.
    const trial=bridge.clone(); trial.side=THREE.FrontSide;
    const compatible=meshlet._isSupportedMaterial(trial) && !geometry.attributes.tangent && !Object.keys(geometry.morphAttributes).length;
    trial.dispose();
    if(compatible && m.side===THREE.DoubleSide) {
      bridge.side=THREE.FrontSide;
      if(!doubled.has(geometry))doubled.set(geometry,frontSides(geometry));
    }
    const candidate=doubled.get(geometry)??geometry;
    const add=(root,g,mat)=>{const clone=o.isInstancedMesh?new THREE.InstancedMesh(g,mat,o.count):new THREE.Mesh(g,mat);
      if(o.isInstancedMesh){clone.instanceMatrix.copy(o.instanceMatrix);if(o.instanceColor)clone.instanceColor=o.instanceColor.clone();}
      clone.name=o.name;clone.matrixAutoUpdate=false;clone.matrix.copy(o.matrixWorld);
      clone.visible=true;for(let parent=o;parent;parent=parent.parent)clone.visible&&=parent.visible;
      clone.castShadow=o.castShadow;clone.receiveShadow=o.receiveShadow;clone.renderOrder=o.renderOrder;root.add(clone);};
    add(originals,geometry,native);add(adapted,candidate,bridge);
    report.inventory.push({name:o.name,type:m.type,instances:o.isInstancedMesh?o.count:1,triangles:(geometry.index?.count??geometry.attributes.position.count)/3,
      beforeEligible:meshlet._isSupportedMaterial(native),afterEligible:meshlet._isSupportedMaterial(bridge),
      vertexColors:m.vertexColors,doubleSide:m.side===THREE.DoubleSide,polygonOffset:m.polygonOffset,transparent:m.transparent,
      customGLSL:m.onBeforeCompile!==THREE.Material.prototype.onBeforeCompile,geometryExpanded:candidate!==geometry});
  });
  report.adaptedBytes=geometryBytes(adapted);
  const scene=new THREE.Scene();scene.background=new THREE.Color(0xbcd4df);
  const hemi=new THREE.HemisphereLight(0xd8eaff,0x77705b,2),sun=new THREE.DirectionalLight(0xfff1dc,3);
  sun.position.set(-70,150,100);scene.add(hemi,sun,originals,adapted);
  const camera=new THREE.PerspectiveCamera(55,800/500,.1,1200);
  const views={ campus:{eye:[35,28,-80],target:[25,8,-145]}, gym:{eye:[-230,16,-265],target:[-190,9,-320]}, far:{eye:[35,85,95],target:[15,10,-140]} };
  const view=name=>{const v=views[name];if(!v)throw Error('Unknown view');camera.position.fromArray(v.eye);camera.lookAt(...v.target);camera.updateMatrixWorld(true);report.view=name;};
  view('campus');
  let mode='original';
  const select=async name=>{
    if(!['original','adapted','meshlet'].includes(name))throw Error('Unknown mode');
    mode=name;originals.visible=name==='original';adapted.visible=name!=='original';
    renderer.drawingPipeline=name==='meshlet'?meshlet:standard;
    const start=performance.now();await renderer.compileAsync(scene,camera);
    renderer.render(scene,camera);await device?.queue.onSubmittedWorkDone();
    report.lastCompileMs=performance.now()-start;
    report.mode=name;report.buffers=buffers?{...buffers}:null;
    result.textContent=JSON.stringify(report,null,2);setStatus(`${report.backend}: ${name}`);
    return {compileMs:report.lastCompileMs,buffers:report.buffers};
  };
  const sample=async(count=30)=>{
    const cpu=[],completed=[],gpuRender=[],gpuCompute=[],gpuTotal=[];
    let render;
    for(let i=0;i<count;i++){
      const start=performance.now();renderer.render(scene,camera);cpu.push(performance.now()-start);
      render={...renderer.info.render};
      await device?.queue.onSubmittedWorkDone();completed.push(performance.now()-start);
      if(report.timestampQueries){await renderer.resolveTimestampsAsync('render');
        // A pool with no new queries returns its previous value. Do not count stale meshlet compute in Standard.
        const compute=mode==='meshlet'?(await renderer.resolveTimestampsAsync('compute')??0):0;
        gpuRender.push(renderer.info.render.timestamp);gpuCompute.push(compute);
        gpuTotal.push(renderer.info.render.timestamp+compute);}
      await nextFrame();
    }
    // Meshlet counters update asynchronously every 30 projections; read only after sufficient frames.
    const counters=mode==='meshlet'?{...meshlet.info}:null;
    return{mode,view:report.view,cpuMs:stats(cpu),completedMs:stats(completed),gpuRenderMs:gpuRender.length?stats(gpuRender):null,
      gpuComputeMs:gpuCompute.length?stats(gpuCompute):null,gpuTotalMs:gpuTotal.length?stats(gpuTotal):null,
      render,counters,buffers:buffers?{...buffers}:null,raw:{cpu,completed,gpuRender,gpuCompute,gpuTotal}};
  };
  window.__meshletPreview={renderer,scene,camera,source,originals,adapted,meshlet,report,select,view,sample,
    async frame(count=1){for(let i=0;i<count;i++){renderer.render(scene,camera);await device?.queue.onSubmittedWorkDone();await nextFrame();}},
    dispose(){meshlet.dispose();standard.dispose();renderer.dispose();}};
  for(const button of document.querySelectorAll('[data-mode]'))button.onclick=()=>select(button.dataset.mode).catch(e=>{report.errors.push(e.stack);setStatus(e.message);});
  await select(params.get('mode')??'original');
  window.__meshletReady=true;
} catch(error) {report.failure=error.stack;setStatus(error.message);result.textContent=JSON.stringify(report,null,2);console.error(error);}

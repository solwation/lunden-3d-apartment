// Private page observer. Called only AFTER the canonical synchronous screenshot read.
(async function observeCarEnvironment({renderer,scene,day}) {
  const THREE=await import('three');
  const {CAR_FINISH:C,NEIGHBOR_OPENINGS:P}=await import('/src/config.js');
  if(THREE.REVISION!=='170')throw Error('Actual THREE r170 required');
  const paint=[],glass=[],tracked=[];
  const effective=m=>{const e=renderer.properties.get(m).envMap;return e?{uuid:e.uuid,mapping:e.mapping,type:e.type,colorSpace:e.colorSpace,width:e.image?.width??null,height:e.image?.height??null}:null;};
  const row=(o,m,slot)=>({object:o.name,uuid:o.uuid,carBatch:o.userData.carBatch,carType:o.userData.carType,
    slot,materialUUID:m.uuid,materialType:m.type,colorLinear:m.color.toArray(),roughness:m.roughness,metalness:m.metalness,
    opacity:m.opacity,transparent:m.transparent,toneMapped:m.toneMapped,vertexColors:m.vertexColors,
    instanceCount:o.isInstancedMesh?o.count:null,hasInstanceColor:!!o.instanceColor,
    envMapUUID:m.envMap?.uuid??null,effectiveEnvironment:effective(m),envMapIntensity:m.envMapIntensity,carReflection:m.userData.carReflection??null,
    envMapRotation:m.envMapRotation.toArray(),maps:Object.fromEntries(['map','normalMap','bumpMap','roughnessMap','metalnessMap','aoMap','alphaMap'].map(k=>[k,m[k]?.uuid??null]))});
  scene.traverse(o=>{
    if(!o.isMesh||!o.userData.carBatch)return;
    (Array.isArray(o.material)?o.material:[o.material]).forEach((m,slot)=>{
      if(!m)return;
      const r=row(o,m,slot);
      if(m.userData.carReflection!=null)tracked.push(r);
      if(m.userData.carReflection===1&&m.roughness===C.paint.roughness&&m.metalness===C.paint.metalness)paint.push({o,m,r});
      if(m.isMeshStandardMaterial&&m.roughness===.05&&m.metalness===.55&&m.color.equals(new THREE.Color(0x33495c)))glass.push({o,m,r});
    });
  });
  if(!paint.length||!glass.length)throw Error('Missing actual source-tagged parked paint/glass; no fabricated bindings');
  const source=paint[0].m.envMap;
  if(!source?.isCubeTexture||paint.some(x=>x.m.envMap!==source))throw Error('Paint must use its actual one shared CubeTexture');
  if(glass.some(x=>x.m.envMap!==null))throw Error('Car-glass envMap is not null: current evidence contract changed');
  if(paint.some(x=>x.m.envMapIntensity!==C.reflectionDay||x.m.envMapRotation.toArray().slice(0,3).some(x=>x!==0)))throw Error('Actual clear-day reflection/rotation mismatch');
  if(source.colorSpace!==THREE.SRGBColorSpace||source.image.length!==6||source.image.some(x=>x.width!==P.reflectionSize||x.height!==P.reflectionSize))throw Error('Actual procedural cube format differs');
  const faces=source.image.map((canvas,index)=>({index,width:canvas.width,height:canvas.height,png:canvas.toDataURL('image/png')}));
  const before={target:renderer.getRenderTarget(),face:renderer.getActiveCubeFace(),mip:renderer.getActiveMipmapLevel(),
    viewport:renderer.getViewport(new THREE.Vector4()),scissor:renderer.getScissor(new THREE.Vector4()),scissorTest:renderer.getScissorTest()};
  const pmrem=new THREE.PMREMGenerator(renderer),gl=renderer.getContext();let target;
  try{
    if(gl.isContextLost()||gl.getError()!==gl.NO_ERROR)throw Error('Preexisting WebGL failure');
    target=pmrem.fromCubemap(source);
    // Exact r170 _setSize/_allocateTargets, derived from ACTUAL source cube (128 -> 384x512).
    const maxMip=Math.floor(Math.log2(source.image[0].width)),cubeSize=2**maxMip;
    const width=3*Math.max(cubeSize,16*7),height=4*cubeSize;
    if(target.width!==width||target.height!==height||target.texture.type!==THREE.HalfFloatType||target.texture.colorSpace!==THREE.LinearSRGBColorSpace||target.texture.mapping!==THREE.CubeUVReflectionMapping)throw Error('Actual PMREM layout/format mismatch');
    const half=new Uint16Array(width*height*4).fill(0x7e00);renderer.readRenderTargetPixels(target,0,0,width,height,half);
    if(gl.getError()!==gl.NO_ERROR||half.some(v=>(v&0x7c00)===0x7c00))throw Error('Raw half readback failed/nonfinite');
    const bytes=new Uint8Array(half.length*2),view=new DataView(bytes.buffer);half.forEach((v,i)=>view.setUint16(i*2,v,true));
    let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    return {version:1,classification:'Actual car-specific CubeTexture PMREM export; no Native acceptance',
      generator:{revision:THREE.REVISION,method:'PMREMGenerator.fromCubemap(actual parked-car paint.envMap)'},
      sourceCube:{uuid:source.uuid,colorSpace:source.colorSpace,mapping:source.mapping,type:source.type,flipY:source.flipY,faces},
      atlas:{width,height,format:'RGBA16F',colorSpace:'linear-srgb',byteOrder:'little-endian',rowOrder:'WebGL readPixels row0 first; import raw rows unchanged',base64:btoa(binary),maxMip,cubeSize,minimumFaceMip:4,minFilter:'linear',magFilter:'linear',mipmaps:false},
      environment:{kind:'procedural-outdoor-cubemap',actualIntensity:paint[0].m.envMapIntensity,sourceReflectionDay:C.reflectionDay,sourceReflectionNight:C.reflectionNight,rotation:paint[0].m.envMapRotation.toArray()},
      paintBindings:paint.map(x=>x.r),glassBindings:glass.map(x=>x.r),trackedCarBindings:tracked,
      glassEnvironmentNull:true,sceneEnvironmentUUID:scene.environment?.uuid??null,
      sourceReference:{date:[day.year,day.month,day.date],hour:day.hour,dayShare:day.dayShare,overcast:day.overcast,dim:day.dim,under:day.under,skyStrength:day.skyLight,sunIntensity:day.lights.sun.intensity,
        ambientIntensityActual:day.lights.ambient.intensity,hemiIntensityActual:day.lights.hemi.intensity,fill:day.lights.fill.intensity,
        skyRgb:day.lights.hemi.color.toArray(),hemiGroundRgb:day.lights.hemi.groundColor.toArray(),ambientRgb:day.lights.ambient.color.toArray(),fillRgb:day.lights.fill.color.toArray(),sunRgb:day.lights.sun.color.toArray(),sunDir:day.sunDir.toArray(),
        fillDir:day.lights.fill.position.clone().sub(day.lights.fill.target.position).normalize().toArray(),exposure:renderer.toneMappingExposure},glErrorAfter:gl.getError(),contextLost:gl.isContextLost()};
  }finally{
    target?.dispose();pmrem.dispose();renderer.setRenderTarget(before.target,before.face,before.mip);
    renderer.setViewport(before.viewport);renderer.setScissor(before.scissor);renderer.setScissorTest(before.scissorTest);
  }
})

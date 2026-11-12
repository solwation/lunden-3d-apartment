// Browser canvas preserves the same authored face/pile maps as runtime; no other asset is rewritten.
// tools/browsertest.sh node tools/buildpingpingglb.cjs http://localhost:8203
const fs=require('node:fs'),kit=require('./testkit.cjs');
(async()=>{const b=await kit.launch();try{const p=await b.newPage();await p.goto((process.argv[2]||'http://localhost:8203')+'/tools/pingpingrealism.html?early');await p.waitForFunction(()=>window.pingping1927);
const data=await p.evaluate(async()=>{const {buildPingpingSurface}=await import('/src/pingpingsurface.js'),{GLTFExporter}=await import('three/addons/exporters/GLTFExporter.js');const model=buildPingpingSurface();const glb=await new GLTFExporter().parseAsync(model,{binary:true});return await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob([glb]));});});
const bytes=Buffer.from(data,'base64');fs.writeFileSync('models/pingping.glb',bytes);console.log('Exported textured models/pingping.glb:',bytes.length,'bytes');}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});

// Root-only: tools/browsertest.sh node THIS --config FROZEN.json. No automatic execution elsewhere.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import Module from 'node:module';
import vm from 'node:vm';
import {pathToFileURL,fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const here=path.dirname(fileURLToPath(import.meta.url)),arg=process.argv.indexOf('--config');
if(arg<0)throw Error('Root explicit --config required');
const configPath=path.resolve(process.argv[arg+1]),c=JSON.parse(fs.readFileSync(configPath));
const root=path.resolve(c.root),out=path.resolve(c.out),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
if(!out.startsWith('/home/devcontainers/.local/state/lunden-codex-20261127/2405/')||fs.existsSync(out))throw Error('Fresh private2405 output required');
const git=(...a)=>execFileSync('git',a,{cwd:root,encoding:'utf8'}).trim();
const {sourceList}=await import(pathToFileURL(path.join(root,'tools/unreal-engine/sources.mjs')));
const before=sourceList(root);if(git('rev-parse','HEAD')!==c.head||before.sourceHash!==c.sourceHash)throw Error('Frozen actual source head/hash differs');
const webSnapshot=JSON.parse(fs.readFileSync(c.webSourceSnapshot)),webFiles=webSnapshot.files;
if(!webFiles||Object.keys(webFiles).length!==718)throw Error('Explicit current718 source snapshot required');
const snapshot=()=>Object.fromEntries(Object.keys(webFiles).sort().map(rel=>[rel,sha(fs.readFileSync(path.join(root,rel)))]));
const webBefore=snapshot();if(Object.entries(webFiles).some(([k,h])=>webBefore[k]!==h))throw Error('Current718 source bytes differ from pinned snapshot');
const original=path.join(root,'tools/unreal-engine/tests/capture-web-lighting.cjs'),observer=fs.readFileSync(path.join(here,'observer.js'),'utf8');
let code=fs.readFileSync(original,'utf8');
const replace=(a,b)=>{if(code.split(a).length!==2)throw Error('Canonical capture marker changed: '+a);code=code.replace(a,b);};
replace("const custom = process.env.LUNDEN_CAPTURE_SHOTS ? require(path.resolve(process.env.LUNDEN_CAPTURE_SHOTS)) : null;",`spec.viewport={width:640,height:360};\nconst custom={views:[{id:'parked-street',x:-39,z:-8.4,feetY:0,yawDeg:44,pitchDeg:-6}],shots:[{name:'parked-street',camera:'parked-street',date:[2026,6,21],hour:14,weather:'clear',lamps:'none'}]};`);
replace('const {state, image} = await page.evaluate','const {state, image, environment} = await page.evaluate');
replace("return {state, image: renderer.domElement.toDataURL('image/jpeg', 0.92).split(',')[1]};",`const image=renderer.domElement.toDataURL('image/jpeg',0.92).split(',')[1];\n    const gl=renderer.getContext();\n    state.profile={quality:window.__app.quality.level,contextLost:gl.isContextLost(),draws:renderer.info.render.calls,verticalFov:camera.fov,aspect:camera.aspect,exposure:renderer.toneMappingExposure};\n    if(state.profile.quality!==4||state.profile.contextLost||Math.abs(camera.fov-72)>1e-5||Math.abs(camera.aspect-640/360)>1e-5)throw Error('Actual source profile mismatch');\n    const environment=await (${observer})({renderer,scene,day});\n    return {state,image,environment};`);
replace("await fs.writeFile(path.join(out, `web-${shot.name}.jpg`), Buffer.from(image, 'base64'));",`await fs.writeFile(path.join(out, \`web-\${shot.name}.jpg\`),Buffer.from(image,'base64'));\n  await fs.writeFile(path.join(out,'atlas.rgba16f'),Buffer.from(environment.atlas.base64,'base64'));\n  for(const f of environment.sourceCube.faces)await fs.writeFile(path.join(out,'cube-face-'+f.index+'.png'),Buffer.from(f.png.split(',')[1],'base64'));\n  await fs.writeFile(path.join(out,'source-export.json'),JSON.stringify(environment,null,2)+'\\n');`);
replace("main().catch((err) => { console.error(err); process.exitCode = 1; });",'module.exports=main;');
if(process.argv.includes('--check-only')){new vm.Script(code,{filename:original});console.log(JSON.stringify({passed:true,scope:'Offline canonical marker substitution and JavaScript compilation only; no browser/GPU',head:c.head,sourceFiles:Object.keys(webFiles).length}));process.exit(0);}
if(c.chromePath!=='/home/devcontainers/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome')throw Error('Exact Chrome1208 required');
if(JSON.parse(fs.readFileSync(path.join(c.threeDir,'package.json'))).version!=='0.170.0')throw Error('THREEr170 required');
process.env.CHROME_PATH=c.chromePath;process.env.THREE_DIR=c.threeDir;process.env.PLAYWRIGHT_MODULE=c.playwrightModule;
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.css':'text/css','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{const urlPath=decodeURIComponent(new URL(req.url,'http://x').pathname);const p=path.resolve(root,'.'+(urlPath==='/'?'/index.html':urlPath));if(!p.startsWith(root+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile()){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':types[path.extname(p)]||'application/octet-stream'});fs.createReadStream(p).pipe(res);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const savedArgs=process.argv;
try{
  process.argv=[process.execPath,original,`http://127.0.0.1:${server.address().port}`,out,'parked-street'];
  const m=new Module(original);m.filename=original;m.paths=Module._nodeModulePaths(path.dirname(original));m._compile(code,original);
  await m.exports();
}finally{process.argv=savedArgs;await new Promise(resolve=>server.close(resolve));}
const webAfter=snapshot();
if(git('rev-parse','HEAD')!==c.head||JSON.stringify(sourceList(root))!==JSON.stringify(before)||Object.entries(webFiles).some(([k,h])=>webAfter[k]!==h))throw Error('Source changed during capture/export');
const payload=JSON.parse(fs.readFileSync(path.join(out,'source-export.json'))),raw=fs.readFileSync(path.join(out,'atlas.rgba16f'));
if(raw.length!==payload.atlas.width*payload.atlas.height*8||payload.contextLost||payload.glErrorAfter!==0)throw Error('Actual raw atlas incomplete');
const dependencies=[configPath,fileURLToPath(import.meta.url),path.join(here,'observer.js'),original,c.webSourceSnapshot,
 ...['src/carfinish.js','src/neighborglass.js','src/config.js'].map(p=>path.join(root,p)),
 ...['src/extras/PMREMGenerator.js','src/renderers/shaders/ShaderChunk/cube_uv_reflection_fragment.glsl.js','src/renderers/shaders/ShaderChunk/lights_physical_pars_fragment.glsl.js'].map(p=>path.join(c.threeDir,p))];
const proof={completed:true,classification:'Actual-source car-cubemap PMREM export and canonical current reference; no Native/material parity claim',sourceHead:c.head,sourceHash:before.sourceHash,sourceFiles:before.files,webSourceFiles:webFiles,all718BeforeAfterExact:true,actualAtlasDimensions:[payload.atlas.width,payload.atlas.height],rawHalfSHA256:sha(raw),rawHalfBytes:raw.length,webRawSHA256:sha(fs.readFileSync(path.join(out,'web-parked-street.jpg'))),paintBindingCount:payload.paintBindings.length,glassBindingCount:payload.glassBindings.length,glassEnvironmentNull:payload.glassEnvironmentNull,browserClosed:true,ownedServerClosed:true,dependenciesSHA256:Object.fromEntries(dependencies.map(p=>[p,sha(fs.readFileSync(p))]))};
await fsp.writeFile(path.join(out,'proof.json'),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({completed:true,out,dimensions:proof.actualAtlasDimensions,rawHalfSHA256:proof.rawHalfSHA256}));

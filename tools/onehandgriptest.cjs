// #912: actual Cup/FishFinger/Bottle/Glass/CoffeeJar+Hand, no apartment. --render needs root GPU grant.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.argv[2]||'http://localhost:8882',out=process.argv[3]||'/tmp/lunden-priority-912/native',render=process.argv.includes('--render');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const furniture=read('src/furniture.js'),start=furniture.indexOf('  const crystal =',furniture.indexOf('function besta(')),end=furniture.indexOf('  const things =',start);
if(start<0||end<0)throw Error('source-bound BESTA glass geometry missing');const glassSource=furniture.slice(start,end);
const files=['src/hand.js','src/config.js','src/cups.js','src/fishfingers.js','src/things.js','src/bottles.js','src/coffeejar.js','src/holdable.js','src/furniture.js','tools/onehandgriptest.cjs'];
const hashes=Object.fromEntries(files.map(p=>[p,crypto.createHash('sha256').update(read(p)).digest('hex')]));
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/source-before.json',JSON.stringify({hashes,glassSource,render},null,2));
let browser;const rows=[],errors=[];const check=(ok,label)=>{rows.push({ok:!!ok,label});console.log(`${ok?'PASS':'FAIL'} ${label}`);};
(async()=>{try{
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const page=await browser.newPage({viewport:{width:640,height:400}});page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/src/bootstrap.js*',r=>r.fulfill({contentType:'text/javascript',body:'// native hand component, no apartment'}));await page.goto(base,{waitUntil:'domcontentloaded'});
 const result=await page.evaluate(async({glassSource,render})=>{
  const native=HTMLCanvasElement.prototype.getContext;window.webglCalls=0;HTMLCanvasElement.prototype.getContext=function(k,...a){if(/webgl/i.test(k)){webglCalls++;if(!render)throw Error('native forbids WebGL');}return native.call(this,k,...a);};
  const T=await import('three'),{Hand}=await import('/src/hand.js'),{Cup}=await import('/src/cups.js'),{FishPack}=await import('/src/fishfingers.js'),{Bottle,Glass}=await import('/src/things.js'),{buildWineBottle}=await import('/src/bottles.js'),{CoffeeJar}=await import('/src/coffeejar.js'),{setHeld}=await import('/src/holdable.js'),{HAND}=await import('/src/config.js');
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(72,640/400,.05,100);camera.position.set(0,1.6,0);scene.add(camera);scene.background=new T.Color('#dce4eb');scene.add(new T.HemisphereLight(0xffffff,0x58616b,3));const key=new T.DirectionalLight(0xffffff,2);key.position.set(2,4,3);scene.add(key);
  const hand=new Hand(camera,scene),cup=new Cup(scene,camera,new T.Vector3(0,0,0),new T.Vector3(0,0,0),'blue-stripes');cup.setFill(.6);
  const pack=new FishPack(scene,camera,{inside:{cx:0,cz:0},shelves:[0]});pack.press();const fish=pack.fingers[0];fish.putBack();
  const wine=buildWineBottle(0);scene.add(wine.model);const bottle=new Bottle(scene,camera,{...wine,kind:wine.kind,back:'fixture rack'});
  const glasses=new Function('THREE',glassSource+'\nreturn {wine,tumbler,crystal};')(T);const glassModel=new T.Mesh(glasses.wine,glasses.crystal);scene.add(glassModel);const glass=new Glass(scene,camera,{model:glassModel,kind:'glass',back:'fixture shelf',inner:[[.004,.086],[.018,.102],[.029,.14],[.027,.185]]});
  const jar=new CoffeeJar(scene,camera,{object:new T.Group()}),scoop=jar.scoop;
  const items={cup,fish,bottle,glass,scoop};const snapshots=[],checks=[];const add=(ok,label)=>checks.push({ok:!!ok,label});
  const settle=(item,n=25)=>{for(let i=0;i<n;i++){item.update(.016);hand.update(.016,item);scene.updateMatrixWorld(true);}};
  const state=item=>JSON.stringify({fill:item.contents?.a,bites:item.bites,full:item.full,state:item.state,uses:item.uses,placed:item.placed});
  const snap=(name,phase,item)=>{
   item.model.updateWorldMatrix(true,true);const before=item.model.matrixWorld.toArray(),beforeState=state(item),beforeParent=item.model.parent;
   hand.update(.016,item);scene.updateMatrixWorld(true);const after=item.model.matrixWorld.toArray();
   const contact=hand.hand.localToWorld(new T.Vector3(.03,.002,.07).multiplyScalar(HAND.size));
   const local=item.model.worldToLocal(contact.clone()),grip=hand.gripOf(item).clone();
   const row={name,phase,scale:item.model.scale.toArray(),modelMatrix:after,cameraMatrix:camera.matrixWorld.toArray(),grip:grip.toArray(),contactInModel:local.toArray(),contactError:local.distanceTo(grip),curl:hand.hand.morphTargetInfluences.slice(),wrist:hand.hand.position.toArray(),armLength:hand.arm.scale.z,contents:item.contents?.a,bites:item.bites,full:item.full,visible:hand.hand.visible,explicit:!!item.grip};snapshots.push(row);
   add(before.every((v,i)=>Object.is(v,after[i]))&&beforeParent===item.model.parent&&beforeState===state(item),name+'/'+phase+': Hand preserves whole item world matrix, parent and contents/action state');
   add(hand.visible&&row.contactError<1e-10,name+'/'+phase+': actual modeled contact follows existing grip without drift');return row;
  };
  const select=name=>{setHeld(null);const item=items[name];camera.position.set(0,1.6,0);camera.rotation.set(0,0,0,'YXZ');camera.updateMatrixWorld(true);if(name==='glass'){glass.contents.set('whisky',.6);glass.liquid.show(glass.contents);}item.take();settle(item);return item;};
  const phase=(name,mode)=>{
   const item=select(name);if(mode==='use'){
    if(name==='cup'){item.use();settle(item,18);}
    if(name==='fish'){item.use();settle(item,10);}
    if(name==='bottle'){item.pour(.6);settle(item,18);}
    if(name==='glass'){item.use();settle(item,18);}
    if(name==='scoop'){jar.press();settle(item,18);}
   }else if(mode==='moved'){camera.position.set(2,1.8,-1);camera.rotation.set(-.2,.5,0,'YXZ');settle(item);}
   const data=snap(name,mode,item);return {item,data};
  };
  for(const name of Object.keys(items)){
   const item=items[name];for(const mode of ['rest','use','moved'])phase(name,mode);
   setHeld(null);item.held=false;scene.add(item.model);item.model.position.set(8,0,0);
  }
  add(snapshots.filter(x=>!x.explicit).every(x=>x.scale.every(v=>v===1)),'actual bottle/glass fallback models use unit root scale; double-scale hypothesis not established for these items');
  add(snapshots.filter(x=>x.name==='fish').every(x=>Math.abs(x.curl[0]-.62)<.01),'actual fish-finger pinch keeps existing0.62 curl');
  add(snapshots.filter(x=>x.name==='cup').every(x=>x.explicit),'cup keeps its explicit modeled handle grip');
  Object.assign(window,{fixture:{T,HAND,scene,camera,hand,items,phase,snapshots}});
  if(render){const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(640,400);document.body.replaceChildren(renderer.domElement);document.body.style.cssText='margin:0';renderer.domElement.style.display='block';window.fixture.renderer=renderer;}
  else add(webglCalls===0,'native audit creates zero WebGL contexts');
  return {checks,snapshots,scope:'actual five one-hand product models and native Hand; no apartment, anthropometry or physical device'};
 },{glassSource,render});
 for(const r of result.checks)check(r.ok,r.label);fs.writeFileSync(out+'/result.json',JSON.stringify({rows,errors,result,hashes},null,2));
 if(render)for(const name of ['cup','fish','bottle','glass','scoop'])for(const mode of ['rest','use','moved']){
  const picture=await page.evaluate(({name,mode})=>{const f=fixture;for(const x of Object.values(f.items)){x.held=false;f.scene.add(x.model);x.model.position.set(8,0,0);}const {item,data}=f.phase(name,mode);f.scene.updateMatrixWorld(true);const target=item.model.localToWorld(new f.T.Vector3(...data.grip)).project(f.camera);const ancestry=[];for(let o=f.hand.hand;o;o=o.parent)ancestry.push(o.visible);f.renderer.render(f.scene,f.camera);f.renderer.getContext().finish();return {data,ndc:target.toArray(),ancestry,layers:f.hand.hand.layers.test(f.camera.layers),projection:f.camera.projectionMatrix.toArray(),calls:f.renderer.info.render.calls,triangles:f.renderer.info.render.triangles};},{name,mode});
  check(picture.ancestry.every(Boolean)&&picture.layers&&Math.abs(picture.ndc[0])<1&&Math.abs(picture.ndc[1])<1,name+'/'+mode+': native hand/contact visible within original72deg camera');fs.writeFileSync(out+'/'+name+'-'+mode+'.json',JSON.stringify(picture,null,2));await page.screenshot({path:out+'/'+name+'-'+mode+'.png'});
 }
 check(errors.length===0,'zero browser errors');const changed=files.filter(p=>crypto.createHash('sha256').update(read(p)).digest('hex')!==hashes[p]);check(changed.length===0,'all executed sources unchanged');fs.writeFileSync(out+'/completion.json',JSON.stringify({rows,errors,changed,failed:rows.filter(r=>!r.ok).length},null,2));console.log(rows.every(r=>r.ok)?'ALL PASS':'FAILED');process.exitCode=rows.every(r=>r.ok)?0:1;
 }catch(e){console.error(e);process.exitCode=1;}finally{await browser?.close();}})();

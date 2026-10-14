// Bounded visual proof for #901: actual Car/OlofDriver only, no apartment.
// Requires the orchestrator's exclusive renderer grant.
const fs=require('node:fs'),crypto=require('node:crypto'),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.argv[2],out=process.argv[3];fs.mkdirSync(out,{recursive:true});
const files=['src/car.js','src/olof.js','src/config.js','src/carmodel.js','tools/carlearnerrender.cjs'];
const hashes=()=>Object.fromEntries(files.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
const result={pid:process.pid,started:new Date().toISOString(),hashes:hashes(),errors:[]},save=()=>fs.writeFileSync(out+'/result.json',JSON.stringify(result,null,2));save();
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const timer=setTimeout(()=>browser.close(),25000);try{const p=await browser.newPage({viewport:{width:960,height:680}});p.on('pageerror',e=>result.errors.push(e.message));await p.goto(base+'/docs/development/environment.md');await p.setContent('<script type="importmap">{"imports":{"three":"/__three/build/three.module.js","three/addons/":"/__three/examples/jsm/"}}</script><style>body{margin:0}</style>');result.scene=await p.evaluate(async()=>{
 const T=await import('three'),{Car}=await import('/src/car.js'),{OlofDriver}=await import('/src/olof.js');
 const scene=new T.Scene();scene.background=new T.Color('#a9bdc2');const car=new Car(),driver=new OlofDriver(car);car.park();driver.update(0);car.object.position.set(0,0,0);car.object.rotation.set(0,0,0);scene.add(car.object);
 scene.add(new T.HemisphereLight(0xffffff,0x53565a,2.5));const light=new T.DirectionalLight(0xffffff,3);light.position.set(-5,6,4);scene.add(light);
 const floor=new T.Mesh(new T.PlaneGeometry(20,20),new T.MeshStandardMaterial({color:0x666b70,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.01;scene.add(floor);
 const camera=new T.PerspectiveCamera(35,960/680,.1,40);camera.position.set(-6.1,1.55,1.6);camera.lookAt(-.6,.75,0);
 const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(960,680);renderer.setPixelRatio(1);document.body.append(renderer.domElement);renderer.render(scene,camera);
 window.proof={car,driver,renderer,scene,camera};return{signVisible:car.learnerSign.visible,driver:driver.state,car:car.state,viewport:[960,680],scene:'isolated actual Car/OlofDriver; no World',calls:renderer.info.render.calls};
 });save();await p.screenshot({path:out+'/rear-visible.png',timeout:10000});result.hidden=await p.evaluate(()=>{const x=window.proof;x.driver.hide();x.renderer.render(x.scene,x.camera);return{signVisible:x.car.learnerSign.visible,driver:x.driver.state}});save();await p.screenshot({path:out+'/rear-hidden.png',timeout:10000});result.finalHashes=hashes();result.pass=result.scene.signVisible&&!result.hidden.signVisible&&!result.errors.length&&JSON.stringify(result.hashes)===JSON.stringify(result.finalHashes);if(!result.pass)process.exitCode=1;
 }finally{clearTimeout(timer);await browser.close();result.finished=new Date().toISOString();result.exit=process.exitCode||0;save()}})().catch(e=>{result.error=String(e.stack);result.exit=1;save();console.error(e);process.exitCode=1});

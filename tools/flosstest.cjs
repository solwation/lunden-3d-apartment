// #1622 the floss on actual Player/Ghosts/Avatar/Worker state, no apartment. Usage: flosstest.cjs GAME WORKER OUT [--render]
// Dancer (page a) sends `dn` in its state; observer (page b) must see the floss; the dancer's own mirror shows it too.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const game = process.argv[2] || 'http://localhost:8622', worker = process.argv[3] || 'http://localhost:8623';
const out = process.argv[4] || '/tmp/lunden-floss1622', render = process.argv.includes('--render');
let checks = 0, failures = 0;
const check = (ok, text) => { checks++; if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'} ${text}`); };
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: render ? ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] : ['--no-sandbox','--disable-gpu'] });
  const pages = [], errors = [];
  try {
    for (const [i, name] of ['Floss Dancer', 'Floss Observer'].entries()) {
      const page = await browser.newPage({ viewport: { width:640, height:420 } }); pages.push(page);
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/src/bootstrap.js', r => r.fulfill({ contentType:'text/javascript', body:'// fixture, no apartment' }));
      await page.goto(game);
      await page.evaluate(async ({i,name,worker}) => {
        const orig = HTMLCanvasElement.prototype.getContext;
        window.originalContext = orig; window.glCalls = 0;
        HTMLCanvasElement.prototype.getContext = function(k,...a) { if (/webgl/i.test(k)) { glCalls++; throw Error('WebGL forbidden in native phase'); } return orig.call(this,k,...a); };
        const T = await import('three'), { Ghosts } = await import('/src/ghosts.js');
        window.T = T; window.scene = new T.Scene(); window.camera = new T.PerspectiveCamera(60,640/420,.1,100);
        window.dancing = false;
        window.ghosts = new Ghosts({scene,camera,url:worker,name:()=>name,active:()=>true,weapon:()=> '',score:()=>0,mirrored:()=>true,
          state:()=>({p:[1+i*2,0,1],r:0,c:false,dn:dancing?1:0})});
        window.tick = setInterval(() => ghosts.update(.04),40);
        window.peer = () => [...ghosts.others.values()].find(g => g.name === (i ? 'Floss Dancer' : 'Floss Observer'));
        window.snapshot = (g) => { g.root.updateMatrixWorld(true); g.avatar.mesh.skeleton.update();
          const V = () => new T.Vector3();
          return { amt: g.avatar.danceAmt, hips: g.avatar.bones.hips.position.toArray(), hL: g.avatar.hand('L').toArray(), hR: g.avatar.hand('R').toArray(), foot: g.avatar.bones.footL.getWorldPosition(V()).toArray() }; };
      }, {i,name,worker});
    }
    const [a,b]=pages;
    await Promise.all(pages.map(p=>p.waitForFunction(()=>ghosts.connected&&peer()?.snaps.length&&peer().root.visible)));
    const rest=await b.evaluate(()=>snapshot(peer()));
    check(rest.amt===0 || rest.amt===undefined,'observer sees the dancer standing before the dance');
    const messages=await a.evaluate(()=>ghosts.messages);
    await a.evaluate(()=>{dancing=true;});
    await b.waitForFunction(()=>peer().dance===true&&peer().avatar.danceAmt>.95);
    check(true,'observer ghost receives dn and blends fully into the floss');
    const sent=await a.evaluate(m=>ghosts.messages-m,messages);
    check(sent<=2,`one state update announces the dance (${sent} messages)`);
    const s1=await b.evaluate(()=>snapshot(peer()));
    await b.waitForTimeout(260);
    const s2=await b.evaluate(()=>snapshot(peer()));
    const d=(p,q)=>Math.hypot(...p.map((v,i)=>v-q[i]));
    check(d(s1.hR,s2.hR)>.05||d(s1.hL,s2.hL)>.05,'the arms move between two moments of the dance');
    check(Math.abs(s1.hips[0])>.001||Math.abs(s2.hips[0])>.001,'hips sway sideways');
    check(d(s1.foot,s2.foot)<.02,'feet stay planted while the hips sway');
    check(d(rest.hL,s1.hL)>.05,'hands moved away from the resting pose');
    const mirror=await a.evaluate(()=>{ghosts.beforeMirror();const g=ghosts.myGhost;for(let i=0;i<40;i++)ghosts.beforeMirror();const r={dance:g.dance,amt:g.avatar.danceAmt};ghosts.afterMirror();return r;});
    check(mirror.dance===true,'own mirror image dances (dance flag from our state)');
    await a.evaluate(()=>{dancing=false;});
    await b.waitForFunction(()=>peer().dance===false&&peer().avatar.danceAmt<.05);
    check(true,'dance ends for the observer and the pose blends back');
    // interpolation / invalid input on the Ghost API
    const inv=await b.evaluate(()=>{const g=ghosts.add('inv','Inv');g.push({p:[5,0,5],r:0,dn:'1'},1000);g.draw(1000+1000,camera.position);const r=g.dance;g.dispose();ghosts.others.delete(g.id);return r;});
    check(inv===false,'a non-1 dn is not dancing');
    check((await Promise.all(pages.map(p=>p.evaluate(()=>glCalls)))).every(n=>n===0),'zero WebGL calls in the native phase');
    if(render){
      await b.evaluate(()=>{HTMLCanvasElement.prototype.getContext=originalContext;scene.background=new T.Color('#e9eef2');scene.add(new T.HemisphereLight(0xffffff,0x465b35,2));
        const light=new T.DirectionalLight(0xffffff,2);light.position.set(4,5,3);scene.add(light);window.renderCamera=new T.PerspectiveCamera(40,640/420,.1,100);
        window.renderer=new T.WebGLRenderer({antialias:true});renderer.setPixelRatio(1);renderer.setSize(640,420);document.body.replaceChildren(renderer.domElement);document.body.style.padding='0';});
      await a.evaluate(()=>{dancing=true;}); await b.waitForFunction(()=>peer().dance===true&&peer().avatar.danceAmt>.95);
      await b.evaluate(()=>clearInterval(tick));
      for(const [name,q,cam] of [['left',.25,[-.4,1.5,-3.2]],['right',.75,[-.4,1.5,-3.2]],['three-quarter',.25,[-2.2,1.3,-2.4]]]){
        await b.evaluate(async ([q,cam])=>{const {DANCE}=await import('/src/config.js');const g=peer();g.avatar.time=q/DANCE.floss.hz;g.avatar.update(0,{dance:1});
          g.root.updateMatrixWorld(true);g.avatar.mesh.skeleton.update();
          renderCamera.position.copy(g.root.position).add(new T.Vector3(...cam));renderCamera.lookAt(g.root.position.clone().add(new T.Vector3(0,.95,0)));renderer.render(scene,renderCamera);renderer.getContext().finish();},[q,cam]);
        await b.screenshot({path:`${out}/floss-${name}.png`});}
      await b.evaluate(()=>renderer.dispose());
    }
    check(errors.length===0,`no page errors: ${JSON.stringify(errors)}`);
    console.log(failures?`SOME FAILED (${failures})`:`ALL PASS (${checks})`);if(failures)process.exitCode=1;
  }finally{for(const p of pages)await p.evaluate(()=>{clearInterval(tick);ghosts.disconnect();}).catch(()=>{});await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

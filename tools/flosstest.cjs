// #1622 the floss and #1757 Gangnam Style on actual Player/Ghosts/Avatar/Worker state, no apartment. Usage: flosstest.cjs GAME WORKER OUT [--render]
// Dancer (page a) sends `dn` (1 floss, 2 Gangnam) in its state; observer (page b) must see the dance; the dancer's own mirror shows it too.
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
        window.dancing = 0;
        window.ghosts = new Ghosts({scene,camera,url:worker,name:()=>name,active:()=>true,weapon:()=> '',score:()=>0,mirrored:()=>true,
          state:()=>({p:[1+i*2,0,1],r:0,c:false,dn:dancing})});
        window.tick = setInterval(() => ghosts.update(.04),40);
        window.peer = () => [...ghosts.others.values()].find(g => g.name === (i ? 'Floss Dancer' : 'Floss Observer'));
        window.snapshot = (g) => { g.root.updateMatrixWorld(true); g.avatar.mesh.skeleton.update();
          const V = () => new T.Vector3();
          const loc = (v) => g.avatar.object.worldToLocal(v).toArray(); // the figure's own frame: +z forward, L = +x
          return { amt: g.avatar.danceAmt, hips: g.avatar.bones.hips.position.toArray(), hL: g.avatar.hand('L').toArray(), hR: g.avatar.hand('R').toArray(), foot: g.avatar.bones.footL.getWorldPosition(V()).toArray(),
            lL: loc(g.avatar.hand('L')), lR: loc(g.avatar.hand('R')), fL: loc(g.avatar.bones.footL.getWorldPosition(V())), fR: loc(g.avatar.bones.footR.getWorldPosition(V())), head: loc(g.avatar.bones.head.getWorldPosition(V())) }; };
        window.at = async (g, t, dance) => { g.avatar.time = t; g.avatar.update(0, { dance }); return snapshot(g); }; // a fixed moment of the full pose
      }, {i,name,worker});
    }
    const [a,b]=pages;
    await Promise.all(pages.map(p=>p.waitForFunction(()=>ghosts.connected&&peer()?.snaps.length&&peer().root.visible)));
    const rest=await b.evaluate(()=>snapshot(peer()));
    check(rest.amt===0 || rest.amt===undefined,'observer sees the dancer standing before the dance');
    const messages=await a.evaluate(()=>ghosts.messages);
    await a.evaluate(()=>{dancing=1;});
    await b.waitForFunction(()=>peer().dance===1&&peer().avatar.danceAmt>.95);
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
    check(mirror.dance===1,'own mirror image dances (dance flag from our state)');
    // #1757: Gangnam Style (dn 2): the floss blends out, the gallop / reins / lasso blend in, for the observer and the mirror
    const m2=await a.evaluate(()=>ghosts.messages);
    await a.evaluate(()=>{dancing=2;});
    await b.waitForFunction(()=>peer().dance===2&&peer().avatar.gangnamAmt>.95&&peer().avatar.flossAmt<.05);
    check(true,'observer switches from the floss to Gangnam Style (dn 2)');
    const sent2=await a.evaluate(m=>ghosts.messages-m,m2);
    check(sent2<=2,`one state update announces the switch (${sent2} messages)`);
    const G=await b.evaluate(async()=>{const {DANCE}=await import('/src/config.js');const g=peer(),N=DANCE.gangnam,beat=1/N.hz;const r={};
      r.reins=await at(g,N.section*.5,2);r.liftL=await at(g,beat*.5,2);r.liftR=await at(g,beat*1.5,2);r.land=await at(g,beat,2);
      r.lassoL=await at(g,N.section*1.5,2);r.lassoL2=await at(g,N.section*1.5+.25/N.lassoHz,2);r.lassoR=await at(g,N.section*3.5,2);r.N=N;return r;});
    check(G.reins.hips[1]<rest.hips[1]-.05,`knees bent: hips ${(rest.hips[1]-G.reins.hips[1]).toFixed(3)} m lower than standing`);
    check(G.liftL.hips[1]>G.land.hips[1]+.01,'the body bounces up between the landings');
    check(G.liftL.fL[1]>G.liftL.fR[1]+.05&&G.liftR.fR[1]>G.liftR.fL[1]+.05,'gallop: one foot lifted per beat, alternating');
    check(G.reins.lL[0]<G.reins.lR[0]&&Math.abs(G.reins.lL[0]-G.reins.lR[0])<.15,`wrists crossed in front (L x ${G.reins.lL[0].toFixed(3)} < R x ${G.reins.lR[0].toFixed(3)})`);
    check(G.reins.lL[2]>.2&&G.reins.lR[2]>.2&&G.reins.lL[1]<G.reins.head[1]-.3&&G.reins.lL[1]>G.reins.hips[1],'reins held in front at chest/waist height');
    check(G.lassoL.lL[1]>G.lassoL.head[1]+.1&&G.lassoL.lR[1]<G.lassoL.head[1]-.3,'second section: the left hand swings the lasso overhead, the right keeps the reins');
    check(Math.hypot(G.lassoL.lL[0]-G.lassoL2.lL[0],G.lassoL.lL[2]-G.lassoL2.lL[2])>.08,'the lasso hand circles');
    check(G.lassoR.lR[1]>G.lassoR.head[1]+.1&&G.lassoR.lL[1]<G.lassoR.head[1]-.3,'fourth section: the right hand takes the lasso');
    const mirror2=await a.evaluate(()=>{ghosts.beforeMirror();const g=ghosts.myGhost;for(let i=0;i<40;i++)ghosts.beforeMirror();const r={dance:g.dance,amt:g.avatar.gangnamAmt};ghosts.afterMirror();return r;});
    check(mirror2.dance===2,'own mirror image dances Gangnam Style (dn 2 from our state)');
    await a.evaluate(()=>{dancing=0;});
    await b.waitForFunction(()=>peer().dance===0&&peer().avatar.danceAmt<.05);
    check(true,'dance ends for the observer and the pose blends back');
    // interpolation / invalid input on the Ghost API
    const inv=await b.evaluate(()=>[ '1', '2', 3, true, -1, 1.5 ].map(dn=>{const g=ghosts.add('inv','Inv');g.push({p:[5,0,5],r:0,dn},1000);g.draw(1000+1000,camera.position);const r=g.dance;g.dispose();ghosts.others.delete(g.id);return r;}));
    check(inv.every(v=>v===0),`a dn other than 1 or 2 is not dancing (${JSON.stringify(inv)})`);
    check((await Promise.all(pages.map(p=>p.evaluate(()=>glCalls)))).every(n=>n===0),'zero WebGL calls in the native phase');
    if(render){
      await b.evaluate(()=>{HTMLCanvasElement.prototype.getContext=originalContext;scene.background=new T.Color('#e9eef2');scene.add(new T.HemisphereLight(0xffffff,0x465b35,2));
        const light=new T.DirectionalLight(0xffffff,2);light.position.set(4,5,3);scene.add(light);window.renderCamera=new T.PerspectiveCamera(40,640/420,.1,100);
        window.renderer=new T.WebGLRenderer({antialias:true});renderer.setPixelRatio(1);renderer.setSize(640,420);document.body.replaceChildren(renderer.domElement);document.body.style.padding='0';});
      await a.evaluate(()=>{dancing=1;}); await b.waitForFunction(()=>peer().dance===1&&peer().avatar.danceAmt>.95);
      await b.evaluate(()=>clearInterval(tick));
      for(const [name,q,cam] of [['left',.25,[-.4,1.5,-3.2]],['right',.75,[-.4,1.5,-3.2]],['three-quarter',.25,[-2.2,1.3,-2.4]]]){
        await b.evaluate(async ([q,cam])=>{const {DANCE}=await import('/src/config.js');const g=peer();g.avatar.time=q/DANCE.floss.hz;g.avatar.update(0,{dance:1});
          g.root.updateMatrixWorld(true);g.avatar.mesh.skeleton.update();
          renderCamera.position.copy(g.root.position).add(new T.Vector3(...cam));renderCamera.lookAt(g.root.position.clone().add(new T.Vector3(0,.95,0)));renderer.render(scene,renderCamera);renderer.getContext().finish();},[q,cam]);
        await b.screenshot({path:`${out}/floss-${name}.png`});}
      await b.evaluate(()=>{const g=peer();g.avatar.flossAmt=0;g.avatar.gangnamAmt=1;}); // #1757: the Gangnam pose as the observer sees it
      for(const [name,sections,beats,cam] of [['gangnam-reins',.5,0,[-.4,1.5,-3.2]],['gangnam-galopp',0,.5,[-2.6,1.2,-1.6]],['gangnam-lasso-vanster',1.5,0,[-.4,1.5,-3.2]],['gangnam-lasso-hoger',3.5,0,[-2.2,1.3,-2.4]]]){
        await b.evaluate(async ([sections,beats,cam])=>{const {DANCE}=await import('/src/config.js');const g=peer(),N=DANCE.gangnam;g.avatar.time=sections*N.section+beats/N.hz;g.avatar.update(0,{dance:2});
          g.root.updateMatrixWorld(true);g.avatar.mesh.skeleton.update();
          renderCamera.position.copy(g.root.position).add(new T.Vector3(...cam));renderCamera.lookAt(g.root.position.clone().add(new T.Vector3(0,1.0,0)));renderer.render(scene,renderCamera);renderer.getContext().finish();},[sections,beats,cam]);
        await b.screenshot({path:`${out}/${name}.png`});}
      await b.evaluate(()=>renderer.dispose());
    }
    check(errors.length===0,`no page errors: ${JSON.stringify(errors)}`);
    console.log(failures?`SOME FAILED (${failures})`:`ALL PASS (${checks})`);if(failures)process.exitCode=1;
  }finally{for(const p of pages)await p.evaluate(()=>{clearInterval(tick);ghosts.disconnect();}).catch(()=>{});await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

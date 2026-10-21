// Real ordinary app views, component bounds/materials and scoped render cost.
// PLAYWRIGHT_MODULE=... CHROME_PATH=... node tools/clubhouserealismtest.cjs GAME OUT
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const game = process.argv[2], out = process.argv[3];
if (!game || !out) throw Error('Usage: clubhouserealismtest.cjs GAME OUT');
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (/THREE.WebGLProgram|GL_INVALID_OPERATION/.test(m.text())) errors.push(m.text()); });
    await page.addInitScript(() => { localStorage.setItem('lunden.name', 'Bio'); sessionStorage.setItem('lunden.nameSkipped', '1'); });
    await page.goto(`${game}/?shot&cloud=&mp=0&quality=3&freeze&time=12&month=6`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__app?.renderer, null, { timeout: 180000 });
    const component = await page.evaluate(async () => {
      const a = __app, { PLAYROOM: R, decodeAvatarLook } = await import('/src/config.js');
      const { cinemaChair, cinemaCurtain } = await import('/src/clubhousefurnishings.js');
      const { clubhouseSurface, FINISH } = await import('/src/clubhousematerials.js');
      const { hasNativeVertexCompile } = await import('/src/vertexcompile.js');
      const T = await import('three');
      let chairs = 0, curved = 0, vertices = 0;
      const S = R.furniture.cinema.seat;
      for (const x of S.rowX) for (const z of S.z) {
        for (const g of cinemaChair(x,z)) {
          const p = g.attributes.position, n = g.attributes.normal, f = g.attributes.aClubFinish;
          for (let i=0; i<p.count; i++) {
            if (![p.getX(i),p.getY(i),p.getZ(i),n.getX(i),n.getY(i),n.getZ(i)].every(Number.isFinite)) throw Error('non-finite chair');
            if (Math.abs(p.getX(i)-R.x-x)>S.depth/2+.001 || Math.abs(p.getZ(i)-R.z-z)>S.width/2+.001 || p.getY(i)<-.001 || p.getY(i)>S.back+.001) throw Error('chair exceeds original footprint/height');
            if (Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)>.001) throw Error('invalid chair normal');
            if (!Object.values(FINISH).includes(f.getX(i))) throw Error('invalid finish');
            if (Math.abs(n.getX(i))>.05 && Math.abs(n.getY(i))>.05) curved++;
          }
          vertices += p.count; g.dispose();
        }
        chairs++;
      }
      for (const side of [-1,1]) {
        const g=cinemaCurtain(side), n=g.attributes.normal;
        if (!Array.from({length:n.count},(_,i)=>n.getX(i)>0).every(Boolean)) throw Error('curtain faces away from room');
        g.dispose();
      }
      const swatch=clubhouseSurface(new T.BoxGeometry(1,1,1),0x808080);
      const linear=swatch.attributes.color.getX(0); swatch.dispose();
      if (Math.abs(linear-new T.Color(0x808080).r)>1e-6) throw Error('vertex colour is not linear');
      const native=[];a.world.playroom.object.traverse(o=>{if(o.material?.customProgramCacheKey?.().startsWith('clubhouse-surfaces-v1'))native.push(hasNativeVertexCompile(o.material));});
      if (!native.length || native.some(v=>!v)) throw Error('surface callback changes vertex positions or loses native-bounds proof');
      a.avatarCustomizer.setLook({...decodeAvatarLook('241302112','me'),height:140});
      a.showOverlay(false); a.renderer.setAnimationLoop(null); if(a.rest.active)a.standUp();a.use({kind:'playhouse'});
      return {chairs,curved,vertices,linear,native};
    });
    assert.equal(component.chairs,8);assert(component.curved>0);
    await page.waitForFunction(()=>__app.player.inPlayroom);await page.waitForTimeout(800);
    await page.evaluate(()=>__app.world.playroom.setDisco(false));
    const views=[['hall',[0,4.5],[-2.4,1.3]],['bio',[-3.9,1.0],[-8.8,-2.0]],['billiards',[2.4,1.0],[-2.4,-2.6]],['chairs',[-8.1,-.9],[-5.3,-2.3,.55]],['games',[3.8,1.0],[8.8,-1.2]]];
    for(const [name,from,to] of views) {
      await page.evaluate(async ({from,to})=>{
        const a=__app,{PLAYROOM:R}=await import('/src/config.js');
        a.player.spawn(R.x+from[0],R.z+from[1],0);for(let i=0;i<20;i++)a.player.update(1/60);
        const d=new a.camera.position.constructor(R.x+to[0],to[2]??1.2,R.z+to[1]).sub(a.camera.position);
        a.camera.rotation.set(Math.atan2(d.y,Math.hypot(d.x,d.z)),Math.atan2(-d.x,-d.z),0,'YXZ');
        a.camera.updateMatrixWorld(true);a.step(0);a.renderer.render(a.scene,a.camera);
      },{from,to});
      await page.screenshot({path:`${out}/${name}.png`});
    }
    const render=await page.evaluate(()=>{
      const a=__app,r=a.world.playroom;
      const count=()=>{a.renderer.info.reset();a.renderer.render(a.scene,a.camera);return{calls:a.renderer.info.render.calls,triangles:a.renderer.info.render.triangles};};
      const shown=count();r.object.visible=false;const hidden=count();r.object.visible=true;
      let lights=0;r.object.traverse(o=>{if(o.isLight)lights++;});
      return{shown,hidden,lights};
    });
    assert.equal(render.lights,0);assert.deepEqual(errors,[]);
    fs.writeFileSync(`${out}/result.json`,JSON.stringify({component,render,errors},null,2));
    console.log('PASS',JSON.stringify({component,render,errors}));
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});

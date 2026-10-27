// #1655: actual basketball flight, distance culling and street draw-call parity.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const kit = require('./testkit.cjs');
(async () => {
  const out = process.argv[3] || '/tmp/basket-visibility'; fs.mkdirSync(out, { recursive: true });
  const browser = await kit.launch();
  try {
    const { page } = await kit.open(browser, `${process.argv[2] || 'http://localhost:8165'}/?shot&hoop&time=12&month=7&freeze&weather=clear&quality=0`, { test:false, viewport:kit.FULL });
    const errors=[]; page.on('pageerror', e=>errors.push(String(e)));
    await kit.skipNameDialog(page);
    await page.evaluate(() => { const a=__app; a.renderer.setAnimationLoop(null); a.showOverlay(false); });
    const result = [];
    for (const [name, distance] of [['three-point', 6.75], ['far-court', 8.4]]) {
      const shot = await page.evaluate(async distance => {
        const a=__app, b=a.ball, h=a.hoop, d=a.detail(), C=await import('/src/config.js'), V=a.camera.position.constructor;
        b.take(); h.update(2,true); h.object.updateMatrixWorld(true);
        const p=h.object.localToWorld(new V(0,0,.38+distance));
        a.player.spawn(p.x,p.z,0); a.step(0); a.camera.lookAt(h.rimC); a.camera.updateMatrixWorld(true);
        b.onUse(); const mesh=b.model.children[0], it=d.items.find(q=>q.o===mesh);
        const frames=[]; let apex=null, captured=null;
        const oldCut=Math.max(C.PERF.detail.minDist*.8,Math.max(C.PERF.detail.minDist,it.r/C.PERF.detail.k)*d.qualityScale);
        for(let n=0;n<240;n++) {
          b.update(1/120); b.model.updateMatrixWorld(true); d.update(a.camera);
          const pos=b.model.getWorldPosition(new V());
          const newCut=it.cut; it.cut=oldCut;it.far=null;d.update(a.camera);const oldMask=mesh.layers.mask;
          it.cut=newCut;it.far=null;d.update(a.camera);
          frames.push({y:pos.y,mask:mesh.layers.mask,oldMask,flying:b.flying});
          if(!apex || pos.y>apex.y) apex={n,y:pos.y,pos:pos.toArray()};
          if(b.v.y<=0 && pos.y>h.rimC.y && (distance===6.75 || oldMask===128)) { captured={n,y:pos.y,pos:pos.toArray(),oldMask};break; }
        }
        a.renderer.render(a.scene,a.camera);
        return {distance,eye:a.camera.position.toArray(),rim:h.rimC.toArray(),apex,captured,frames,newMask:mesh.layers.mask,oldCut,qualityScale:d.qualityScale,cut:it.cut===Infinity?'Infinity':it.cut};
      },distance);
      assert(shot.apex.y>shot.rim[1], 'ball rises above rim');
      assert(shot.frames.every(f=>f.mask===1), 'ball remains rendered throughout ascent');
      assert(shot.captured,'capture descending ball above the rim');
      if(distance>8) assert.equal(shot.captured.oldMask,128,'old low-quality policy hides far-court shot');
      assert.equal(shot.newMask,1);
      await page.screenshot({ path:`${out}/${name}.png` }); result.push({name,...shot});
    }
    const street = await page.evaluate(async () => {
      const a=__app, d=a.detail(), mesh=a.ball.model.children[0], it=d.items.find(q=>q.o===mesh), C=await import('/src/config.js');
      a.ball.goHome(); a.hoop.update(2); a.player.spawn(5,-13,0); a.step(0); a.camera.lookAt(2.8,3,5);a.camera.updateMatrixWorld(true);
      const cuts=[Math.max(C.PERF.detail.minDist*.8,Math.max(C.PERF.detail.minDist,it.r/C.PERF.detail.k)*d.qualityScale),Infinity];
      return cuts.map(cut=>{it.cut=cut;it.far=null;d.refresh();d.update(a.camera);a.renderer.info.reset();a.renderer.render(a.scene,a.camera);return{calls:a.renderer.info.render.calls,triangles:a.renderer.info.render.triangles,ballMask:mesh.layers.mask};});
    });
    assert.equal(street[0].calls,street[1].calls,'street draw-call parity');
    assert.equal(street[1].ballMask,128,'home ball remains occluded from street');
    assert.deepEqual(errors,[]);
    fs.writeFileSync(`${out}/result.json`, JSON.stringify({result,street,errors},null,2));
    console.log(JSON.stringify({shots:result.map(s=>({name:s.name,apex:s.apex,captured:s.captured,newMask:s.newMask,qualityScale:s.qualityScale,oldCut:s.oldCut})),street,errors}));
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});

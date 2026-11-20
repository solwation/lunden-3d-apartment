// #2226: one actual application load, original vs projected real Nov 18 history.
const fs=require('node:fs'),path=require('node:path');
exports.verify=async(page,url,out)=>{
  await page.unroute('**/src/bootstrap.js*');
  await page.goto(url+'/tools/notetest.html');
  await page.waitForFunction(()=>/ALL PASS|SOME FAILED/.test(document.querySelector('#out')?.textContent),null,{timeout:480000});
  const test=await page.locator('#out').textContent();
  fs.writeFileSync(path.join(out,'notetest.txt'),test);
  if(!test.includes('ALL PASS'))throw Error(test);
  const frame=page.frames().find(f=>f.url().includes('index.html'));
  // The actual first-visit name dialog can arrive after the interaction fixture.
  const skip=frame.locator('#player-skip');
  if(await skip.isVisible()) await skip.evaluate(button=>button.click());
  const result=await frame.evaluate(async()=>{
    const source=await fetch('/data/changelog.json').then(r=>r.json());
    const day=source.filter(e=>e.date==='2026-11-18');
    const before=day.map(({group,issues,...e})=>({...e,isNew:true}));
    const mod=await import('/src/changelog.js');
    const a=window.__app;
    a.showNote(true);
    mod.renderChangelog(document.querySelector('#note-list'),before);a.note.refresh(before);
    document.querySelector('#note .paper').scrollTop=0;
    window.__noteComparison={day,before,mod};
    return {beforeRows:before.length,afterRows:mod.summarizeChangelog(day).length};
  });
  await frame.locator('#note .paper').screenshot({path:path.join(out,'before-note.png')});
  result.before=await frame.locator('#note-list').textContent();
  await frame.evaluate(()=>{const{day,mod}=window.__noteComparison;const rows=day.map(e=>({...e,isNew:true}));mod.renderChangelog(document.querySelector('#note-list'),rows);window.__app.note.refresh(rows);});
  await frame.locator('#note .paper').screenshot({path:path.join(out,'after-note.png')});
  result.after=await frame.locator('#note-list').textContent();
  if(result.afterRows>=result.beforeRows||!result.after.includes('#2132')||!result.after.includes('#2128'))throw Error('Actual app summary/reference check failed');
  const texture=await frame.evaluate(()=>window.__app.note.object.children[0].material.map.image.toDataURL());
  fs.writeFileSync(path.join(out,'after-paper.png'),Buffer.from(texture.split(',')[1],'base64'));
  fs.writeFileSync(path.join(out,'app-result.json'),JSON.stringify(result,null,2));
  console.log(`ALL PASS actual application note: ${result.beforeRows} -> ${result.afterRows} rows; real notetest passed`);
};

// #958: production index DOM and actual buildNote canvas, no World or WebGL.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { launchNativeFixtureBrowser } = require('./nativefixturebrowser.cjs');
const url = process.argv[2] || 'http://localhost:8875', out = process.argv[3] || '/tmp/lunden-freezer-summary-surface';
fs.mkdirSync(out, { recursive: true });
(async () => {
  const fixture = await launchNativeFixtureBrowser(), errors = [];
  let error;
  try {
    const { page } = fixture;
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/src/bootstrap.js*', r => r.fulfill({contentType:'text/javascript',body:'// DOM-only fixture'}));
    await page.goto(url);
    const results = await page.evaluate(async () => {
      const checks = [], check = (ok, name) => { checks.push({ok:!!ok,name}); };
      const context = HTMLCanvasElement.prototype.getContext;
      let webgl = 0;
      HTMLCanvasElement.prototype.getContext = function(kind,...args) { if (/webgl/i.test(kind)) { webgl++; throw Error('No WebGL'); } return context.call(this,kind,...args); };
      const { markNew, summarizeChangelog, loadChangelog, renderChangelog, buildNote } = await import('/src/changelog.js');
      const label = 'Förbättringar för huvudträffar.', raw = await fetch('/data/changelog.json').then(r=>r.json());
      const before = JSON.stringify(raw), mem = (o={}) => ({o,getItem:k=>o[k]??null,setItem:(k,v)=>o[k]=v});
      const original = markNew(raw, mem({'lunden.changelogSeen':'1'})), display = summarizeChangelog(original);
      check(display.filter(e=>e.text===label).length===1, 'actual history has exactly one head-hit summary');
      check(display.filter(e=>e.text==='Förbättringar för Nerf-skott.').length===1&&display.some(e=>e.id===680), 'one Nerf improvement summary; unrelated Nerf feature remains separate');
      check(JSON.stringify(raw)===before, 'all original history fields remain unchanged');
      check(JSON.stringify(display.filter(e=>!['head-hits','nerf-improvements'].includes(e.group)))===JSON.stringify(original.filter(e=>!['head-hits','nerf-improvements'].includes(e.group))), 'every unrelated original row remains in order');
      check(JSON.stringify(summarizeChangelog(display))===JSON.stringify(display), 'presentation is idempotent');
      check(summarizeChangelog([{id:1,date:'2026-10-13',text:'Keep me',group:'unknown'}])[0].text==='Keep me','unknown groups stay ordinary');
      check(['constructor','toString','__proto__'].every(group=>summarizeChangelog([{id:1,text:'Keep me',group}])[0].text==='Keep me'),'inherited object names stay ordinary unknown groups');
      const sample = [
        {id:90,t:200,date:'2026-10-10',text:'Older head',group:'head-hits'},
        {id:4,t:400,date:'2026-10-13',text:'Later lower-id head',group:'head-hits'},
        {id:3,t:100,date:'2026-10-09',text:'Other update'}];
      const store = mem({'lunden.changelogSeen':'90'}), grouped = summarizeChangelog(markNew(sample,store));
      check(grouped[0].id===4&&grouped[0].t===400&&grouped[0].date==='2026-10-13'&&grouped[0].isNew, 'group inherits newest publication row despite lower id; id-only visitor migrates');
      check(store.o['lunden.changelogSeen']==='90'&&store.o['lunden.changelogSeenT']==='400','original max id and publication markers retained');
      check(!summarizeChangelog(markNew(sample,store)).some(e=>e.isNew), 'return visit has no false new badge');
      check(!summarizeChangelog(markNew(sample,mem())).some(e=>e.isNew), 'first visit has no badges');
      check(summarizeChangelog([{...sample[0],isNew:false},{...sample[1],isNew:true}])[0].isNew, 'any new group member marks summary new');
      const list = document.getElementById('note-list');
      renderChangelog(list, original, 100);
      check(list.children.length===100&&[...list.querySelectorAll('.text')].filter(e=>e.textContent===label).length===1, 'actual index list groups before its 100-row limit');
      const actualFetch = window.fetch;
      try {
        localStorage.clear();
        localStorage.setItem('lunden.changelogSeen','90');
        window.fetch=async()=>({ok:true,json:async()=>sample});
        const live=await loadChangelog();
        check(live.fresh&&live.length===2&&live[0].id===4&&live[0].isNew,'real loader uses original publication order before grouping');
        check(JSON.parse(localStorage.getItem('lunden.changelogCache')).length===3,'raw offline cache preserves both original group ids/t');
        window.fetch=async()=>({ok:false});
        const offline=await loadChangelog();
        check(!offline.fresh&&offline.length===2&&!offline.some(e=>e.isNew)&&localStorage.getItem('lunden.changelogSeen')==='90','offline return retains original max id and no false new badge');
        localStorage.setItem('lunden.changelogSeen','999');
        await loadChangelog();
        check(localStorage.getItem('lunden.changelogSeen')==='999','partial cached history cannot regress seen id');
        window.fetch=actualFetch;
        localStorage.clear();
        const current=await loadChangelog();
        check(current.length===100&&current.filter(e=>e.text===label).length===1,'actual loader retains 100 display rows after grouping');
        window.fetch=async()=>({ok:false});
        const cached=await loadChangelog();
        check(cached.length===100&&JSON.stringify(cached.map(e=>[e.id,e.text]))===JSON.stringify(current.map(e=>[e.id,e.text])),'current offline cache displays identical summary and unrelated rows');
      } finally { window.fetch=actualFetch; }
      const drawn=[], fill=CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText=function(text,...args){drawn.push(text);return fill.call(this,text,...args);};
      const note=buildNote(original.slice(0,30)), first=note.object.children[0].material.map;
      const firstText=drawn.join(' ');
      check((firstText.match(/Förbättringar för huvudträffar\./g)||[]).length===1&&!/Verifierade|tinning|skallyta/.test(firstText),'actual paper canvas draws one plain summary, no technical group text');
      check(firstText.includes('Förbättringar för Nerf-skott.')&&!/hinder|cache|träffkontroll/.test(firstText)&&firstText.includes('NYTT!'),'paper uses plain Nerf summary and new stamp');
      drawn.length=0;
      let disposed=false; first.addEventListener('dispose',()=>disposed=true);
      note.refresh(display.slice(0,8));
      check(disposed&&(drawn.join(' ').match(/Förbättringar för huvudträffar\./g)||[]).length===1,'late refresh disposes old texture and keeps one summary');
      CanvasRenderingContext2D.prototype.fillText=fill;
      const canvas=note.object.children[0].material.map.image;
      canvas.id='summary-paper';canvas.style.cssText='position:fixed;left:12px;top:12px;z-index:999999';document.body.append(canvas);
      check(webgl===0,'zero WebGL contexts');
      return {checks, rawCount:raw.length, groupedCount:display.length, headCount:raw.filter(e=>e.group==='head-hits').length};
    });
    fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({...results,errors,pid:fixture.pid,profile:fixture.profile},null,2));
    await page.locator('#summary-paper').screenshot({path:path.join(out,'freezer-summary.png')});
    for(const c of results.checks) console.log(`${c.ok?'PASS':'FAIL'} ${c.name}`);
    if(errors.length||results.checks.some(c=>!c.ok))throw Error('Freezer summary verification failed: '+errors.join('; '));
    const files=['src/changelog.js','data/changelog.json','tools/freezersummarytest.cjs'];
    fs.writeFileSync(path.join(out,'source-freeze.json'),JSON.stringify(Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'..',f))).digest('hex')])),null,2));
    console.log(`ALL PASS ${results.checks.length}; no World/WebGL`);
  } catch(e) { error=e; throw e; }
  finally { await fixture.close(error); }
})().catch(e=>{console.error(e);process.exitCode=1;});

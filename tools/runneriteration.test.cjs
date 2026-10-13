// #860: exercise the actual CLI/server/browser in a temporary native-DOM-only repository.
// No apartment, WebGL, fixture migrations or test-output normalization.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { spawnSync } = require('node:child_process');
const net = require('node:net');

test('test-only preserves native queries, reloads, isolation and actual mode evidence; compare stays paired', { timeout: 120000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-iteration-'));
  fs.mkdirSync(path.join(root, 'tools'));
  for (const file of ['runtests.cjs', 'runnerverdict.cjs', 'devserve.py']) fs.copyFileSync(path.join(__dirname, file), path.join(root, 'tools', file));
  const baseline = '{"known":["FAIL intentional"]}\n';
  fs.writeFileSync(path.join(root, 'tools/baseline.json'), baseline);
  fs.writeFileSync(path.join(root, 'index.html'), `<!doctype html>
    <script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js"}}</script>
    <script>const q=new URLSearchParams(location.search);window.__app={testMode:q.has('bad')?false:q.has('test')};
    window.nativeRecord={vp:[innerWidth,innerHeight],test:q.has('test'),variant:q.get('test'),marker:q.get('marker'),storage:localStorage.getItem('proof')};</script>`);
  const fixture = `<!doctype html><pre id="out">running…</pre><script>
    (async()=>{let pass=true;const lines=[],check=(ok,msg)=>{lines.push((ok?'PASS':'FAIL')+' '+msg);pass&&=!!ok};
      const f=document.createElement('iframe');f.width=900;f.height=600;document.body.append(f);
      const records=[];for(const suffix of ['marker=keep','marker=keep&test=lazy']){
        await new Promise(r=>{f.onload=r;f.src='../index.html?'+suffix});const w=f.contentWindow;
        records.push(w.nativeRecord);check(w.nativeRecord.marker==='keep','authored query preserved');
        if(records.length===1){check(w.nativeRecord.storage===null,'fresh case storage');w.localStorage.setItem('proof','kept');}
        else check(w.nativeRecord.storage==='kept','native reload storage preserved');
      }
      window.records=records;document.getElementById('out').textContent=lines.join('\\n')+'\\n'+(pass?'ALL PASS':'SOME FAILED');
    })();</script>`;
  fs.writeFileSync(path.join(root, 'tools/nativeiterationtest.html'), fixture);
  fs.writeFileSync(path.join(root, 'tools/baditerationtest.html'), '<pre id="out">running…</pre><iframe src="../index.html?bad"></iframe><script>document.querySelector("iframe").onload=()=>out.textContent="PASS native row\\nALL PASS"</script>');
  fs.writeFileSync(path.join(root, 'tools/scripttest.cjs'), 'console.log("PASS script");');
  // Each CLI invocation retains its ordinary /tmp/runtests-* diagnostics. The temporary native repo is removed.
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, resolve));
  const port = Number(process.env.ITERATION_TEST_PORT) || probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const run = flags => {
    const r=spawnSync(process.execPath,[path.join(root,'tools/runtests.cjs'),...flags,'--port',String(port),'--timeout','0.2'],{encoding:'utf8',timeout:60000});
    assert.equal(r.error,undefined,r.error?.message);
    const dir=/logs (\/tmp\/runtests-\d+)/.exec(r.stdout)?.[1];
    const rows=dir?JSON.parse(fs.readFileSync(path.join(dir,'summary.json'),'utf8')):[];
    return {...r,dir,rows};
  };
  try {
    const iteration=run(['--test-only','nativeiterationtest.html']);
    assert.equal(iteration.status,0,iteration.stdout+iteration.stderr);
    assert.equal(iteration.rows.length,1);
    const row=iteration.rows[0];
    assert.equal(row.mode,'test-only'); assert.equal(row.modeVerified,true);
    assert.equal(row.scope,'iteration/test-only, NOT full/test parity'); assert.equal(row.comparison,undefined);
    assert.equal(row.gameLoads.length,2);
    assert.ok(row.gameLoads.every(load=>load.test&&load.viewport[0]===480&&load.viewport[1]===300));
    assert.equal(new URL(row.gameLoads[1].url).searchParams.get('test'),'lazy','authored test variant kept');
    const log=fs.readFileSync(path.join(iteration.dir,'nativeiterationtest.test.log'),'utf8');
    assert.ok(log.includes('[runner] iteration/test-only, NOT full/test parity'));
    assert.equal(fs.readFileSync(path.join(root,'tools/nativeiterationtest.html'),'utf8'),fixture);
    const compare=run(['--compare','nativeiterationtest.html']);
    assert.equal(compare.status,0,compare.stdout+compare.stderr);
    assert.deepEqual(compare.rows.map(row=>row.mode),['full','test']);
    assert.ok(compare.rows.every(row=>row.modeVerified&&row.comparison.identical&&row.scope===undefined));
    assert.ok(compare.rows[0].gameLoads.every(load=>!load.test&&load.viewport[0]===900&&load.viewport[1]===600));
    assert.ok(compare.rows[1].gameLoads.every(load=>load.test&&load.viewport[0]===480&&load.viewport[1]===300));
    const bad=run(['--test-only','baditerationtest.html']);
    assert.equal(bad.status,1,bad.stdout+bad.stderr);assert.equal(bad.rows[0].verdict,'ERROR');assert.equal(bad.rows[0].modeVerified,false);
    for(const flags of [['--test-only','--compare','nativeiterationtest.html'],['--test-only','--update-baseline','nativeiterationtest.html'],
      ['--test-only','scripttest.cjs'],['--test-only','--list','scripttest.cjs']]){
      const invalid=run(flags);assert.equal(invalid.status,2,invalid.stdout+invalid.stderr);assert.equal(invalid.rows.length,0);assert.match(invalid.stderr,/--test-only/);
    }
    assert.equal(fs.readFileSync(path.join(root,'tools/baseline.json'),'utf8'),baseline);
    console.log('temporary native runner repo (removed) '+root+'; iteration '+iteration.dir+'; compare '+compare.dir+'; rejected actual mode '+bad.dir);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});

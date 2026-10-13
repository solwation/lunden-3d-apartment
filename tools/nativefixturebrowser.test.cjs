// #942: owned real native browsers/DOM, plus explicitly controlled removal faults. No app/WebGL.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { launchNativeFixtureBrowser } = require('./nativefixturebrowser.cjs');
const out = process.env.NATIVE_BROWSER_ARTIFACTS || fs.mkdtempSync(path.join(os.tmpdir(), 'native-browser-check-'));
fs.mkdirSync(out, { recursive: true });
const records = [];
const source = require('node:crypto').createHash('sha256').update(fs.readFileSync(__dirname + '/nativefixturebrowser.cjs')).digest('hex');
const stopped = pid => { try { process.kill(pid, 0); return false; } catch (error) { return error.code === 'ESRCH'; } };
const save = (name, native, extra = {}) => {
  const r = { name, pid: native.pid, profile: native.profile, masterExited: stopped(native.pid),
    profileRemoved: !fs.existsSync(native.profile), ...extra };
  records.push(r);fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ source, records }, null, 2));return r;
};

test('real normal DOM and early fixture error preserve original failure while cleaning owned resources', { timeout: 30000 }, async () => {
  for (const early of [false, true]) {
    const native = await launchNativeFixtureBrowser(), primary = new Error('Controlled early native fixture error');let caught;
    try {
      await native.page.setViewportSize({ width: 480, height: 300 });
      await native.page.setContent('<h1>Native DOM cleanup</h1><p>Owned disposable browser, no apartment or WebGL.</p>');
      assert.equal(await native.page.locator('h1').textContent(), 'Native DOM cleanup');
      if (early) throw primary;
      await native.page.screenshot({ path: path.join(out, 'normal.png') });
    } catch (error) { caught = error; }
    finally { await native.close(caught); }
    assert.equal(caught, early ? primary : undefined, 'successful cleanup cannot swallow or replace primary');
    await native.close();const r=save(early?'early-error':'normal',native,{ originalError: caught?.message });
    assert.equal(r.masterExited,true);assert.equal(r.profileRemoved,true);
  }
});

test('controlled transient ENOTEMPTY retries whole owned profile and then removes it', { timeout: 30000 }, async t => {
  const native=await launchNativeFixtureBrowser(), realRemove=fs.promises.rm;let calls=0;const start=performance.now();
  t.mock.method(fs.promises,'rm',async (profile,opts)=>{
    if(profile!==native.profile)return realRemove(profile,opts);assert.equal(opts.maxRetries,0);calls++;
    if(calls<=2)throw Object.assign(new Error('controlled ENOTEMPTY'),{code:'ENOTEMPTY'});
    return realRemove(profile,opts);
  });
  try { await native.close(); } finally { t.mock.restoreAll(); }
  const r=save('controlled-transient',native,{ calls, wallMs: performance.now()-start });
  assert.ok(calls>=3&&calls<=6);assert.equal(r.masterExited,true);assert.equal(r.profileRemoved,true);
});

test('permanent cleanup failure remains visible on repeated close and preserves supplied original error', { timeout: 30000 }, async t => {
  const native=await launchNativeFixtureBrowser(), primary=new Error('Original fixture predicate failed'),realRemove=fs.promises.rm;let calls=0;
  const removalError=Object.assign(new Error('controlled permanent ENOTEMPTY'),{code:'ENOTEMPTY'});const start=performance.now();
  t.mock.method(fs.promises,'rm',async(p,opts)=>{if(p!==native.profile)return realRemove(p,opts);calls++;throw removalError});
  try {
    await assert.rejects(native.close(primary),error=>error instanceof AggregateError&&error.cause===primary&&error.errors[0]===primary&&error.errors[1]===removalError);
    assert.equal(calls,6);await assert.rejects(native.close(),error=>error===removalError);assert.equal(calls,6,'same failed closePromise is never silently accepted or retried forever');
    const r=save('controlled-permanent',native,{calls,wallMs:performance.now()-start,originalError:primary.message,cleanupError:removalError.message});
    assert.equal(r.masterExited,true);assert.equal(r.profileRemoved,false);
  } finally { t.mock.restoreAll();await fs.promises.rm(native.profile,{recursive:true,force:true,maxRetries:5,retryDelay:100}); }
});

test('non-transient cleanup failure is not retried', { timeout: 30000 }, async t=>{
  const native=await launchNativeFixtureBrowser(), denied=Object.assign(new Error('controlled EACCES'),{code:'EACCES'}),realRemove=fs.promises.rm;let calls=0;
  t.mock.method(fs.promises,'rm',async(p,opts)=>{if(p!==native.profile)return realRemove(p,opts);calls++;throw denied});
  try {await assert.rejects(native.close(),error=>error===denied);assert.equal(calls,1);save('controlled-nontransient',native,{calls,cleanupError:denied.message});}
  finally {t.mock.restoreAll();await fs.promises.rm(native.profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});

test('startup failure retains original launch error when profile removal also fails', { timeout: 30000 }, async t=>{
  const old=process.env.CHROME_PATH;process.env.CHROME_PATH='/nonexistent/native-fixture-browser-942';let profile,calls=0;
  const removalError=Object.assign(new Error('controlled startup cleanup failure'),{code:'ENOTEMPTY'});
  t.mock.method(fs.promises,'rm',async p=>{profile=p;calls++;throw removalError});
  try {
    await assert.rejects(launchNativeFixtureBrowser(),error=>error instanceof AggregateError&&error.cause.code==='ENOENT'&&error.errors[0]===error.cause&&error.errors[1]===removalError);
    assert.equal(calls,6);records.push({name:'controlled-startup',profile,calls,originalError:'ENOENT',cleanupError:removalError.message});
  } finally {t.mock.restoreAll();if(old===undefined)delete process.env.CHROME_PATH;else process.env.CHROME_PATH=old;if(profile)await fs.promises.rm(profile,{recursive:true,force:true});}
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({source,records},null,2));
});


test('startup launch error remains original after successful owned-profile cleanup', { timeout: 15000 }, async t=>{
  const old=process.env.CHROME_PATH,realRemove=fs.promises.rm;process.env.CHROME_PATH='/nonexistent/native-fixture-browser-942-clean';let profile;
  t.mock.method(fs.promises,'rm',async(p,opts)=>{profile=p;return realRemove(p,opts)});
  try {await assert.rejects(launchNativeFixtureBrowser(),error=>error.code==='ENOENT'&&!(error instanceof AggregateError));assert.ok(profile);assert.equal(fs.existsSync(profile),false);records.push({name:'startup-clean',profile,profileRemoved:true,originalError:'ENOENT'});}
  finally {t.mock.restoreAll();if(old===undefined)delete process.env.CHROME_PATH;else process.env.CHROME_PATH=old;}
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({source,records},null,2));
});

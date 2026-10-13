#!/usr/bin/env node
// #853: native browser SHA/verifier + real local Worker PUT/read/reload, no apartment or WebGL.
// Start devserve and cloudflare/dev.mjs separately; private inputs are mandatory external JSON.
const { loadSecretTestInputs, redact } = require('./secret-test-inputs.cjs');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const kit = require('./testkit.cjs');
const game = process.argv[2] || 'http://localhost:8811', worker = process.argv[3] || 'http://localhost:8821';
const output = process.env.PRIVATE_CODE_OUTPUT || '/tmp/lunden-private-codes';
(async () => {
 const inputs = loadSecretTestInputs(), { codes } = inputs;
 const browser = await kit.launch();
 try {
  const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
  const errors=[];page.on('pageerror',error=>errors.push(redact(error.message,inputs)));
  // A real loopback response establishes the browser address space; an intercepted synthetic navigation does not.
  await page.goto(game+'/docs/development/storage.md');
  await page.setContent('<!doctype html><title>Private verifier regression</title><pre id="out">running</pre>');
  const vectors=['','abc','a'.repeat(56),'a'.repeat(64),'Lägenhet 🐈','\ud800','\udc00','a\ud800b'];
  const expected=vectors.map(value=>createHash('sha256').update(value,'utf8').digest('hex'));
  const results=await page.evaluate(async({codes,vectors,expected,worker})=>{
   const M=await import('/src/privatecodes.js'), lines=[];
   const check=(ok,label)=>{lines.push(`${ok?'PASS':'FAIL'} ${label}`);};
   check(vectors.every((value,i)=>M.sha256(value)===expected[i]),'synchronous browser SHA matches known UTF-8/block vectors');
   const name=`f-private-probe-${Date.now()}`;
   const read=async()=>{const response=await fetch(worker+'/furniture');if(!response.ok)throw new Error('Worker GET failed');return response.json();};
   const start=await read();
   let state=start;
   for(let i=0;i<codes.length;i++) {
    const code=codes[i], credential=M.privateCodeCredential(code);
    check(M.isPrivateCode(code)&&M.isPrivateCredential(credential),`real provisioned input ${i+1} is recognized`);
    check(![code.toUpperCase(),` ${code}`,code.replace(' ','  '),`/${code}`].some(M.isPrivateCode),`input ${i+1} keeps exact helper semantics`);
    for(const [mode,auth] of [['legacy',{code}],['credential',{credential}]]) {
     const id=`${name}-${i}-${mode}`, x=i+1;
     const response=await fetch(worker+'/furniture',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...auth,moves:[{id,base:0,pos:[x,0,3],quat:[0,0,0,1]}]})});
     check(response.status===200,`input ${i+1} ${mode} writes through actual Worker`);
     if(response.ok)state=await response.json();
     const persisted=await read();check(persisted.pieces[id]?.pos[0]===x&&persisted.revision===state.revision,`input ${i+1} ${mode} persists through Worker GET`);
    }
   }
   const bad=await fetch(worker+'/furniture',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({credential:{version:2,digest:M.layoutWriteCredential().digest},moves:[{id:name,base:0,pos:[0,0,0],quat:[0,0,0,1]}]})});
   check(bad.status===403,'wrong credential version refused');
   const unchanged=await read();check(unchanged.revision===state.revision,'refused credential writes nothing');
   return {lines,revision:state.revision,pieces:Object.fromEntries(Object.entries(state.pieces).filter(([id])=>id.startsWith(name))),worker};
  },{codes,vectors,expected,worker});
  await page.reload();
  const reloaded=await page.evaluate(async({worker,pieces,revision})=>{
   const response=await fetch(worker+'/furniture'),state=await response.json();
   return response.ok&&state.revision===revision&&Object.entries(pieces).every(([id,piece])=>JSON.stringify(state.pieces[id])===JSON.stringify(piece));
  },results);
  results.lines.push(`${reloaded?'PASS':'FAIL'} actual browser reload reads both legacy and credential writes`);
  const pass=results.lines.every(line=>line.startsWith('PASS'))&&errors.length===0;
  await page.setContent('<!doctype html><title>Private verifier regression</title><pre id="out"></pre>');
  await page.evaluate(({lines,pass})=>document.getElementById('out').textContent=lines.join('\n')+'\n'+(pass?'ALL PASS':'SOME FAILED'),{lines:results.lines,pass});
  fs.mkdirSync(output,{recursive:true});
  fs.writeFileSync(output+'/result.json',JSON.stringify({pass,lines:results.lines,errors},null,2));
  await page.screenshot({path:output+'/fixture.png'});
  console.log(results.lines.join('\n'));console.log(pass?'ALL PASS':'SOME FAILED');
  if(!pass)process.exitCode=1;
 } finally {await browser.close();}
})().catch(error=>{console.error('FAIL '+error.message);process.exitCode=1;});

#!/usr/bin/env node
// #853/#856: native browser SHA, synchronous command/unlock and actual Rearrange→Worker writes/reload; no apartment/WebGL.
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
  const clientWrites=[];
  page.on('request',request=>{
   if(request.method()!=='PUT'||request.url()!==worker+'/furniture')return;
   const body=request.postDataJSON();
   if(body.moves?.some(move=>move.id.startsWith('f-client-probe-'))) clientWrites.push({hasCode:Object.hasOwn(body,'code'),credential:body.credential});
  });
  const errors=[];page.on('pageerror',error=>errors.push(redact(error.message,inputs)));
  // A real loopback response establishes the browser address space; an intercepted synthetic navigation does not.
  await page.goto(game+'/docs/development/storage.md');
  await page.setContent('<!doctype html><title>Private verifier regression</title><pre id="out">running</pre><script type="importmap">{"imports":{"three":"/__three/build/three.module.js","three/addons/":"/__three/examples/jsm/"}}</script>');
  const vectors=['','abc','a'.repeat(56),'a'.repeat(64),'Lägenhet 🐈','\ud800','\udc00','a\ud800b'];
  const expected=vectors.map(value=>createHash('sha256').update(value,'utf8').digest('hex'));
  const results=await page.evaluate(async({codes,vectors,expected,worker})=>{
   const M=await import('/src/privatecodes.js'), C=await import('/src/cheats.js'), {Rearrange}=await import('/src/rearrange.js'), T=await import('three'), lines=[];
   const check=(ok,label)=>{lines.push(`${ok?'PASS':'FAIL'} ${label}`);};
   check(vectors.every((value,i)=>M.sha256(value)===expected[i]),'synchronous browser SHA matches known UTF-8/block vectors');
   const publicNames=['clean','jetpack','spiderman','day','night','lights on','lights off','handsfree'];
   check(C.CHEATS.length===8&&JSON.stringify(C.publicCheats().map(item=>item.code))===JSON.stringify(publicNames)&&codes.every(code=>!C.cheatList().includes(code)), 'exact eight public commands/list remain; private inputs absent from catalogue');
   for(let i=0;i<codes.length;i++) {
    const canonical=codes[i], variants=[canonical,` ${canonical} `,canonical.toUpperCase(),` / ${canonical.toUpperCase().replaceAll(' ','  ')} `];
    let calls=0,received='';const handlers={unlock:input=>{calls++;received=input;return 'native unlock';}};
    check(variants.every(input=>C.isCommand(input)===true&&C.runCheat(input,handlers)==='native unlock')&&calls===variants.length&&received===canonical,`private input ${i+1} preserves synchronous console normalization and canonical handler input`);
    check(C.runCheat(`//${canonical}`,handlers)===C.UNKNOWN&&C.runCheat(canonical+'x',handlers)===C.UNKNOWN&&C.isCommand('ordinary sentence')===false&&C.isCommand('/unknown')===true,`private input ${i+1} keeps one-slash and neutral refusal/command routing`);
   }
   check(publicNames.every(code=>C.isCommand(code)&&C.runCheat(code,{[code]:()=>42})===42),'all public handlers remain synchronous');
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
   const clientPieces={};
   const makeRearrange=async(id)=>{
    const scene=new T.Scene(), camera=new T.PerspectiveCamera(), object=new T.Group(), root=new T.Group();root.add(object);scene.add(root);
    const piece={id,item:{type:'fixture'},object,level:0};let busy=false;
    const world={furniture:{movable:[piece],object:root,surfaces:[],segments:[[],[]],footprints:[[],[]]},lamps:[],refreshFurniture(){}};
    const rearrange=new Rearrange({scene,camera,world,player:{},life:{},carryables:()=>[],marks:{invalidate(){}},busy:()=>busy},worker);
    clearInterval(rearrange.timer);await rearrange.ready;
    return {rearrange,piece,setBusy:value=>{busy=value;}};
   };
   for(let i=0;i<codes.length;i++) {
    localStorage.removeItem('lunden.furniture.unlocked');localStorage.removeItem('lunden.furniture.layout');
    const id=`f-client-probe-${Date.now()}-${i}`, {rearrange:R,piece,setBusy}=await makeRearrange(id);
    check(R.unlocked===false&&R.unlock(codes[i].toUpperCase())===false&&R.unlock('/'+codes[i])===false&&R.unlock(codes[i].replace(' ','  '))===false,`direct input ${i+1} rejects console-only normalization`);
    setBusy(true);const accepted=R.unlock(' '+codes[i]+' ');
    check(accepted===true&&R.unlocked===true&&R.enabled===false&&localStorage.getItem('lunden.furniture.unlocked')==='true',`direct input ${i+1} synchronously persists trim-only unlock despite real busy refusal`);
    setBusy(false);check(R.unlock(codes[i])===true&&R.enabled===true,`direct input ${i+1} calls actual enable after busy clears`);
    const move=(base,x)=>({id,base,pos:[x,0,3],quat:[0,0,0,1]});
    const saved=await R.write([move(0,i+5)]);R.apply(saved);
    check(saved.pieces[id]?.pos[0]===i+5&&piece.revision===saved.revision,`input ${i+1} actual client credential PUT applies authoritative revision`);
    let conflict=false;try{await R.write([move(0,90)]);}catch{conflict=R.pending?.revision===saved.revision;}R.cancel();
    check(conflict&&(await read()).pieces[id].pos[0]===i+5,`input ${i+1} actual stale client PUT retains conflict state without overwrite`);
    let invalid=false;try{await R.write([{...move(piece.revision,90),quat:[0,0,0,0]}]);}catch{invalid=true;}
    check(invalid&&(await read()).revision===saved.revision,`input ${i+1} client PUT preserves server pose validation`);
    check(await R.restoreAll(saved.revision)===true&&(await read()).pieces[id].pos[0]===0,`input ${i+1} real reset confirmation revision writes home pose atomically`);
    const restored=await makeRearrange(id);
    check(restored.rearrange.unlocked===true&&restored.piece.object.position.x===0&&restored.piece.revision===R.state.revision,`input ${i+1} fresh real client restores saved boolean and shared layout without input`);
    clientPieces[id]=(await read()).pieces[id];
   }
   state=await read();
   const bad=await fetch(worker+'/furniture',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({credential:{version:2,digest:M.layoutWriteCredential().digest},moves:[{id:name,base:0,pos:[0,0,0],quat:[0,0,0,1]}]})});
   check(bad.status===403,'wrong credential version refused');
   const unchanged=await read();check(unchanged.revision===state.revision,'refused credential writes nothing');
   return {lines,revision:state.revision,pieces:Object.fromEntries(Object.entries(state.pieces).filter(([id])=>id.startsWith(name)||Object.hasOwn(clientPieces,id))),worker};
  },{codes,vectors,expected,worker});
  await page.reload();
  const reloaded=await page.evaluate(async({worker,pieces,revision})=>{
   const response=await fetch(worker+'/furniture'),state=await response.json();
   return localStorage.getItem('lunden.furniture.unlocked')==='true'&&response.ok&&state.revision===revision&&Object.entries(pieces).every(([id,piece])=>JSON.stringify(state.pieces[id])===JSON.stringify(piece));
  },results);
  results.lines.push(`${reloaded?'PASS':'FAIL'} actual browser reload reads both legacy and credential writes`);
  results.lines.push(`${clientWrites.length===8&&clientWrites.every(write=>!write.hasCode&&write.credential?.version===1)?'PASS':'FAIL'} every actual client PUT sends only versioned credential, never plaintext input`);
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

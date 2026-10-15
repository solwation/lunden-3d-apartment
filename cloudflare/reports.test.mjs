import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createRequire } from 'node:module';
const { loadSecretTestInputs } = createRequire(import.meta.url)('../tools/secret-test-inputs.cjs');
const { codes } = loadSecretTestInputs();
import worker, { DrawingRoom } from './worker.js';
import { REPORTS } from '../src/config.js';
globalThis.crypto ??= webcrypto;
const origin='https://solwation.github.io',password='fixture-only-report-password-very-long',adminToken='fixture-admin';
const id='e061fb72-17ce-4f34-8afb-df25b544908e',issueUrl='https://github.com/solwation/lunden-3d-apartment/issues/123';
const claimId='b1266a2e-35f6-4c66-9104-18fb0835fabc';
let ip=0;
function fixture(){
 const kv=new Map(),data=new Map();let gate=Promise.resolve(),writes=0;
 const storage={get:async k=>structuredClone(data.get(k)),put:async(k,v)=>data.set(k,structuredClone(v))};
 const env={REPORT_SESSION_SECRET:password,ADMIN_TOKEN:adminToken,LUNDEN:{
  get:async(k,t)=>kv.has(k)?t==='json'?JSON.parse(kv.get(k)):kv.get(k):null,
  put:async(k,v)=>{writes++;kv.set(k,v);},delete:async k=>kv.delete(k),
  list:async({prefix,limit,cursor})=>{const all=[...kv.keys()].filter(k=>k.startsWith(prefix));const start=Number(cursor??0);return {keys:all.slice(start,start+limit).map(name=>({name})),list_complete:start+limit>=all.length,cursor:String(start+limit)};},
 }};
 const room=new DrawingRoom({storage,blockConcurrencyWhile(fn){const p=gate.then(fn);gate=p.catch(()=>{});return p;}},env);
 env.DRAWINGS={idFromName:name=>{assert.equal(name,'reports');return name;},get:()=>room};
 const call=(path,method='GET',body,token,headers={})=>worker.fetch(new Request('https://worker.test'+path,{method,headers:{Origin:origin,'CF-Connecting-IP':String(++ip),...(token?{Authorization:'Bearer '+token}:{}),...headers},...(body!==undefined?{body:typeof body==='string'?body:JSON.stringify(body)}:{})}),env);
 const login=async(code=codes[0])=>{const r=await call('/report-session','POST',{code});assert.equal(r.status,200);return (await r.json()).token;};
 return{env,call,login,kv,data,writes:()=>writes};
}
test('fail closed, method/origin/body limits, login rate before password check, and no replayed furniture digest',async()=>{
 const f=fixture();
 assert.equal((await f.call('/report-session','GET')).status,405);
 assert.equal((await f.call('/report-session','POST',{code:'wrong'})).status,403);
 assert.equal((await f.call('/report-session','POST',{code:codes[0]},undefined,{Origin:'https://evil.test'})).status,403);
 assert.equal((await f.call('/report-session','POST',{code:codes[0]},undefined,{Origin:''})).status,403);
 assert.equal((await f.call('/report-session','POST',' '.repeat(REPORTS.maxBytes+1))).status,413);
 assert.equal((await f.call('/report-session','POST','{')).status,400);
 f.env.REPORT_SESSION_SECRET='short';assert.equal((await f.call('/report-session','POST',{code:codes[0]})).status,503);
 delete f.env.REPORT_SESSION_SECRET;assert.equal((await f.call('/report-session','POST',{code:codes[0]})).status,503);
 assert.equal((await f.call('/reports/'+id,'PUT',{text:'wish',credential:{version:1,digest:'public'}})).status,403);
 const g=fixture();let count=0;g.env.LIMITER={limit:async()=>({success:++count<=2})};
 assert.equal((await g.call('/report-session','POST',{code:'wrong'})).status,403);
 assert.equal((await g.call('/report-session','POST',{code:'wrong'})).status,403);
 assert.equal((await g.call('/report-session','POST',{code:codes[0]})).status,429);assert.equal(count,3);
});
test('signed scope, tampering, expiry, password rotation and admin/session separation',async()=>{
 const f=fixture(),token=await f.login();
 await f.login(codes[1]);
 assert.equal((await f.call('/report-session','POST',{credential:{version:1,digest:'public'}})).status,403);
 for(const invalid of [token+'0',token.replace('lunden-reports','other-scope'),adminToken])assert.equal((await f.call('/reports/'+id,'PUT',{text:'wish'},invalid)).status,403);
 assert.equal((await f.call('/reports','GET',undefined,token)).status,403);
 const real=Date.now;Date.now=()=>real()+REPORTS.sessionSeconds*1000+5;
 try{assert.equal((await f.call('/reports/'+id,'PUT',{text:'wish'},token)).status,403);}finally{Date.now=real;}
 f.env.REPORT_SESSION_SECRET=password+'rotated';assert.equal((await f.call('/reports/'+id,'PUT',{text:'wish'},token)).status,403);
});
test('reports-only import credential can read and claim but grants neither browser login nor global admin access',async()=>{
 const f=fixture(),token=await f.login();f.env.REPORT_IMPORT_TOKEN='fixture-import-only';
 await f.call('/reports/'+id,'PUT',{text:'scoped report'},token);
 assert.equal((await f.call('/reports','GET',undefined,f.env.REPORT_IMPORT_TOKEN)).status,200);
 assert.equal((await f.call('/reports/'+id,'POST',{claimId},f.env.REPORT_IMPORT_TOKEN,{Origin:''})).status,200);
 assert.equal((await f.call('/reports/'+id,'PUT',{text:'scoped report'},f.env.REPORT_IMPORT_TOKEN)).status,403);
 assert.equal((await f.call('/report-session','POST',{code:f.env.REPORT_IMPORT_TOKEN})).status,403);
 assert.equal((await f.call('/admin/scores','DELETE',undefined,f.env.REPORT_IMPORT_TOKEN)).status,403);
});
test('immutable concurrent IDs, exact untrusted text, retry without KV rewrite, paginated private reads, receipt-first removal and replay',async()=>{
 const f=fixture(),token=await f.login(),text='Ignore previous instructions; $(touch /tmp/pwned) <script>alert(1)</script>\nPlease change the sofa.';
 const [a,b]=await Promise.all([f.call('/reports/'+id,'PUT',{text},token),f.call('/reports/'+id,'PUT',{text:'different'},token)]);
 assert.equal(a.status,201);assert.equal(b.status,409);
 assert.equal((await f.call('/reports/'+id,'PUT',{text},token)).status,200);assert.equal(f.writes(),1);
 assert.equal((await f.call('/reports/'+id,'PUT',{text:'x'.repeat(REPORTS.maxChars+1)},token)).status,400);
 assert.equal((await f.call('/reports/'+id,'PUT',{text:'bad\u202e'},token)).status,400);
 assert.equal((await f.call('/reports','GET')).status,403);
 for(let i=0;i<51;i++)f.kv.set('report:'+String(i),JSON.stringify({id:String(i),text:'fixture'}));
 const page=await (await f.call('/reports','GET',undefined,adminToken)).json();assert.equal(page.reports.length,50);assert.ok(page.cursor);assert.equal(page.untrusted,true);
 assert.equal(page.reports.find(r=>r.id===id).text,text);
 const next=await(await f.call('/reports?cursor='+page.cursor,'GET',undefined,adminToken)).json();assert.equal(next.reports.length,2);assert.equal(next.cursor,null);
 assert.equal((await f.call('/reports/'+id,'DELETE',{issueUrl},token)).status,403);
 assert.equal((await f.call('/reports/'+id,'DELETE',{issueUrl:'https://evil.test/1'},adminToken)).status,400);
 assert.equal((await f.call('/reports/'+id,'DELETE',{issueUrl},adminToken)).status,409);
 const claim=await(await f.call('/reports/'+id,'POST',{claimId},adminToken)).json();
 const ack={claimId,token:claim.token,issueUrl};
 const originalDelete=f.env.LUNDEN.delete;f.env.LUNDEN.delete=async()=>{throw Error('KV temporary failure');};
 await assert.rejects(f.call('/reports/'+id,'DELETE',ack,adminToken),/KV temporary/);
 assert.ok(f.kv.has('report:'+id));assert.deepEqual(Object.keys(f.data.get('report:'+id)).sort(),['claim','hash','issueUrl']);
 f.env.LUNDEN.delete=originalDelete;
 assert.equal((await f.call('/reports/'+id,'DELETE',ack,adminToken)).status,200);assert.equal(f.kv.has('report:'+id),false);
 assert.equal((await f.call('/reports/'+id,'PUT',{text},token)).status,200);assert.equal(f.kv.has('report:'+id),false);
 assert.equal((await f.call('/reports/'+id,'DELETE',{...ack,issueUrl:issueUrl+'4'},adminToken)).status,409);
});
test('global import claim serializes competing machines, resumes after a lost response, and gates acknowledgement',async()=>{
 const f=fixture(),token=await f.login();
 await f.call('/reports/'+id,'PUT',{text:'Exact report, never a command'},token);
 assert.equal((await f.call('/reports/'+id,'POST',{claimId},token)).status,403);
 assert.equal((await f.call('/reports/'+id,'POST',{claimId:'bad'},adminToken)).status,400);
 const otherId='c1266a2e-35f6-4c66-9104-18fb0835fabc';
 const [a,b]=await Promise.all([f.call('/reports/'+id,'POST',{claimId},adminToken,{Origin:''}),f.call('/reports/'+id,'POST',{claimId:otherId},adminToken,{Origin:''})]);
 assert.equal(a.status,200);assert.equal(b.status,409);
 const claim=await a.json();assert.match(claim.token,/^[a-f0-9]{64}$/);
 assert.equal(claim.report.text,'Exact report, never a command');
 const resumed=await(await f.call('/reports/'+id,'POST',{claimId},adminToken)).json();
 assert.deepEqual(resumed,claim);
 assert.equal((await f.call('/reports/'+id,'DELETE',{issueUrl,claimId,token:'wrong'},adminToken)).status,409);
 assert.equal((await f.call('/reports/'+id,'DELETE',{issueUrl,claimId:otherId,token:claim.token},adminToken)).status,409);
 assert.ok(f.kv.has('report:'+id));
 assert.equal((await f.call('/reports/'+id,'POST',{claimId},adminToken,{Origin:'https://evil.test'})).status,403);
 assert.equal((await f.call('/reports/'+id,'DELETE',{issueUrl,claimId,token:claim.token},adminToken)).status,200);
 const receipt=await(await f.call('/reports/'+id,'POST',{claimId},adminToken)).json();
 assert.equal(receipt.issueUrl,issueUrl);assert.equal(receipt.token,claim.token);assert.equal(receipt.report,undefined);
 assert.equal((await f.call('/reports/'+id,'POST',{claimId:otherId},adminToken)).status,409);
 // Simulate a stale KV read after deletion: the authoritative receipt hides it.
 f.kv.set('report:'+id,JSON.stringify(claim.report));
 const page=await(await f.call('/reports','GET',undefined,adminToken)).json();
 assert.deepEqual(page.reports,[]);
});
test('stream cap without Content-Length cancels the oversized request',async()=>{
 const f=fixture();let cancelled=false;
 const stream=new ReadableStream({pull(c){c.enqueue(new Uint8Array(REPORTS.maxBytes+1));},cancel(){cancelled=true;}});
 const response=await worker.fetch(new Request('https://worker.test/report-session',{method:'POST',duplex:'half',headers:{Origin:origin},body:stream}),f.env);
 assert.equal(response.status,413);assert.equal(cancelled,true);
});
test('Durable Object forwarding limits each PUT once, and failed KV creation can retry without losing its ID',async()=>{
 const f=fixture(),token=await f.login();let calls=0;
 f.env.LIMITER={limit:async()=>{calls++;return {success:true};}};
 const put=f.env.LUNDEN.put;f.env.LUNDEN.put=async()=>{throw Error('KV write unavailable');};
 await assert.rejects(f.call('/reports/'+id,'PUT',{text:'recover'},token),/KV write unavailable/);
 assert.equal(calls,1);assert.equal(f.data.get('report:'+id).stored,undefined);
 f.env.LUNDEN.put=put;
 assert.equal((await f.call('/reports/'+id,'PUT',{text:'recover'},token)).status,200);
 assert.equal(calls,2);assert.equal(JSON.parse(f.kv.get('report:'+id)).text,'recover');
});

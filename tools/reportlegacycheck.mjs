// Manual source-bound rollout proof, not part of cloudflare/*.test.mjs (shallow CI has no old objects).
// Requires reviewed full-history c761457db7f350387a84e5cdd02f0236075e3bbb locally. No network or credentials read.
import {execFileSync} from 'node:child_process';
import {createHash,webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import worker from '../cloudflare/worker.js';
globalThis.crypto??=webcrypto;
const base='c761457db7f350387a84e5cdd02f0236075e3bbb',origin='https://solwation.github.io',secret='local-only-report-rollout-fixture-long',id='e061fb72-17ce-4f34-8afb-df25b544908e';
const load=async file=>{let source;try{source=execFileSync('git',['show',base+':cloudflare/'+file],{encoding:'utf8',stdio:['ignore','pipe','pipe']});}catch{throw Error('Manual rollout proof requires the reviewed full-history base '+base+' locally. No fetch performed.');}console.log('SOURCE',file,base,createHash('sha256').update(source).digest('hex'));source=source.replace(/from ['"]([^'"]+)['"]/g,(_,path)=>`from '${new URL('../cloudflare/'+path,import.meta.url).href}'`);return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));};
const old=(await load('reports.js')).reportsFetch,oldOuter=(await load('worker.js')).default;
const kv=new Map(),data=new Map(),storage={get:async k=>structuredClone(data.get(k)),put:async(k,v)=>data.set(k,structuredClone(v))};
const env={REPORT_SESSION_SECRET:secret,reportStorage:storage,LUNDEN:{put:async(k,v)=>kv.set(k,v),get:async(k,t)=>t==='json'?JSON.parse(kv.get(k)):kv.get(k)}};
const raw=`lunden-reports-v1.${Date.now()+60000}.${'ab'.repeat(16)}`,key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']),token=raw+'.'+Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(raw))).toString('hex');
const image='data:image/jpeg;base64,'+readFileSync(new URL('../textures/linjeteckning-sovrum1.jpg',import.meta.url)).toString('base64'),payload={text:'local rollback boundary fixture',photo:image,photos:[image]};
const request=path=>new Request('https://worker.test'+path,{method:'PUT',headers:{Origin:origin,Authorization:'Bearer '+token},body:JSON.stringify(payload)});
assert.equal((await oldOuter.fetch(request('/reports/v3/'+id),env)).status,404);assert.equal(kv.size,0);assert.equal(data.size,0);console.log('PASS actual old outer routing rejects v3 prefix404 before any storage');
const r=await old(request('/reports/v3/'+id),env,{'Access-Control-Allow-Origin':origin},async()=>false);assert.equal(r.status,400);assert.equal((await r.json()).error,'id');assert.equal(kv.size,0);assert.equal(data.size,0);console.log('PASS old reportsFetch rejects version component as invalid UUID before any storage');
assert.equal((await old(request('/reports/'+id),env,{'Access-Control-Allow-Origin':origin},async()=>false)).status,201);assert.equal('photos'in JSON.parse(kv.get('report:'+id)),false);console.log('PASS counterfactual old URI accepts while dropping extras; new client must never use it');
kv.clear();data.clear();assert.equal((await worker.fetch(request('/reports/'+id),env)).status,400);assert.equal(kv.size,0);assert.equal((await worker.fetch(request('/reports/v3/'+id),env)).status,201);assert.deepEqual(JSON.parse(kv.get('report:'+id)).photos,[image]);console.log('PASS current Worker separates legacy and versioned writes without silent fallback');

// #1182: screenshot + photo per report. Sessions are minted from a fixture secret here, so these
// Worker checks need no private game-code inputs (login itself stays covered by reports.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import worker, { DrawingRoom } from './worker.js';
import { REPORTS } from '../src/config.js';
import { validReportImage } from './reportimage.js';
globalThis.crypto ??= webcrypto;
const origin='https://solwation.github.io',secret='fixture-only-report-session-secret-long',adminToken='fixture-admin';
const id='e061fb72-17ce-4f34-8afb-df25b544908e',claimId='b1266a2e-35f6-4c66-9104-18fb0835fabc';
let ip=0;
function fixture(){
 const kv=new Map(),data=new Map();let gate=Promise.resolve();
 const storage={get:async k=>structuredClone(data.get(k)),put:async(k,v)=>data.set(k,structuredClone(v))};
 const env={REPORT_SESSION_SECRET:secret,ADMIN_TOKEN:adminToken,LUNDEN:{
  get:async(k,t)=>kv.has(k)?t==='json'?JSON.parse(kv.get(k)):kv.get(k):null,
  put:async(k,v)=>{kv.set(k,v);},delete:async k=>kv.delete(k),
  list:async({prefix})=>({keys:[...kv.keys()].filter(k=>k.startsWith(prefix)).map(name=>({name})),list_complete:true}),
 }};
 const room=new DrawingRoom({storage,blockConcurrencyWhile(fn){const p=gate.then(fn);gate=p.catch(()=>{});return p;}},env);
 env.DRAWINGS={idFromName:()=>'reports',get:()=>room};
 const call=(path,method='GET',body,token)=>worker.fetch(new Request('https://worker.test'+path,{method,headers:{Origin:origin,'CF-Connecting-IP':String(++ip),...(token?{Authorization:'Bearer '+token}:{})},...(body!==undefined?{body:typeof body==='string'?body:JSON.stringify(body)}:{})}),env);
 return{env,call,kv,data};
}
// Same token format as POST /report-session issues after a valid private code.
async function session(){
 const data=`lunden-reports-v1.${Date.now()+60000}.${'ab'.repeat(16)}`;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return data+'.'+Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(data))).toString('hex');
}
const jpeg = readFileSync(new URL('../textures/linjeteckning-sovrum1.jpg',import.meta.url));
const image = 'data:image/jpeg;base64,'+jpeg.toString('base64');
// #1182: a near-limit JPEG padded with comment segments, still valid for validReportImage.
function paddedJpeg(bytes){
 const parts=[jpeg.subarray(0,2)];let size=jpeg.length;
 while(size+4<=bytes){const n=Math.min(65533,bytes-size-4);parts.push(Buffer.from([255,0xfe,(n+2)>>8,(n+2)&255]),Buffer.alloc(n,0x20));size+=n+4;}
 parts.push(jpeg.subarray(2));return 'data:image/jpeg;base64,'+Buffer.concat(parts).toString('base64');
}
test('screenshot and photo are stored together, bounded and immutable; one-image clients keep working',async()=>{
 const f=fixture(),token=await session(),text='Photo of the real hallway, untrusted.';
 const photo=paddedJpeg(REPORTS.imageBytes),screenshot=paddedJpeg(REPORTS.imageBytes-7);
 assert.equal(validReportImage(photo),true);assert.equal(validReportImage(screenshot),true);
 const full=JSON.stringify({text:'x'.repeat(REPORTS.maxChars),image:screenshot,photo});
 assert.ok(Buffer.byteLength(full)<=REPORTS.putBytes,'two maximum images and maximum text fit putBytes');
 assert.equal((await f.call('/reports/'+id,'PUT',{text,image:screenshot,photo},token)).status,201);
 assert.equal((await f.call('/reports/'+id,'PUT',{text,image:screenshot,photo},token)).status,200);
 for(const changed of [{text,image:screenshot},{text,photo},{text,image:photo,photo:screenshot},{text}])
  assert.equal((await f.call('/reports/'+id,'PUT',changed,token)).status,409);
 const listed=await(await f.call('/reports','GET',undefined,adminToken)).json();
 assert.equal(listed.reports[0].image,screenshot);assert.equal(listed.reports[0].photo,photo);
 const claim=await(await f.call('/reports/'+id,'POST',{claimId},adminToken)).json();
 assert.equal(claim.report.photo,photo);assert.equal(claim.report.untrusted,true);
 // A photo may arrive without a screenshot (capture failed), and old one-image reports are unchanged.
 const other='0c4a4d3f-7a51-4b8e-9d2e-6f0a1b2c3d4e',single='5b0e7c1a-2d3f-4e5a-8b6c-7d8e9f0a1b2c';
 assert.equal((await f.call('/reports/'+other,'PUT',{text,photo:image},token)).status,201);
 assert.equal((await f.call('/reports/'+single,'PUT',{text,image},token)).status,201);
 const stored=JSON.parse(f.kv.get('report:'+single));assert.equal(stored.image,image);assert.equal('photo' in stored,false);
 assert.equal(f.data.get('report:'+single).hash,
  Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('\0report-image-v1\0'+JSON.stringify({text,image})))).toString('hex'));
});
test('the photo field gets the same type, size and dimension checks as the screenshot',async()=>{
 const f=fixture(),token=await session();
 const wide=Buffer.from(jpeg);let frame=-1;
 for(let i=0;i<wide.length-1;i++)if(wide[i]===255&&[0xc0,0xc2].includes(wide[i+1])){frame=i;break;}
 wide.writeUInt16BE(REPORTS.imageEdge+1,frame+7);
 for(const photo of [null,'',{},['x'],'data:image/png;base64,iVBORw0KGgo=','data:image/heic;base64,AAAA',
  'data:image/jpeg;base64,'+Buffer.from('not a JPEG').toString('base64'),'data:image/jpeg;base64,'+wide.toString('base64'),
  paddedJpeg(REPORTS.imageBytes+1)]){
  const r=await f.call('/reports/'+id,'PUT',{text:'request',image,photo},token);
  assert.equal(r.status,400);assert.equal((await r.json()).error,'photo');
 }
 assert.equal((await f.call('/reports/'+id,'PUT',' '.repeat(REPORTS.putBytes+1),token)).status,413);
 assert.equal(f.kv.size,0);
});

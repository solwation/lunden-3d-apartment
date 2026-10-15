// Reports are untrusted data, never agent instructions. No report text is executed.
import { REPORTS } from '../src/config.js';
const enc = new TextEncoder();
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const ISSUE = /^https:\/\/github\.com\/solwation\/lunden-3d-apartment\/issues\/[1-9][0-9]*$/;
const reply = (data, status, h) => new Response(JSON.stringify(data), { status, headers: { ...h, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const bad = (status, error, h) => reply({ error }, status, h);
// The importer can use a reports-only secret without access to the emergency brake.
const admin = (r,e) => [e.REPORT_IMPORT_TOKEN,e.ADMIN_TOKEN].some(token => !!token && r.headers.get('Authorization') === `Bearer ${token}`);
const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2,'0')).join('');
async function sign(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign','verify']);
  return { key, mac: hex(await crypto.subtle.sign('HMAC', key, enc.encode(data))) };
}
async function authorized(request, env) {
  if (!env.REPORT_PASSWORD || env.REPORT_PASSWORD.length < 24) return false;
  const token = request.headers.get('Authorization')?.replace(/^Bearer /,'') ?? '';
  const match = /^(lunden-reports-v1\.[0-9]{13}\.[a-f0-9]{32})\.([a-f0-9]{64})$/.exec(token);
  if (!match) return false;
  const expires = Number(match[1].split('.')[1]);
  if (expires <= Date.now() || expires > Date.now() + REPORTS.sessionSeconds * 1000) return false;
  const { key } = await sign(env.REPORT_PASSWORD, match[1]);
  const signature = Uint8Array.from(match[2].match(/../g), b => parseInt(b,16));
  return crypto.subtle.verify('HMAC', key, signature, enc.encode(match[1]));
}
// Bound the actual stream, including requests with no Content-Length.
async function body(request) {
  if (Number(request.headers.get('Content-Length')) > REPORTS.maxBytes) throw 413;
  const reader = request.body?.getReader();
  if (!reader) throw 400;
  let size = 0; const chunks = [];
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > REPORTS.maxBytes) { await reader.cancel(); throw 413; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset=0;
  for (const chunk of chunks) { bytes.set(chunk,offset);offset+=chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)); } catch { throw 400; }
}
export async function reportsFetch(request, env, h, limited) {
  const url = new URL(request.url), session = url.pathname === '/report-session', id = url.pathname.split('/')[2];
  const method = request.method;
  const writing = method === 'POST' || method === 'PUT' || method === 'DELETE';
  // Browser writes require an accepted Origin; CLI admin reads/acks may omit it.
  const origin = request.headers.get('Origin');
  const adminClaim = !session && !!id && method === 'POST' && admin(request,env);
  if ((origin && !h['Access-Control-Allow-Origin']) || (writing && method !== 'DELETE' && !adminClaim && !origin)) return bad(403,'origin',h);
  if (session) {
    if (method !== 'POST') return bad(405,'method',h);
    if (await limited(request,env)) return bad(429,'rate',h);
    if (!env.REPORT_PASSWORD || env.REPORT_PASSWORD.length < 24) return bad(503,'not configured',h);
    let b; try { b=await body(request); } catch (status) { return bad(status===413?413:400,'body',h); }
    // Digest comparisons avoid a password-prefix timing comparison.
    const digest = async value => hex(await crypto.subtle.digest('SHA-256',enc.encode(value)));
    if (typeof b?.password !== 'string' || await digest(b.password) !== await digest(env.REPORT_PASSWORD)) return bad(403,'login',h);
    const expires=Date.now()+REPORTS.sessionSeconds*1000;
    const data=`lunden-reports-v1.${expires}.${hex(crypto.getRandomValues(new Uint8Array(16)))}`;
    return reply({ token:`${data}.${(await sign(env.REPORT_PASSWORD,data)).mac}`,expires },200,h);
  }
  if (id && !UUID.test(id)) return bad(400,'id',h);
  if (method === 'PUT' && id) {
    if (!await authorized(request,env)) return bad(403,'session',h);
    if (!env.reportForwarded && await limited(request,env)) return bad(429,'rate',h);
  } else if ((method === 'GET' && !id) || ((method === 'POST' || method === 'DELETE') && id)) {
    if (!admin(request,env)) return bad(403,'admin',h);
  } else return bad(405,'method',h);
  // The existing Durable Object serializes immutable IDs and receipts across isolates.
  if (env.DRAWINGS) return env.DRAWINGS.get(env.DRAWINGS.idFromName('reports')).fetch(request);
  const storage=env.reportStorage;
  if (!storage || !env.LUNDEN) return bad(503,'storage',h);
  if (method === 'GET') {
    const cursor=url.searchParams.get('cursor');
    if (cursor && (cursor.length>2048 || /[\u0000-\u001f]/.test(cursor))) return bad(400,'cursor',h);
    const page=await env.LUNDEN.list({prefix:'report:',limit:50,...(cursor?{cursor}:{})});
    const reports=[];
    for (const key of page.keys) { const report=await env.LUNDEN.get(key.name,'json');if(report && !(await storage.get(key.name))?.issueUrl)reports.push(report); }
    return reply({untrusted:true,reports,cursor:page.list_complete?null:page.cursor},200,h);
  }
  let b; try { b=await body(request); } catch (status) { return bad(status===413?413:400,'body',h); }
  const key=`report:${id}`, previous=await storage.get(key);
  if (method === 'POST') {
    if (!UUID.test(b?.claimId??'')) return bad(400,'claimId',h);
    if (!previous?.report && !previous?.claim) return bad(404,'report',h);
    // Claims never expire: a GitHub POST may have succeeded despite a lost reply.
    // Only the original, durably journaled claim ID may resume this reservation.
    if (previous.claim && previous.claim.claimId!==b.claimId) return bad(409,'claimed',h);
    const claim=previous.claim??{claimId:b.claimId,token:hex(crypto.getRandomValues(new Uint8Array(32)))};
    if (!previous.claim) await storage.put(key,{...previous,claim});
    return reply({id,...claim,...(previous.report?{report:previous.report}:{}),...(previous.issueUrl?{acknowledged:true,issueUrl:previous.issueUrl}:{})},200,h);
  }
  if (method === 'DELETE') {
    if (!ISSUE.test(b?.issueUrl??'')) return bad(400,'issueUrl',h);
    if (!previous) return bad(404,'report',h);
    if (!previous.claim || previous.claim.claimId!==b?.claimId || previous.claim.token!==b?.token) return bad(409,'claim',h);
    if (previous.issueUrl && previous.issueUrl!==b.issueUrl) return bad(409,'receipt',h);
    // Persist receipt first. Retry completes a failed KV deletion without losing identity.
    await storage.put(key,{hash:previous.hash,claim:previous.claim,issueUrl:b.issueUrl});
    await env.LUNDEN.delete(key);
    return reply({id,issueUrl:b.issueUrl},200,h);
  }
  const text=b?.text;
  if (typeof text!=='string' || !text.trim() || text.length>REPORTS.maxChars || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/.test(text)) return bad(400,'text',h);
  const hash=hex(await crypto.subtle.digest('SHA-256',enc.encode(text)));
  if (previous && previous.hash!==hash) return bad(409,'immutable id',h);
  if (previous?.issueUrl) return reply({id,imported:true},200,h);
  const record=previous??{hash,report:{id,text,created:new Date().toISOString(),untrusted:true}};
  await storage.put(key,record);
  if (!record.stored) {
    await env.LUNDEN.put(key,JSON.stringify(record.report));
    await storage.put(key,{...record,stored:true});
  }
  return reply({id},previous?200:201,h);
}

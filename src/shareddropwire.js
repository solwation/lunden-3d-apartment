// #1855 caught-fish transactions only. No personal inventory, photos, names or reward payload.
import {FISHING as F} from './config.js';
export const dropId=v=>typeof v==='string'&&/^[a-f0-9]{32}$/.test(v);
export const dropKey=dropId;
const vec=(v,n,limit)=>Array.isArray(v)&&v.length===n&&v.every(x=>Number.isFinite(x)&&Math.abs(x)<=limit);
export function cleanDropFish(v){const range=F.species[v?.sp]?.cm;if(!range||!Number.isInteger(v.cm)||v.cm<range[0]||v.cm>range[1]||!Number.isFinite(v.ck)||v.ck<0||v.ck>F.cook.burn||!['grill','pan'].includes(v.by)||!Number.isInteger(v.b)||v.b<0||v.b>=F.cook.bites)return null;return{sp:v.sp,cm:v.cm,ck:Math.round(v.ck*100)/100,by:v.by,b:v.b};}
export function cleanDropPose(p,q){if(!vec(p,3,5000)||!vec(q,4,1.01)||Math.abs(Math.hypot(...q)-1)>.01)return null;const n=Math.hypot(...q);return{p:p.map(x=>Math.round(x*1000)/1000),q:q.map(x=>Math.round(x/n*100000)/100000)};}
export function cleanSharedDrop(v){if(v?.t!=='df'||!['put','take','resume','consume','get'].includes(v.k)||!dropId(v.id)||!Number.isSafeInteger(v.n)||v.n<1||v.n>2147483647)return null;const out={k:v.k,id:v.id,n:v.n};if(v.k==='get')return out;if(!dropKey(v.key)||!Number.isSafeInteger(v.r)||v.r<0||v.r>1e9)return null;Object.assign(out,{key:v.key,r:v.r});if(v.k==='take'||v.k==='resume'){if(!dropKey(v.next))return null;out.next=v.next;}if(v.k==='put'){const data=cleanDropFish(v.d),pose=cleanDropPose(v.p,v.q);if(!data||!pose)return null;Object.assign(out,{d:data,...pose});}return out;}
export const publicDrop=r=>({id:r.id,r:r.r,mode:r.mode,d:{...r.d},p:[...r.p],q:[...r.q],who:r.who??null,until:r.until});

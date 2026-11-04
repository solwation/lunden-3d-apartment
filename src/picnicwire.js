import {ROOF_PICNIC as C,DRINKS,WALK} from './config.js';
export const picnicKey=v=>typeof v==='string'&&/^[a-f0-9]{32}$/.test(v);
const integer=(v,max)=>Number.isSafeInteger(v)&&v>=0&&v<=max;
export const picnicPoint=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite)&&p[0]>=WALK.x0&&p[0]<=WALK.x1&&p[2]>=WALK.z0&&p[2]<=WALK.z1&&p[1]>=-30&&p[1]<=120;
export function cleanPicnic(m){
 if(m?.t!=='pc'||!['get','take','put','sip','pour','bite','sit','stand'].includes(m.k)||!picnicKey(m.key)||!integer(m.n,2147483647)||!m.n)return null;
 const o={t:'pc',k:m.k,key:m.key,n:m.n};if(m.k==='get')return o;
 if(!integer(m.r,1e12))return null;o.r=m.r;
 if(m.k!=='stand'){if(!integer(m.i,['bite','sit','pour','sip'].includes(m.k)?1:2))return null;o.i=m.i;}
 if(m.k==='put'){if(!picnicPoint(m.p)||!Array.isArray(m.q)||m.q.length!==4||!m.q.every(Number.isFinite)||Math.abs(Math.hypot(...m.q)-1)>.01)return null;o.p=m.p.map(v=>Math.round(v*1000)/1000);const n=Math.hypot(...m.q);o.q=m.q.map(v=>v/n);}
 return o;
}
export function picnicHome(i){const[x,z]=i<2?C.glasses[i]:C.shared.bottle,c=Math.cos(C.yaw),s=Math.sin(C.yaw);return[C.at[0]+c*x+s*z,C.shared.roofY+C.lift+.005,C.at[1]-s*x+c*z];}
export function newPicnic(){return{v:1,r:0,food:[C.portions,C.portions],objects:[0,1,2].map(i=>({p:picnicHome(i),q:[0,0,0,1],ml:i<2?C.wine*DRINKS.ml.glass:C.shared.bottleMl,used:false,who:'',key:'',until:0})),seats:[0,1].map(()=>({who:'',key:'',until:0})),receipts:[]};}
export function publicPicnic(s){return{v:1,r:s.r,food:[...s.food],objects:s.objects.map(({p,q,ml,used,who,key})=>({p:[...p],q:[...q],ml,used,who,held:!!key})),seats:s.seats.map(x=>({who:x.who,held:!!x.key}))};}
export function validPicnic(s){return s?.v===1&&integer(s.r,1e12)&&Array.isArray(s.food)&&s.food.length===2&&s.food.every(n=>integer(n,C.portions))&&Array.isArray(s.objects)&&s.objects.length===3&&s.objects.every((o,i)=>picnicPoint(o.p)&&Array.isArray(o.q)&&o.q.length===4&&o.q.every(Number.isFinite)&&Math.abs(Math.hypot(...o.q)-1)<.01&&Number.isFinite(o.ml)&&o.ml>=0&&o.ml<=(i<2?DRINKS.pour.glass.wine.to*DRINKS.ml.glass:C.shared.bottleMl)&&typeof o.who==='string'&&o.who.length<=32)&&Array.isArray(s.seats)&&s.seats.length===2;}

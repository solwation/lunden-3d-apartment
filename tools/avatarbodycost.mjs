// #2001: bounded cold variant cost with isolated baseline config; no browser.
import {performance} from 'node:perf_hooks';
import {readFileSync,writeFileSync,unlinkSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {avatarModelGeometry as after} from '../src/avatar.js';
import {avatarLook} from '../src/config.js';
const baseline='3f7c3d0b1983bec2cde7fd44855c1c0af19744ba',out=process.argv[2]||mkdtempSync(join(tmpdir(),'cost2001-')); // #2116: only an explicit directory argument rewrites the committed docs/verification/2001/build-cost.json

const old=f=>execFileSync('git',['show',`${baseline}:${f}`],{maxBuffer:8e6});
const moduleURL=new URL('../src/.avatar-2001-before.js',import.meta.url),configURL=new URL('../src/.avatar-2001-before-config.js',import.meta.url);
try{
 writeFileSync(moduleURL,old('src/avatar.js').toString().replaceAll("from './config.js'","from './.avatar-2001-before-config.js'"));writeFileSync(configURL,old('src/config.js'));
 const {avatarModelGeometry:before}=await import(moduleURL.href),rows=[];
 for(let i=0;i<6;i++){
  const look={...avatarLook('2001-'+i),style:i%5,sleeves:i===5?1:0,gender:i%2,cut:[0,1,2,2,1,0][i],legs:i%3,facial:0,hat:0,phones:0,glasses:0,necklace:0,height:[180,165,195,120,180,165][i],bodyBuild:[0,4,8,0,8,4][i]},row={look};
  for(const[k,f]of i%2?[['after',after],['before',before]]:[['before',before],['after',after]]){
   const t=performance.now(),g=f(look);row[k+'BuildMs']=performance.now()-t;row[k+'Bytes']=Object.values(g.attributes).reduce((n,a)=>n+a.array.byteLength,0);row[k+'Tri']=g.attributes.position.count/3;g.dispose();
  }rows.push(row);
 }
 const hash=b=>createHash('sha256').update(b).digest('hex');
 writeFileSync(`${out}/build-cost.json`,JSON.stringify({baseline,environment:`${process.version}; six cold variant builds alternating before/after; warm module imports; diagnostic CPU timings`,hashes:Object.fromEntries(['src/avatar.js','src/config.js'].map(f=>[f,hash(readFileSync(f))])),rows},null,2)+'\n');
}finally{for(const u of[moduleURL,configURL])try{unlinkSync(u);}catch(e){if(e.code!=='ENOENT')throw e;}}

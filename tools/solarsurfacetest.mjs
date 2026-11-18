import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync}from'node:fs';
import {execFileSync}from'node:child_process';
import * as T from'three';
import {SOLAR_SURFACE as C,HUS_L as H,COLORS}from'../src/config.js';
import {solarSurfaceData,solarSurfaceTextures,solarPanelUV,solarPanelMaterial}from'../src/solarsurface.js';
import {tiltedPanelGeo}from'../src/exterior.js';
const base='451e12ea1e82a220fc9934052c226cbfb6c1e71e',original=execFileSync('git',['show',base+':src/exterior.js'],{encoding:'utf8'});
const source=original.replace(/from '([^']+)'/g,(_,p)=>'from '+JSON.stringify(p.startsWith('.')?new URL('../src/'+p.slice(2),import.meta.url).href:import.meta.resolve(p)));
const old=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const sample=(data,n,u,v,c=0)=>data[4*(Math.min(n-1,Math.floor(v*n))*n+Math.min(n-1,Math.floor(u*n)))+c];
test('deterministic top cell/gap/busbar masks retain an exactly flat blue side swatch',()=>{
 const colour=solarSurfaceData(C.colourSize),rough=solarSurfaceData(C.roughnessSize,true);assert.deepEqual(colour,solarSurfaceData(C.colourSize));assert.deepEqual(rough,solarSurfaceData(C.roughnessSize,true));assert.equal(colour.byteLength,262144);assert.equal(rough.byteLength,65536);
 for(let x=0;x<256;x++)for(let y=0;y<32;y++){const i=4*(y*256+x);assert.deepEqual([...colour.slice(i,i+4)],[255,255,255,255]);}
 for(let x=0;x<128;x++)for(let y=0;y<16;y++)assert.equal(Math.fround(C.baseRoughness*rough[4*(y*128+x)+1]/255),Math.fround(.3));
 const v=C.topV[0]+.5/6*(C.topV[1]-C.topV[0]);
 assert(sample(colour,256,.1,v)<sample(colour,256,.15,v)-30,'cell gap is darker than its face');
 let minimum=255,maximum=0;for(let x=5;x<23;x++){const q=sample(colour,256,x/256,v);minimum=Math.min(minimum,q);maximum=Math.max(maximum,q);}assert(maximum-minimum>3,'thin buses remain readable within the same cell');
});
test('top-only UV assignment preserves every original box position/normal/index and cache/material contracts',()=>{
 let panels=0;for(const[xa,xb]of H.solar.x)for(const[za,zb]of H.solar.z){const a=old.tiltedPanelGeo(xa,xb,12.79,za,zb),b=tiltedPanelGeo(xa,xb,12.79,za,zb);assert.equal(b.index.count/3,12);for(const k of['position','normal'])assert.deepEqual(b.attributes[k].array,a.attributes[k].array);assert.deepEqual(a.index.array,b.index.array);assert.equal(a.attributes.uv.array.byteLength,b.attributes.uv.array.byteLength);panels++;}
 assert.equal(panels,12);const g=solarPanelUV(new T.BoxGeometry(14,.05,1),14,1),n=g.attributes.normal,uv=g.attributes.uv;let top=0,side=0;
 for(let i=0;i<n.count;i++)if(n.getY(i)>.5){top++;assert(uv.getY(i)>=C.topV[0]&&uv.getY(i)<=C.topV[1]);}else{side++;assert.equal(uv.getX(i),.5);assert.equal(uv.getY(i),C.flatV);}assert.equal(top,4);assert.equal(side,20);
 const t=solarSurfaceTextures();assert.equal(t,solarSurfaceTextures());assert.equal(t.colour.colorSpace,T.SRGBColorSpace);assert.equal(t.roughness.colorSpace,T.NoColorSpace);for(const tex of Object.values(t)){assert.equal(tex.minFilter,T.LinearMipmapLinearFilter);assert.equal(tex.magFilter,T.LinearFilter);assert.equal(tex.wrapS,T.RepeatWrapping);assert.equal(tex.wrapT,T.ClampToEdgeWrapping);assert(tex.generateMipmaps);}
 const m=solarPanelMaterial();assert.equal(m.color.getHex(),COLORS.solar);assert.equal(m.metalness,.5);assert.equal(m.map,t.colour);assert.equal(m.roughnessMap,t.roughness);assert.equal(m.bumpMap,null);assert.equal(m.transparent,false);
});
// Function/line-level contract (#2092): later unrelated edits in these files must not fail this test, so only the solar
// functions and solar lines are compared with the frozen baseline, never whole files.
const baseOf=(f)=>execFileSync('git',['show',base+':'+f],{encoding:'utf8'});
const fn=(text,name)=>{const m=text.match(new RegExp('^(?:export )?(?:function '+name+'\\b[\\s\\S]*?^\\}|const '+name+' = [\\s\\S]*?^\\};)','m'));assert(m,name+' found');return m[0];};
const solarLines=(text)=>text.split('\n').filter((l)=>/\bsolar|solarRise|tiltedPanelGeo|panels\b/i.test(l)&&!/^\s*(\/\/|\*|\/\*)/.test(l)).map((l)=>l.trim());
test('solar functions/lines differ from the baseline only by the intended integration; sibling solar recipes stay exact',()=>{
 const now=readFileSync('src/exterior.js','utf8');
 const undo=(t)=>t.replace('solarPanelUV(new THREE.BoxGeometry(xb - xa, t, zb - za), xb - xa, zb - za)','new THREE.BoxGeometry(xb - xa, t, zb - za)');
 assert.equal(undo(fn(now,'tiltedPanelGeo')),fn(original,'tiltedPanelGeo'));
 assert.equal(fn(now,'solarRise'),fn(original,'solarRise'));
 const unwrap=(t)=>t.replace("import {solarPanelUV,solarPanelMaterial} from './solarsurface.js';",'').replace('add(panels, solarPanelMaterial(), false);','add(panels, new THREE.MeshStandardMaterial({ color: COLORS.solar, roughness: 0.3, metalness: 0.5 }), false);');
 const a=solarLines(unwrap(undo(now))).filter(Boolean),b=solarLines(original).filter(Boolean);assert.deepEqual(a,b);
 assert(now.includes('add(panels, solarPanelMaterial(), false);'),'panels use the solar material');
 assert(!/color: COLORS\.solar/.test(now),'no inline solar material left');
 // config: the solar dimensions and colour are unchanged; only the own #2083 block was added
 const cfg=readFileSync('src/config.js','utf8'),cb=baseOf('src/config.js');
 assert(cfg.includes('// #2083: visual solar-cell/glass assumptions'));
 for(const re of[/^  solar: \{ x: .*$/m,/^  solar: 0x[0-9a-f]+,$/m])assert.equal(cfg.match(re)?.[0],cb.match(re)?.[0]);
 // sibling solar recipes (neighbour roofs and Hus L roof-walk) keep their solar lines exactly
 for(const f of['src/corehouse.js','src/surroundings.js','src/nordicgym.js','src/southbackdrop.js','src/roofs.js'])assert.deepEqual(solarLines(readFileSync(f,'utf8')),solarLines(baseOf(f)),f);
});

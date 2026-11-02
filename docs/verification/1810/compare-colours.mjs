import {SITE} from '/home/devcontainers/lunden-wt/1810-20261102/src/config.js';
const S=SITE.south;
const hv=(list,source,salt,fb)=>{if(!list?.length)return fb;let h=salt*2654435761>>>0;for(const c of String(source))h=Math.imul(h^c.charCodeAt(0),16777619)>>>0;return list[(h>>>8)%list.length];};
const calc=(b,nu)=>{const V=S.villas.sources.includes(b.source)?S.villas:null,W=S.whiteHouses,WB=W.sources.includes(b.source)?{...W,...W.barn.sources.includes(b.source)?W.barn:{}}:null,BH=S.brickHouses?.roofs[b.source]!==undefined?S.brickHouses:null,PV=nu?V??(BH?null:WB):V??WB,barn=WB&&W.barn.sources.includes(b.source);
return JSON.stringify([PV?hv(PV.facades,b.source,1,PV.facade):BH?BH.facade:b.facade,PV?barn?WB.rise:hv(PV.rises,b.source,3,PV.rise):b.rise,PV?barn?WB.roof:hv(PV.roofs,b.source,2,PV.roof):BH?BH.roofs[b.source]:S.roofColor]);};
let n=0;for(const b of S.buildings){const a=calc(b,0),c=calc(b,1);n++;if(a!==c)console.log('DIFF',b.source,a,'->',c);}console.log(n,'buildings checked');

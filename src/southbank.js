import { SOUTH_BANK as S, SOUTH_PLATEAU, SITE } from './config.js';

const clamp=t=>Math.max(0,Math.min(1,t));
const smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
const between=(list,value,key,at)=>{
 let i=1;while(i<list.length-1&&key(list[i])<value)i++;
 const a=list[i-1],b=list[i],t=clamp((value-key(a))/(key(b)-key(a)));
 return at(a)*(1-t)+at(b)*t;
};
const section=(row,offset)=>between(row[2],offset,p=>p[0],p=>p[1]);
const radius=Math.max(...S.cross[0][2].map(p=>Math.abs(p[0])));
const crestEdge=Math.min(...S.cross[0][2].map(p=>Math.abs(p[0])));
const last=S.road.at(-1),plateau=SOUTH_PLATEAU.points.find(([x,z])=>x===S.plateauControl[0]&&z===S.plateauControl[1]);
// The mapped western road branch links the last road sample to the plateau. Its grade is interpolated,
// not a survey of the road surface. Keep its source centreline separate from the ground cross-sections.
const branch=SITE.south.paths.find(p=>p.source==='30633546').path;
export function southBankCentre(z){
 return z<=last[1]?between(S.road,z,p=>p[1],p=>p[0]):between(branch,z,p=>p[1],p=>p[0]);
}
export function southBankCrest(z){
 return z<=last[1]?between(S.road,z,p=>p[1],p=>p[2]):last[2]+(plateau[2]-last[2])*clamp((z-last[1])/(plateau[1]-last[1]));
}

/** Replace only the sampled southern road corridor; preserve the river/decks and distant ground.
 * Heights are model-relative LM ground samples. The deck datum, tie-in, flat crest and fade are guesses. */
export function southBankGround(x,z,baseAt){
 const base=baseAt(x,z);
 if(z<=S.start||z>=S.fade[1])return base;
 const offset=x-southBankCentre(z),a=Math.abs(offset),extension=smooth((z-last[1])/(S.extensionEnd-last[1]));
 const width=radius+(S.extensionWidth-radius)*extension,feather=S.feather+(S.extensionFeather-S.feather)*extension;
 if(a>=width+feather)return base;
 const lateral=smooth((width+feather-a)/feather),north=clamp((z-S.start)/(S.full-S.start)),south=1-smooth((z-S.fade[0])/(S.fade[1]-S.fade[0]));
 const cross=between(S.cross,z,r=>r[0],r=>section(r,offset)-section(r,0))*smooth((a-S.flat)/(crestEdge-S.flat));
 const flatten=1-smooth((z-last[1])/(S.fade[0]-last[1]));
 const target=southBankCrest(z)+cross*flatten;
 return base+(target-base)*lateral*north*south;
}

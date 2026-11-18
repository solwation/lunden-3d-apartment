// #2085: colour-only atlas details. Keep the old Canvas draw stream as the exact alpha authority.
const colourContexts=new WeakMap();
/** Two startup-only canvases: old alpha and detailed RGB. No per-leaf readback or GPU texture. */
export function leafRgbContext(original){
 const canvas=document.createElement('canvas');canvas.width=original.canvas.width;canvas.height=original.canvas.height;
 const detail=canvas.getContext('2d',{willReadFrequently:true}),methods=new Map();
 const g=new Proxy(original,{
  get(target,key){
   if(key==='getImageData')return(...args)=>{
    const alpha=target.getImageData(...args),rgb=detail.getImageData(...args);
    for(let i=3;i<rgb.data.length;i+=4)rgb.data[i]=alpha.data[i];
    canvas.width=canvas.height=1;return rgb;
   };
   if(typeof target[key]!=='function')return target[key];
   if(!methods.has(key))methods.set(key,(...args)=>{const value=target[key](...args);detail[key](...args);return value;});
   return methods.get(key);
  },
  set(target,key,value){target[key]=value;detail[key]=value;return true;}
 });colourContexts.set(g,detail);return g;
}
const colour=(k,f)=>`rgb(${Math.round(k*.96*f)},${Math.round(k*f)},${Math.round(k*.86*f)})`;
/** Same opaque fill coverage as the original solid colour; core leaves get a quieter gradient. */
export function leafTone(g,k,l,w,core=false){
 g=colourContexts.get(g)||g;
 const strength=core?.10:.22,gradient=g.createLinearGradient(-l*.22,-w*.52,l*.2,w*.5);
 gradient.addColorStop(0,colour(k,1-strength));gradient.addColorStop(.4,colour(k,1+strength*.5));gradient.addColorStop(1,colour(k,1-strength*.32));
 g.fillStyle=gradient;return gradient;
}
/** Detail canvas only; the original leaf path masks veins. Final alpha comes from the untouched draw stream. */
export function leafSideVeins(g,l,w,size){
 g=colourContexts.get(g)||g;
 const pairs=l>size*.04?3:2;
 g.save();g.clip();g.globalCompositeOperation='source-atop';g.strokeStyle='rgba(0,0,0,0.12)';g.lineWidth=Math.max(.4,size/1100);g.beginPath();
 for(let i=0;i<pairs;i++)for(const sign of[-1,1]){const x=l*(-.28+i*.2);g.moveTo(x,0);g.quadraticCurveTo(x+l*.055,sign*w*.10,x+l*.16,sign*w*.28);}
 g.stroke();g.restore();
}

// Test-only checks against captured actual scene solids and local height samples; not imported by the game.
export function coverage(points){
 const sorted=[...new Map(points.map(p=>[p.join(','),p])).values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]),cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 const half=pts=>{const out=[];for(const p of pts){while(out.length>1&&cross(out.at(-2),out.at(-1),p)<=0)out.pop();out.push(p);}return out;};
 const hull=half(sorted).slice(0,-1).concat(half(sorted.slice().reverse()).slice(0,-1));let area=0;for(let i=0;i<hull.length;i++){const a=hull[i],b=hull[(i+1)%hull.length];area+=a[0]*b[1]-a[1]*b[0];}
 const xs=points.map(p=>p[0]),zs=points.map(p=>p[1]),width=Math.max(...xs)-Math.min(...xs),depth=Math.max(...zs)-Math.min(...zs);return{hullArea:Math.abs(area)/2,boxArea:width*depth,width,depth};
}
export const inPoly=(q,x,z)=>{let yes=false;for(let i=0,j=q.length-1;i<q.length;j=i++)if((q[i][1]>z)!==(q[j][1]>z)&&x<(q[j][0]-q[i][0])*(z-q[i][1])/(q[j][1]-q[i][1])+q[i][0])yes=!yes;return yes;};
export const segDist=(x,z,s)=>{const dx=s[2]-s[0],dz=s[3]-s[1],t=Math.max(0,Math.min(1,((x-s[0])*dx+(z-s[1])*dz)/(dx*dx+dz*dz||1)));return Math.hypot(x-s[0]-t*dx,z-s[1]-t*dz);};
export function siteHeight(site,x,z){const[x0,x1,z0,z1]=site.bounds,w=x1-x0+1,i=Math.max(0,Math.min(w-2,Math.floor(x-x0))),j=Math.max(0,Math.min(z1-z0-1,Math.floor(z-z0))),u=x-x0-i,v=z-z0-j,get=(a,b)=>site.heights[b*w+a];return get(i,j)*(1-u)*(1-v)+get(i+1,j)*u*(1-v)+get(i,j+1)*(1-u)*v+get(i+1,j+1)*u*v;}

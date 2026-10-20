/** Subtract collinear opening intervals while preserving the source segment's direction and exact cut bounds. */
export function cutSegmentOpenings(segment, openings) {
  const [x,z,xx,zz]=segment,dx=xx-x,dz=zz-z,length2=dx*dx+dz*dz;
  if (!length2) return [segment];
  const length=Math.sqrt(length2),cuts=[];
  for (const o of openings) {
    if (Math.abs((o.x0-x)*dz-(o.z0-z)*dx)/length>1e-6 || Math.abs((o.x1-x)*dz-(o.z1-z)*dx)/length>1e-6) continue;
    const a=((o.x0-x)*dx+(o.z0-z)*dz)/length2,b=((o.x1-x)*dx+(o.z1-z)*dz)/length2;
    const lo=Math.max(0,Math.min(a,b)),hi=Math.min(1,Math.max(a,b));
    if (hi>lo) cuts.push([lo,hi,lo===0?[x,z]:a<=b?[o.x0,o.z0]:[o.x1,o.z1],hi===1?[xx,zz]:a<=b?[o.x1,o.z1]:[o.x0,o.z0]]);
  }
  if (!cuts.length) return [segment];
  cuts.sort((a,b)=>a[0]-b[0]);const out=[];let start=0,point=[x,z];
  for (const [lo,hi,from,to] of cuts) {
    if(lo>start)out.push([...point,...from]);
    if(hi>start){start=hi;point=to;} // retain actual source coordinates, without a floating-point projection round trip
  }
  if(start<1)out.push([...point,xx,zz]);return out;
}

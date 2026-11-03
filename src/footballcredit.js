// #1853: per-profile lifetime goals, deduplicated against the room's cumulative per-socket credits.
// A new welcome remembers this socket and retains former own IDs for reconnects in the same match.
export function creditFootball(stats,snapshot,self,welcome=false){if(!snapshot||typeof snapshot.epoch!=='string'||!Array.isArray(snapshot.credits))return 0;let r=stats.footballRecord;
 if(!r||r.epoch!==snapshot.epoch){if(!welcome)return 0;r=stats.footballRecord={epoch:snapshot.epoch,own:[],counts:{}};}
 const valid=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,8}$/.test(id),own=[...new Set(Array.isArray(r.own)?r.own.filter(valid):[])].slice(-32),counts={};for(const id of own)if(Number.isSafeInteger(r.counts?.[id])&&r.counts[id]>=0&&r.counts[id]<=1000000)counts[id]=r.counts[id];r.own=own;r.counts=counts;
 if(welcome&&typeof self==='string'&&/^[A-Za-z0-9_-]{1,8}$/.test(self)&&!r.own.includes(self)){r.own.push(self);if(r.own.length>32){const old=r.own.shift();delete r.counts[old];}}
 let added=0;for(const[id,count]of snapshot.credits){if(!r.own.includes(id)||!Number.isSafeInteger(count)||count<0||count>1000000)continue;const old=Number.isSafeInteger(r.counts[id])?r.counts[id]:0;if(count>old){added+=count-old;r.counts[id]=count;}}
 return added;
}

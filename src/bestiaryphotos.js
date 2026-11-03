// Event photographs are globally throttled, unlike the disposable model-thumbnail cache.
export class BestiaryPhotoQueue {
 constructor({candidate,capture,save,every=5,maxPending=8,perEntry=30}){Object.assign(this,{candidate,capture,save,every,maxPending,perEntry,time:0,next:0,jobs:0});this.pending=new Set();this.last=new Map();}
 request(id){if(this.time-(this.last.get(id)??-Infinity)<this.perEntry)return false;if(this.pending.has(id))return true;if(this.pending.size>=this.maxPending)return false;this.pending.add(id);return true;}
 update(dt){this.time+=Math.max(0,dt);if(this.time<this.next)return;for(const id of this.pending){this.pending.delete(id);const point=this.candidate(id);if(!point)continue;this.last.set(id,this.time);this.next=this.time+this.every;try{const data=this.capture(point);this.jobs++;Promise.resolve(this.save(id,data)).catch(()=>{});}catch{/* discovery survives a lost graphics context */}break;}}
}

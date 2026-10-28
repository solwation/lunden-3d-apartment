import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PLAYROOM as R, PLAYROOM_TRACKS, SONOS } from './config.js';

// #1664/#1667: controls sit on the actual black panel. One atlas includes moving button labels;
// pressed/emissive button faces use two small batches, no light sources.
export class PlayroomDJ {
  constructor(music, root, fur, paint) {
    this.music = music; this.pickables = []; this.controls = []; this.buttons = [];
    const D=R.dj, C=D.controls, y=D.h+D.panel.top;
    this.origin = new THREE.Vector3(R.x+D.x,y,R.z+D.z);
    const box=(x,z,w,h,d,color)=>paint(new THREE.BoxGeometry(w,h,d).translate(this.origin.x+x,y+h/2,this.origin.z+z),color);
    const add=(id,x,z,w,d,verb,run,adjust)=>{
      const target={kind:'djControl',name:'',verb, toggle:()=>run(target.point),adjust,
        aimAt:p=>{target.point=p;}, id};
      const pick=new THREE.Mesh(new THREE.BoxGeometry(w,C.pickHeight,d),new THREE.MeshBasicMaterial({visible:false}));
      pick.position.set(this.origin.x+x,y+C.pickHeight/2,this.origin.z+z); pick.userData.door=target; target.pickable=pick;
      root.add(pick); this.pickables.push(pick); this.controls.push(target); return target;
    };
    const button=(id,x,z,label,run,color=0x777777)=>{
      this.buttons.push({id,x,z,color});
      fur.push(box(x,z,C.button[0]+2*C.bezel,C.bezel,C.button[1]+2*C.bezel,0x22262b));
      return add(id,x,z,...C.button,()=>label,run);
    };
    for(let s=0;s<2;s++) {
      const x=C.deckX[s];
      add(`record${s}`,x,0,.32,.31,'byta låt · ←/→ väljer på denna skiva',()=>music.changeDJTrack(s,1),dir=>music.changeDJTrack(s,dir));
      button(`play${s}`,x,C.playZ,'spela/pausa denna skiva',()=>music.djAction({c:'play',s}),s?0x2868ad:0xa5323c);
      for(const dir of [-1,1]) button(`track${s}${dir}`,x-dir*.13,C.browseZ,'välja föregående/nästa låt på denna skiva',()=>music.changeDJTrack(s,dir));
      fur.push(box(C.faderX[s],C.faderZ,.018,.008,C.faderSpan,0x080a0d));
      add(`gain${s}`,C.faderX[s],C.faderZ,.075,C.faderSpan+.04,'ställa kanalvolym · ←/→ finjusterar',p=>this.setAt('gain',s,p),dir=>this.step('gain',s,dir));
    }
    fur.push(box(0,C.crossZ,C.crossSpan,.008,.018,0x080a0d));
    add('cross',0,C.crossZ,C.crossSpan+.04,.07,'blanda vänster och höger skiva · ←/→ finjusterar',p=>this.setAt('cross',0,p),dir=>this.step('cross',0,dir));
    button('master',...C.master,'ställa mastervolym · ←/→ sänker/höjer',p=>music.djAction({c:'volume',v:Math.max(0,Math.min(SONOS.steps,music.djState.volume+(p && p.x>this.origin.x+.005?-1:1)))}));
    fur.push(paint(new THREE.CylinderGeometry(.025,.028,.028,12).translate(this.origin.x,y+.025,this.origin.z+C.master[1]+.035),0x30343a));
    this.controls.at(-1).adjust=dir=>music.djAction({c:'volume',v:Math.max(0,Math.min(SONOS.steps,music.djState.volume+dir))});
    button('stop',...C.stop,'stänga av musiken',()=>music.djAction({c:'stop'}),0x993334);
    button('shuffle',...C.shuffle,'slå på/av slumpad låtordning',()=>music.djAction({c:'shuffle'}));
    button('dance',...C.dance,'dansa floss / sluta dansa',()=>music.toggleDance(),0x863aab);
    // MASTER has a visible rotary pointer; the action button turns one step, arrows turn either way.
    this.canvas=document.createElement('canvas'); [this.canvas.width,this.canvas.height]=C.labelPixels;
    this.texture=new THREE.CanvasTexture(this.canvas); this.texture.colorSpace=THREE.SRGBColorSpace;
    this.face=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial({map:this.texture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}));root.add(this.face);
    this.offButtons=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshStandardMaterial({vertexColors:true,roughness:.4}));root.add(this.offButtons);
    this.litButtons=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshStandardMaterial({color:C.activeColor,emissive:C.emissive,emissiveIntensity:C.emissiveIntensity,roughness:.35}));root.add(this.litButtons);
    this.handles=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshStandardMaterial({color:0xe6e7e9,metalness:.65,roughness:.3})); root.add(this.handles);
    this.update();
  }
  setAt(c,s,p) {
    if(!p)return; const C=R.dj.controls;
    const v=c==='cross'?.5-(p.x-this.origin.x)/C.crossSpan:.5+(p.z-this.origin.z-C.faderZ)/C.faderSpan;
    this.music.djAction({c,...(c==='gain'?{s}:{}),v:Math.round(Math.max(0,Math.min(1,v))*10)/10});
  }
  step(c,s,dir) { const d=this.music.djState; this.music.djAction({c,...(c==='gain'?{s}:{}),v:Math.max(0,Math.min(1,(c==='cross'?d.cross:d.gain[s])+dir*R.dj.controls.step))}); }
  update() {
    const d=this.music.djState, dance=this.music.danceActive, key=JSON.stringify([d,dance]); if(this.key===key)return; this.key=key;
    const D=R.dj,C=D.controls,ctx=this.canvas.getContext('2d'),W=1536,H=576;
    ctx.setTransform(this.canvas.width/W,0,0,this.canvas.height/H,0,0);
    ctx.clearRect(0,0,W,H);
    this.labelBounds=[];
    const text=(x,z,t,size=19,color='#edf0f5')=>{
      ctx.fillStyle=color;ctx.font=`600 ${size}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
      const button=this.buttons.find(b=>b.x===x&&b.z===z),maxWidth=button?C.button[0]/D.w*W*.9:W;
      ctx.fillText(t,(.5-x/D.w)*W,(.5-z/D.d)*H,maxWidth);
      const m=ctx.measureText(t),w=Math.min(m.width,maxWidth)*D.w/W,h=(m.actualBoundingBoxAscent+m.actualBoundingBoxDescent)*D.d/H;
      this.labelBounds.push({text:t,x0:x-w/2,x1:x+w/2,z0:z-h/2,z1:z+h/2});
    };
    for(let s=0;s<2;s++) {
      const x=C.deckX[s],track=PLAYROOM_TRACKS[d.ix[s]];
      // A dark, blue-green LCD above each record, with a short track title and source artist.
      const cx=(.5-x/D.w)*W,cz=(.5-C.displayZ/D.d)*H;
      ctx.fillStyle='#101d23';ctx.fillRect(cx-145,cz-28,290,56);
      this.labelBounds.push({text:'LCD',x0:x-145*D.w/W,x1:x+145*D.w/W,z0:C.displayZ-28*D.d/H,z1:C.displayZ+28*D.d/H});
      text(x,C.displayZ-.010,track.title.slice(0,29),18,'#91ebd4');text(x,C.displayZ+.015,track.artist.slice(0,29),12,'#a7c7c3');
      text(x,C.playZ,d.on[s]?'PAUSE':'PLAY',15);text(x+.13,C.browseZ,'◀',18);text(x-.13,C.browseZ,'▶',18);
      text(x+ (s?-.22:.22),0,s?'B':'A',23,s?'#81b9ff':'#ff9d9d');
      text(C.faderX[s],-.13,`${s?'B':'A'} VOLYM`,13);text(C.faderX[s],.105,`${Math.round(d.gain[s]*100)}%`,12);
    }
    text(0,C.crossLabelZ,'A  ←  CROSSFADER  →  B',12);text(...C.master,`− MASTER ${d.volume} +`,10);
    text(...C.stop,'STOP',13);text(...C.shuffle,d.shuffle?'SLUMP PÅ':'SLUMP AV',12);text(...C.dance,'DANSA',12);
    this.texture.needsUpdate=true;
    this.updateButtons(d,dance);
    const parts=[],make=(x,z,w,h,depth)=>parts.push(new THREE.BoxGeometry(w,h,depth).translate(this.origin.x+x,this.origin.y+.025,this.origin.z+z));
    make((.5-d.cross)*C.crossSpan,C.crossZ,.035,.025,.06);
    for(let s=0;s<2;s++)make(C.faderX[s],C.faderZ+(d.gain[s]-.5)*C.faderSpan,.055,.025,.028);
    // A small rotary marker beside the MASTER label, rotated with its setting.
    parts.push(new THREE.BoxGeometry(.007,.014,.031).rotateY(-Math.PI*.75+d.volume/SONOS.steps*Math.PI*1.5).translate(this.origin.x,this.origin.y+.034,this.origin.z+C.master[1]+.035));
    this.handles.geometry.dispose();this.handles.geometry=mergeGeometries(parts);parts.forEach(g=>g.dispose());
    for(const t of this.controls) { if(typeof t.verb==='function')t.verb=t.verb(); }
  }
  activeButton(id,d,dance) { return id==='play0'?d.on[0]:id==='play1'?d.on[1]:id==='shuffle'?d.shuffle:id==='dance'?dance:false; }
  updateButtons(d,dance) {
    const D=R.dj,C=D.controls,off=[],lit=[],positions=[],uv=[];
    const quad=(x0,x1,z0,z1,y)=>{
      for(const [x,z] of [[x0,z0],[x0,z1],[x1,z1],[x0,z0],[x1,z1],[x1,z0]]) {
        positions.push(this.origin.x+x,y,this.origin.z+z);uv.push(.5-x/D.w,.5+z/D.d);
      }
    };
    const inside=(x,z,b)=>Math.abs(x-b.x)<C.button[0]/2 && Math.abs(z-b.z)<C.button[1]/2;
    const cuts=(axis,half,span)=>[...new Set([-half,half,...this.buttons.flatMap(b=>[b[axis]-span/2,b[axis]+span/2])])].sort((a,b)=>a-b);
    const xs=cuts('x',D.panel.w/2,C.button[0]),zs=cuts('z',D.panel.d/2,C.button[1]);
    // Cut only the button label footprints from the static atlas surface; their label quads move with the faces.
    for(let i=0;i<xs.length-1;i++)for(let j=0;j<zs.length-1;j++) {
      if(!this.buttons.some(b=>inside((xs[i]+xs[i+1])/2,(zs[j]+zs[j+1])/2,b)))quad(xs[i],xs[i+1],zs[j],zs[j+1],this.origin.y+C.labelLift);
    }
    for(const b of this.buttons) {
      const on=this.activeButton(b.id,d,dance),top=this.origin.y+C.buttonHeight-(on?C.pressDepth:0);
      const g=new THREE.BoxGeometry(C.button[0],C.buttonHeight,C.button[1]).translate(this.origin.x+b.x,top-C.buttonHeight/2,this.origin.z+b.z);
      const color=new THREE.Color(b.color),rgb=new Float32Array(g.attributes.position.count*3);
      for(let i=0;i<rgb.length;i+=3)rgb.set([color.r,color.g,color.b],i);g.setAttribute('color',new THREE.BufferAttribute(rgb,3));
      (on?lit:off).push(g);
      quad(b.x-C.button[0]/2,b.x+C.button[0]/2,b.z-C.button[1]/2,b.z+C.button[1]/2,top+C.labelLift);
    }
    for(const [mesh,parts] of [[this.offButtons,off],[this.litButtons,lit]]) {
      mesh.geometry.dispose();mesh.geometry=parts.length?mergeGeometries(parts):new THREE.BufferGeometry();mesh.visible=parts.length>0;parts.forEach(g=>g.dispose());
    }
    this.face.geometry.dispose();this.face.geometry=new THREE.BufferGeometry();
    this.face.geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));this.face.geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  }

}


/** #1667: a small procedural vinyl map with fine grooves and a soft paired ceiling-panel reflection.
 * It supplies a restrained highlight even in the ambient-only room approximation; no live reflection or light. */
export function djVinylMaterial() {
  const V=R.dj.vinyl,n=V.textureSize,c=document.createElement('canvas');c.width=c.height=n;
  const ctx=c.getContext('2d'),pixels=ctx.createImageData(n,n),base=[V.color>>16&255,V.color>>8&255,V.color&255];
  for(let y=0;y<n;y++)for(let x=0;x<n;x++) {
    const dx=(x+.5)/n*2-1,dz=(y+.5)/n*2-1,r=Math.hypot(dx,dz),a=Math.atan2(dz,dx);
    const streak=Math.exp(-((Math.sin(a-.6)/V.streakWidth)**2))*V.streakStrength*(.35+.65*r);
    const groove=Math.sin(r*V.grooves*Math.PI*2)*.012;
    const at=(y*n+x)*4;
    for(let k=0;k<3;k++)pixels.data[at+k]=Math.max(0,Math.min(255,base[k]+255*(streak+groove)));
    pixels.data[at+3]=255;
  }
  ctx.putImageData(pixels,0,0);const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({map,roughness:V.roughness,metalness:V.metalness});
}

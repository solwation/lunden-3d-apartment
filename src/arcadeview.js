import { BLOCKS, METEORS } from './config.js';
import { SHAPES, COLORS } from './blocks.js';

// #1577: Klossar and Meteoriter drawn on the computer's existing monitor canvas (no extra meshes or draw calls).
// Names are always canvas text. `top` is [{name, score}] from src/gameboards.js.
const ANON='Anonym';

/** A compact top list box; returns nothing. */
export function drawTopList(c,x,y,w,h,top,title='Topplista',me='') {
  c.save();c.fillStyle='rgba(8,14,26,.82)';c.fillRect(x,y,w,h);c.strokeStyle='#3b4f6b';c.lineWidth=1;c.strokeRect(x+.5,y+.5,w-1,h-1);
  const line=h/11.6; // room for ten rows under the title
  c.textBaseline='middle';c.fillStyle='#e9f1ff';c.font=`bold ${line*.78}px system-ui`;c.textAlign='center';c.fillText(title,x+w/2,y+line*.75);
  c.font=`${line*.68}px system-ui`;
  if(!top?.length){c.fillStyle='#9fb0c8';c.fillText('Inga resultat än',x+w/2,y+line*2);}
  (top??[]).slice(0,10).forEach((r,i)=>{
    const ty=y+line*(1.75+i);c.fillStyle=me&&r.name===me?'#ffe28a':'#c9d6ea';
    const score=String(r.score),room=w*.82-c.measureText(score).width;let name=`${i+1}. ${String(r.name||ANON)}`;while(name.length>4&&c.measureText(name).width>room)name=name.slice(0,-2)+'…';
    c.textAlign='left';c.fillText(name,x+w*.06,ty);
    c.textAlign='right';c.fillText(String(r.score),x+w*.94,ty);
  });
  c.restore();
}

function overlay(c,w,h,title,lines,top,me,color) {
  c.fillStyle='rgba(5,9,18,.72)';c.fillRect(0,0,w,h);
  c.fillStyle=color;c.textAlign='center';c.textBaseline='middle';c.font=`bold ${h/10}px system-ui`;c.fillText(title,w*.3,h*.2);
  c.fillStyle='#e9f1ff';c.font=`${h/18}px system-ui`;lines.forEach((t,i)=>c.fillText(t,w*.3,h*(.38+i*.11)));
  drawTopList(c,w*.58,h*.08,w*.38,h*.84,top,'Topplista',me);
}

export function drawBlocks(canvas,game,theme,top,me) {
  const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height,{cols,rows}=BLOCKS;
  c.fillStyle='#0a1220';c.fillRect(0,0,w,h);
  const cell=Math.floor(h*.92/rows),bw=cell*cols,bh=cell*rows,ox=Math.round(w*.36-bw/2),oy=Math.round((h-bh)/2);
  c.fillStyle='#111c2e';c.fillRect(ox,oy,bw,bh);c.strokeStyle=theme;c.lineWidth=2;c.strokeRect(ox-1,oy-1,bw+2,bh+2);
  const block=(x,y,color,alpha=1)=>{c.globalAlpha=alpha;c.fillStyle=color;c.fillRect(ox+x*cell+1,oy+y*cell+1,cell-2,cell-2);c.globalAlpha=1;};
  game.board.forEach((row,y)=>row.forEach((t,x)=>{if(t)block(x,y,COLORS[t]);}));
  const p=game.piece;
  if(p){const gy=game.ghost();for(const [x,y]of p.cells)if(gy+y>=0)block(p.x+x,gy+y,COLORS[p.type],.25);for(const [x,y]of p.cells)if(p.y+y>=0)block(p.x+x,p.y+y,COLORS[p.type]);}
  const sx=ox+bw+w*.05;c.textAlign='left';c.textBaseline='top';c.fillStyle='#9fb0c8';c.font=`${h/18}px system-ui`;
  c.fillText('Nästa',sx,oy);
  const n=game.next;if(n)for(const [x,y]of SHAPES[n]){c.fillStyle=COLORS[n];c.fillRect(sx+x*cell*.8,oy+h/12+y*cell*.8,cell*.8-2,cell*.8-2);}
  c.fillStyle='#e9f1ff';c.font=`bold ${h/14}px system-ui`;
  [['Poäng',game.score],['Rader',game.lines],['Nivå',game.level]].forEach(([k,v],i)=>{c.fillStyle='#9fb0c8';c.font=`${h/20}px system-ui`;c.fillText(k,sx,oy+h*(.3+i*.2));c.fillStyle='#e9f1ff';c.font=`bold ${h/13}px system-ui`;c.fillText(String(v),sx,oy+h*(.36+i*.2));});
  if(!game.running)overlay(c,w,h,'KLOSSAR',game.over?[`Slut! ${game.score} poäng`,'Mellanslag: spela igen']:['Starta med mellanslag','Pilar: flytta och vrid'],top,me,theme);
}

export function drawMeteors(canvas,game,theme,top,me) {
  const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
  c.fillStyle='#05070f';c.fillRect(0,0,w,h);
  const scale=Math.min(w/METEORS.width,h/METEORS.height),ox=(w-METEORS.width*scale)/2,oy=(h-METEORS.height*scale)/2;
  c.save();c.translate(ox,oy);c.scale(scale,scale);c.lineWidth=1.6/scale;c.lineJoin='round';
  c.strokeStyle='#26334a';c.strokeRect(0,0,METEORS.width,METEORS.height);
  c.strokeStyle='#c9b9a0';
  for(const r of game.rocks){c.beginPath();for(let k=0;k<9;k++){const a=k/9*Math.PI*2+r.spin,rr=r.r*(.78+.22*Math.abs(Math.sin(k*1.7+r.spin)));c[k?'lineTo':'moveTo'](r.x+Math.cos(a)*rr,r.y+Math.sin(a)*rr);}c.closePath();c.stroke();}
  c.fillStyle='#ffe28a';for(const b of game.bullets){c.beginPath();c.arc(b.x,b.y,.09,0,Math.PI*2);c.fill();}
  const s=game.ship,blink=s.alive&&game.ms<s.safeUntil&&Math.floor(game.ms/120)%2;
  if(s.alive&&!blink){
    const R=METEORS.shipRadius,pt=(a,r)=>[s.x+Math.cos(s.a+a)*r,s.y+Math.sin(s.a+a)*r];
    c.strokeStyle=theme;c.beginPath();c.moveTo(...pt(0,R*1.3));c.lineTo(...pt(2.5,R));c.lineTo(...pt(Math.PI,R*.45));c.lineTo(...pt(-2.5,R));c.closePath();c.stroke();
    if(game.input.thrust&&game.running&&Math.floor(game.ms/60)%2){c.strokeStyle='#ffa65a';c.beginPath();c.moveTo(...pt(2.8,R*.7));c.lineTo(...pt(Math.PI,R*1.3));c.lineTo(...pt(-2.8,R*.7));c.stroke();}
  }
  c.restore();
  c.fillStyle='#e9f1ff';c.textBaseline='top';c.font=`bold ${h/16}px system-ui`;c.textAlign='left';c.fillText(String(game.score),w*.03,h*.03);
  c.textAlign='right';c.font=`${h/20}px system-ui`;c.fillText(`Våg ${Math.max(1,game.wave)} · ${'▲'.repeat(Math.max(0,game.lives))}`,w*.97,h*.035);
  if(!game.running)overlay(c,w,h,'METEORITER',game.over?[`Slut! ${game.score} poäng`,'Mellanslag: spela igen']:['Starta med mellanslag','Pilar: sväng och gasa'],top,me,theme);
}

/** What other visitors see while someone else plays, and the idle card: the game name, who plays and the top list. */
export function drawArcadeCard(canvas,title,owner,top,theme) {
  const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
  c.fillStyle='#101622';c.fillRect(0,0,w,h);c.fillStyle=theme;c.fillRect(0,0,w,h*.025);
  c.textAlign='center';c.textBaseline='middle';c.font=`bold ${h/10}px system-ui`;c.fillText(title.toUpperCase(),w*.3,h*.4);
  c.fillStyle='#c0ccdd';c.font=`${h/18}px system-ui`;c.fillText(owner?`${owner} spelar …`:'Ledig',w*.3,h*.56);
  drawTopList(c,w*.58,h*.08,w*.38,h*.84,top);
}

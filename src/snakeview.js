import { SNAKE as C } from './config.js';
import { drawTopList } from './arcadeview.js';

/** Shared arena rendered on each physical computer monitor. */
/** `top` (#1577): the Ormstriden top list, drawn between rounds (no snakes, or ours is out). */
export function drawSnake(canvas,state,me,theme,previous=null,blend=1,top=null) {
  const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
  c.fillStyle='#0a1220';c.fillRect(0,0,w,h);
  const scale=Math.min(w/C.width,h/C.height),ox=(w-C.width*scale)/2,oy=(h-C.height*scale)/2;
  c.save();c.translate(ox,oy);c.scale(scale,scale);
  c.strokeStyle='#1e3045';c.lineWidth=1/scale;
  for(let x=0;x<=C.width;x+=2){c.beginPath();c.moveTo(x,0);c.lineTo(x,C.height);c.stroke();}
  for(let y=0;y<=C.height;y+=2){c.beginPath();c.moveTo(0,y);c.lineTo(C.width,y);c.stroke();}
  c.strokeStyle=theme;c.strokeRect(0,0,C.width,C.height);
  if(state){
    for(const [x,y,v]of state.food){c.fillStyle=v>1?'#ffbd78':'#9cddc3';c.beginPath();c.arc(x,y,C.foodRadius*(v>1?1.5:1),0,Math.PI*2);c.fill();}
    for(const s of state.snakes){if(!s.alive||!s.points.length)continue;
      const old=previous?.snakes.find(p=>p.id===s.id&&p.alive),points=s.points.map((p,i)=>old?.points[i]?[old.points[i][0]+(p[0]-old.points[i][0])*blend,old.points[i][1]+(p[1]-old.points[i][1])*blend]:p);
      const radius=C.radius+(s.length-C.initialSegments)*C.radiusGrowth;
      c.strokeStyle=s.color;c.lineWidth=radius*2;c.lineJoin=c.lineCap='round';c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.stroke();
      const [x,y]=points[0];c.fillStyle=s.id===me?'#fff':'#182534';
      for(const side of [-1,1]){c.beginPath();c.arc(x+Math.cos(s.angle+side*.7)*radius*.6,y+Math.sin(s.angle+side*.7)*radius*.6,radius*.22,0,Math.PI*2);c.fill();}
      c.font=`${C.height/32}px system-ui`;c.textAlign='center';c.fillStyle='#fff';c.fillText(s.name+(s.id===me?' (du)':''),x,y-radius-.25);
    }
  }
  c.restore();
  const cx=top?w*.3:w/2;
  if(!state?.snakes.length){c.fillStyle='#e9f1ff';c.font=`bold ${h/13}px system-ui`;c.textAlign='center';c.fillText('ORMSTRIDEN',cx,h*.45);c.font=`${h/(top?26:20)}px system-ui`;c.fillText('Gå med och möt de andra datorerna',cx,h*.58);}
  if(top)drawTopList(c,w*.58,h*.08,w*.38,h*.84,top);
}
export function drawComputerMenu(canvas,info,app,owner) {
  const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height;c.fillStyle='#101622';c.fillRect(0,0,w,h);
  c.fillStyle=info.color;c.fillRect(0,0,w,h*.025);c.textAlign='center';c.font=`bold ${h/9}px system-ui`;c.fillText(info.name,w/2,h*.25);
  for(const [title,x,color]of [['YouTube',.27,'#e96d77'],['Spel',.73,info.color]]){c.fillStyle='#253245';c.fillRect(w*(x-.2),h*.36,w*.4,h*.3);c.fillStyle=color;c.font=`bold ${h/9}px system-ui`;c.fillText(title,w*x,h*.55);}
  c.fillStyle='#c0ccdd';c.font=`${h/18}px system-ui`;c.fillText(owner?`${owner} styr datorn`:'E / tryck på skärmen för att välja',w/2,h*.84);
}

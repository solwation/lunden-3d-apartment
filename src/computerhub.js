import * as THREE from 'three';
import { CinemaPlayer } from './cinemaplayer.js';
import { CinemaSurface } from './cinemasurface.js';
import { COMPUTER_MEDIA as C, SNAKE, computerViewer, nearComputer } from './config.js';
import { drawSnake, drawComputerMenu } from './snakeview.js';

/** One app selector per physical computer; all game clients share one server arena. */
export class ComputerHub {
  constructor({canvas,targets,template,onClose,onOpen,endpoint}) {
    this.sessions=new Map();this.onOpen=onOpen;this.seq=0;this.angle=0;
    for(const target of targets.filter(t=>t.mediaId&&C.stations.some(s=>s.id===t.mediaId))) {
      const info=C.stations.find(s=>s.id===target.mediaId),el=template.cloneNode(true);
      el.id=`computer-${info.id}`;el.removeAttribute('open');el.classList.add('computer-player');
      const title=el.querySelector('h2');title.id=`computer-title-${info.id}`;title.textContent=info.name;el.setAttribute('aria-labelledby',title.id);
      const input=el.querySelector('input');input.id=`computer-search-${info.id}`;el.querySelector('label').htmlFor=input.id;
      const movie=document.createElement('section');movie.className='computer-movie';
      movie.append(el.querySelector('form'),el.querySelector('.cinema-video'),el.lastElementChild);
      const nav=document.createElement('nav');nav.className='cinema-row computer-apps';nav.setAttribute('aria-label','Välj på datorn');
      const game=document.createElement('section');game.className='computer-game';game.hidden=true;
      game.innerHTML='<h3>Ormstriden</h3><p>Ät ljuspunkter och väx. Få de andra att krocka med din kropp och ät det som blir kvar. Vid huvudkrock vinner den större ormen. Undvik väggarna!</p><canvas tabindex="0" aria-label="Ormarena. Styr med piltangenter, WASD eller tryck dit du vill svänga."></canvas><p class="computer-score" aria-live="polite"></p><div class="cinema-row"><button type="button" data-snake="join">Gå med i spelet</button><button type="button" data-angle="-1.5707963267948966" aria-label="Sväng upp">↑</button><button type="button" data-angle="3.141592653589793" aria-label="Sväng vänster">←</button><button type="button" data-angle="1.5707963267948966" aria-label="Sväng ner">↓</button><button type="button" data-angle="0" aria-label="Sväng höger">→</button></div><p class="computer-players"></p>';
      const board=game.querySelector('canvas');board.width=SNAKE.canvasWidth;board.height=SNAKE.canvasHeight;
      el.append(nav,movie,game);document.body.append(el);
      const player=new CinemaPlayer(el,onClose,endpoint,{id:info.id,label:info.name,place:'datorskärmen'});
      // No film search before the player chooses the YouTube app.
      const search=player.search.bind(player);player.search=(...args)=>player.state?.app==='youtube'?search(...args):undefined;
      const poster=document.createElement('canvas');poster.width=SNAKE.screenWidth;poster.height=Math.round(poster.width*target.mesh.geometry.parameters.height/target.mesh.geometry.parameters.width);
      const texture=new THREE.CanvasTexture(poster);texture.colorSpace=THREE.SRGBColorSpace;
      const material=new THREE.MeshBasicMaterial({map:texture,toneMapped:false});
      player.surface=new CinemaSurface(canvas,target.mesh,`computer-world-${info.id}`);player.surface.poster=material;
      const session={info,target,player,poster,texture,material,nav,movie,game,board,score:game.querySelector('.computer-score'),list:game.querySelector('.computer-players'),join:game.querySelector('[data-snake=join]'),available:false};
      this.sessions.set(info.id,session);
      for(const [app,label]of [['menu','Startsida'],['youtube','YouTube'],['snake','Spel · Ormstriden']]) {
        const button=document.createElement('button');button.type='button';button.dataset.app=app;button.textContent=label;nav.append(button);
        button.addEventListener('click',()=>{if(!player.owns)return;this.stopInput(session);player.command('app',{app});});
      }
      const claim=document.createElement('button');claim.type='button';claim.textContent='Ta kontroll';claim.dataset.computerClaim='';nav.after(claim);session.claim=claim;
      claim.addEventListener('click',()=>{player.wantsControl=true;player.awaitingPresence=!player.state;player.command('claim');});
      const controls=player.controls.bind(player);player.controls=()=>{controls();this.controls(session);};
      const close=player.close.bind(player);player.close=(reason)=>{this.stopInput(session);close(reason);};
      const receive=player.receive.bind(player);player.receive=m=>{receive(m);this.controls(session);if(m.k==='state'&&player.state?.app!=='youtube')player.status.textContent=player.owns?'Du styr datorn. Välj YouTube eller Spel.':player.state?.owner?`${player.state.name} använder datorn.`:'Datorn är ledig.';};
      session.join.addEventListener('click',()=>{if(player.owns){this.pendingScreen=info.id;this.send({k:'join',screen:info.id});session.joining=true;this.controls(session);board.focus();}});
      for(const b of game.querySelectorAll('[data-angle]'))b.addEventListener('click',()=>{this.angle=Number(b.dataset.angle);board.focus();});
      const headings={ArrowRight:0,KeyD:0,ArrowDown:Math.PI/2,KeyS:Math.PI/2,ArrowLeft:Math.PI,KeyA:Math.PI,ArrowUp:-Math.PI/2,KeyW:-Math.PI/2};
      el.addEventListener('keydown',e=>{if(player.state?.app==='snake'&&e.code in headings){e.preventDefault();this.angle=headings[e.code];}});
      const steer=e=>{
        if(!player.owns)return;const mine=this.arena?.snakes.find(s=>s.id===this.net?.id()&&s.alive);if(!mine?.points[0])return;
        const r=board.getBoundingClientRect(),x=(e.clientX-r.left)/r.width*SNAKE.width,y=(e.clientY-r.top)/r.height*SNAKE.height;
        this.angle=Math.atan2(y-mine.points[0][1],x-mine.points[0][0]);
      };
      board.addEventListener('pointerdown',e=>{e.preventDefault();board.focus();board.setPointerCapture(e.pointerId);steer(e);});
      board.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'||e.buttons)steer(e);});
      this.controls(session);drawComputerMenu(poster,info,'menu','');texture.needsUpdate=true;
    }
  }
  connect(net){this.net=net;for(const [id,{player}]of this.sessions)player.net={ready:net.ready,id:net.id,send:m=>net.send({...m,screen:id})};}
  send(m){return this.net?.snake({t:'snake',...m});}
  get open(){return [...this.sessions.values()].some(s=>s.player.open);}
  get watching(){return [...this.sessions.values()].some(s=>s.player.inside&&(s.player.open||s.player.state?.video));}
  receive(m){const s=this.sessions.get(m.screen);if(!s)return false;s.player.receive(m);if(m.k==='state'&&s.player.inside&&this.arenaConnection!==this.net?.id()){this.arenaConnection=this.net?.id();this.send({k:'get'});}return true;}
  receiveSnake(m){
    if(m.k==='state') {this.previous=this.arena;this.arena=m.s;this.receivedAt=performance.now();const mine=this.arena?.snakes.find(s=>s.id===this.net?.id()&&s.alive&&s.screen===this.pendingScreen);if(mine){this.angle=mine.angle;this.pendingScreen=null;}for(const s of this.sessions.values()){s.joining=false;this.controls(s);}}
    else if(m.k==='no')for(const s of this.sessions.values())if(s.player.open){s.joining=false;s.score.textContent=({wait:'Vänta ett ögonblick och försök igen.',away:'Gå närmare datorn.',owner:'Någon annan styr datorn.',join:'Gå med i spelet igen.',app:'Välj Spel först.'})[m.why]??'Spelet kunde inte nås.';}
  }
  controls(s){
    const p=s.player,app=p.state?.app??'menu',mine=this.arena?.snakes.find(a=>a.id===this.net?.id()&&a.screen===s.info.id);
    s.movie.hidden=app!=='youtube';s.game.hidden=app!=='snake';
    if(app==='youtube'&&s.lastApp!==app&&p.owns&&p.open&&p.searchEndpoint)p.search('animerad kortfilm',true);
    s.lastApp=app;
    for(const b of s.nav.children){b.disabled=!p.owns;b.setAttribute('aria-pressed',String(b.dataset.app===app));}
    if(s.claim){s.claim.hidden=p.owns;s.claim.disabled=!p.connected||!!p.state?.owner;}
    s.join.disabled=!p.owns||!!mine?.alive||!!s.joining;s.join.textContent=mine&&!mine.alive?'Spela igen':'Gå med i spelet';
    for(const b of s.game.querySelectorAll('[data-angle]'))b.disabled=!p.owns||!mine?.alive;
    s.score.textContent=mine?mine.alive?`Du: ${mine.score} poäng · ${mine.length} längd · ${mine.kills} besegrade`:`Du åkte ut: ${mine.why}. Spela igen!`:'Gå med från den här datorn. Alla datorer delar samma arena.';
    s.list.textContent=(this.arena?.snakes??[]).slice().sort((a,b)=>b.score-a.score).map(a=>`${a.name}: ${a.score}${a.alive?'':' (ute)'}`).join(' · ');
  }
  stopInput(s){
    if(this.playing===s||s.joining){this.send({k:'leave'});this.playing=null;s.joining=false;this.pendingScreen=null;}
  }
  show(target){const s=this.sessions.get(target.mediaId);if(!s?.player.inside||!nearComputer(s.info.id,this.position))return false;if(s.player.activate())return true;this.close();if(target.kind==='pc'&&!target.isOpen)target.toggle();if(target.kind==='laptop')target.laptop.set(true);this.onOpen();s.player.show();return true;}
  close(reason='button'){for(const s of this.sessions.values())if(s.player.open)s.player.close(reason);}
  update(visitor,camera,renderer,available,furniture=true) {
    this.position=[visitor.pos.x,visitor.pos.y,visitor.pos.z];const now=performance.now();let any=false;
    if(!this.net?.ready()){this.arena=null;this.previous=null;this.arenaConnection=null;}
    for(const [id,s]of this.sessions){
      const inside=available&&(s.info.clubhouse||furniture)&&computerViewer(id,this.position),p=s.player;
      const changed=inside!==s.available;
      if(changed&&inside){s.target.media?.(true);s.target.mesh.material=s.material;}
      p.update(inside,camera,renderer);
      if(changed){s.available=inside;if(!inside)s.target.media?.(false);}any||=inside;
      const mine=this.arena?.snakes.find(a=>a.id===this.net?.id()&&a.screen===id);
      const playing=inside&&p.open&&p.owns&&p.state?.app==='snake'&&mine?.alive&&nearComputer(id,this.position);
      if(playing){this.playing=s;if(now-(this.inputAt??0)>=SNAKE.inputMs){this.inputAt=now;this.send({k:'input',screen:id,seq:++this.seq,angle:this.angle});}}
      else if(this.playing===s&&(!inside||!p.open||!p.owns||p.state?.app!=='snake'||!nearComputer(id,this.position)))this.stopInput(s);
      if(!inside)continue;
      if(now-(s.renderAt??0)>=SNAKE.renderMs){
        s.renderAt=now;const blend=Math.min(1,(now-(this.receivedAt??0))/SNAKE.inputMs);
        if(p.state?.app==='snake'){
          drawSnake(s.poster,this.arena,this.net?.id(),s.info.color,this.previous,blend);
          if(p.open)drawSnake(s.board,this.arena,this.net?.id(),s.info.color,this.previous,blend);
        }else if(!p.state?.video&&s.menuKey!==`${p.state?.q}`){drawComputerMenu(s.poster,s.info,p.state?.app,p.state?.name);s.menuKey=`${p.state?.q}`;}
        if(p.state?.app==='snake'||s.drawnMenu!==s.menuKey){s.texture.needsUpdate=true;s.drawnMenu=s.menuKey;}
      }
    }
    if(!any){this.arena=null;this.previous=null;this.arenaConnection=null;}
  }
}

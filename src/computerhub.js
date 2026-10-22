import * as THREE from 'three';
import { CinemaPlayer } from './cinemaplayer.js';
import { CinemaSurface } from './cinemasurface.js';
import { COMPUTER_MEDIA as C, SNAKE, computerViewer, nearComputer } from './config.js';
import { drawSnake, drawComputerMenu } from './snakeview.js';

/** One app selector per physical computer; all game clients share one server arena. */
export class ComputerHub {
  constructor({canvas,targets,template,onClose,onOpen,endpoint,onNotice}) {
    this.canvas=canvas;this.raycaster=new THREE.Raycaster();this.pointer=new THREE.Vector2();this.sessions=new Map();this.onOpen=onOpen;this.onNotice=onNotice;this.seq=0;this.angle=0;this.offMaterial=new THREE.MeshBasicMaterial({color:C.offColor,toneMapped:false});
    for(const target of targets.filter(t=>t.mediaId&&C.stations.some(s=>s.id===t.mediaId))) {
      const info=C.stations.find(s=>s.id===target.mediaId),el=template.cloneNode(true);
      el.id=`computer-${info.id}`;el.removeAttribute('open');el.classList.add('computer-player');
      const title=el.querySelector('h2');title.id=`computer-title-${info.id}`;title.textContent=info.name;el.setAttribute('aria-labelledby',title.id);
      const input=el.querySelector('input');input.id=`computer-search-${info.id}`;el.querySelector('label').htmlFor=input.id;
      const movie=document.createElement('section');movie.className='computer-movie';
      movie.append(el.querySelector('form'),el.querySelector('.cinema-video'),el.lastElementChild);
      const nav=document.createElement('nav');nav.className='cinema-row computer-apps';nav.setAttribute('aria-label','Välj på datorn');
      const game=document.createElement('section');game.className='computer-game';game.hidden=true;
      game.innerHTML='<h3>Ormstriden</h3><p>Ät ljuspunkter och väx. Få de andra att krocka med din kropp och ät det som blir kvar. Vid huvudkrock vinner den större ormen. Undvik väggarna!</p><p class="computer-help">Piltangenter / WASD eller peka på skärmen. Esc / E lämnar datorn.</p><p class="computer-score" aria-live="polite"></p><div class="cinema-row"><button type="button" data-snake="join">Gå med i spelet</button><button type="button" data-angle="-1.5707963267948966" aria-label="Sväng upp">↑</button><button type="button" data-angle="3.141592653589793" aria-label="Sväng vänster">←</button><button type="button" data-angle="1.5707963267948966" aria-label="Sväng ner">↓</button><button type="button" data-angle="0" aria-label="Sväng höger">→</button></div><p class="computer-players"></p>';
      el.append(nav,movie,game);document.body.append(el);
      const player=new CinemaPlayer(el,onClose,endpoint,{id:info.id,label:info.name,place:'datorskärmen'});
      // No film search before the player chooses the YouTube app.
      const search=player.search.bind(player);player.search=(...args)=>player.state?.app==='youtube'?search(...args):undefined;
      const poster=document.createElement('canvas');poster.width=SNAKE.screenWidth;poster.height=Math.round(poster.width*target.mesh.geometry.parameters.height/target.mesh.geometry.parameters.width);
      const texture=new THREE.CanvasTexture(poster);texture.colorSpace=THREE.SRGBColorSpace;
      const material=new THREE.MeshBasicMaterial({map:texture,toneMapped:false});
      player.surface=new CinemaSurface(canvas,target.mesh,`computer-world-${info.id}`);player.surface.poster=material;
      const session={info,target,player,poster,texture,material,nav,movie,game,score:game.querySelector('.computer-score'),list:game.querySelector('.computer-players'),join:game.querySelector('[data-snake=join]'),available:false};
      this.sessions.set(info.id,session);
      for(const [app,label]of [['menu','Startsida'],['youtube','YouTube'],['snake','Spel · Ormstriden']]) {
        const button=document.createElement('button');button.type='button';button.dataset.app=app;button.textContent=label;nav.append(button);
        button.addEventListener('click',()=>{if(!player.owns)return;this.stopInput(session);player.command('app',{app});});
      }
      const claim=document.createElement('button');claim.type='button';claim.textContent='Ta kontroll';claim.dataset.computerClaim='';nav.after(claim);session.claim=claim;
      claim.addEventListener('click',()=>{player.wantsControl=true;player.awaitingPresence=!player.state;player.command('claim');});
      const off=document.createElement('button');off.type='button';off.textContent='Stäng av datorn';off.dataset.computerPower='';claim.after(off);off.addEventListener('click',()=>this.requestPower(session,false));
      const controls=player.controls.bind(player);player.controls=()=>{controls();this.controls(session);};
      const close=player.close.bind(player);player.close=(reason)=>{this.stopInput(session);this.worldMode(session,false);close(reason);};
      const receive=player.receive.bind(player);player.receive=m=>{receive(m);if(m.k==='no'&&session.pendingPower!==undefined)this.onNotice?.(player.status.textContent);session.pendingPower=undefined;this.syncPower(session);this.controls(session);if(m.k==='state'&&player.state?.app!=='youtube')player.status.textContent=player.owns?'Du styr datorn. Välj YouTube eller Spel.':player.state?.owner?`${player.state.name} använder datorn.`:'Datorn är ledig.';};
      session.join.addEventListener('click',()=>{if(player.owns){this.pendingScreen=info.id;this.send({k:'join',screen:info.id});session.joining=true;this.controls(session);session.join.focus();}});
      for(const b of game.querySelectorAll('[data-angle]'))b.addEventListener('click',()=>{this.angle=Number(b.dataset.angle);session.join.focus();});
      const headings={ArrowRight:0,KeyD:0,ArrowDown:Math.PI/2,KeyS:Math.PI/2,ArrowLeft:Math.PI,KeyA:Math.PI,ArrowUp:-Math.PI/2,KeyW:-Math.PI/2};
      el.addEventListener('keydown',e=>{if(player.state?.app==='snake'&&e.code in headings){e.preventDefault();this.angle=headings[e.code];}});
      this.controls(session);drawComputerMenu(poster,info,'menu','');texture.needsUpdate=true;this.syncPower(session);
    }
    const headings={ArrowRight:0,KeyD:0,ArrowDown:Math.PI/2,KeyS:Math.PI/2,ArrowLeft:Math.PI,KeyA:Math.PI,ArrowUp:-Math.PI/2,KeyW:-Math.PI/2};
    for(const type of ['keydown','keyup'])window.addEventListener(type,e=>{
      const s=this.worldSession;if(!s)return;
      if(e.code==='Tab'){
        e.preventDefault();e.stopImmediatePropagation();
        const buttons=[...s.player.el.querySelectorAll('button')].filter(b=>!b.disabled&&b.getClientRects().length);
        const i=buttons.indexOf(document.activeElement),next=(i+(e.shiftKey?-1:1)+buttons.length)%buttons.length;buttons[next]?.focus();return;
      }
      if(e.target.closest?.('button')&&['Enter','Space'].includes(e.code))return;
      e.preventDefault();e.stopImmediatePropagation();
      if(type==='keyup')return;
      if(e.code==='Escape'||e.code==='KeyE'){s.player.close('Escape');return;}
      if(e.code in headings)this.angle=headings[e.code];
      if(e.code==='Space'&&!s.join.disabled)s.join.click();
    },true);
    for(const type of ['pointerdown','pointermove','pointerup','pointercancel','touchstart','touchmove','touchend','mousedown','mouseup','click','contextmenu','wheel'])window.addEventListener(type,e=>{
      const s=this.worldSession;if(!s||s.player.el.contains(e.target))return;
      e.preventDefault();e.stopImmediatePropagation();
      if((type==='pointerdown'||type==='pointermove')&&(e.pointerType==='mouse'||e.buttons))this.steerScreen(s,e);
    },{capture:true,passive:false});
  }
  worldMode(s,on) {
    if(!!s.inWorld===on)return;
    s.inWorld=on;s.player.el.classList.toggle('computer-world-controls',on);
    s.player.el.querySelector('[data-cinema=close]').textContent=on?'Lämna datorn':'Tillbaka till rummet';
    if(on){this.worldSession=s;s.player.el.close();s.player.el.show();s.join.focus();}
    else {
      if(this.worldSession===s)this.worldSession=null;
      if(s.view){s.view.camera.position.copy(s.view.position);s.view.camera.quaternion.copy(s.view.quaternion);s.view.camera.updateMatrixWorld(true);s.view=null;}
    }
  }
  frameScreen(s,camera) {
    if(!s.view)s.view={camera,position:camera.position.clone(),quaternion:camera.quaternion.clone()};
    const mesh=s.target.mesh;mesh.updateWorldMatrix(true,false);
    const center=mesh.getWorldPosition(new THREE.Vector3()),scale=mesh.getWorldScale(new THREE.Vector3()),g=mesh.geometry.parameters;
    const halfFov=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
    const distance=Math.max(g.height*scale.y/SNAKE.viewHeight,g.width*scale.x/(camera.aspect*SNAKE.viewWidth))/(2*halfFov);
    const normal=new THREE.Vector3(0,0,1).transformDirection(mesh.matrixWorld);
    const up=new THREE.Vector3(0,1,0).transformDirection(mesh.matrixWorld);
    const aim=center.clone().addScaledVector(up,-distance*halfFov*SNAKE.viewLift);
    camera.position.copy(aim).addScaledVector(normal,distance);camera.lookAt(aim);camera.updateMatrixWorld(true);
    this.camera=camera;
  }
  steerScreen(s,e) {
    if(!s.player.owns||!this.camera)return;
    const mine=this.arena?.snakes.find(a=>a.id===this.net?.id()&&a.screen===s.info.id&&a.alive);if(!mine?.points[0])return;
    const r=this.canvas.getBoundingClientRect();this.pointer.set((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2);
    this.raycaster.setFromCamera(this.pointer,this.camera);
    const hit=this.raycaster.intersectObject(s.target.mesh,false)[0];if(!hit?.uv)return;
    // Match the centered arena on monitors with a different aspect ratio.
    const w=s.poster.width,h=s.poster.height,scale=Math.min(w/SNAKE.width,h/SNAKE.height);
    const x=(hit.uv.x*w-(w-SNAKE.width*scale)/2)/scale,y=((1-hit.uv.y)*h-(h-SNAKE.height*scale)/2)/scale;
    if(x<0||y<0||x>SNAKE.width||y>SNAKE.height)return;
    this.angle=Math.atan2(y-mine.points[0][1],x-mine.points[0][0]);
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
    const wasWorld=s.inWorld;
    this.worldMode(s,app==='snake'&&p.open&&p.owns);
    if(wasWorld&&!s.inWorld&&p.open){p.el.close();p.el.showModal();}
    s.movie.hidden=app!=='youtube';s.game.hidden=app!=='snake';
    if(app==='youtube'&&s.lastApp!==app&&p.owns&&p.open&&p.searchEndpoint)p.search('animerad kortfilm',true);
    s.lastApp=app;
    for(const b of s.nav.children){b.disabled=!p.owns;b.setAttribute('aria-pressed',String(b.dataset.app===app));}
    if(s.claim){s.claim.hidden=p.owns;s.claim.disabled=!p.connected||!!p.state?.owner;}
    const off=p.el.querySelector('[data-computer-power]');if(off)off.disabled=!p.connected||!s.target.isOpen||!!p.state?.owner&&!p.owns;
    s.join.disabled=!p.owns||!!mine?.alive||!!s.joining;s.join.textContent=mine&&!mine.alive?'Spela igen':'Gå med i spelet';
    for(const b of s.game.querySelectorAll('[data-angle]'))b.disabled=!p.owns||!mine?.alive;
    s.score.textContent=mine?mine.alive?`Du: ${mine.score} poäng · ${mine.length} längd · ${mine.kills} besegrade`:`Du åkte ut: ${mine.why}. Spela igen!`:'Gå med från den här datorn. Alla datorer delar samma arena.';
    s.list.textContent=(this.arena?.snakes??[]).slice().sort((a,b)=>b.score-a.score).map(a=>`${a.name}: ${a.score}${a.alive?'':' (ute)'}`).join(' · ');
  }
  stopInput(s){
    if(this.playing===s||s.joining){this.send({k:'leave'});this.playing=null;s.joining=false;this.pendingScreen=null;}
  }
  requestPower(s,on) {
    if(s.pendingPower!==undefined)return false;
    if(!s.player.connected){this.onNotice?.('Datorn väntar på anslutning. Försök igen.');return false;}
    if(!on)this.stopInput(s);
    const sent=s.player.command('power',{on});if(sent)s.pendingPower=on;return sent;
  }
  syncPower(s) {
    const on=s.player.inside&&s.player.state?.power===true;
    s.target.media?.(on);
    if(s.target.kind==='laptop')s.target.laptop.set(on);else if(!!s.target.isOpen!==on)s.target.toggle();
    if(!on){this.stopInput(s);s.player.close('button');s.target.mesh.material=this.offMaterial;}
    else s.target.mesh.material=s.player.surface.active?s.player.surface.aperture:s.material;
  }
  power(target) {
    const s=[...this.sessions.values()].find(s=>s.target===target||target.laptop&&s.target.laptop===target.laptop);
    if(!s?.enabled||!nearComputer(s.info.id,this.position))return false;
    this.requestPower(s,!s.target.isOpen);return true;
  }
  show(target) {
    const s=this.sessions.get(target.mediaId);if(!s?.enabled||!nearComputer(s.info.id,this.position))return false;
    if(!s.target.isOpen){this.requestPower(s,true);return true;}
    if(!s.player.inside)return true;
    if(s.player.activate())return true;
    this.close();this.onOpen();s.player.show();return true;
  }
  close(reason='button'){for(const s of this.sessions.values())if(s.player.open)s.player.close(reason);}
  update(visitor,camera,renderer,available,furniture=true) {
    this.position=[visitor.pos.x,visitor.pos.y,visitor.pos.z];const now=performance.now();let any=false;
    if(!this.net?.ready()){this.arena=null;this.previous=null;this.arenaConnection=null;}
    for(const [id,s]of this.sessions){
      s.enabled=available&&(s.info.clubhouse||furniture)&&computerViewer(id,this.position);
      const inside=s.enabled,p=s.player;
      const changed=inside!==s.available;
      p.update(inside,camera,renderer);
      if(changed||s.connected!==p.connected){s.available=inside;s.connected=p.connected;this.syncPower(s);}any||=inside;
      if(s.inWorld&&(!p.connected||!p.owns||!inside||!nearComputer(id,this.position)))p.close('exit');
      if(s.inWorld)this.frameScreen(s,camera);
      const mine=this.arena?.snakes.find(a=>a.id===this.net?.id()&&a.screen===id);
      const playing=inside&&p.open&&p.owns&&p.state?.app==='snake'&&mine?.alive&&nearComputer(id,this.position);
      if(playing){this.playing=s;if(now-(this.inputAt??0)>=SNAKE.inputMs){this.inputAt=now;this.send({k:'input',screen:id,seq:++this.seq,angle:this.angle});}}
      else if(this.playing===s&&(!inside||!p.open||!p.owns||p.state?.app!=='snake'||!nearComputer(id,this.position)))this.stopInput(s);
      if(!inside||!s.target.isOpen)continue;
      if(now-(s.renderAt??0)>=SNAKE.renderMs){
        s.renderAt=now;const blend=Math.min(1,(now-(this.receivedAt??0))/SNAKE.inputMs);
        if(p.state?.app==='snake'){
          drawSnake(s.poster,this.arena,this.net?.id(),s.info.color,this.previous,blend);
        }else if(!p.state?.video&&s.menuKey!==`${p.state?.q}`){drawComputerMenu(s.poster,s.info,p.state?.app,p.state?.name);s.menuKey=`${p.state?.q}`;}
        if(p.state?.app==='snake'||s.drawnMenu!==s.menuKey){s.texture.needsUpdate=true;s.drawnMenu=s.menuKey;}
      }
    }
    if(!any){this.arena=null;this.previous=null;this.arenaConnection=null;}
  }
}

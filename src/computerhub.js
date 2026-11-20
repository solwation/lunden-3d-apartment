import * as THREE from 'three';
import { CinemaPlayer } from './cinemaplayer.js';
import { CinemaSurface } from './cinemasurface.js';
import { COMPUTER_MEDIA as C, SNAKE, GAME_BOARDS, SCREEN_SHARE, NES, computerViewer, nearComputer } from './config.js';
import { NesGame, NES_KEYS, NES_PAD, drawNes } from './nes.js';
import { NES_TITLES, nesTitle } from './nestitles.js';
import { NES_BOARDS, nesBoardForHash } from './nesboards.js';
import { drawSnake, drawComputerMenu } from './snakeview.js';
import { BlocksGame } from './blocks.js';
import { MeteorsGame } from './meteors.js';
import { drawBlocks, drawMeteors, drawArcadeCard } from './arcadeview.js';
import { portraitThumb } from './playerportraits.js';
import { SCREEN_CODECS, ScreenFeed, cleanScreenRelay, frameDue } from './screenshare.js';

// #1577: single-player games run only in the controlling client while its panel is open; `board` names the top list.
// #2241: the onlookers in the computer's room see the same picture when the app has a codec in src/screenshare.js (Klossar and Meteoriter):
// the controller sends compact snapshots, they draw them with the same `draw` on their monitor canvas.
const ARCADE={
  blocks:{title:'Klossar',board:'klossar',make:()=>new BlocksGame(),draw:drawBlocks,about:'Vrid och flytta bitarna så att hela rader försvinner. Varje nivå går lite fortare.',
    help:'← → flyttar, ↑ vrider, ↓ släpper snabbare och mellanslag släpper ner. Esc / E lämnar datorn.',
    keys:{ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right',ArrowUp:'rotate',KeyW:'rotate',ArrowDown:'soft',KeyS:'soft',Space:'hard'},
    pad:[['left','←','Flytta vänster'],['rotate','↻','Vrid'],['right','→','Flytta höger'],['soft','↓','Snabbare ner'],['hard','⤓','Släpp ner']]},
  meteors:{title:'Meteoriter',board:'meteoriter',make:()=>new MeteorsGame(),draw:drawMeteors,hold:true,about:'Skjut sönder meteoriterna innan de träffar skeppet. Stora stenar spricker i mindre.',
    help:'← → svänger, ↑ gasar och mellanslag skjuter. Esc / E lämnar datorn.',
    keys:{ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right',ArrowUp:'thrust',KeyW:'thrust',Space:'fire'},
    pad:[['left','↺','Sväng vänster'],['thrust','▲','Gasa'],['right','↻','Sväng höger'],['fire','●','Skjut']]},
  // #2237: the NES adapter (src/nes.js): a cartridge-specific board (#2239), its own touch-pad profile and key map, redrawn at NES.renderMs,
  // the emulator loaded on Starta and freed on leaving (arcadeEnd → dispose), paused by P / a hidden tab / a lost window focus.
  // Onlookers see the "spelar" card: NES screen sharing (#2241 codec) is a follow-up.
  // The titles come from the manifest src/nestitles.js (a picker in the panel when there are several; `s.nesTitle` per computer).
  nes:{title:'NES',make:s=>new NesGame({title:s?.nesTitle}),draw:drawNes,hold:true,renderMs:NES.renderMs,license:true,titles:true,
    about:'',help:'Pilar / WASD styrkors, Z / K = B, X / J = A, Enter = Start, Skift = Select. Mellanslag startar, P pausar, Esc / E lämnar datorn.',
    keys:NES_KEYS,pad:NES_PAD,
    status:(g,p)=>({loading:'Laddar emulatorn …',running:g.reader?`${NES_BOARDS[g.reader.game].label}: ${g.score}`:'Spelar NES.',paused:'Pausad. Fortsätt med knappen eller mellanslag.',over:'Omgången är avslutad.',error:g.error})[g.phase]??(p.owns?'Starta med knappen eller mellanslag.':p.state?.owner?`${p.state.name} spelar.`:'')},
};
// #2237: the NES title picker and the licence notices shown in the computer, built from the manifest (the full texts are
// published next to the files they cover).
function nesPanel(){
  const picker=document.createElement('div');picker.className='cinema-row computer-nes-titles';picker.hidden=true;picker.setAttribute('aria-label','Välj NES-spel');
  for(const t of NES_TITLES){const b=document.createElement('button');b.type='button';b.dataset.nesTitle=t.id;b.textContent=t.title;picker.append(b);}
  const d=document.createElement('details');d.className='computer-license';d.hidden=true;
  const sum=document.createElement('summary');sum.textContent='Om NES och licenser';const intro=document.createElement('p'),list=document.createElement('ul');
  const link=(href,text)=>{const a=document.createElement('a');a.href=href;a.target='_blank';a.rel='noopener';a.textContent=text;return a;};
  intro.append('Emulatorn är jsnes 1.2.1 (Ben Firshman med flera), oförändrad, under ',link('src/vendor/jsnes/LICENSE','Apache License 2.0'),
    '. Ingen Nintendo-kod, BIOS eller kommersiell ROM ingår. Allt laddas från den här sajten först när du startar, och ljudet är avstängt.');
  for(const t of NES_TITLES){const li=document.createElement('li');li.append(`${t.title}: ${t.credit}, `,link(t.notice,t.license),'.');list.append(li);}
  d.append(sum,intro,list);return [picker,d];
}
const GAME_APPS=['snake',...Object.keys(ARCADE)];

/** One app selector per physical computer; all game clients share one server arena. */
export class ComputerHub {
  constructor({canvas,targets,template,onClose,onOpen,endpoint,onNotice,boards=null,lowMemory=false}) {
    this.lowMemory=lowMemory;this.frameSeq=Math.floor(Date.now()/250);this.frustum=new THREE.Frustum();this.viewProjection=new THREE.Matrix4();this.screenStats={sent:0,sentBytes:0,got:0,gotBytes:0}; // #2241 (frame numbers from the clock: a reloaded controller never falls behind its old ones at ≤ 4 a second)
    this.boards=boards;this.canvas=canvas;this.raycaster=new THREE.Raycaster();this.pointer=new THREE.Vector2();this.sessions=new Map();this.onOpen=onOpen;this.onNotice=onNotice;this.seq=0;this.angle=0;this.offMaterial=new THREE.MeshBasicMaterial({color:C.offColor,toneMapped:false});
    for(const target of targets.filter(t=>t.mediaId&&C.stations.some(s=>s.id===t.mediaId))) {
      const info=C.stations.find(s=>s.id===target.mediaId),el=template.cloneNode(true);
      el.id=`computer-${info.id}`;el.removeAttribute('open');el.classList.add('computer-player');
      const title=el.querySelector('h2');title.id=`computer-title-${info.id}`;title.textContent=info.name;el.setAttribute('aria-labelledby',title.id);
      const input=el.querySelector('input');input.id=`computer-search-${info.id}`;el.querySelector('label').htmlFor=input.id;
      const movie=document.createElement('section');movie.className='computer-movie';
      movie.append(el.querySelector('form'),el.querySelector('.cinema-video'),el.lastElementChild);
      const nav=document.createElement('nav');nav.className='cinema-row computer-apps';nav.setAttribute('aria-label','Välj på datorn');
      const game=document.createElement('section');game.className='computer-game';game.hidden=true;
      game.innerHTML='<h3>Ormstriden</h3><p>Ät ljuspunkter och väx. Få de andra att krocka med din kropp och ät det som blir kvar. Vid huvudkrock vinner den större ormen. Undvik väggarna!</p><p class="computer-help">Piltangenter / WASD eller peka på skärmen. Esc / E lämnar datorn.</p><p class="computer-score" aria-live="polite"></p><div class="cinema-row"><button type="button" data-snake="join">Gå med i spelet</button><button type="button" data-angle="-1.5707963267948966" aria-label="Sväng upp">↑</button><button type="button" data-angle="3.141592653589793" aria-label="Sväng vänster">←</button><button type="button" data-angle="1.5707963267948966" aria-label="Sväng ner">↓</button><button type="button" data-angle="0" aria-label="Sväng höger">→</button></div><p class="computer-players"></p><h4 class="computer-top-title">Topplista</h4><ol class="computer-top"></ol>';
      const arcade=document.createElement('section');arcade.className='computer-game computer-arcade';arcade.hidden=true;
      arcade.innerHTML='<h3></h3><p class="computer-about"></p><p class="computer-help"></p><p class="computer-score" aria-live="polite"></p><div class="cinema-row"><button type="button" data-arcade="start">Starta</button><button type="button" data-arcade="finish" hidden>Avsluta omgång</button></div><h4 class="computer-top-title">Topplista</h4><ol class="computer-top"></ol>';arcade.querySelector('.computer-score').after(...nesPanel());
      const pad=arcade.querySelector('[data-arcade=start]').parentElement;
      for(const [app,def]of Object.entries(ARCADE))for(const [action,text,label]of def.pad){
        const b=document.createElement('button');b.type='button';b.dataset.pad=action;b.dataset.padApp=app;b.textContent=text;b.setAttribute('aria-label',label);b.hidden=true;pad.append(b);
        if(def.hold){for(const t of ['pointerdown','pointerup','pointercancel','pointerleave'])b.addEventListener(t,e=>{if(t==='pointerdown')e.preventDefault();this.arcadeInput(session,action,t==='pointerdown');});}
        else b.addEventListener('click',()=>this.arcadeInput(session,action,true));
      }
      el.append(nav,movie,game,arcade);document.body.append(el);
      const player=new CinemaPlayer(el,onClose,endpoint,{id:info.id,label:info.name,place:'datorskärmen'});
      // No film search before the player chooses the YouTube app.
      const search=player.search.bind(player);player.search=(...args)=>player.state?.app==='youtube'?search(...args):undefined;
      const poster=document.createElement('canvas');poster.width=SNAKE.screenWidth;poster.height=Math.round(poster.width*target.mesh.geometry.parameters.height/target.mesh.geometry.parameters.width);
      const texture=new THREE.CanvasTexture(poster);texture.colorSpace=THREE.SRGBColorSpace;
      const material=new THREE.MeshBasicMaterial({map:texture,toneMapped:false});
      player.surface=new CinemaSurface(canvas,target.mesh,`computer-world-${info.id}`);player.surface.poster=material;
      const session={info,target,player,poster,texture,material,nav,movie,game,arcade,arcadeTitle:arcade.querySelector('h3'),arcadeHelp:arcade.querySelector('.computer-help'),arcadeScore:arcade.querySelector('.computer-score'),arcadeStart:arcade.querySelector('[data-arcade=start]'),arcadeFinish:arcade.querySelector('[data-arcade=finish]'),arcadeTop:arcade.querySelector('.computer-top'),arcadeTopTitle:arcade.querySelector('.computer-top-title'),snakeTop:game.querySelector('.computer-top'),snakeTopTitle:game.querySelector('.computer-top-title'),run:null,score:game.querySelector('.computer-score'),list:game.querySelector('.computer-players'),join:game.querySelector('[data-snake=join]'),available:false,feed:new ScreenFeed()};
      this.sessions.set(info.id,session);
      for(const [app,label]of [['menu','Startsida'],['youtube','YouTube'],['snake','Spel · Ormstriden'],['blocks','Spel · Klossar'],['meteors','Spel · Meteoriter'],['nes','Spel · NES']]) {
        const button=document.createElement('button');button.type='button';button.dataset.app=app;button.textContent=label;nav.append(button);
        button.addEventListener('click',()=>{if(!player.owns)return;this.stopInput(session);player.command('app',{app});});
      }
      const claim=document.createElement('button');claim.type='button';claim.textContent='Ta kontroll';claim.dataset.computerClaim='';nav.after(claim);session.claim=claim;
      claim.addEventListener('click',()=>{player.wantsControl=true;player.awaitingPresence=!player.state;player.command('claim');});
      const off=document.createElement('button');off.type='button';off.textContent='Stäng av datorn';off.dataset.computerPower='';claim.after(off);off.addEventListener('click',()=>this.requestPower(session,false));
      const controls=player.controls.bind(player);player.controls=()=>{controls();this.controls(session);};
      const close=player.close.bind(player);player.close=(reason)=>{this.stopInput(session);this.worldMode(session,false);close(reason);};
      const receive=player.receive.bind(player);player.receive=m=>{receive(m);if(m.k==='no'&&session.pendingPower!==undefined)this.onNotice?.(player.status.textContent);session.pendingPower=undefined;this.syncPower(session);this.controls(session);if(m.k==='state'&&player.state?.app!=='youtube')player.status.textContent=player.owns?'Du styr datorn. Välj YouTube eller Spel.':player.state?.owner?`${player.state.name} använder datorn.`:'Datorn är ledig.';};
      session.join.addEventListener('click',()=>{if(player.owns){this.pendingScreen=info.id;this.send({k:'join',screen:info.id,pid:this.boards?.id()});session.joining=true;this.controls(session);session.join.focus();}});
      session.arcadeStart.addEventListener('click',()=>this.arcadeStart(session));
      session.arcadeFinish.addEventListener('click',()=>{if(player.owns&&player.state?.app==='nes')this.arcadeEnd(session);});
      for(const b of arcade.querySelectorAll('[data-nes-title]'))b.addEventListener('click',()=>{ // #2237: another title frees the running one
        if(!player.owns||player.state?.app!=='nes'||nesTitle(session.nesTitle).id===b.dataset.nesTitle)return;
        this.arcadeEnd(session);session.nesTitle=b.dataset.nesTitle;session.run={app:'nes',game:ARCADE.nes.make(session),sent:true};session.lastApp=null;session.menuKey=null;this.controls(session);});
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
      const arcade=ARCADE[s.player.state?.app];
      if(e.target.closest?.('[data-arcade=finish]')&&(e.code==='Enter'||e.code==='Space'))return;
      if(e.target.closest?.('button')&&(e.code==='Enter'&&!(arcade?.keys[e.code]&&this.arcadeGame(s)?.running)||e.code==='Space'&&!arcade))return;
      e.preventDefault();e.stopImmediatePropagation();
      if(type==='keyup'){if(arcade)this.arcadeKey(s,e.code,false,false);return;}
      if(e.code==='Escape'||e.code==='KeyE'){s.player.close('Escape');return;}
      if(arcade){this.arcadeKey(s,e.code,true,e.repeat);return;}
      if(e.code in headings)this.angle=headings[e.code];
      if(e.code==='Space'&&!s.join.disabled)s.join.click();
    },true);
    // #2237: a hidden tab or a lost window focus pauses a running NES game (resumed by the player, no fast-forward).
    const pause=()=>{for(const s of this.sessions.values()){const g=this.arcadeGame(s);if(g?.pause?.())this.controls(s);}};
    document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});for(const t of ['blur','pagehide'])window.addEventListener(t,pause);
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
  get watching(){const now=performance.now();return [...this.sessions.values()].some(s=>s.player.inside&&(s.player.open||s.player.state?.video||s.feed.current(now,s.player.state?.owner,s.player.state?.app)));} // (#2241: watching someone play counts)
  receive(m){const s=this.sessions.get(m.screen);if(!s)return false;s.player.receive(m);if(m.k==='state'&&s.player.inside&&this.arenaConnection!==this.net?.id()){this.arenaConnection=this.net?.id();this.send({k:'get'});}return true;}
  /** #2241: a relayed picture of another player's game on one of our computers: only from its current owner and app, never while we control it. */
  receiveScreen(m){
    const c=cleanScreenRelay(m),s=c&&this.sessions.get(c.screen),p=s?.player;
    if(!s||!p.inside||p.owns||p.state?.owner!==c.i||p.state?.app!==c.app||!s.feed.accept(c,performance.now()))return false;
    this.screenStats.got++;this.screenStats.gotBytes+=JSON.stringify(m).length;return true;
  }
  /** #2241: the controller's side: while someone else is in this computer's room, a snapshot when the picture changed (≤ SCREEN_SHARE.hz,
   * lowMemoryHz on phones) or every keyMs; nothing while nobody watches. Only the newest waits in the shared socket budget. */
  shareFrame(s,game,now){
    const app=s.player.state?.app,codec=SCREEN_CODECS[app];
    if(!codec||!this.net?.screen||!this.net.ready())return;
    if(!this.net.watchers?.(s.info.id)){s.shared=null;return;}
    const hz=this.lowMemory?SCREEN_SHARE.lowMemoryHz:SCREEN_SHARE.hz;if(s.shared&&now-s.shared.at<1000/hz)return; // (no encoding between slots)
    const f=codec.encode(game);
    if(!frameDue(s.shared,f,now,hz))return;
    const m={t:'scr',screen:s.info.id,app,n:++this.frameSeq,f};
    if(this.net.screen(m)){s.shared={f,at:now};this.screenStats.sent++;this.screenStats.sentBytes+=JSON.stringify(m).length;}
  }
  /** #2241: is the monitor inside the camera's view (an onlooker's picture is only drawn then)? The frustum is built once per update. */
  inView(mesh,camera,now){
    if(!camera)return true;
    if(this.frustumAt!==now){this.frustumAt=now;camera.updateMatrixWorld();this.viewProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);this.frustum.setFromProjectionMatrix(this.viewProjection);}
    return this.frustum.intersectsObject(mesh);
  }
  receiveSnake(m){
    if(m.k==='state') {this.previous=this.arena;this.arena=m.s;this.receivedAt=performance.now();const mine=this.arena?.snakes.find(s=>s.id===this.net?.id()&&s.alive&&s.screen===this.pendingScreen);if(mine){this.angle=mine.angle;this.pendingScreen=null;}const dead=!!this.arena?.snakes.some(s=>s.id===this.net?.id()&&!s.alive);if(dead&&!this.wasDead)setTimeout(()=>this.boards?.refresh('ormstriden',true).then(()=>{for(const s of this.sessions.values())this.controls(s);}),GAME_BOARDS.refreshMs);this.wasDead=dead;for(const s of this.sessions.values()){s.joining=false;this.controls(s);}}
    else if(m.k==='no')for(const s of this.sessions.values())if(s.player.open){s.joining=false;s.score.textContent=({wait:'Vänta ett ögonblick och försök igen.',away:'Gå närmare datorn.',owner:'Någon annan styr datorn.',join:'Gå med i spelet igen.',app:'Välj Spel först.'})[m.why]??'Spelet kunde inte nås.';}
  }
  controls(s){
    const p=s.player,app=p.state?.app??'menu',mine=this.arena?.snakes.find(a=>a.id===this.net?.id()&&a.screen===s.info.id);
    const wasWorld=s.inWorld;
    this.worldMode(s,GAME_APPS.includes(app)&&p.open&&p.owns);
    if(wasWorld&&!s.inWorld&&p.open){p.el.close();p.el.showModal();}
    s.movie.hidden=app!=='youtube';s.game.hidden=app!=='snake';
    if(app==='youtube'&&s.lastApp!==app&&p.owns&&p.open&&p.searchEndpoint)p.search('animerad kortfilm',true);
    const entered=s.lastApp!==app;s.lastApp=app;
    this.arcadeControls(s,app,entered);
    if(app==='snake'){if(entered&&p.inside)this.loadTop(s,'ormstriden');this.renderTop(s.snakeTop,s.snakeTopTitle,'ormstriden');}
    for(const b of s.nav.children){b.disabled=!p.owns;b.setAttribute('aria-pressed',String(b.dataset.app===app));}
    if(s.claim){s.claim.hidden=p.owns;s.claim.disabled=!p.connected||!!p.state?.owner;}
    const off=p.el.querySelector('[data-computer-power]');if(off)off.disabled=!p.connected||!s.target.isOpen||!!p.state?.owner&&!p.owns;
    s.join.disabled=!p.owns||!!mine?.alive||!!s.joining;s.join.textContent=mine&&!mine.alive?'Spela igen':'Gå med i spelet';
    for(const b of s.game.querySelectorAll('[data-angle]'))b.disabled=!p.owns||!mine?.alive;
    s.score.textContent=mine?mine.alive?`Du: ${mine.score} poäng · ${mine.length} längd · ${mine.kills} besegrade`:`Du åkte ut: ${mine.why}. Spela igen!`:'Gå med från den här datorn. Alla datorer delar samma arena.';
    s.list.textContent=(this.arena?.snakes??[]).slice().sort((a,b)=>b.score-a.score).map(a=>`${a.name}: ${a.score}${a.alive?'':' (ute)'}`).join(' · ');
  }
  stopInput(s){
    this.arcadeEnd(s);
    if(this.playing===s||s.joining){this.send({k:'leave'});this.playing=null;s.joining=false;this.pendingScreen=null;}
  }
  /** The running (or just finished) single-player game of this computer's current app, if this client plays it. */
  arcadeGame(s){const app=s.player.state?.app;return ARCADE[app]&&s.run?.app===app?s.run.game:null;}
  arcadeControls(s,app,entered){
    const def=ARCADE[app],p=s.player;s.arcade.hidden=!def;if(!def)return;
    const t=def.titles?nesTitle(s.nesTitle):null;
    const board=t?(globalThis.crypto?.subtle&&nesBoardForHash(t.sha256)):def.board;
    if(entered){
      s.arcadeTitle.textContent=t?`${def.title} · ${t.title}`:def.title;s.arcade.querySelector('.computer-about').textContent=t?t.about:def.about;s.arcadeHelp.textContent=t?`${t.controls} ${def.help}`:def.help;
      const picker=s.arcade.querySelector('.computer-nes-titles');picker.hidden=!def.titles||NES_TITLES.length<2;
      for(const b of picker.children)b.setAttribute('aria-pressed',String(b.dataset.nesTitle===nesTitle(s.nesTitle).id));
      for(const b of s.arcade.querySelectorAll('[data-pad]'))b.hidden=b.dataset.padApp!==app;
      s.arcadeTop.hidden=s.arcadeTopTitle.hidden=!board;s.arcade.querySelector('.computer-license').hidden=!def.license;s.arcade.classList.toggle('computer-nes',app==='nes');
      if(p.inside&&board)this.loadTop(s,board);
    }
    if(p.owns&&s.run?.app!==app)s.run={app,game:def.make(s),sent:true}; // the start screen with the top list
    const g=this.arcadeGame(s),running=!!g?.running&&p.owns;
    s.arcadeStart.disabled=!p.owns||running||!!g?.loading;s.arcadeStart.textContent=g?.paused?'Fortsätt':g?.over&&(board||t)?'Spela igen':'Starta';
    s.arcadeFinish.hidden=!t||!p.owns||!(running||g?.paused);
    for(const b of s.arcade.querySelectorAll('[data-pad]'))b.disabled=!running;
    for(const b of s.arcade.querySelectorAll('[data-nes-title]'))b.disabled=!p.owns||!!g?.loading;
    s.arcadeScore.textContent=def.status&&g?def.status(g,p):running?`${g.score} poäng`:g?.over?`Slut: ${g.score} poäng.`:p.owns?'Starta en omgång med knappen eller mellanslag.':p.state?.owner?`${p.state.name} spelar.`:'';
    s.shownScore=g?.score;
    if(board)this.renderTop(s.arcadeTop,s.arcadeTopTitle,board,t?.title);
  }
  arcadeStart(s){
    const app=s.player.state?.app,def=ARCADE[app],old=this.arcadeGame(s);if(!def||!s.player.owns||old?.running||old?.loading)return;
    if(old?.paused&&old.resume()){s.stepAt=performance.now();this.controls(s);return;} // #2237: a paused NES game goes on where it was
    const run=s.run={app,game:def.make(s),sent:false},started=run.game.start();s.stepAt=performance.now();this.controls(s);
    if(started?.then)started.then(()=>{if(s.run===run){s.stepAt=performance.now();s.menuKey=null;this.controls(s);}}); // (#2237: the lazy load)
  }
  /** Ends a running round (leaving, switching app, power off) and sends a finished round's result once. */
  arcadeEnd(s){
    const r=s.run;if(!r)return;const g=r.game;
    if(g.dispose){
      if(g.disposed)return;
      g.dispose();
    }else if(g.running){g.running=false;g.over=true;}
    else if(r.sent||!g.over)return;
    if(!r.sent){
      r.sent=true;
      const board=r.app==='nes'?g.reader?.game:ARCADE[r.app].board,result=g.result();
      if(board&&result?.score>0)this.boards?.submit(board,result).then(()=>this.controls(s));
    }
    this.controls(s);
  }
  arcadeInput(s,action,down){
    const g=this.arcadeGame(s);if(!g?.running||!s.player.owns)return;
    if(g.press){g.press(action,down);return;} // #2237: NES buttons are held
    if(g instanceof MeteorsGame){if(action in g.input)g.input[action]=down;return;}
    if(down)({left:()=>g.move(-1),right:()=>g.move(1),rotate:()=>g.rotate(1),soft:()=>g.down(true),hard:()=>g.hard()})[action]?.();
  }
  arcadeKey(s,code,down,repeat){
    const app=s.player.state?.app,def=ARCADE[app],g=this.arcadeGame(s);if(!def)return;
    if(code==='Space'&&down&&!g?.running){if(!repeat)this.arcadeStart(s);return;}
    if(code==='KeyP'&&down&&!repeat&&g?.pause){if(!g.pause())this.arcadeStart(s);else this.controls(s);return;} // #2237
    const action=def.keys[code];if(!action||down&&repeat&&(action==='rotate'||action==='hard'))return;
    this.arcadeInput(s,action,down);
  }
  loadTop(s,board){this.boards?.refresh(board).then(()=>this.controls(s));}
  renderTop(list,title,board,cartridge){
    if(!list||!this.boards)return;
    const key=`${this.boards.version}:${board}:${this.boards.global(board)}`;if(list.dataset.key===key)return;list.dataset.key=key;
    const top=this.boards.top(board);const heading=this.boards.global(board)?'Topplista':'Dina bästa omgångar (lokalt)';
    title.textContent=cartridge?`${heading} · ${cartridge} · ${NES_BOARDS[board].label} (klientrapporterade resultat)`:heading;
    list.replaceChildren(...(top.length?top:[null]).map(r=>{const li=document.createElement('li');if(!r){li.textContent='Inga resultat än';return li;}
      if(r.me)li.className='me';li.append(portraitThumb(r.avatar,18),document.createTextNode(`${r.name||'Anonym'}: ${r.score}`));return li;})); // #1585: avatar thumbnail, name as text
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
      const arcade=this.arcadeGame(s);
      if(arcade?.running){if(inside&&p.open&&p.owns&&nearComputer(id,this.position))arcade.step(now-(s.stepAt??now));s.stepAt=now;if(p.open&&s.shownScore!==arcade.score){s.shownScore=arcade.score;s.arcadeScore.textContent=ARCADE[s.run.app].status?.(arcade,p)??`${arcade.score} poäng`;}}
      if(s.run&&s.run.game.over&&!s.run.sent)this.arcadeEnd(s);
      if(arcade&&inside&&p.owns&&s.target.isOpen)this.shareFrame(s,arcade,now); // #2241
      if(!inside&&s.feed.data)s.feed.clear(); // (an onlooker who leaves stops; the room stops sending too)
      if(!inside||!s.target.isOpen)continue;
      if(now-(s.renderAt??0)>=(ARCADE[p.state?.app]?.renderMs??SNAKE.renderMs)){
        s.renderAt=now;const blend=Math.min(1,(now-(this.receivedAt??0))/SNAKE.inputMs);
        const def=ARCADE[p.state?.app];let live=false;
        if(p.state?.app==='snake'){
          const mine=this.arena?.snakes.find(a=>a.id===this.net?.id()&&a.screen===id),between=!this.arena?.snakes.length||mine&&!mine.alive;
          drawSnake(s.poster,this.arena,this.net?.id(),s.info.color,this.previous,blend,between?this.boards?.top('ormstriden'):null);
        }else if(def){
          // The player's own game is redrawn while it runs; start/end screens and others' "spelar" card only on change.
          // #2241: an onlooker draws the controller's newest snapshot with the same function, once per new snapshot and only while the
          // monitor is in view (phones at most lowMemoryHz); without a fresh one (none yet, or staleMs passed) the card.
          const own=p.owns&&arcade,remote=!own&&s.feed.current(now,p.state.owner,p.state.app),key=own?`own:${p.state.app}:${arcade.over}:${arcade.phase??''}:${this.boards?.version}`:`card:${p.state.app}:${p.state.name}:${this.boards?.version}`;
          live=!!(own&&arcade.running);
          if(remote){
            if(s.feedDrawn!==s.feed.version&&now-(s.feedAt??-Infinity)>=(this.lowMemory?1000/SCREEN_SHARE.lowMemoryHz:0)&&this.inView(s.target.mesh,camera,now)){
              def.draw(s.poster,SCREEN_CODECS[p.state.app].view(remote),s.info.color,this.boards?.top(def.board)??[],p.state.name);s.feedDrawn=s.feed.version;s.feedAt=now;s.menuKey=`feed:${s.feed.version}`;
            }
          }else if(live||s.menuKey!==key){if(own)def.draw(s.poster,arcade,s.info.color,def.board?this.boards?.top(def.board)??[]:[],this.boards?.name());else drawArcadeCard(s.poster,def.title,p.state.owner?p.state.name:'',def.board?this.boards?.top(def.board)??[]:null,s.info.color);s.menuKey=key;}
        }else if(!p.state?.video&&s.menuKey!==`${p.state?.q}`){drawComputerMenu(s.poster,s.info,p.state?.app,p.state?.name);s.menuKey=`${p.state?.q}`;}
        if(p.state?.app==='snake'||live||s.drawnMenu!==s.menuKey){s.texture.needsUpdate=true;s.drawnMenu=s.menuKey;}
      }
    }
    if(!any){this.arena=null;this.previous=null;this.arenaConnection=null;}
  }
}

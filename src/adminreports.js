import { reportOwnImages, reportImagesFit, reportImageBytes } from './reportattachments.js';
import { reportPlayerName } from './reportauthor.js';
import { REPORTS, CLOUD_URL } from './config.js';
import { cloudUrl } from './cloud.js';
import { isPrivateCode } from './privatecodes.js';
import { prepareReportPhoto } from './reportphoto.js';

// Match the existing console parser for both direct codes and the optional masked field.
const normalizeCode = text => text.trim().replace(/^\//, '').trim().toLowerCase().replace(/\s+/g, ' ');

// Admin and furniture editing share one in-memory session on this page.
export class AdminReports {
  constructor({ form, input, message, panel, password, login, cancel, menu, reportPanel, reportInput, reportStatus, help = () => '', changed = () => {}, capture = () => Promise.reject(Error('capture unavailable')), playerName = () => '' }, url = cloudUrl()) {
    Object.assign(this,{form,input,message,panel,password,login,cancel,menu,reportPanel,reportInput,reportStatus,help,changed,capture,playerName,url});
    // The public cloud debug override must never redirect an admin code to an arbitrary host.
    const loopback = value => ['localhost','127.0.0.1'].includes(value);
    try {
      const endpoint=new URL(url);
      if (url !== CLOUD_URL.replace(/\/+$/,'') && !(loopback(location.hostname) && loopback(endpoint.hostname) && endpoint.protocol==='http:' && endpoint.pathname==='/')) this.url='';
    } catch { this.url=''; }
    this.token='';this.expires=0;this.pending=null;this.busy=false;this.epoch=0;this.photos=[];this.photoJob=0;this.photoJobs=0;this.photoQueue=Promise.resolve();
    form.addEventListener('submit',e=>{
      const code=normalizeCode(input.value);
      if(isPrivateCode(code)){
        e.preventDefault();e.stopImmediatePropagation();input.value='';
        this.signIn(code);return;
      }
      if(/^\s*\/?help\s*$/i.test(input.value)){
        e.preventDefault();e.stopImmediatePropagation();
        this.say([this.help(),this.active?'Välj Rapportera eller Möblera under textfältet.':''].filter(Boolean).join('\n'));input.value='';return;
      }
      const match=/^\s*\/(admin|rapport|loggaut)(?:\s+([\s\S]*))?$/i.exec(input.value);
      if(!match)return;
      // Stop before the normal multiplayer/cheat listener, including when unauthenticated.
      e.preventDefault();e.stopImmediatePropagation();
      this.command(match[1].toLowerCase(),match[2]??'');
    },true);
    input.addEventListener('paste',e=>{
      const next=input.value.slice(0,input.selectionStart)+(e.clipboardData?.getData('text')??'')+input.value.slice(input.selectionEnd);
      if(/^\s*\/rapport\b/i.test(next))input.maxLength=REPORTS.maxChars+10;
    });
    if(menu){
      this.reportInput.maxLength=REPORTS.maxChars;
      menu.querySelector('#admin-report-open').addEventListener('click',()=>this.openReport());
      reportPanel.querySelector('form').addEventListener('submit',e=>{e.preventDefault();this.command('rapport',reportInput.value,reportInput);});
      reportPanel.addEventListener('cancel',e=>{e.preventDefault();this.closeReport();});
      // Keep normal text editing inside the native modal, away from gameplay keys.
      reportPanel.addEventListener('keydown',e=>e.stopPropagation());
      reportPanel.addEventListener('keyup',e=>e.stopPropagation());
      reportPanel.querySelector('#admin-report-cancel').addEventListener('click',()=>this.closeReport());
      this.photoSetup(reportPanel);
      // #1226: a tap on a field that already has focus but no keyboard (iOS after the camera sheet) re-focuses it inside the tap.
      reportInput.addEventListener('pointerup',e=>{if(e.pointerType==='mouse'||document.activeElement!==reportInput)return;reportInput.blur();reportInput.focus();});
    }
    login.addEventListener('click',()=>this.signIn());
    cancel.addEventListener('click',()=>{this.logout();this.closeLogin();});
    password.addEventListener('keydown',e=>{
      if(e.key==='Enter'){e.preventDefault();e.stopPropagation();this.signIn();}
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();this.logout();this.closeLogin();}
    });
    addEventListener('pagehide',()=>{this.logout();this.closeLogin();});
  }
  // #1841: additive atomic batches, with one removable preview per own picture.
  photoSetup(panel){
    const file=panel.querySelector('#admin-report-file');if(!file)return;
    this.photoEls={file,preview:panel.querySelector('#admin-report-preview')};
    panel.querySelector('#admin-report-camera').addEventListener('click',()=>{file.value='';file.click();});
    file.addEventListener('change',()=>{const files=[...(file.files??[])];file.value='';if(files.length)this.choosePhotos(files);else this.restoreFocus();});
    const files=e=>[...(e.dataTransfer?.types??[])].includes('Files');
    panel.addEventListener('dragover',e=>{if(!files(e))return;e.preventDefault();e.dataTransfer.dropEffect='copy';panel.classList.add('dragging');});
    panel.addEventListener('dragleave',e=>{if(!panel.contains(e.relatedTarget))panel.classList.remove('dragging');});
    panel.addEventListener('drop',e=>{if(!files(e))return;e.preventDefault();panel.classList.remove('dragging');this.choosePhotos([...(e.dataTransfer.files??[])]);});
  }
  get photo(){return this.photos[0]?.image??null;}
  get photoBusy(){return this.photoJobs>0;}
  choosePhoto(file){return this.choosePhotos([file]);}
  choosePhotos(files){
    const job=this.photoJob;this.photoJobs++;
    const run=async()=>{
      if(job!==this.photoJob)return;
      this.reportStatus.textContent='Förbereder bilderna…';
      try{
        if(this.photos.length+files.length>REPORTS.photoCount)throw Object.assign(Error(),{code:'count'});
        const prepared=[];
        for(const file of files)prepared.push({id:crypto.randomUUID(),name:file.name||'Egen bild',image:await prepareReportPhoto(file)});
        if(job!==this.photoJob)return;
        if(!reportImagesFit(reportOwnImages(this.photos.concat(prepared).map(p=>p.image))))throw Object.assign(Error(),{code:'total'});
        this.photos=this.photos.concat(prepared);this.renderPhotos();
        this.reportStatus.textContent=`${prepared.length} bild${prepared.length===1?'':'er'} tillagd${prepared.length===1?'':'a'}. ${this.photos.length} av ${REPORTS.photoCount} egna bilder; spelbilden tillkommer.`;
      }catch(error){
        if(job!==this.photoJob)return;
        const messages={count:`Högst ${REPORTS.photoCount} egna bilder. Inga bilder i detta val lades till.`,size:'En originalfil är större än 20 MiB. Välj en mindre fil.',type:'En fil är ingen bild. Välj bara bildfiler.',format:'Ett bildformat stöds inte. Välj JPEG eller PNG.',total:'Bilderna överskrider 800 KiB totalt. Välj färre eller mindre bilder.'};
        this.reportStatus.textContent=(messages[error?.code]||'Bilderna kunde inte förberedas.')+' Tidigare bilder och rapporttexten finns kvar.';
      }finally{this.restoreFocus();}
    };
    this.photoQueue=this.photoQueue.then(run).finally(()=>this.photoJobs--);return this.photoQueue;
  }
  renderPhotos(){
    const els=this.photoEls;if(!els)return;els.preview.replaceChildren();els.preview.hidden=!this.photos.length;
    this.photos.forEach((photo,i)=>{
      const figure=document.createElement('figure'),img=document.createElement('img'),caption=document.createElement('figcaption'),name=document.createElement('span'),remove=document.createElement('button');
      figure.setAttribute('role','listitem');img.src=photo.image;img.alt=`Bild ${i+1}: ${photo.name}`;if(i===0)img.id='admin-report-preview-img';
      name.textContent=`${i+1}. ${photo.name}`;remove.type='button';remove.textContent='Ta bort';remove.setAttribute('aria-label',`Ta bort bild ${i+1}`);if(i===0)remove.id='admin-report-photo-remove';
      remove.addEventListener('click',()=>{this.photos=this.photos.filter(p=>p.id!==photo.id);this.renderPhotos();this.reportStatus.textContent=`Bilden är borttagen. ${this.photos.length} egna bilder kvar; spelbilden följer med.`;this.reportPanel.querySelector('#admin-report-camera').focus();});
      caption.append(name,remove);figure.append(img,caption);els.preview.append(figure);
    });
    const count=this.reportPanel.querySelector('#admin-report-photo-count');if(count)count.textContent=`${this.photos.length}/${REPORTS.photoCount} egna bilder · ${Math.ceil(reportImageBytes(reportOwnImages(this.photos.map(p=>p.image)))/1024)} KiB före spelbilden`;
  }
  // #1226: back from the camera. A script focus() outside a tap never raises the iOS keyboard and leaves the field
  // "already focused", so the next real tap does nothing. On touch screens the field is therefore left unfocused (a tap
  // opens the keyboard normally); with a keyboard/mouse it is focused as before (#1214).
  restoreFocus(){
    const t=this.reportInput;if(!t||!this.reportPanel?.open)return;
    if(matchMedia('(pointer: coarse)').matches){if(document.activeElement===t)t.blur();}else t.focus();
  }
  setPhoto(image){this.photoJob++;this.photos=image?[{id:crypto.randomUUID(),name:'Egen bild',image}]:[];this.renderPhotos();}
  get active(){return !!this.token&&Date.now()<this.expires;}
  say(text){this.message.textContent=text;if(this.reportPanel?.open&&this.reportStatus)this.reportStatus.textContent=text;}
  closeLogin(){this.password.value='';this.panel.hidden=true;this.input.focus();}
  closeReport(){
    if(!this.reportPanel?.open)return;
    this.reportPanel.close();
    const button=this.menu.querySelector('#admin-report-open');
    if(this.active&&!this.menu.hidden)button.focus();else this.input.focus();
  }
  openReport(){
    if(!this.active){this.logout();this.say('Skriv din adminkod i chatten igen.');return;}
    if(!this.reportPanel||this.reportPanel.open)return;
    this.reportPanel.showModal();this.reportInput.focus();
  }
  menuState(){if(this.menu)this.menu.hidden=!this.active;}
  logout(){this.epoch++;this.loginRequest?.abort();this.busy=false;this.login.disabled=false;clearTimeout(this.expiryTimer);this.token='';this.expires=0;this.closeReport();this.menuState();this.changed(false);}
  async signIn(suppliedCode){
    const code=normalizeCode(typeof suppliedCode==='string'?suppliedCode:this.password.value);this.password.value='';
    if(this.busy)return;
    if(!this.url){this.say('Rapportering är inte ansluten.');return;}
    this.busy=true;this.login.disabled=true;const epoch=++this.epoch;
    this.loginRequest=new AbortController();
    try{
      const r=await fetch(this.url+'/report-session',{redirect:'error',signal:this.loginRequest.signal,method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});
      if(epoch!==this.epoch)return;
      if(!r.ok){this.say(r.status===503?'Adminrapportering är inte aktiverad på servern.':r.status===429?'Vänta en minut innan nästa inloggningsförsök.':'Inloggningen misslyckades.');return;}
      const data=await r.json();
      if(typeof data.token!=='string'||!Number.isFinite(data.expires)||data.expires<=Date.now())throw Error('session');
      if(epoch!==this.epoch)return;
      this.token=data.token;this.expires=data.expires;
      clearTimeout(this.expiryTimer);this.expiryTimer=setTimeout(()=>{this.logout();this.say('Adminsessionen har gått ut. Skriv din adminkod i chatten igen.');},data.expires-Date.now());
      this.closeLogin();this.menuState();this.changed(true);
      this.say('Välj Rapportera eller Möblera under textfältet.');
    }catch{if(epoch===this.epoch)this.say('Kunde inte ansluta. Försök igen.');}
    finally{if(epoch===this.epoch){this.busy=false;this.login.disabled=false;}}
  }
  async command(command,text,source=this.input){
    if(command==='admin'){
      if(this.active){this.say('Du är inloggad. Välj Rapportera i adminmenyn.');return;}
      this.panel.hidden=false;this.password.focus();this.input.value='';this.say('Ange din adminkod för att öppna adminläget.');return;
    }
    if(command==='loggaut'){this.logout();this.closeLogin();this.input.value='';this.say('Adminläget är utloggat.');return;}
    if(!this.active){this.logout();this.say('Skriv din adminkod i chatten innan du rapporterar.');return;}
    if(this.busy){this.say('Vänta tills den pågående begäran är klar.');return;}
    if(!text.trim()||text.length>REPORTS.maxChars){this.say(`Skriv 1–${REPORTS.maxChars} tecken i rapporten.`);return;}
    if(this.photoBusy&&source===this.reportInput){this.say('Vänta tills bilderna är klara.');return;}
    // Freeze one submission snapshot; edits/new selections in flight remain a separate draft.
    const selected=source===this.reportInput?this.photos:[],key=selected.map(p=>p.id).join(',');
    if(!this.pending||this.pending.text!==text||this.pending.photoKey!==key)this.pending={id:crypto.randomUUID(),text,photoKey:key,selected:selected.slice(),...reportOwnImages(selected.map(p=>p.image)),playerName:reportPlayerName(this.playerName())};
    const pending=this.pending, draft=source.value, epoch=this.epoch;this.busy=true;
    try{
      if(!pending.image){
        this.say('Tar en bild av spelvyn…');
        try{pending.image=await this.capture();}
        catch{if(epoch===this.epoch)this.say('Kunde inte ta bilden. Försök igen; texten finns kvar.');return;}
      }
      if(epoch!==this.epoch||!this.active)return;
      const payload={text,playerName:pending.playerName,image:pending.image,...(pending.photo?{photo:pending.photo}:{}),...(pending.photos?.length?{photos:pending.photos}:{})};
      if(!reportImagesFit(payload)||new TextEncoder().encode(JSON.stringify(payload)).length>REPORTS.putBytes){this.say('Rapportens bilder överskrider 800 KiB totalt inklusive spelbilden. Ta bort en bild och försök igen; text och bilder finns kvar.');return;}
      const r=await fetch(this.url+(pending.photos?.length?'/reports/v3/':'/reports/')+pending.id,{redirect:'error',method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+this.token},body:JSON.stringify(payload)});
      if(epoch!==this.epoch)return;
      if(r.status===403){this.logout();this.say('Adminsessionen har gått ut. Skriv din adminkod i chatten igen.');return;}
      if(!r.ok){const issue=await r.json().catch(()=>null);const outdated=pending.photos?.length&&([404,405].includes(r.status)||(r.status===400&&issue?.error==='id'));this.say(outdated?'Servern behöver uppdateras för flera bilder. Text och bilder finns kvar.':r.status===429?'Vänta en minut och skicka rapporten igen.':r.status===413?'Rapporten är för stor. Ta bort en bild; text och bilder finns kvar.':'Rapporten kunde inte sparas. Text och bilder finns kvar.');return;}
      if(this.pending===pending)this.pending=null;
      // Preserve any new draft typed while the request was in flight.
      if(source.value===draft)source.value='';
      const sent=new Set(pending.selected.map(p=>p.id));this.photos=this.photos.filter(p=>!sent.has(p.id));this.renderPhotos();
      this.say(`Rapporten med ${1+pending.selected.length} bild${pending.selected.length?'er':''} är sparad och väntar på granskning.`);
    }catch{if(epoch===this.epoch)this.say('Rapporten kunde inte skickas. Försök igen; texten finns kvar.');}
    finally{if(epoch===this.epoch)this.busy=false;}
  }
}

import { REPORTS, CLOUD_URL } from './config.js';
import { cloudUrl } from './cloud.js';
import { isPrivateCode } from './privatecodes.js';
import { prepareReportPhoto } from './reportphoto.js';

// Match the existing console parser for both direct codes and the optional masked field.
const normalizeCode = text => text.trim().replace(/^\//, '').trim().toLowerCase().replace(/\s+/g, ' ');

// Admin and furniture editing share one in-memory session on this page.
export class AdminReports {
  constructor({ form, input, message, panel, password, login, cancel, menu, reportPanel, reportInput, reportStatus, help = () => '', changed = () => {}, capture = () => Promise.reject(Error('capture unavailable')) }, url = cloudUrl()) {
    Object.assign(this,{form,input,message,panel,password,login,cancel,menu,reportPanel,reportInput,reportStatus,help,changed,capture,url});
    // The public cloud debug override must never redirect an admin code to an arbitrary host.
    const loopback = value => ['localhost','127.0.0.1'].includes(value);
    try {
      const endpoint=new URL(url);
      if (url !== CLOUD_URL.replace(/\/+$/,'') && !(loopback(location.hostname) && loopback(endpoint.hostname) && endpoint.protocol==='http:' && endpoint.pathname==='/')) this.url='';
    } catch { this.url=''; }
    this.token='';this.expires=0;this.pending=null;this.busy=false;this.epoch=0;this.photo=null;this.photoJob=0;
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
    }
    login.addEventListener('click',()=>this.signIn());
    cancel.addEventListener('click',()=>{this.logout();this.closeLogin();});
    password.addEventListener('keydown',e=>{
      if(e.key==='Enter'){e.preventDefault();e.stopPropagation();this.signIn();}
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();this.logout();this.closeLogin();}
    });
    addEventListener('pagehide',()=>{this.logout();this.closeLogin();});
  }
  // #1181: camera/file input and desktop drag and drop; the chosen photo goes beside the screenshot (#1182).
  photoSetup(panel){
    const file=panel.querySelector('#admin-report-file');if(!file)return;
    this.photoEls={file,preview:panel.querySelector('#admin-report-preview'),img:panel.querySelector('#admin-report-preview-img')};
    const pick=()=>{file.value='';file.click();};
    panel.querySelector('#admin-report-camera').addEventListener('click',pick);
    panel.querySelector('#admin-report-photo-change').addEventListener('click',pick);
    panel.querySelector('#admin-report-photo-remove').addEventListener('click',()=>{this.setPhoto(null);this.reportStatus.textContent='Fotot är borttaget. Bara bilden av spelvyn följer med.';panel.querySelector('#admin-report-camera').focus();});
    file.addEventListener('change',()=>{const f=file.files?.[0];file.value='';if(f)this.choosePhoto(f);else this.reportInput?.focus();});
    const files=e=>[...(e.dataTransfer?.types??[])].includes('Files');
    panel.addEventListener('dragover',e=>{if(!files(e))return;e.preventDefault();e.dataTransfer.dropEffect='copy';panel.classList.add('dragging');});
    panel.addEventListener('dragleave',e=>{if(!panel.contains(e.relatedTarget))panel.classList.remove('dragging');});
    panel.addEventListener('drop',e=>{if(!files(e))return;e.preventDefault();panel.classList.remove('dragging');const f=e.dataTransfer.files?.[0];if(f)this.choosePhoto(f);});
  }
  async choosePhoto(file){
    const job=++this.photoJob;this.photoBusy=true;this.reportStatus.textContent='Förbereder fotot…';
    try{
      const image=await prepareReportPhoto(file);
      if(job!==this.photoJob)return;
      this.setPhoto(image);this.reportStatus.textContent='Fotot skickas med rapporten tillsammans med bilden av spelvyn.';
      this.reportInput?.focus();
    }catch(error){
      if(job!==this.photoJob)return;
      this.reportStatus.textContent=error?.code==='type'?'Filen är ingen bild. Välj en bild eller ta ett foto.':error?.code==='format'?'Bildformatet stöds inte av webbläsaren. Välj en JPEG- eller PNG-bild.':'Fotot kunde inte förberedas. Försök med en annan bild.';
      this.reportInput?.focus();
    }finally{if(job===this.photoJob)this.photoBusy=false;}
  }
  setPhoto(image){
    this.photo=image;const els=this.photoEls;if(!els)return;
    els.preview.hidden=!image;if(image)els.img.src=image;else els.img.removeAttribute('src');
  }
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
    if(this.photoBusy&&source===this.reportInput){this.say('Vänta tills fotot är klart.');return;}
    // A chosen photo belongs to the report popup; legacy chat /rapport keeps the screenshot.
    const photo=source===this.reportInput?this.photo:null;
    if(!this.pending||this.pending.text!==text||this.pending.photo!==photo)this.pending={id:crypto.randomUUID(),text,photo};
    const pending=this.pending, draft=source.value, epoch=this.epoch;this.busy=true;
    try{
      if(!pending.image){
        this.say('Tar en bild av spelvyn…');
        try{pending.image=await this.capture();}
        catch{if(epoch===this.epoch)this.say('Kunde inte ta bilden. Försök igen; texten finns kvar.');return;}
      }
      if(epoch!==this.epoch||!this.active)return;
      const r=await fetch(this.url+'/reports/'+pending.id,{redirect:'error',method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+this.token},body:JSON.stringify({text,image:pending.image,...(pending.photo?{photo:pending.photo}:{})})});
      if(epoch!==this.epoch)return;
      if(r.status===403){this.logout();this.say('Adminsessionen har gått ut. Skriv din adminkod i chatten igen.');return;}
      if(!r.ok){this.say(r.status===429?'Vänta en minut och skicka rapporten igen.':'Rapporten kunde inte sparas. Texten finns kvar.');return;}
      if(this.pending===pending)this.pending=null;
      // Preserve any new draft typed while the request was in flight.
      if(source.value===draft)source.value='';
      if(photo&&this.photo===photo)this.setPhoto(null);
      this.say(photo?'Rapporten med foto och bild är sparad och väntar på granskning.':'Rapporten med bild är sparad och väntar på granskning.');
    }catch{if(epoch===this.epoch)this.say('Rapporten kunde inte skickas. Försök igen; texten finns kvar.');}
    finally{if(epoch===this.epoch)this.busy=false;}
  }
}

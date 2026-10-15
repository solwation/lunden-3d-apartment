import { REPORTS, CLOUD_URL } from './config.js';
import { cloudUrl } from './cloud.js';
import { isPrivateCode } from './privatecodes.js';

// Match the existing console parser for both direct codes and the optional masked field.
const normalizeCode = text => text.trim().replace(/^\//, '').trim().toLowerCase().replace(/\s+/g, ' ');

// Admin and furniture editing share one in-memory session on this page.
export class AdminReports {
  constructor({ form, input, message, panel, password, login, cancel, help = () => '', changed = () => {} }, url = cloudUrl()) {
    Object.assign(this,{form,input,message,panel,password,login,cancel,help,changed,url});
    // The public cloud debug override must never redirect an admin code to an arbitrary host.
    const loopback = value => ['localhost','127.0.0.1'].includes(value);
    try {
      const endpoint=new URL(url);
      if (url !== CLOUD_URL.replace(/\/+$/,'') && !(loopback(location.hostname) && loopback(endpoint.hostname) && endpoint.protocol==='http:' && endpoint.pathname==='/')) this.url='';
    } catch { this.url=''; }
    this.token='';this.expires=0;this.pending=null;this.busy=false;this.epoch=0;
    form.addEventListener('submit',e=>{
      const code=normalizeCode(input.value);
      if(isPrivateCode(code)){
        e.preventDefault();e.stopImmediatePropagation();input.value='';
        this.signIn(code);return;
      }
      if(/^\s*\/?help\s*$/i.test(input.value)){
        e.preventDefault();e.stopImmediatePropagation();
        this.say([this.help(),'/admin — öppna adminläget','/rapport text — lämna ett önskemål för granskning','/loggaut — avsluta adminläget'].filter(Boolean).join('\n'));input.value='';return;
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
    login.addEventListener('click',()=>this.signIn());
    cancel.addEventListener('click',()=>{this.logout();this.closeLogin();});
    password.addEventListener('keydown',e=>{
      if(e.key==='Enter'){e.preventDefault();e.stopPropagation();this.signIn();}
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();this.logout();this.closeLogin();}
    });
    addEventListener('pagehide',()=>{this.logout();this.closeLogin();});
  }
  get active(){return !!this.token&&Date.now()<this.expires;}
  say(text){this.message.textContent=text;}
  closeLogin(){this.password.value='';this.panel.hidden=true;this.input.focus();}
  logout(){this.epoch++;this.loginRequest?.abort();this.busy=false;this.login.disabled=false;clearTimeout(this.expiryTimer);this.token='';this.expires=0;this.changed(false);}
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
      clearTimeout(this.expiryTimer);this.expiryTimer=setTimeout(()=>{this.logout();this.say('Adminsessionen har gått ut. Logga in igen med /admin.');},data.expires-Date.now());
      this.closeLogin();this.changed(true);
      this.say('Adminläge. Skriv /rapport följt av ditt önskemål. /loggaut avslutar.');
    }catch{if(epoch===this.epoch)this.say('Kunde inte ansluta. Försök igen.');}
    finally{if(epoch===this.epoch){this.busy=false;this.login.disabled=false;}}
  }
  async command(command,text){
    if(command==='admin'){
      if(this.active){this.say('Du är inloggad. Skriv /rapport följt av ditt önskemål.');return;}
      this.panel.hidden=false;this.password.focus();this.input.value='';this.say('Ange din adminkod för att öppna adminläget.');return;
    }
    if(command==='loggaut'){this.logout();this.closeLogin();this.input.value='';this.say('Adminläget är utloggat.');return;}
    if(!this.active){this.logout();this.say('Logga in med /admin innan du rapporterar.');return;}
    if(this.busy){this.say('Vänta tills den pågående begäran är klar.');return;}
    if(!text.trim()||text.length>REPORTS.maxChars){this.say(`Skriv /rapport och 1–${REPORTS.maxChars} tecken.`);return;}
    if(!this.pending||this.pending.text!==text)this.pending={id:crypto.randomUUID(),text};
    const pending=this.pending, draft=this.input.value, epoch=this.epoch;this.busy=true;
    try{
      const r=await fetch(this.url+'/reports/'+pending.id,{redirect:'error',method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+this.token},body:JSON.stringify({text})});
      if(epoch!==this.epoch)return;
      if(r.status===403){this.logout();this.say('Adminsessionen har gått ut. Logga in igen med /admin.');return;}
      if(!r.ok){this.say(r.status===429?'Vänta en minut och skicka rapporten igen.':'Rapporten kunde inte sparas. Texten finns kvar.');return;}
      if(this.pending===pending)this.pending=null;
      // Preserve any new draft typed while the request was in flight.
      if(this.input.value===draft)this.input.value='';
      this.say('Rapporten är sparad och väntar på granskning.');
    }catch{if(epoch===this.epoch)this.say('Rapporten kunde inte skickas. Försök igen; texten finns kvar.');}
    finally{if(epoch===this.epoch)this.busy=false;}
  }
}

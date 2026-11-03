# Native follow-up for an already-open, held app after the recorded desktop pet/detail steps.
# See docs/verification/1848/README.md for the explicit fixture sequence; no fabricated discovery.
import json,time,sys
from pathlib import Path
control=Path(sys.argv[1] if len(sys.argv)>1 else '/tmp/1848-app');out=Path(sys.argv[2] if len(sys.argv)>2 else 'docs/verification/1848/app')
def wait(path,predicate,seconds=35):
 end=time.monotonic()+seconds
 while time.monotonic()<end:
  try:
   value=json.loads(path.read_text())
   if predicate(value):return value
  except (FileNotFoundError,json.JSONDecodeError):pass
  time.sleep(.05)
 raise RuntimeError('Timed out: '+str(path))
def native(**request):
 request['tag']=str(time.time_ns());Path(str(control)+'.native').write_text(json.dumps(request));result=wait(out/'native-result.json',lambda v:v.get('request',{}).get('tag')==request['tag']);assert result['ok'],result;return result
def evaluate(code):
 stamp=str(time.time_ns());Path(str(control)+'.command').write_text('(async()=>{const value=await('+code+");return {stamp:'"+stamp+"',value};})()");return wait(out/'command-result.json',lambda v:v.get('stamp')==stamp)['value']
def shot(name):
 p=out/(name+'.png');old=p.stat().st_mtime_ns if p.exists() else 0;Path(str(control)+'.shot').write_text(name);end=time.monotonic()+30
 while time.monotonic()<end:
  if p.exists() and p.stat().st_mtime_ns>old and not Path(str(control)+'.shot').exists():return
  time.sleep(.1)
 raise RuntimeError('shot timeout')
if __name__=='__main__':
 native(click='#binder-close');evaluate('(()=>{__app.step(0);return true;})()');native(click='#action');print('REOPEN',evaluate("(()=>{proof.reopenScroll=document.querySelector('.dex-body').scrollTop;return{open:__app.binderPanel.open,scroll:proof.reopenScroll};})()"))
 native(viewport={'width':390,'height':844});native(tap='#binder-view [data-act="entry"][data-id="cat:huskatt:svartvit:adult"]');print('TOUCH',evaluate("(()=>{proof.touch={cards:[...document.querySelectorAll('.dex-card')].filter(n=>n.getClientRects().length).length,stats:document.querySelector('.dex-stats')?.textContent,photos:document.querySelectorAll('[data-act=photo]').length,width:innerWidth};document.querySelector('.dex-body').scrollTop=0;return proof.touch;})()"))
 evaluate("(async()=>{for(let i=0;i<80;i++){const n=document.querySelector('.dex-card .dex-art');if(n?.classList.contains('loaded'))return true;await new Promise(r=>setTimeout(r,50));}return false;})()")
 shot('touch-detail');evaluate("(()=>{document.querySelector('.dex-chain').scrollIntoView({block:'center'});return true;})()")
 evaluate("(async()=>{for(let i=0;i<80;i++){const b=document.querySelector('.dex-body').getBoundingClientRect(),nodes=[...document.querySelectorAll('.dex-body .dex-art')].filter(n=>{const r=n.getBoundingClientRect();return r.bottom>b.top&&r.top<b.bottom;});if(nodes.every(n=>n.classList.contains('loaded')))return true;await new Promise(r=>setTimeout(r,50));}return false;})()")
 shot('touch-statistics-chain');native(tap='#binder-view [data-act="photo"]');print('TOUCH PHOTO',evaluate("(()=>{proof.touchPhoto=!!__app.binderPanel.photo;return proof.touchPhoto;})()"));native(tap='#binder-view [data-act="photo-back"]');print('TOUCH BACK',evaluate("(()=>{proof.touchPhotoBack=!__app.binderPanel.photo&&__app.binderPanel.open;return proof.touchPhotoBack;})()"))
 result=evaluate("(()=>{proof.final={imageJobs:__app.bestiaryImages.renders,cacheHits:__app.bestiaryImages.hits,memory:__app.bestiaryImages.memory.size,pending:__app.bestiaryImages.pending.size,worldPhotos:__app.bestiaryPhotos.jobs,photoQueue:__app.bestiaryPhotos.pending.size,error:__app.bestiary.error};return proof;})()")
 for phase in ('beforePet','afterPet'):
  if phase in result and 'record' in result[phase]:
   for p in result[phase]['record']['photos']:p['bytes']=len(p.pop('data',''))
 (out/'browser.json').write_text(json.dumps(result,indent=2)+'\n');print('SAVED browser.json')

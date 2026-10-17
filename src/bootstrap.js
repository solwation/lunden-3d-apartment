import { prepareStartup } from './startup.js';
import { BUILD } from './version.js';
import { watchStartup } from './startuprecovery.js';

// Loading steps (#1130): index.html's dependency-free `__lundenLoading` (bootstrap stays small; main.js uses loadingstep.js).
const step = (name, fraction) => { try { window.__lundenLoading?.step(name, fraction); } catch { /* cosmetic */ } };
const start = await prepareStartup({status(text){step(text,0.04)}});
if(start){
  step('Hämtar programfilerna',0.06);
  const moduleURL = new URL('./main.js',import.meta.url);
  if(BUILD!=='dev') moduleURL.searchParams.set('v',BUILD);
  const recovery = watchStartup();
  try { await import(moduleURL.href); }
  catch(error) { console.error('Startup failed', error); recovery.fail(error); }
}

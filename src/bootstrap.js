import { prepareStartup } from './startup.js';
import { BUILD } from './version.js';
import { watchStartup, importWithRetry } from './startuprecovery.js';

// Loading steps (#1130): index.html's dependency-free `__lundenLoading` (bootstrap stays small; main.js uses loadingstep.js).
const step = (name, fraction) => { try { window.__lundenLoading?.step(name, fraction); } catch { /* cosmetic */ } };
const start = await prepareStartup({status(text){step(text,0.04)}});
if(start){
  step('Hämtar programfilerna',0.06);
  const moduleURL = new URL('./main.js',import.meta.url);
  if(BUILD!=='dev') moduleURL.searchParams.set('v',BUILD);
  const recovery = watchStartup();
  // #1627: a failed import is retried (new URL, fresh version check) before the error view
  try { await importWithRetry(moduleURL.href, { recheck: () => prepareStartup({status(text){step(text,0.06)}}) }); }
  catch(error) { console.error('Startup failed', error); recovery.fail(error); }
}

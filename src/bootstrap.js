import { prepareStartup } from './startup.js';
import { BUILD } from './version.js';
import { watchStartup } from './startuprecovery.js';

const title = document.querySelector('#loading h1');
const description = document.querySelector('#loading p');
const start = await prepareStartup({status(text){if(title)title.textContent=text;if(description)description.textContent='Förbereder starten.'}});
if(start){
  if(title)title.textContent='Laddar lägenheten…';
  if(description)description.textContent='Förbereder 3D-modellen och planritningen.';
  const moduleURL = new URL('./main.js',import.meta.url);
  if(BUILD!=='dev') moduleURL.searchParams.set('v',BUILD);
  const recovery = watchStartup();
  try { await import(moduleURL.href); }
  catch(error) { console.error('Startup failed', error); recovery.fail(error); }
}

import { BUILD, CONTENT, isNewer } from './version.js';

const KEY = 'lunden.startupUpdate';
const LIMIT = 2500;

/** Check a published build before importing the scene. Bounded failures keep the working local build. */
export async function prepareStartup({
  local = { version: BUILD, content: CONTENT }, fetcher = globalThis.fetch,
  url = location.href, storage, navigate = u => location.replace(u),
  serviceWorker = navigator.serviceWorker, timeout = LIMIT, status = () => {},
} = {}) {
  if(local.version === 'dev') return true;
  if(storage===undefined) { try{storage=globalThis.sessionStorage}catch{/* blocked storage: URL guard */} }
  status('Kontrollerar version…');
  const controller = new AbortController();
  let timer;
  const work = async () => {
    try {
      const versionURL = new URL('version.json',url); versionURL.searchParams.set('t',Date.now());
      const response = await fetcher(versionURL.href,{cache:'no-store',signal:controller.signal});
      if(!response.ok) return true;
      const remote = await response.json();
      if(!isNewer(remote,local)) return true;
      const next = new URL(url); next.searchParams.set('v',remote.version);
      // URL guard also works when session storage is unavailable. Never retry the same navigation.
      if(new URL(url).searchParams.get('v')===remote.version) return true;
      try {
        const last=JSON.parse(storage?.getItem(KEY)||'null');
        if(last?.version===remote.version && Date.now()-last.at<300_000) return true;
      }catch{/* storage may be disabled */}
      status('Hämtar uppdateringen…');
      // Check the cheap HTML first: a half-published deploy must not reload a completed old scene.
      const page = await fetcher(next.href,{cache:'no-store',signal:controller.signal});
      if(!page.ok) return true;
      const html = await page.text();
      const stamp = html.match(/src="src\/(?:bootstrap|main)\.js\?v=([^"&]+)"/)?.[1];
      if(stamp!==remote.version || controller.signal.aborted) return true;
      // This project has no service worker. Retire a legacy registration for this app before navigation,
      // so it cannot keep serving an obsolete cached shell. Browser caches are bypassed by the build URL.
      if(serviceWorker) {
        const registration = await serviceWorker.getRegistration(new URL('./',url).href);
        if(registration?.scope===new URL('./',url).href) await registration.unregister();
      }
      if(controller.signal.aborted) return true;
      try{storage?.setItem(KEY,JSON.stringify({version:remote.version,at:Date.now()}))}catch{/* URL guard remains */}
      status('Startar den nya versionen…');
      navigate(next.href);
      return false; // Do not fetch/import the expensive scene on the outgoing page.
    }catch{return true}
  };
  try {
    return await Promise.race([work(),new Promise(resolve=>{timer=setTimeout(()=>{controller.abort();resolve(true)},timeout)})]);
  }finally{clearTimeout(timer)}
}

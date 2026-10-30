// #1367: shared fixture defaults for tests that evaluate verbatim excerpts of src/main.js (use/click/updateFocus ...).
// Those excerpts read module-level bindings that main.js declares elsewhere (paddock, playroom, lightModes ...). A test
// that does not set one gets a ReferenceError every time main.js grows a new global, so ALL such tests install this
// one list instead of stubbing per file. Defaults are installed only when the name is not already defined, and a test's
// own (richer) stand-ins assigned afterwards always win. When a new main.js global breaks the excerpts, add it HERE once.
const DEFAULTS = {
  binderFreed: 'false',                  // cat binder intentionally frees pointer lock (#1255)
  slideRide: '{active:false,cancel:()=>false,begin:()=>false,savePlace:()=>null}', // #1414: transient slide excerpts
  paddock: 'null',                       // main.js: `nopaddock` -> null (no ponies)
  playroom: '{inside:false,devices:{cinemaTarget:null},music:{dancing:false},billiards:{cancelCharge(){}}}', // #1544: updateFocus compares focus with the cinema target; #1653: state callback reads music.dancing (#1636), Esc calls billiards.cancelCharge (#1637)
  cinema: '{state:null}',
  computerHub: '{sessions:new Map()}',
  SOUNDS: '{}',
  ringBell: '()=>false',
  santa: '{visible:false,pickable:{}}',  // #1544: updateFocus offers santa.pickable only while visible
  santaDelivery: 'null',
  santaTV: '{tv:null,active:false,activate:()=>false}',
  djInput: '{key:()=>false}',            // #1713: DJ booth input (#1664); the key handler asks it first
  binoculars: '{zoomed:false,lookScale:()=>1,fov:f=>f,setZoom(){}}', // #1706: updateFocus/look read the binoculars from the mailbox
  tvMedia: '{seekable:()=>false,show(){},power(){}}',
  remote: '{findTv:()=>null,seek(){},update(){}}', // #1653: the key handler / updateFocus compare heldItem() with the TV remote
  lightModes: '{page:"top",rows:()=>[],release(){},update(){}}',
};
// DOM elements main.js looks up at load: the init script runs before the DOM exists, so they resolve lazily (a test's own
// assignment replaces the getter).
const ELEMENTS = { bellBtn: 'bell-btn', remoteSeekControls: 'remote-seek' }; // #1544: updateFocus reads remoteSeekControls
const initScript = '(()=>{for(const [k,id] of Object.entries(' + JSON.stringify(ELEMENTS) + '))if(!(k in window))Object.defineProperty(window,k,{configurable:true,get:()=>document.getElementById(id),set(v){Object.defineProperty(window,k,{value:v,writable:true,configurable:true});}});const d={' + Object.entries(DEFAULTS).map(([k, v]) => `${k}:()=>(${v})`).join(',') + '};' +
  'for(const k in d)if(!(k in window))try{window[k]=d[k]();}catch(e){window[k]=null;}})();';
// Functions main.js imports from modules cannot be stubbed before load; the real ones are imported once the page is up.
const IMPORTS = { fitChoiceLabels: '/src/hudicons.js', REACT: '/src/config.js' }; // REACT: #1639 key handler
async function installMainImports(page) {
  await page.evaluate(async imports => { for (const [k, url] of Object.entries(imports)) if (!(k in window)) window[k] = (await import(url))[k]; }, IMPORTS);
}
// Call right after newPage() and before page.goto(); call installMainImports(page) after goto: defaults exist before any test setup runs (and again after reloads).
async function installMainGlobals(page) { await page.addInitScript(initScript); }
module.exports = { DEFAULTS, ELEMENTS, IMPORTS, installMainImports, initScript, installMainGlobals };

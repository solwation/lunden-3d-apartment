// #1367: shared fixture defaults for tests that evaluate verbatim excerpts of src/main.js (use/click/updateFocus ...).
// Those excerpts read module-level bindings that main.js declares elsewhere (paddock, playroom, lightModes ...). A test
// that does not set one gets a ReferenceError every time main.js grows a new global, so ALL such tests install this
// one list instead of stubbing per file. Defaults are installed only when the name is not already defined, and a test's
// own (richer) stand-ins assigned afterwards always win. When a new main.js global breaks the excerpts, add it HERE once.
const DEFAULTS = {
  binderFreed: 'false',                  // cat binder intentionally frees pointer lock (#1255)
  paddock: 'null',                       // main.js: `nopaddock` -> null (no ponies)
  playroom: '{inside:false}',
  SOUNDS: '{}',
  ringBell: '()=>false',
  lightModes: '{page:"top",rows:()=>[],release(){},update(){}}',
};
// DOM elements main.js looks up at load: the init script runs before the DOM exists, so they resolve lazily (a test's own
// assignment replaces the getter).
const ELEMENTS = { bellBtn: 'bell-btn' };
const initScript = '(()=>{for(const [k,id] of Object.entries(' + JSON.stringify(ELEMENTS) + '))if(!(k in window))Object.defineProperty(window,k,{configurable:true,get:()=>document.getElementById(id),set(v){Object.defineProperty(window,k,{value:v,writable:true,configurable:true});}});const d={' + Object.entries(DEFAULTS).map(([k, v]) => `${k}:()=>(${v})`).join(',') + '};' +
  'for(const k in d)if(!(k in window))try{window[k]=d[k]();}catch(e){window[k]=null;}})();';
// Functions main.js imports from modules cannot be stubbed before load; the real ones are imported once the page is up.
const IMPORTS = { fitChoiceLabels: '/src/hudicons.js' };
async function installMainImports(page) {
  await page.evaluate(async imports => { for (const [k, url] of Object.entries(imports)) if (!(k in window)) window[k] = (await import(url))[k]; }, IMPORTS);
}
// Call right after newPage() and before page.goto(); call installMainImports(page) after goto: defaults exist before any test setup runs (and again after reloads).
async function installMainGlobals(page) { await page.addInitScript(initScript); }
module.exports = { DEFAULTS, ELEMENTS, IMPORTS, installMainImports, initScript, installMainGlobals };

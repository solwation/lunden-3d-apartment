import { STARTUP } from './config.js';

/** Bound both fetching and reading the body, even if a request ignores abort. */
export async function fetchStartupJSON(url, { fetcher = globalThis.fetch, timeout = STARTUP.dataTimeout } = {}) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetcher(url, { signal: controller.signal });
        if (!response.ok) throw Error(`Startup data: ${response.status}`);
        return response.json();
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(Error('Startup data timeout')); }, timeout);
      }),
    ]);
  } finally { clearTimeout(timer); controller.abort(); }
}

/** Keep the scene covered, but offer recovery for failed imports or stalled startup/warm-up. */
export function watchStartup(options = {}) {
  // The real index starts its dependency-free guard before bootstrap is even requested.
  // Reuse it rather than creating another timer/button handler after module loading.
  if (globalThis.__lundenStartupRecovery && !Object.keys(options).length) return globalThis.__lundenStartupRecovery;
  const { timeout = STARTUP.recoveryTimeout, retry = () => location.reload() } = options;
  const loading = document.getElementById('loading');
  if (!loading) return { fail() {} };
  let timer;
  const finished = () => loading.hidden || loading.classList.contains('done');
  const observer = new MutationObserver(() => { if (finished()) stop(); });
  const stop = () => { clearTimeout(timer); observer.disconnect(); };
  const fail = () => {
    stop();
    if (finished()) return;
    // Resuming normally hides #loading behind a pseudo-element. Show this card on failure
    // without deleting the saved position/home or allowing access to an incomplete scene.
    document.documentElement.classList.remove('resuming');
    loading.querySelector('h1').textContent = 'Starten kunde inte slutföras';
    loading.querySelector('p').textContent = 'Försök ladda igen. Din sparade plats och ditt hem finns kvar.';
    const bar = loading.querySelector('.loading-bar');
    if (bar) bar.hidden = true;
    if (!loading.querySelector('[data-startup-retry]')) {
      const button = document.createElement('button');
      button.textContent = 'Försök igen';
      button.dataset.startupRetry = '';
      button.style.cssText = 'min-height:44px;padding:12px 20px;touch-action:manipulation';
      button.addEventListener('click', retry);
      loading.querySelector('.loading-card').append(button);
    }
  };
  observer.observe(loading, { attributes: true, attributeFilter: ['hidden', 'class'] });
  timer = setTimeout(fail, timeout);
  if (finished()) stop();
  return { fail };
}

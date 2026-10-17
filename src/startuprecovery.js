import { STARTUP } from './config.js';

/** Bound each request and body. Retry one transient failure before abandoning the scene. */
export async function fetchStartupJSON(url, {
  fetcher = globalThis.fetch, timeout = STARTUP.dataTimeout,
  attempts = STARTUP.dataAttempts, retryDelay = STARTUP.retryDelay,
} = {}) {
  const count = Number.isInteger(attempts) ? Math.max(1, Math.min(attempts, 3)) : 1;
  for (let attempt = 0; attempt < count; attempt++) {
    const controller = new AbortController();
    let timer;
    try {
      return await Promise.race([
        (async () => {
          const response = await fetcher(url, {
            signal: controller.signal, ...(attempt ? { cache: 'no-store' } : {}),
          });
          if (!response.ok) {
            const error = Error(`Startup data: ${response.status}`);
            error.retryable = response.status === 408 || response.status === 429 || response.status >= 500;
            throw error;
          }
          return response.json();
        })(),
        new Promise((_, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(Error('Startup data timeout')); }, timeout);
        }),
      ]);
    } catch (error) {
      if (attempt + 1 === count || error?.retryable === false || error?.name === 'SyntaxError') throw error;
    } finally { clearTimeout(timer); controller.abort(); }
    await new Promise(resolve => setTimeout(resolve, retryDelay));
  }
}

// Startup error view (#1132): the cause class and Swedish reason for a failed step.
// Keep aligned with causeOf/REASONS in index.html's dependency-free guard.
const REASONS = { import: 'en programfil kunde inte hämtas', network: 'nätverket svarade inte',
  webgl: 'webbläsaren kunde inte starta 3D-grafiken (WebGL)', scene: 'ett oväntat fel uppstod' };
export function startupCause(error) {
  const text = `${error?.name || ''} ${error?.message || ''}`;
  if (/dynamically imported module|Importing a module script failed|Bootstrap module failed/i.test(text)) return 'import';
  if (/WebGL/i.test(text)) return 'webgl';
  if (/Startup data|Failed to fetch|NetworkError|Load failed/i.test(text)) return 'network';
  return 'scene';
}
/** The short message naming the failed step, e.g. Fel i steget ”Hämtar planritningen”: nätverket svarade inte. */
export function startupErrorText(step, cause) {
  return `${step ? `Fel i steget ”${step}”` : 'Fel vid starten'}: ${REASONS[cause] || REASONS.scene}.`;
}
const currentStep = () => { try { return String(globalThis.__lundenLoading?.name || '').slice(0, 60); } catch { return ''; } };

// The dependency-free index guard writes the same bounded technical record before modules exist.
const FAILURE_KEY = 'lunden.startupFailure';
export function recordStartupFailure(error, step = currentStep()) {
  try {
    const clean = value => String(value || '').replace(/https?:\/\/[^\s'")]+/g, url => url.split(/[?#]/)[0]);
    const script = document.querySelector('script[src*="src/bootstrap.js"]');
    const build = script ? new URL(script.src).searchParams.get('v') || 'dev' : 'dev';
    sessionStorage.setItem(FAILURE_KEY, JSON.stringify({
      at: Date.now(), build, name: clean(error?.name || 'Error').slice(0, 40),
      message: clean(error?.message || 'Startup deadline exceeded').slice(0, 300),
      stack: clean(error?.stack).slice(0, 1500), step, cause: error ? startupCause(error) : 'timeout',
    }));
  } catch { /* Storage can be unavailable; recovery must still work. */ }
}

/** Report at most one recent failed start on the next load, through the existing crash logger. */
export function takeStartupFailure() {
  try {
    const raw = sessionStorage.getItem(FAILURE_KEY);
    sessionStorage.removeItem(FAILURE_KEY);
    const record = JSON.parse(raw);
    if (!record || !Number.isFinite(record.at) || Date.now() - record.at < 0 || Date.now() - record.at > 3600_000
      || typeof record.name !== 'string' || typeof record.message !== 'string' || typeof record.build !== 'string') return null;
    return { name: record.name.slice(0, 40), message: record.message.slice(0, 300),
      build: record.build.slice(0, 40), stack: typeof record.stack === 'string' ? record.stack.slice(0, 1500) : '',
      step: typeof record.step === 'string' ? record.step.slice(0, 60) : '', cause: typeof record.cause === 'string' ? record.cause.slice(0, 20) : '' };
  } catch { return null; }
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
  const fail = (error) => {
    stop();
    if (finished()) return;
    const step = currentStep();
    recordStartupFailure(error, step);
    // Resuming normally hides #loading behind a pseudo-element. Show this card on failure
    // without deleting the saved position/home or allowing access to an incomplete scene.
    document.documentElement.classList.remove('resuming');
    loading.querySelector('[data-startup-slow]')?.setAttribute('hidden', ''); // the hard failure replaces the stall notice (#1131)
    loading.querySelector('h1').textContent = 'Starten kunde inte slutföras';
    loading.querySelector('p').textContent = 'Försök ladda igen. Din sparade plats och ditt hem finns kvar.';
    const bar = loading.querySelector('.loading-bar');
    if (bar) bar.hidden = true;
    if (error) { // the error view (#1132), as in index.html's guard
      let line = loading.querySelector('[data-startup-error]');
      if (!line) {
        line = Object.assign(document.createElement('p'), { className: 'loading-error' });
        line.dataset.startupError = '';
        line.setAttribute('role', 'alert');
        loading.querySelector('.loading-card').insertBefore(line, loading.querySelector('[data-startup-retry]'));
      }
      line.dataset.cause = startupCause(error);
      line.textContent = startupErrorText(step, line.dataset.cause);
      const row = loading.querySelector('.loading-step');
      if (row) row.hidden = true;
    }
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

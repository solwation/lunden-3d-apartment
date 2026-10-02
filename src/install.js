// Installing as an app. An iPhone has no fullscreen API for pages, so the browser bars eat the
// screen (and iOS can shift the tap targets of the HUD buttons): there we ask the visitor to add
// the page to the home screen first, with a way to play in the browser anyway. Browsers that
// offer their own install prompt (Chrome on Android/desktop) get a link on the start screen.

const standalone = () => navigator.standalone === true
  || matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;

const SKIP_KEY = 'lunden.installSkipped';

/** The steps for this browser on iOS (they all share the iOS share sheet). */
function iosSteps(ua) {
  const share = '<span class="share" aria-label="Dela"></span>';
  const browser = /CriOS/.test(ua) ? 'chrome' : /FxiOS|EdgiOS/.test(ua) ? 'other' : 'safari';
  const first = {
    safari: `Tryck på ${share} <b>Dela</b> (i Safari-menyn <b>•••</b> om knappen inte syns).`,
    chrome: `Tryck på ${share} <b>Dela</b> uppe till höger i adressfältet.`,
    other: `Öppna webbläsarens meny och välj ${share} <b>Dela</b>.`,
  }[browser];
  return [
    first,
    'Välj <b>Lägg till på hemskärmen</b> (scrolla ner i listan om den inte syns).',
    'Öppna <b>Lunden</b> från hemskärmen.',
  ];
}

export function setupInstall({ ua = navigator.userAgent, force = false } = {}) {
  const sheet = document.getElementById('install');
  const iPhone = /iPhone|iPod/.test(ua);
  let skipped = false;
  try { skipped = sessionStorage.getItem(SKIP_KEY) === '1'; } catch { /* ignore */ }
  if (force || (iPhone && !standalone() && !skipped)) {
    document.getElementById('install-steps').innerHTML = iosSteps(ua).map((s) => `<li>${s}</li>`).join('');
    sheet.hidden = false;
  }
  document.getElementById('install-skip').addEventListener('click', () => {
    sheet.hidden = true;
    try { sessionStorage.setItem(SKIP_KEY, '1'); } catch { /* ignore */ }
  });

  // Chrome/Edge (Android, desktop): their own install dialog, offered from the start screen
  const btn = document.getElementById('install-btn');
  let deferred = null;
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    btn.hidden = false;
  });
  btn.addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice.catch(() => {});
    deferred = null;
    btn.hidden = true;
  });
  addEventListener('appinstalled', () => { btn.hidden = true; });
}

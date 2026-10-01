// Detects when a newer version has been published while the page is open.
// BUILD is replaced with the commit SHA by tools/stamp.sh (GitHub Pages workflow);
// locally it stays 'dev' and no checks are made.
export const BUILD = 'dev';

const INTERVAL = 60_000;

export function watchForUpdates(onUpdate) {
  if (BUILD === 'dev') return;
  let timer = null;
  const check = async () => {
    try {
      const r = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) return;
      const { version } = await r.json();
      if (version && version !== BUILD) {
        clearInterval(timer);
        document.removeEventListener('visibilitychange', onVisible);
        onUpdate(version);
      }
    } catch { /* offline — try again later */ }
  };
  const onVisible = () => { if (document.visibilityState === 'visible') check(); };
  timer = setInterval(check, INTERVAL);
  document.addEventListener('visibilitychange', onVisible);
  check();
}

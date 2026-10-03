// Detects when a newer version has been published while the page is open.
// BUILD is replaced with the commit SHA by tools/stamp.sh (GitHub Pages workflow), CONTENT with a hash of what the
// page loads (#304); locally both stay 'dev' and no checks are made.
export const BUILD = 'dev';
export const CONTENT = 'dev';

const INTERVAL = 60_000;

/** Is the published version.json `remote` something new for this page? Only when what the page loads changed (#304):
 * a commit that touched docs, tests or reference images gets a new SHA but the same content hash — no reload. A
 * version.json without a hash (or a page without one) falls back to the SHA. */
export function isNewer(remote, local = { version: BUILD, content: CONTENT }) {
  if (!remote?.version) return false;
  if (remote.content && local.content && local.content !== 'dev') return remote.content !== local.content;
  return remote.version !== local.version;
}

export function watchForUpdates(onUpdate) {
  if (BUILD === 'dev') return;
  let timer = null;
  const check = async () => {
    try {
      const r = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) return;
      const remote = await r.json();
      if (isNewer(remote)) {
        clearInterval(timer);
        document.removeEventListener('visibilitychange', onVisible);
        onUpdate(remote.version);
      }
    } catch { /* offline — try again later */ }
  };
  const onVisible = () => { if (document.visibilityState === 'visible') check(); };
  timer = setInterval(check, INTERVAL);
  document.addEventListener('visibilitychange', onVisible);
  check();
}

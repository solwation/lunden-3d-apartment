// Phones and tablets get a smaller memory footprint (LOW_MEMORY, #585; lighter campus facades, #589): iOS otherwise
// kills the tab after a few steps. iPadOS Safari says "Macintosh", so a Mac with a touch screen counts too.
// `&lowmem` forces it on a desktop.
export const lowMemory = typeof navigator !== 'undefined' && (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  || (typeof location !== 'undefined' && /[?&]lowmem\b/.test(location.search)));

/**
 * Free a canvas texture's CPU copy once it is on the GPU (#628): three keeps the source canvas for as long as the texture
 * lives (the measured phone profile held ~186 MB of them). On phones only; desktop is untouched. Use it ONLY for textures
 * that are drawn once and never redrawn (no later `needsUpdate`) and are not cloned/shared after the upload: the canvas
 * shrinks to 1×1, so a second upload would show a blank texture. Returns `tex`.
 */
export function freeCanvasAfterUpload(tex) {
  if (!lowMemory) return tex;
  tex.onUpdate = () => {
    tex.onUpdate = null;
    const c = tex.image;
    if (typeof HTMLCanvasElement !== 'undefined' && c instanceof HTMLCanvasElement) { c.width = 1; c.height = 1; }
  };
  return tex;
}

const GL_RELOAD_KEY = 'lunden.glReloadAt', GL_RELOAD_GAP = 60 * 1000;
/**
 * Phone only (#628): once a lost WebGL context is restored, three re-uploads every texture from its source, but the canvases
 * freed by `freeCanvasAfterUpload` are 1×1, so curtains, rugs, signs and posters would turn blank. Reload the page instead
 * (`reload()` saves the place and world like "Ladda om"; the page resumes where the visitor was). At most one automatic
 * reload per 60 s (sessionStorage), so a flapping context can never loop; then it only logs. Desktop is untouched.
 */
export function reloadOnContextRestore(canvas, reload) {
  if (!lowMemory) return;
  let lost = false;
  canvas.addEventListener('webglcontextlost', (e) => { lost = true; e.preventDefault(); }); // lets the browser restore it
  canvas.addEventListener('webglcontextrestored', () => {
    if (!lost) return;
    let last = 0;
    try { last = Number(sessionStorage.getItem(GL_RELOAD_KEY)) || 0; } catch { /* blocked */ }
    if (Date.now() - last < GL_RELOAD_GAP) { console.warn('WebGL context restored again within 60 s: no second reload (#628)'); return; }
    try { sessionStorage.setItem(GL_RELOAD_KEY, String(Date.now())); } catch { /* blocked: no guard, but a reload still beats blank textures */ }
    reload();
  });
}

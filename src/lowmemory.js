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

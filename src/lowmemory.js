// Phones and tablets get a smaller memory footprint (LOW_MEMORY, #585; lighter campus facades, #589): iOS otherwise
// kills the tab after a few steps. iPadOS Safari says "Macintosh", so a Mac with a touch screen counts too.
// `&lowmem` forces it on a desktop.
export const lowMemory = typeof navigator !== 'undefined' && (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  || (typeof location !== 'undefined' && /[?&]lowmem\b/.test(location.search)));

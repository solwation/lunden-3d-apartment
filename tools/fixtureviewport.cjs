// A headless fixture can resize its browser window only after leaving real native fullscreen (#862).
// Keep the product's requestFullscreen and touch-start behavior intact; exit using the real DOM API.
const { waitForState } = require('./semanticwait.cjs');
async function setFixtureViewport(page, viewport) {
  const leftFullscreen = await page.evaluate(async () => {
    if (!document.fullscreenElement) return false;
    await document.exitFullscreen();
    return true;
  });
  await page.setViewportSize(viewport);
  await waitForState(page, ({ width, height }) => !document.fullscreenElement && innerWidth === width && innerHeight === height,
    viewport, { timeout: 10000 });
  return { leftFullscreen, viewport: await page.evaluate(() => ({ width: innerWidth, height: innerHeight })) };
}
module.exports = { setFixtureViewport };

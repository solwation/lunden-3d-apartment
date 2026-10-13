// #880: semantic state only, not a rendered frame/image/visibility assertion.
// Numeric polling keeps timer-driven Page/Frame state observable when requestAnimationFrame is stopped.
async function waitForState(target, predicate, arg = null, { timeout = 30000, polling = 100 } = {}) {
  if (!Number.isFinite(timeout) || timeout <= 0) throw new TypeError('Semantic wait requires a finite positive timeout');
  if (!Number.isFinite(polling) || polling <= 0) throw new TypeError('Semantic wait requires a finite positive polling interval');
  return target.waitForFunction(predicate, arg, { timeout, polling });
}
module.exports = { waitForState };

// Test setup only (#814): tools/ is excluded from the published site by tools/stamp.sh.
// Code-parser and Worker credential tests must use their real inputs, not this helper.
function setupRearrangeForFixture(rearrange, gameWindow) {
  if (!/^\/tools\//.test(location.pathname)) throw new Error('Rearrangement fixture setup is only available on tools pages');
  rearrange.unlocked = true;
  rearrange.enable(true); // keep the actual busy/saving/cancel/status behavior, in full mode too
  return true; // original unlock() returns true for a valid code even when enable() refuses while busy
}

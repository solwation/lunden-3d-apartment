#!/usr/bin/env bash
# Run one browser test under a memory ceiling, one browser at a time (#1599).
# Headless Chrome with SwiftShader keeps textures and geometry in CPU memory; single tests have reached 8–14 GB
# and, before OOMPolicy=continue, an OOM took all of WSL down with every agent in it. This wrapper:
#   - waits for the shared lock so parallel agents take turns with the expensive browser run;
#   - runs the command in its own systemd user scope with MemoryMax (no swap), so only this test is killed;
#   - stops a test that runs longer than BROWSERTEST_TIMEOUT, so a hung page cannot hold the lock for everyone;
#   - points CHROME_PATH at Playwright's full Chromium when it is unset: chrome-headless-shell (Playwright's default
#     headless binary, seen with build 1208) leaks ~120 MB/s while the pointer is locked, even on a blank page, and
#     keeps it after unlock; that alone drove playroomtest to 12 GB. Full Chromium in new-headless mode stays flat;
#   - prints the peak memory and a readable line when the ceiling or the time limit was hit.
#   tools/browsertest.sh node tools/playroomtest.cjs http://localhost:8137
# BROWSERTEST_MEM (default 4G), BROWSERTEST_TIMEOUT (default 30m, a timeout(1) duration), BROWSERTEST_LOCK (default ~/.local/state/orkester/browser.lock; empty = no lock).
# Without systemd user scopes (CI, macOS) it runs the command directly and says so.
set -u
mem=${BROWSERTEST_MEM:-4G}
limit=${BROWSERTEST_TIMEOUT:-30m}
lock=${BROWSERTEST_LOCK-$HOME/.local/state/orkester/browser.lock}
if [ -z "${CHROME_PATH:-}" ]; then
  full=$(ls -d "${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"/chromium-*/chrome-linux*/chrome 2>/dev/null | sort -V | tail -1)
  if [ -n "$full" ]; then export CHROME_PATH=$full
  else echo "browsertest: no full Chromium found; headless-shell leaks memory under pointer lock (npx playwright install chromium)" >&2; fi
fi
[ $# -gt 0 ] || { echo "usage: $0 command [args…]" >&2; exit 2; }

inner='timeout --kill-after=15s '"$limit"' "$@"; rc=$?
cg=/sys/fs/cgroup$(cut -d: -f3 /proc/self/cgroup)
peak=$(cat "$cg/memory.peak" 2>/dev/null || echo 0)
kills=$(awk "/^oom_kill /{print \$2}" "$cg/memory.events" 2>/dev/null)
echo "browsertest: peak $((peak / 1048576)) MiB of '"$mem"'" >&2
if [ "${kills:-0}" -gt 0 ]; then
  echo "browsertest: FAIL — memory ceiling '"$mem"' reached, $kills process(es) killed; see docs/development/verification.md#browser-memory" >&2
  [ $rc -eq 0 ] && rc=137
elif [ $rc -eq 124 ]; then
  echo "browsertest: FAIL — time limit '"$limit"' reached (BROWSERTEST_TIMEOUT)" >&2
fi
exit $rc'

run() {
  if command -v systemd-run >/dev/null && systemd-run --user --scope -q true 2>/dev/null; then
    systemd-run --user --scope -q -p MemoryMax="$mem" -p MemorySwapMax=0 -p OOMPolicy=continue -- bash -c "$inner" browsertest "$@"
  else
    echo "browsertest: no systemd user scope here, running without a memory ceiling" >&2
    timeout --kill-after=15s "$limit" "$@"
  fi
}

if [ -n "$lock" ]; then
  mkdir -p "$(dirname "$lock")"
  exec 9>"$lock"
  flock -n 9 || { echo "browsertest: waiting for $lock (another browser test is running)" >&2; flock 9; }
fi
run "$@"

#!/bin/sh
# Check release consistency: version pins, GitHub releases and CHANGELOG headings.
# Needs git, gh (authenticated) and standard tools. Exits 1 on any deviation.
# RELEASES_FILE=<file with one tag name per line> replaces the gh query (for tests).
set -u
repo=solwation/dirigenten-och-orkestern
cd "$(dirname "$0")/.." || exit 1
fail=0
report() { echo "$1"; fail=1; }

tags=$(git tag -l 'v[0-9]*.[0-9]*.[0-9]*' | sort -V)
latest=$(echo "$tags" | tail -n 1)
[ -n "$latest" ] || { echo "No v* tags found (fetch tags first)"; exit 1; }

# (a) pins in README.md and INSTALL.md equal the latest tag
for f in README.md INSTALL.md; do
  pins=$(grep -o 'dirigenten-och-orkestern\.git v[0-9][0-9.]*' "$f" | awk '{print $2}' | sort -u)
  [ -n "$pins" ] || report "$f: no version pin found"
  for p in $pins; do
    [ "$p" = "$latest" ] || report "$f: pin $p differs from latest tag $latest"
  done
done

# (b) every v* tag has a GitHub release
if [ -n "${RELEASES_FILE:-}" ]; then
  releases=$(cat "$RELEASES_FILE")
elif ! releases=$(gh api --paginate "repos/$repo/releases" --jq '.[].tag_name'); then
  echo "Could not list GitHub releases with gh"; exit 1
fi
for t in $tags; do
  echo "$releases" | grep -qx "$t" || report "$t: tag has no GitHub release"
done

# (c) CHANGELOG heading for the latest tag
v=${latest#v}
grep -q "^## $v — [0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}\$" CHANGELOG.md ||
  report "CHANGELOG.md: no '## $v — YYYY-MM-DD' heading for $latest"

[ "$fail" -eq 0 ] && echo "OK: pins, releases and CHANGELOG match $latest"
exit "$fail"

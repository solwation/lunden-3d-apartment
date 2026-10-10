#!/bin/sh
# Build the published site into OUT with a version stamp (used by the Pages workflow;
# can be run locally to test the update notice): tools/stamp.sh OUT VERSION
set -eu
OUT=${1:?output dir}
V=${2:?version}
# a hash of what the page loads (#304): open pages reload only when this changes, not on every commit (reference
# images, docs, tests, CLAUDE.md …). tools/ (test pages), the PDF and README are not loaded by visitors; stamp.sh is
# in it because it shapes what they load.
C=$(find index.html manifest.webmanifest icons src data textures music tools/stamp.sh tools/changelog_stamp.py -type f ! -path data/todo.json | LC_ALL=C sort \
  | xargs sha256sum | sha256sum | cut -c1-12)
rm -rf "$OUT"
mkdir -p "$OUT"
cp -r index.html manifest.webmanifest icons src data textures music tools L1007_mattsatt_planritning.pdf README.md "$OUT"/
# the changelog's entries get `t` = when their line reached main (git history) and go newest first (#341)
python3 tools/changelog_stamp.py "$OUT/data/changelog.json"
# fail loudly rather than publish an empty fridge note (#655): the stamped file must be a non-empty list of entries
# with an integer id, a date, a text and a numeric `t`
python3 - "$OUT/data/changelog.json" <<'PY' || { echo "::error::stamp.sh: $OUT/data/changelog.json is not a non-empty changelog list (#655)" >&2; exit 1; }
import json, sys
d = json.load(open(sys.argv[1], encoding='utf-8'))
assert isinstance(d, list) and d, 'changelog is empty or not a list'
for e in d:
    assert isinstance(e, dict) and isinstance(e.get('id'), int) and isinstance(e.get('date'), str) \
        and isinstance(e.get('text'), str) and e['text'] and isinstance(e.get('t'), (int, float)), f'bad entry: {e!r}'
print(f'changelog ok: {len(d)} entries')
PY
# the running page knows which version it is …
sed -i -e "s/^export const BUILD = 'dev';/export const BUILD = '$V';/" \
  -e "s/^export const CONTENT = 'dev';/export const CONTENT = '$C';/" "$OUT/src/version.js"
# the open issues as the fridge's post-its (#340), written AFTER the content hash and kept out of it: a deploy that
# only changes the TODO list reloads nobody; the notes refresh on the next real reload
python3 tools/todo.py "$OUT/data/todo.json" || echo '[]' > "$OUT/data/todo.json"
# … and the server says which version is current
printf '{"version":"%s","content":"%s","built":"%s"}\n' "$V" "$C" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$OUT/version.json"
# cache-bust modules and data so a reload really fetches the new version
sed -i -E "s#(from '\./[^']+\.js)'#\1?v=$V'#g" "$OUT"/src/*.js
sed -i -E "s#src=\"src/bootstrap\.js\"#src=\"src/bootstrap.js?v=$V\"#" "$OUT/index.html"
sed -i -E "s#'(data/[^']+\.json)'#'\1?v=$V'#g" "$OUT"/src/*.js

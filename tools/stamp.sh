#!/bin/sh
# Build the published site into OUT with a version stamp (used by the Pages workflow;
# can be run locally to test the update notice): tools/stamp.sh OUT VERSION
set -eu
OUT=${1:?output dir}
V=${2:?version}
rm -rf "$OUT"
mkdir -p "$OUT"
cp -r index.html manifest.webmanifest icons src data tools L1007_mattsatt_planritning.pdf README.md "$OUT"/
# the running page knows which version it is …
sed -i "s/^export const BUILD = 'dev';/export const BUILD = '$V';/" "$OUT/src/version.js"
# … and the server says which version is current
printf '{"version":"%s","built":"%s"}\n' "$V" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$OUT/version.json"
# cache-bust modules and data so a reload really fetches the new version
sed -i -E "s#(from '\./[^']+\.js)'#\1?v=$V'#g" "$OUT"/src/*.js
sed -i -E "s#src=\"src/main\.js\"#src=\"src/main.js?v=$V\"#" "$OUT/index.html"
sed -i -E "s#'(data/[^']+\.json)'#'\1?v=$V'#g" "$OUT"/src/*.js

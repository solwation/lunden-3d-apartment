#!/usr/bin/env bash
# Sets up the shared world (#178, #119) in YOUR Cloudflare account, in one go:
#   ./cloudflare/setup.sh
# 1. wrangler via npx (no global install), 2. `wrangler login` if needed (opens the browser), 3. the KV namespace
# (created only if missing), its id into cloudflare/wrangler.toml, 4. deploy the Worker, 5. an ADMIN_TOKEN secret
# for the emergency brake (only if missing; kept outside the repo), 6. the Worker's URL into src/config.js
# (CLOUD_URL), 7. a check that it answers, 8. offers to commit + push. Safe to run again: everything that exists
# is reused. No secrets end up in the repo. Needs Node.js (https://nodejs.org).
# WRANGLER="..." overrides the wrangler command (tests use a fake one).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
TOML="$HERE/wrangler.toml"
CONFIG="$ROOT/src/config.js"
KV_NAME="lunden-l1007"
TOKEN_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/lunden-l1007/admin-token"

say() { printf '\n\033[1m▶ %s\033[0m\n' "$*"; }
die() { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

if [ -z "${WRANGLER:-}" ]; then
  command -v npx >/dev/null 2>&1 || die "Node.js saknas. Installera det från https://nodejs.org och kör skriptet igen."
  WRANGLER="npx --yes wrangler@4"
fi
command -v node >/dev/null 2>&1 || die "Node.js saknas. Installera det från https://nodejs.org och kör skriptet igen."
wr() { (cd "$HERE" && $WRANGLER "$@"); }

say "Kollar inloggningen i Cloudflare"
if wr whoami 2>&1 | grep -qiE "not authenticated|not logged in|wrangler login"; then
  echo "Du är inte inloggad – webbläsaren öppnas så att du kan logga in och godkänna wrangler."
  wr login
fi
wr whoami 2>&1 | grep -iE "email|account" | head -3 || true

say "KV-lagringen ($KV_NAME)"
# the id of a namespace titled $KV_NAME (some wrangler versions prefix the title with the worker name)
find_kv() {
  wr kv namespace list 2>/dev/null | node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      const i = s.indexOf("["); if (i < 0) return;
      try { const l = JSON.parse(s.slice(i)); const n = process.argv[1];
        const hit = l.find((x) => x.title === n) ?? l.find((x) => x.title.endsWith("-" + n));
        if (hit) process.stdout.write(hit.id);
      } catch {} });' "$KV_NAME"
}
KV_ID="$(find_kv || true)"
if [ -z "$KV_ID" ]; then
  echo "Skapar KV-namnrymden $KV_NAME …"
  wr kv namespace create "$KV_NAME" >/dev/null
  KV_ID="$(find_kv || true)"
fi
[ -n "$KV_ID" ] || die "Kunde inte hitta eller skapa KV-namnrymden $KV_NAME."
echo "KV-id: $KV_ID"
# into wrangler.toml (the one `id = "…"` line of the [[kv_namespaces]] block)
node -e '
  const fs = require("fs"), [f, id] = process.argv.slice(1);
  const s = fs.readFileSync(f, "utf8"), t = s.replace(/^id = ".*"$/m, `id = "${id}"`);
  if (t !== s) fs.writeFileSync(f, t);' "$TOML" "$KV_ID"

say "Driftsätter workern"
DEPLOY_LOG="$(mktemp)"
wr deploy 2>&1 | tee "$DEPLOY_LOG"
URL="$(grep -oE 'https://[A-Za-z0-9.-]+\.workers\.dev' "$DEPLOY_LOG" | head -1 || true)"
rm -f "$DEPLOY_LOG"
[ -n "$URL" ] || die "Hittade ingen workers.dev-adress i utskriften ovan. Har kontot en workers.dev-underdomän? (Cloudflare-panelen → Workers & Pages)"
echo "Workern finns på $URL"

say "Nödbromsen (ADMIN_TOKEN)"
if wr secret list 2>/dev/null | grep -q '"ADMIN_TOKEN"\|ADMIN_TOKEN'; then
  echo "ADMIN_TOKEN finns redan."
else
  TOKEN="$(node -e 'process.stdout.write(require("crypto").randomBytes(24).toString("hex"))')"
  printf '%s' "$TOKEN" | wr secret put ADMIN_TOKEN >/dev/null
  mkdir -p "$(dirname "$TOKEN_FILE")"
  ( umask 077; printf '%s\n' "$TOKEN" > "$TOKEN_FILE" )
  echo "ADMIN_TOKEN satt och sparad i $TOKEN_FILE (inte i repot)."
fi

say "Adressen in i src/config.js"
node -e '
  const fs = require("fs"), [f, url] = process.argv.slice(1);
  const s = fs.readFileSync(f, "utf8");
  if (!/^export const CLOUD_URL = .*;$/m.test(s)) { console.error("Hittade inte raden export const CLOUD_URL i " + f); process.exit(1); }
  const t = s.replace(/^export const CLOUD_URL = .*;$/m, `export const CLOUD_URL = ${JSON.stringify(url).replace(/"/g, "\x27")};`);
  if (t !== s) { fs.writeFileSync(f, t); console.log("Ändrat: export const CLOUD_URL = \x27" + url + "\x27;"); } else console.log("Redan rätt.");' "$CONFIG" "$URL"

say "Provar workern"
if node -e 'fetch(process.argv[1] + "/drawings").then((r) => r.json()).then((l) => { console.log("Svarar: " + l.length + " teckningar."); }).catch((e) => { console.error(e.message); process.exit(1); })' "$URL"; then :; else
  echo "Den svarade inte än – det kan ta någon minut innan en ny workers.dev-adress fungerar."
fi

say "Klart"
cd "$ROOT"
if command -v git >/dev/null 2>&1 && git rev-parse --git-dir >/dev/null 2>&1 && ! git diff --quiet -- src/config.js cloudflare/wrangler.toml; then
  echo "src/config.js och cloudflare/wrangler.toml har ändrats. Sajten börjar synka när ändringen är pushad till main."
  read -r -p "Committa och pusha nu? [j/N] " ok || ok=""
  if [ "$ok" = "j" ] || [ "$ok" = "J" ]; then
    git add src/config.js cloudflare/wrangler.toml
    git commit -m "Shared world: the Cloudflare Worker's address (cloudflare/setup.sh)"
    git pull --rebase origin main && git push origin HEAD:main
  else
    echo "Gör det själv senare: git add src/config.js cloudflare/wrangler.toml && git commit -m 'Cloud URL' && git push"
  fi
else
  echo "Inget att committa – allt var redan uppsatt."
fi
echo "Nödbroms: curl -X DELETE -H \"Authorization: Bearer \$(cat $TOKEN_FILE)\" $URL/admin/all   (eller /admin/drawings, /admin/catphotos, /admin/paper)"

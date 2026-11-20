#!/usr/bin/env bash
# Create the release manifest signing key pair (#2248) without writing the private key to disk.
#
# The ECDSA P-256 private key exists only in this shell's memory and is piped over stdin into
# the protected `signing` environment secret LUNDEN_MANIFEST_PRIVATE_KEY. Only the public SPKI
# PEM is kept, as the repository variable LUNDEN_MANIFEST_PUBLIC_KEY (embedded in launchers by
# release.yml and used by the signing and promotion workflows). No here-strings or temporary
# files are used: bash builtins (printf) feed pipes, and command substitution reads pipes.
#
# Run by a repository admin with an authenticated `gh` (not by agents, not on the build PC):
#   tools/unreal-engine/create-manifest-key.sh --dry-run   # checks and prints a throwaway public key
#   tools/unreal-engine/create-manifest-key.sh             # refuses if a key already exists
#   tools/unreal-engine/create-manifest-key.sh --rotate    # replaces the key; see docs/development/unreal.md
set -euo pipefail
umask 077

repo=solwation/lunden-3d-apartment
environment=signing
secret=LUNDEN_MANIFEST_PRIVATE_KEY
variable=LUNDEN_MANIFEST_PUBLIC_KEY
rotate=false
dry_run=false

usage() {
  echo "Usage: $0 [--dry-run] [--rotate]"
}

for arg in "$@"; do
  case $arg in
    --rotate) rotate=true ;;
    --dry-run) dry_run=true ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
done

for tool in gh openssl sha256sum; do
  command -v "$tool" >/dev/null || { echo "Missing $tool." >&2; exit 1; }
done

if ! gh api "repos/$repo/environments/$environment" --jq .name >/dev/null; then
  echo "The protected environment '$environment' does not exist or is not readable in $repo." >&2
  exit 1
fi

has() { printf '%s\n' "$1" | grep -x -- "$2" >/dev/null; }
secrets=$(gh secret list --env "$environment" -R "$repo" --json name --jq '.[].name')
variables=$(gh variable list -R "$repo" --json name --jq '.[].name')
existing=false
if has "$secrets" "$secret" || has "$variables" "$variable"; then existing=true; fi
if $existing && ! $rotate; then
  echo "Refusing: $secret (environment $environment) or $variable already exists in $repo." >&2
  echo "Launchers embed the current public key; replacing it needs --rotate and a launcher migration." >&2
  exit 1
fi

private_key=$(openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -pkeyopt ec_param_enc:named_curve)
case $private_key in
  "-----BEGIN PRIVATE KEY-----"*"-----END PRIVATE KEY-----") ;;
  *) echo "openssl did not return an unencrypted PKCS#8 private key." >&2; exit 1 ;;
esac
public_key=$(printf '%s\n' "$private_key" | openssl pkey -pubout)
if ! printf '%s\n' "$public_key" | openssl pkey -pubin -noout -text | grep -q 'ASN1 OID: prime256v1'; then
  echo "The generated key is not a named-curve P-256 key." >&2
  exit 1
fi
key_sha256=$(printf '%s\n' "$public_key" | openssl pkey -pubin -outform DER | sha256sum | cut -d' ' -f1)

if $dry_run; then
  unset private_key
  echo "Dry run: nothing was stored. A real run would pipe a new private key into secret $secret"
  echo "(environment $environment) and set variable $variable in $repo to a public key like this one:"
  printf '%s\n' "$public_key"
  echo "Public key SPKI SHA-256 (this throwaway key): $key_sha256"
  if $existing; then echo "A key already exists; the real run would replace it (--rotate)."; fi
  exit 0
fi

if $existing; then
  echo "Rotating: launchers that embed the previous public key will reject manifests signed from now on." >&2
fi
printf '%s\n' "$private_key" | gh secret set "$secret" --env "$environment" -R "$repo"
unset private_key
printf '%s\n' "$public_key" | gh variable set "$variable" -R "$repo"

stored=$(gh variable list -R "$repo" --json name,value --jq ".[] | select(.name == \"$variable\") | .value")
if [ "$stored" != "$public_key" ]; then
  echo "The stored $variable differs from the generated public key; do not sign or build a launcher until fixed." >&2
  exit 1
fi
echo "Stored $secret in environment $environment and $variable in $repo."
echo "Public key SPKI SHA-256: $key_sha256 (equals manifestPublicKeySha256 in launcher-build.json)."
printf '%s\n' "$public_key"

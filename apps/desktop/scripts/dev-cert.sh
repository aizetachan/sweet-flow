#!/bin/zsh
# Creates the development signing certificate «Sweetflow Dev» in this Mac's login
# keychain, so every installer built here carries the same identity and macOS keeps
# the permissions given to the app across updates (docs/DEVELOPMENT.md «Firma de
# desarrollo»). Run it once, by hand: macOS asks to confirm the trust and, the first
# time codesign uses the key, to allow it («Permitir siempre»).
#
#   zsh apps/desktop/scripts/dev-cert.sh
set -euo pipefail

NAME="${1:-Sweetflow Dev}"
KEYCHAIN="$HOME/Library/Keychains/login.keychain-db"

if security find-identity -v -p codesigning | grep -q "\"$NAME\""; then
  echo "El certificado «$NAME» ya está en el llavero."
  exit 0
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# A self-signed certificate for code signing, valid ten years.
openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
  -keyout "$TMP/key.pem" -out "$TMP/cert.pem" \
  -subj "/CN=$NAME/O=Sweetflow" \
  -addext "keyUsage=critical,digitalSignature" \
  -addext "extendedKeyUsage=critical,codeSigning" \
  -addext "basicConstraints=critical,CA:false" 2>/dev/null

PASS="$(openssl rand -hex 12)"
openssl pkcs12 -export -inkey "$TMP/key.pem" -in "$TMP/cert.pem" -out "$TMP/cert.p12" -passout "pass:$PASS" -name "$NAME"

# Into the login keychain; codesign may use the key.
security import "$TMP/cert.p12" -k "$KEYCHAIN" -P "$PASS" -T /usr/bin/codesign -T /usr/bin/security >/dev/null
# Trusted for code signing (macOS asks for the login password here).
security add-trusted-cert -r trustRoot -p codeSign -k "$KEYCHAIN" "$TMP/cert.pem"

echo
security find-identity -v -p codesigning | grep "\"$NAME\"" || { echo "No ha quedado como identidad de firma válida." >&2; exit 1; }
echo "Listo: los instaladores generados en este Mac irán firmados con «$NAME» (pnpm dist:mac)."

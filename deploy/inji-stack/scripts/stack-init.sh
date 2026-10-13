#!/bin/sh
# SPDX-License-Identifier: MIT
#
# One-shot "init" service of the ps02-inji compose project. Creates the run-time material the stack needs, so
# that nothing has to be installed on the host: a test certificate authority and one TLS server certificate for
# the TLS front (certify.ps02.test, certify-ac.ps02.test, verify.ps02.test, ref.ps02.test, playground.ps02.test).
#
# Runs in the nginx:stable image (already used by the stack) because it ships openssl. Writes to /out, which
# compose binds to $PLAYGROUND_RUN_DIR/stack on the host:
#
#   ca/ps02-test-ca.crt     test CA certificate; mounted as /certificates in verify-service and Mimoto, whose
#                           Temurin entrypoint imports it into the JVM trust store (USE_SYSTEM_CA_CERTS=1)
#   ca-private/ca.key       test CA private key (never leaves the run directory)
#   tls/server.crt|key      TLS front certificate (leaf followed by the CA) and key
#
# Idempotent: existing material is kept while it is valid for at least 30 more days and names every host in
# TLS_NAMES; otherwise everything is generated again. All of it is test-only and never committed.
set -eu

OUT=${OUT_DIR:-/out}
# The last three are the JSON-LD context hosts the TLS front caches for the stack (nginx/tls-front.conf.template).
TLS_NAMES=${TLS_NAMES:-certify.ps02.test certify-ac.ps02.test verify.ps02.test ref.ps02.test playground.ps02.test localhost www.w3.org w3id.org piyush7034.github.io}
CA_CRT="$OUT/ca/ps02-test-ca.crt"
CA_KEY="$OUT/ca-private/ca.key"
SRV_CRT="$OUT/tls/server.crt"
SRV_KEY="$OUT/tls/server.key"
MIN_VALID_SECONDS=2592000 # 30 days

mkdir -p "$OUT/ca" "$OUT/ca-private" "$OUT/tls" "$OUT/mimoto"

material_is_valid() {
  [ -s "$CA_CRT" ] && [ -s "$CA_KEY" ] && [ -s "$SRV_CRT" ] && [ -s "$SRV_KEY" ] || return 1
  openssl x509 -in "$CA_CRT" -noout -checkend "$MIN_VALID_SECONDS" >/dev/null || return 1
  openssl x509 -in "$SRV_CRT" -noout -checkend "$MIN_VALID_SECONDS" >/dev/null || return 1
  openssl verify -CAfile "$CA_CRT" "$SRV_CRT" >/dev/null 2>&1 || return 1
  sans=$(openssl x509 -in "$SRV_CRT" -noout -ext subjectAltName)
  for name in $TLS_NAMES; do
    case "$sans" in *"DNS:$name"*) ;; *) return 1 ;; esac
  done
}

if material_is_valid; then
  echo "stack-init: test CA and TLS certificate present and valid; nothing to do"
  exit 0
fi

echo "stack-init: creating test CA and TLS certificate for: $TLS_NAMES"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# Test CA: P-256 key, self-signed, may only sign end-entity certificates (pathlen 0).
openssl ecparam -name prime256v1 -genkey -noout -out "$work/ca.key"
openssl req -x509 -new -key "$work/ca.key" -sha256 -days 3650 \
  -subj "/O=PS02 Inji Interop Playground/CN=PS02 Playground Test CA (test only)" \
  -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
  -addext "keyUsage=critical,keyCertSign,cRLSign" \
  -addext "subjectKeyIdentifier=hash" \
  -out "$work/ca.crt"

# Server certificate for every TLS front host name. 397 days keeps it inside common client limits.
san=""
for name in $TLS_NAMES; do san="${san:+$san,}DNS:$name"; done
san="$san,IP:127.0.0.1"
openssl ecparam -name prime256v1 -genkey -noout -out "$work/server.key"
openssl req -new -key "$work/server.key" -subj "/O=PS02 Inji Interop Playground/CN=certify.ps02.test" \
  -out "$work/server.csr"
cat >"$work/server.ext" <<EOF
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature
extendedKeyUsage=serverAuth
subjectAltName=$san
subjectKeyIdentifier=hash
authorityKeyIdentifier=keyid
EOF
openssl x509 -req -in "$work/server.csr" -CA "$work/ca.crt" -CAkey "$work/ca.key" -CAcreateserial \
  -sha256 -days 397 -extfile "$work/server.ext" -out "$work/server.leaf.crt"
openssl verify -CAfile "$work/ca.crt" "$work/server.leaf.crt" >/dev/null

# Replace the files only once everything was generated, so a failure never leaves a half-written set.
cp "$work/ca.key" "$CA_KEY"
cp "$work/ca.crt" "$CA_CRT"
cat "$work/server.leaf.crt" "$work/ca.crt" >"$SRV_CRT"
cp "$work/server.key" "$SRV_KEY"
chmod 600 "$CA_KEY" "$SRV_KEY" 2>/dev/null || true
# nginx worker processes read the key through the master, which runs as root; the files stay private.

echo "stack-init: wrote $CA_CRT and $SRV_CRT"
openssl x509 -in "$SRV_CRT" -noout -subject -enddate -ext subjectAltName

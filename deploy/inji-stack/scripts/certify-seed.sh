#!/bin/sh
# SPDX-License-Identifier: MPL-2.0
# Copyright (c) 2026 Team Badmosip
#
# One-shot "certify-seed" service of the ps02-inji compose project. Adds the playground's extra credential
# configurations to Inji Certify through its credential-configuration API, after Certify reports healthy.
#
# FarmerCredential (ldp_vc) comes from sql/certify_init.sql. Each file /seed/*.credential-configuration.json is
# a POST /v1/certify/credential-configurations body (config/seed/); it is posted only when its
# credentialConfigKeyId is not yet in the issuer metadata, so the service can run on every start.
#
# Every configuration carries display name, logo, background colour and text colour, because Mimoto 0.22.0
# rejects the whole issuer when one configuration lacks them (gap G4).
set -eu

CERTIFY=${CERTIFY_URL:-http://certify:8090/v1/certify}
METADATA_URL="$CERTIFY/issuance/.well-known/openid-credential-issuer"

metadata=$(curl -sf --max-time 120 "$METADATA_URL")
for body in /seed/*.credential-configuration.json; do
  [ -f "$body" ] || continue
  id=$(sed -n 's/^ *"credentialConfigKeyId": *"\([^"]*\)".*/\1/p' "$body" | head -n 1)
  if [ -z "$id" ]; then
    echo "certify-seed: $body has no credentialConfigKeyId" >&2
    exit 1
  fi
  case "$metadata" in
    *"\"$id\""*)
      echo "certify-seed: $id already configured"
      continue
      ;;
  esac
  status=$(curl -s --max-time 60 -o /tmp/seed-response.json -w '%{http_code}' \
    -H 'Content-Type: application/json' --data-binary "@$body" "$CERTIFY/credential-configurations")
  if [ "$status" != 200 ] && [ "$status" != 201 ]; then
    echo "certify-seed: POST $id returned HTTP $status: $(head -c 600 /tmp/seed-response.json)" >&2
    exit 1
  fi
  echo "certify-seed: added $id ($(head -c 200 /tmp/seed-response.json))"
done

#!/bin/sh
# SPDX-License-Identifier: MIT
#
# Entrypoint wrapper for the injistack/mimoto:0.22.0 container (service mimoto-service).
#
# Mimoto needs a PKCS#12 key store, certs/oidckeystore.p12, holding the client key it uses for private_key_jwt
# at the authorization server, and its password in the oidc_p12_password variable. Upstream expects both from
# client onboarding (mimoto docker-compose/README.md); the playground creates them on first start instead, with
# the keytool of the image itself, so the host needs no JDK or OpenSSL:
#
#   /home/mosip/certs/oidckeystore.p12         key store (alias $MIMOTO_CLIENT_ALIAS, RSA 2048)
#   /home/mosip/certs/oidckeystore.password    its random password
#   /home/mosip/certs/oidc-client.crt          the client certificate, for registering the client at a test AS
#
# /home/mosip/certs is bound to $PLAYGROUND_RUN_DIR/stack/mimoto, so the key survives restarts and is never in
# git. Mimoto also writes its own key-manager keys into the same key store.
#
# Then it hands over to the image's own entrypoint (/__cacert_entrypoint.sh, which imports the test CA from
# /certificates when USE_SYSTEM_CA_CERTS is set) with the image's own start command. The image's command also
# has an optional Glowroot profiler branch, which the playground never enables, so only the plain java start is
# repeated here.
set -eu

CERT_DIR=/home/mosip/certs
P12="$CERT_DIR/oidckeystore.p12"
PASS_FILE="$CERT_DIR/oidckeystore.password"
CLIENT_CERT="$CERT_DIR/oidc-client.crt"
ALIAS=${MIMOTO_CLIENT_ALIAS:-wallet-demo-client}

mkdir -p "$CERT_DIR"
if [ ! -s "$P12" ] || [ ! -s "$PASS_FILE" ]; then
  echo "mimoto-start: creating client key store $P12 (alias $ALIAS)"
  rm -f "$P12" "$CLIENT_CERT"
  head -c 24 /dev/urandom | base64 | tr -d '/+=\n' >"$PASS_FILE"
  chmod 600 "$PASS_FILE"
  keytool -genkeypair -noprompt -alias "$ALIAS" -keyalg RSA -keysize 2048 -validity 825 \
    -dname "CN=$ALIAS, O=PS02 Inji Interop Playground (test only)" \
    -storetype PKCS12 -keystore "$P12" -storepass:file "$PASS_FILE"
fi
if [ ! -s "$CLIENT_CERT" ]; then
  keytool -exportcert -rfc -alias "$ALIAS" -keystore "$P12" -storepass:file "$PASS_FILE" -file "$CLIENT_CERT"
fi

oidc_p12_password=$(cat "$PASS_FILE")
export oidc_p12_password

# shellcheck disable=SC2016 # the inner shell expands the variables, as in the image's CMD
exec /__cacert_entrypoint.sh /bin/sh -c 'java -jar -Dspring.cloud.config.label="${spring_config_label_env}" -Dspring.profiles.active="${active_profile_env}" -Dspring.cloud.config.uri="${spring_config_url_env}" mimoto.jar'

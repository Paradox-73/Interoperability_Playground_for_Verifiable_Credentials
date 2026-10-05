-- SPDX-License-Identifier: MIT
--
-- certify-ac only (holder-web profile), run by scripts/postgres-init.sh after the upstream certify_init.sql.
-- Written for the PS02 playground (not an upstream file). certify_init.sql signs FarmerCredential under the core
-- Certify's DID (did:web:certify.ps02.test); certify-ac issues under its own DID, which its TLS front name serves,
-- so the proof's verification method must name it too, or every verifier rejects the signature.
\c inji_certify postgres
UPDATE certify.credential_config SET did_url = 'did:web:certify-ac.ps02.test' WHERE did_url = 'did:web:certify.ps02.test';

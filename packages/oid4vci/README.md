# @inji-playground/oid4vci

Reference OpenID4VCI issuer (draft 13 and 1.0), a test authorization server, and the wallet side of
issuance.

Status (2026-10-04): skeleton with the protocol constants (well-known paths, pre-authorized code grant
type, credential offer scheme) and `wellKnownUrl()`, which builds metadata URLs for both the draft 13
(append) and the RFC 8615 (insert) placement.

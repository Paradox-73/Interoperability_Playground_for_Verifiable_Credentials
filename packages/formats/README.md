# @inji-playground/formats

Keys, DIDs and credential formats used by the reference issuer, wallet and verifier: W3C VC with Data
Integrity proofs (Ed25519Signature2020, eddsa-rdfc-2022) and SD-JWT VC with key binding.

Status (2026-10-04): skeleton. It exports `isSdJwtFormat()`, and its test checks that every library
the package will use loads inside Vitest on Node 24.

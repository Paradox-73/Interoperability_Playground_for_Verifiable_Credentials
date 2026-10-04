# Security

## What this project is

The playground is a test and demonstration tool. It runs local Inji containers and reference roles
with **test keys only** and is not meant to hold real personal data or to face the internet.

- Every key, certificate and password it needs is generated at run time into the run directory
  (`PLAYGROUND_RUN_DIR`, default `./run`), which is git-ignored. Delete that folder to start fresh.
- The recording proxy stores full request and response bodies, including access tokens and codes, in
  the local SQLite database inside the run directory. Exports (reports, fixtures, matrix files) replace
  tokens, codes, cookies and private keys with placeholders.
- Configuration files imported from upstream Inji repositories contain the upstream sample passwords.
  They are listed in `.gitguardian.yaml` and only work against throw-away local containers.
- The server listens on 127.0.0.1 by default. The container image listens on all interfaces inside the
  container; publish its port only on a trusted network.

## Reporting a vulnerability in this playground

Use the repository's private vulnerability reporting (GitHub: **Security → Report a vulnerability**).
Please do not open a public issue. We aim to answer within 7 days.

## Vulnerabilities found in Inji modules

Interoperability problems found with the playground are written up in `docs/gaps/`. A problem with a
security impact (for example a forged credential being accepted) is not published there; it is
reported privately to MOSIP through the channel MOSIP names, and listed publicly only as "reported
privately" until MOSIP agrees otherwise.

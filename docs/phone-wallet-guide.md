# Phone wallet guide

How to test Inji Wallet on a real phone against the playground and the local Inji Verify, and what to bring
back. No run with a phone is recorded yet. Record the results in
[manual-test-checklist.md, Inji Wallet on a phone](manual-test-checklist.md#inji-wallet-on-a-phone)
(`PH-01` to `PH-06`).

- [Before you start](#before-you-start)
- [Install Inji Wallet](#install-inji-wallet)
- [Get a credential from Collab](#get-a-credential-from-collab)
- [Present to the local Inji Verify](#present-to-the-local-inji-verify)
- [Run the playground with the phone wallet role](#run-the-playground-with-the-phone-wallet-role)
- [Screenshots to take](#screenshots-to-take)
- [Known failures](#known-failures)
- [Emulator attempt](#emulator-attempt)
- [Sources](#sources)

## Before you start

| Need                           | Why                                                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| A real Android phone or iPhone | Inji Wallet needs a key store backed by secure hardware; an emulator does not have one ([emulator attempt](#emulator-attempt)) |
| Internet on the phone          | the app downloads its settings and the Collab credential from MOSIP's hosted services                                          |
| The bundle running             | [setup.md, One-command bundle](setup.md#one-command-bundle)                                                                    |
| An HTTPS tunnel tool           | only for the playground run; see [step 2 of that section](#run-the-playground-with-the-phone-wallet-role)                      |
| 45 minutes                     | 30 for the checklist, 15 for installing the app and getting a credential                                                       |

## Install Inji Wallet

MOSIP's own guide distributes the app outside the stores. On 2026-10-14 the Play Store page for the app's
package name (`io.mosip.residentapp`) answered 404, and no store listing was found. If you find one
published by MOSIP, use it and write its name and version in the notes column.

1. Android: open the Google Drive folder linked from the
   [Inji Mobile end user guide](https://docs.inji.io/inji-wallet/inji-mobile/functional-overview/end-user-guide)
   (section "Installing Inji Wallet"). On 2026-10-14 it held one file, `Inji_Release-1.0.0-alpha.1(v30).apk`.
   Download it on the phone, open it and allow installing from this source.
2. iPhone: install TestFlight from the App Store, then open the TestFlight invitation linked from the
   [Inji Mobile Collab guide](https://docs.inji.io/inji-wallet/inji-mobile/functional-overview/sandbox-details/inji-setup-guide).
3. Open the app. Choose a language, skip or read the tutorial, and set a PIN or biometrics.
   Expected: the home page with a **+** button. Take `phone-01-home.png`.
4. Write in the notes the app version shown in the app's settings.

## Get a credential from Collab

Each build is set to one MOSIP environment. MOSIP's Collab guide uses the Drive and TestFlight builds with
its Collab environment. If the issuer names end in `(QA)`, the build uses MOSIP's QA environment and the data
below may not work. Note it and stop this section.

1. Tap **+**. Expected: a list of issuers. Take `phone-02-issuers.png`.
2. Choose one of these, with the test data from the
   [Inji Mobile Collab guide](https://docs.inji.io/inji-wallet/inji-mobile/functional-overview/sandbox-details/inji-setup-guide):

   | Issuer in the app                            | Data to enter on the eSignet page                                                                                                 |
   | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
   | StayProtected Insurance                      | Policy id `7070`, name `aswin`, date of birth `19/02/2025`                                                                        |
   | Republic of Veridonia National ID Department | your own demo UIN from the [Collab self registration form](https://self-register.collab.mosip.net/) (sent by email), OTP `111111` |

3. Complete the login in the browser page the app opens. Expected: the app returns to the home page and
   shows the credential card. Take `phone-03-credential.png`, then open the card and take
   `phone-04-credential-detail.png`.

These values come from MOSIP's public guide. They are not checked by this project; if the login refuses
them, write the error text in the notes.

## Present to the local Inji Verify

Inji Verify UI runs at <http://localhost:28030> (`verify-ui` profile, see [setup.md, Ports](setup.md#ports)).
With the default bundle this flow is expected to fail on the phone. The QR code points at host names that
only the laptop's containers know (see [known failures](#known-failures)). Run it anyway. The error screen
is the evidence.

1. On the laptop, open <http://localhost:28030> and choose **VP Verification**.
2. Press **Request Verifiable Credentials**. In the panel, keep only the type the phone holds (`MOSIP ID`
   for the national ID; for StayProtected, `Health Insurance` or `Life Insurance`, not checked which). `MOSIP ID` is selected by
   default. Note whether it can be cleared.
3. Press **Generate QR Code**. Take `verify-01-request-qr.png` of the laptop screen.
4. In Inji Wallet, tap the QR scanner on the home page (or **Share**) and scan the code.
5. If the app shows the request: choose the credential, pass the face check, and tap **Share**. Take
   `phone-05-share-consent.png` before sharing and `phone-06-share-result.png` after.
6. If the app shows an error: take `phone-05-scan-error.png` and copy the exact error text into the notes.
7. Take `verify-02-result.png` of the laptop screen. Expected with the default bundle: no result.

## Run the playground with the phone wallet role

The `mobile-wallet` role (`packages/server/src/adapters/manual/mobile-wallet.ts`) shows the credential offer
and then the presentation request as QR codes, and continues when the recorded traffic shows the phone acted
or when you press **Done**. [flows.md, Phone wallets](flows.md#phone-wallets) describes the messages. This
route has not been run with Inji Wallet yet; every expected result below comes from the code, not from a run.

1. Start a tunnel that gives `http://localhost:28100` a public `https://` address with a publicly trusted
   certificate. A LAN address such as `http://192.168.1.20:28100` is not enough for Inji Wallet on Android:
   the app refuses plain `http` and ignores certificates the user installed (see
   [known failures](#known-failures)). The tunnel connects to `localhost`, so the default binding of the
   ports to 127.0.0.1 works; to use a LAN address instead, start with `STACK_BIND=0.0.0.0`
   ([setup.md, Ports](setup.md#ports)).
2. Restart the playground with that address: `PLAYGROUND_PUBLIC_URL=https://<tunnel-host> npm run up -- --no-build`.
   This breaks Inji Web runs until you start it again without the variable
   ([Inji stack README, Known limits](../deploy/inji-stack/README.md#known-limits)).
3. Open `https://<tunnel-host>/` on the phone's browser. Expected: the playground page (`PH-01`).
4. On the laptop, open the playground and choose issuer `Reference issuer`, wallet
   `Phone wallet (Inji Wallet or any OpenID4VC app)` and verifier `Reference verifier`. In **Run settings**,
   choose the credential format `JSON-LD VC (ldp_vc)`.
   Press **Run**. Do not choose `Inji Certify` as issuer: its offer names `http://certify-nginx:80` as the
   issuer, a container address the phone cannot reach.
5. Expected: the dialog `Scan the credential offer with the wallet app`. Take `playground-01-offer.png`.
   In Inji Wallet, tap **+**, then **Scan & Download**, and scan the code. The phone camera app does not
   read credential offers. Accept the trust screen for the issuer. Take `phone-07-offer-result.png`.
6. Expected: the dialog `Share the credential with the verifier`. Take `playground-02-request.png`. Scan it
   with the QR scanner on the app's home page, share the credential, and take `phone-08-present-result.png`.
7. If a dialog does not close by itself after the phone finished, press **Done** and note it.
8. Open the run's report. Take `playground-03-report.png` and save it with **Download Markdown** (`PH-05`).

`Inji Verify (API)` as verifier in step 4 sends the phone to `INJI_VERIFY_SUBMISSION_BASE_URL`
([setup.md, Environment variables](setup.md#environment-variables)), which defaults to the laptop-only
`https://verify.ps02.test/v1/verify`. A second tunnel to `http://localhost:28080` with that variable set to
`https://<second-tunnel-host>/v1/verify` might make it work. This has not been tried.

## Screenshots to take

Save them in `run/phone-evidence/` in the clone (ignored by git) with these names. Skip the ones for steps
you did not reach, and say which step stopped you.

| File                                                      | What it shows                                     |
| --------------------------------------------------------- | ------------------------------------------------- |
| `phone-01-home.png`                                       | app home page after set-up                        |
| `phone-02-issuers.png`                                    | issuer list after **+**                           |
| `phone-03-credential.png`                                 | home page with the Collab credential              |
| `phone-04-credential-detail.png`                          | the credential opened                             |
| `verify-01-request-qr.png`                                | Inji Verify UI with the request QR code           |
| `phone-05-share-consent.png` or `phone-05-scan-error.png` | the app after scanning Inji Verify's code         |
| `phone-06-share-result.png`                               | the app after **Share**                           |
| `verify-02-result.png`                                    | Inji Verify UI after the phone shared, or expired |
| `playground-01-offer.png`                                 | playground offer dialog                           |
| `phone-07-offer-result.png`                               | the app after **Scan & Download**                 |
| `playground-02-request.png`                               | playground request dialog                         |
| `phone-08-present-result.png`                             | the app after sharing with the playground         |
| `playground-03-report.png`                                | the run report                                    |

Report back with the filled copy of
[manual-test-results-template.md](manual-test-results-template.md), the screenshots, the downloaded
report, the app version and the phone model with its OS version.

## Known failures

| What fails                                                     | Why                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inji Verify UI's QR code on a phone                            | measured on 2026-10-14: the code carries `request_uri=https://verify.ps02.test/v1/verify/vp-request/<id>`; the request object it returns is signed by `did:web:verify.ps02.test:v1:verify` and names `response_uri` `https://verify.ps02.test/v1/verify/vp-submission/direct-post`. A phone cannot resolve `verify.ps02.test`, and its certificate comes from the stack's test CA |
| Trusting the test CA on Android                                | the app's manifest sets `usesCleartextTraffic="false"` and has no network security configuration (checked in the 1.0.0 build below), so Android only trusts the system's certificates for it; installing `run/stack/ca/ps02-test-ca.crt` as a user certificate does not help                                                                                                      |
| Trusting the test CA on iPhone                                 | possible in principle (install the certificate, then turn it on under **Settings**, **General**, **About**, **Certificate Trust Settings**), but the phone still needs `verify.ps02.test` to resolve to the laptop on port 443, and the stack serves it on 28443. Not tried                                                                                                       |
| Issuing from `Inji Certify` to a phone                         | its offer names `http://certify-nginx:80`, a container address over plain `http`                                                                                                                                                                                                                                                                                                  |
| Inji Web runs while `PLAYGROUND_PUBLIC_URL` points at a tunnel | certify-ac and Mimoto expect `https://ref.ps02.test` ([Inji stack README, Known limits](../deploy/inji-stack/README.md#known-limits))                                                                                                                                                                                                                                             |
| Unknown verifiers                                              | Inji Wallet can check a verifier against Mimoto's trusted list. Collab's settings had `openid4vpClientValidation = false` on 2026-10-14, so the local verifiers should not be refused for that reason; not confirmed on a phone                                                                                                                                                   |
| Any Android emulator                                           | see [emulator attempt](#emulator-attempt)                                                                                                                                                                                                                                                                                                                                         |

## Emulator attempt

On 2026-10-14 the team tried Inji Wallet on the Android emulator (API 34 Google APIs x86_64 image, 2 GB)
for 30 minutes. It did not get past the app's start screen.

- App: `Inji_universal.apk`, version 1.0.0 (code 252), from the GitHub Actions artifact `Alpha.2 LSH build`
  (artifact 11558540625) of [run 37792884997](https://github.com/inji/inji-wallet/actions/runs/37792884997),
  branch `release-1.0.x`, commit `52923de`. A CI build, not a release; the GitHub releases carry no APK.
- It installed and launched, then showed a blank screen for 7 minutes, and again after a restart. The log
  showed `SecureStorage: Device Supports Hardware false` and then `Credentials failed to load for user`.
- Cause, read in the source at that commit: `machines/store.ts` needs a key store backed by secure hardware.
  Without one, creating the encryption key fails and the state machine has no way out of that state. The
  emulator's key store is software only. The same code is in v0.15.0, v0.16.0 and v1.0.0-alpha.1, so no
  current build runs on an emulator.
- Evidence: [the blank screen after 7 minutes](phone-wallet/emulator-blank-after-7-minutes.png) and
  [the log excerpt](phone-wallet/emulator-logcat-excerpt.txt).

## Sources

Read on 2026-10-14:

- [Inji Mobile Collab guide](https://docs.inji.io/inji-wallet/inji-mobile/functional-overview/sandbox-details/inji-setup-guide): APK and TestFlight links, OTP `111111`, insurance test data, self registration
- [Inji Mobile end user guide](https://docs.inji.io/inji-wallet/inji-mobile/functional-overview/end-user-guide): installing, **Scan & Download**, OpenID4VP cross-device and same-device sharing
- Collab Mimoto: `https://api.collab.mosip.net/v1/mimoto/issuers`, `/verifiers` and `/allProperties`
- Inji Wallet source: [inji/inji-wallet](https://github.com/inji/inji-wallet) `machines/store.ts`, and
  [inji/secure-keystore](https://github.com/inji/secure-keystore) `DeviceCapability.kt`

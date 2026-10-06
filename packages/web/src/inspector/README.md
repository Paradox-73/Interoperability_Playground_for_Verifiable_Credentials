# Protocol inspector, sequence diagram and run playback

These three views show what crossed the wire during a run. They read only recorded data: the
`exchange` and `artifact` events the server emits for every HTTP request it records (see
`RecordedExchange` in `packages/protocol/src/exchange.ts`). Nothing is drawn from a template, so a
message appears only because the playground captured it.

| View             | Code             | Where it appears                                                                    |
| ---------------- | ---------------- | ----------------------------------------------------------------------------------- |
| Sequence diagram | `src/sequence/`  | Playground page (after Run), run page `/runs/:id`, playback page                    |
| Inspector        | `src/inspector/` | Same pages, next to the diagram                                                     |
| Playback         | `src/playback/`  | `/runs/:id/playback`, linked from the run page as "Play back this run step by step" |

`RunExplorer.tsx` puts the diagram and the inspector side by side with one shared selection. It takes
the run's events as a prop, so the live run (events from the WebSocket store), a stored run and a
playback position (the first N stored events) all use the same component. Pages load it through
`LazyRunExplorer.tsx`, so the first page load does not carry it.

## Inspector

- **List (left):** recorded messages grouped by protocol step, in recording order
  (`model.ts`, `buildInspectorModel`). Each entry shows the sequence number, method, path, sender,
  receiver and HTTP status. Artefacts the run reported (offer, credential, request object, vp_token,
  result) are listed under the step that produced them. A message the recorder could not tag with a
  step goes under the step in progress.
- **Detail (right):** the selected message, or the newest one until the person chooses
  ("Showing the newest message"). It shows:
  - sender, receiver, capture point (recording client, proxy or hosted reference role), start time
    and duration, and a note when the export redacted tokens;
  - "What is this step?": the protocol term, two or three plain sentences, and a link to the
    specification section that defines the step (`STEP_INFO` in the protocol package; texts under
    `inspector.stepHelp` in `src/locales/en.json`);
  - every protocol object found in the message, each with the **raw text and the decoded view side
    by side**, and Copy and Download buttons;
  - the full request and response: method and URL, status, headers, and the body as a collapsible
    JSON tree or as text.

### What is decoded

`analyse.ts` looks for protocol objects by field name and content, not by which role sent them, so
Inji modules, the reference roles and any third-party role are decoded the same way.

| Object                               | Found in                                                                                                     | Decoded view                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Credential offer                     | `credential_offer`, `credential_offer_uri`, `openid-credential-offer://` URIs, `offer` artefacts             | URI parameters, offer JSON                                                                      |
| Proof of possession                  | `proof.jwt`, `proofs.jwt[]` of a credential request                                                          | JWT header and payload                                                                          |
| Credential                           | `credential`, `credentials[].credential`, a bare SD-JWT body, `credential` artefacts                         | SD-JWT, JWT, JSON-LD with its embedded proof, or an mdoc (base64url CBOR) as JSON               |
| Authorization request (OpenID4VP)    | `openid4vp://` URIs, URLs with `request`, `request_uri`, `presentation_definition`, `dcql_query`             | parameter table                                                                                 |
| Request object                       | `application/oauth-authz-req+jwt` bodies, the body of the "wallet fetches the request" step, `request`       | JWT header and payload; its `presentation_definition` or `dcql_query` gets its own section      |
| Presentation definition / DCQL query | request objects, URL or form parameters                                                                      | JSON tree                                                                                       |
| vp_token                             | `vp_token` in a form or JSON body                                                                            | one section per presentation: a string, an array, or a DCQL object keyed by credential query id |
| presentation_submission              | form or JSON body                                                                                            | JSON tree                                                                                       |
| Verification result                  | response of the result step; any JSON with `vpResultStatus`, `vcResults`, `verificationStatus` or `verified` | JSON tree                                                                                       |

The decoded views (`SectionView.tsx`):

- **JWT:** header, payload (with `iat`, `nbf`, `exp` also shown as dates) and the signature as sent.
- **SD-JWT** (RFC 9901): the issuer-signed JWT, a table of disclosures `[salt, name, value]`, and the
  key-binding JWT when there is one. For each disclosure the inspector hashes it with Web Crypto
  and says whether that digest is in the issuer JWT's `_sd` list. "no: not signed by the issuer"
  is what an altered-disclosure tamper looks like.
- **mdoc** (`mso_mdoc`, ISO/IEC 18013-5): base64url CBOR text whose top-level map is an IssuerSigned,
  Inji Certify's `{docType, issuerSigned}` or a DeviceResponse is decoded by `cbor.ts` (a small CBOR
  reader, RFC 8949) and shown as a JSON tree: byte strings as base64url, `#6.24` items decoded, dates as
  text, and each COSE_Sign1 (`issuerAuth`, `deviceSignature`) as `{protected, unprotected, payload,
signature}` with the MSO decoded inside `issuerAuth.payload`. Other base64url text stays opaque.
- **JSON-LD credential or presentation:** the JSON tree plus a table of the embedded Data Integrity
  or Linked Data proof (`type`, `cryptosuite`, `created`, `verificationMethod`, `proofPurpose`,
  `challenge`, `domain`, `proofValue` or `jws`). Credentials inside a presentation get their own
  section.

The inspector decodes but never verifies signatures; the page says so. The verdict comes from the
verifier role of the run. Bodies stored as base64 (binary, for example raw CBOR bodies) are not decoded.

Downloads are made in the browser from the recorded text and named
`<run id>_message-<n>_<request|response|url>_<path>.<json|txt>`.

## Sequence diagram

- `diagram.ts` turns the run's events into Mermaid `sequenceDiagram` text: lifelines Playground,
  Issuer, Wallet and Verifier (always drawn, so arrows do not move sideways during a run), plus
  Person when the run needed one. **One arrow per recorded exchange**, labelled
  `seq. METHOD /path → status`; a failed exchange (no response or status 400 and above) is drawn as a
  cross arrow `-x`. Person actions become notes on the Person lifeline at the point they happened.
- Participants come from the run configuration (`issuer`, `wallet`, `verifier` role ids); other
  names seen by the proxy are matched by words they contain (`mimoto` and `inji-web` are the
  wallet, `verify` the verifier, `certify` the issuer); anything else is the playground.
- Characters Mermaid reads as syntax (`#`, `;`, `<`, `>`, `%%`) are written as Mermaid entity codes.
- `accTitle` (run id and the three roles) and `accDescr` (how many messages, and that the timeline
  has the same steps as text) are in the source; Mermaid writes them as the SVG's `<title>` and
  `<desc>`.
- `SequenceDiagram.tsx` then makes each arrow label a focusable button (`tabindex="0"`,
  `role="button"`, a label such as "Wallet to Issuer: 3. POST /ref/issuer/credential → 200. Open in
  the inspector."). Click, Enter or Space opens that exchange in the inspector and moves focus to
  its heading. Clicking the arrow line works too. The selected arrow is underlined and marked with
  `aria-current`.
- The newest arrow is drawn thicker and its label bold. When motion is allowed it draws itself from
  sender to receiver once (0.7 s). With `prefers-reduced-motion: reduce` the component leaves the
  animation class out (and `sequence.css` disables it as a second guard); the mark stays.
- Mermaid is loaded with a dynamic `import()` in `mermaid-loader.ts`, the only file that loads it;
  `test/sequence-lazy.test.ts` fails if a static import appears. Mermaid runs with
  `securityLevel: 'strict'`, because labels come from recorded traffic. If drawing fails, the
  messages are listed as buttons instead.
- The Mermaid theme follows the page theme (`<html data-theme>`).

## Playback

- `/runs/:id/playback` reads `GET /api/runs/{id}/events` and `GET /api/runs/{id}` and replays the
  events into the timeline, the diagram and the inspector.
- The heading says "Playback of run ID recorded on DATE" (the run's `createdAt`, or the time of its
  first event when the summary is missing; shown in UTC). A notice says it is a recording and that
  nothing is sent again. The mode badge in the top bar says "Playback".
- Controls: Restart, Step back, Play / Pause (Play again at the end), Step forward, Go to end, speed
  0.5× to 4×, and a position slider; "Event N of M" is a status region.
- While playing, the pause before each event is the recorded gap between events, kept between
  350 ms and 2 s so fast runs stay readable and a long wait for a person does not stall, then
  divided by the speed (`player.ts`, `delayBefore`).

## Tests

| File                             | What it checks                                                                                                                                                                                                                                  |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/inspector-decode.test.ts`  | JWT and SD-JWT decoding (disclosures, key-binding JWT, missing trailing `~`, array-element disclosures, bad parts kept), `_sd` digests, placeholders rejected                                                                                   |
| `test/inspector-analyse.test.ts` | Every object kind in the table above, JSON-LD presentations with proofs, DCQL vp_token, Inji Verify's vp-results, binary bodies skipped, grouping by step; an mdoc credential and DeviceResponse (`fixtures/mdoc.synthetic.json`) shown as JSON |
| `test/inspector.test.tsx`        | Disclosures table next to the raw SD-JWT, `_sd` check and a forged disclosure, request object and presentation definition, vp_token with KB-JWT, step help link, copy and download, axe                                                         |
| `test/sequence.test.tsx`         | One arrow per exchange, accTitle and accDescr, failed arrows, person notes, participant mapping, escaping; focusable messages, click / Enter / line click select the exchange, newest mark, reduced motion                                      |
| `test/sequence-lazy.test.ts`     | Mermaid is imported only dynamically, only by the loader                                                                                                                                                                                        |
| `test/playback.test.tsx`         | Heading with run id and date, fallback date, stepping through the synthetic run into timeline, diagram and inspector, play and pause, load error, link from the run page; player reducer and pauses                                             |

`test/fixtures/decodable-run.ts` builds a made-up SD-JWT VC run at test time whose payloads decode
(real base64url JSON, `_sd` digests that match, placeholder signature bytes, no keys). Playback
tests use the protocol package's `example-run.synthetic.json` until a recorded reference run is
exported to the fixtures (work package WP-08). In jsdom, Mermaid cannot lay out text, so
`test/fake-mermaid.ts` stands in for it and writes the same element classes.

On 2026-10-04 the real Mermaid 11.17.2 was run in headless Chromium on a generated diagram
(three messages, one note): it produced one `.messageText` and one `.messageLine0` per message, and
`<title>` and `<desc>` from accTitle and accDescr, which are the elements `SequenceDiagram.tsx`
relies on.

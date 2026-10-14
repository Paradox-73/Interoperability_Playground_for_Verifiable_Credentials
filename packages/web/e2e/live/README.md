# Live browser tests

Playwright project `e2e-live`: needs the bundle (Inji stack and playground) running.
Run with `npm run e2e:live` (one worker: the tests share the stack).

- `all-inji-run.spec.ts`: Inji Certify (authorization code), Inji Web and Inji Verify chosen in the playground page; writes
  screenshots 1-3 with `--screenshots`. Needs the holder-web profile.
- `sdk-verify.spec.ts`: Inji Certify, the reference wallet and the Inji Verify web component in the playground page.
- `inji-web-ui.spec.ts`: Inji Web's own pages on 28004: log in, add a card from Inji Certify (certify-ac), share it
  with Inji Verify. Needs the holder-web profile.

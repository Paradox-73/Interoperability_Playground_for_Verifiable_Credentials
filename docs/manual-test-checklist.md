# Manual test checklist before recording

Run these steps on your own machine before you record the video or demo. They take about 35 minutes on the
first run (most of it is Docker pulling and starting images) and 20 minutes when the images exist. Timings
below were measured on a Windows 11 laptop with Docker Desktop at 8 GB on 2026-10-14. A Mac with a 4 GB Docker
VM took 969 s for step 6 on 2026-10-13, so give Docker 8 GB where you can.

Stop at the first step that does not match its expected output, and note the step number, the command and the
output. [Troubleshooting in docs/setup.md](setup.md#troubleshooting) lists the known causes.

## Before you start

| Need                                       | macOS                       | Linux                                 | Windows 11                                     |
| ------------------------------------------ | --------------------------- | ------------------------------------- | ---------------------------------------------- |
| Shell for the commands below               | Terminal, zsh or bash       | any shell                             | Git Bash (not cmd.exe or PowerShell)           |
| Node.js 24.21 or newer, npm 11.19 or newer | `node -v`, `npm -v`         | the same                              | the same                                       |
| Docker with Compose 2.24 or newer          | Docker Desktop, 8 GB memory | Docker Engine with the Compose plugin | Docker Desktop (Linux containers), 8 GB memory |
| Git                                        | preinstalled                | `git --version`                       | Git for Windows                                |
| Free ports                                 | 28000 to 28999              | 28000 to 28999                        | 28000 to 28999                                 |

Platform notes:

- Linux: if the reference server is not reachable from the containers as `ref.ps02.test`, set
  `PLAYGROUND_REF_UPSTREAM` to the host bridge address. See the troubleshooting table.
- Windows: if Git Bash rewrites a path in a `docker` command you type by hand, prefix it with
  `MSYS_NO_PATHCONV=1`. The npm commands do this already.
- Stop other Docker projects that use the ports above. Containers that do not start with `ps02-` are not
  touched by any command here.

## Steps

1. **Get the code.** Run `git clone <repository URL> && cd inji-interop-playground`, then `git log --oneline -1`.
   Expected: the newest commit is the one you were told to test. Time: 30 s.
2. **Install.** Run `npm ci`. Expected: it ends without `ERR!` and `npm ls --depth=0` lists no `UNMET`. Time: 40 s.
3. **Static checks.** Run `npm run lint && npm run format:check && npm run typecheck`. Expected: all three
   exit 0 with no warnings. Time: 90 s.
4. **Unit tests.** Run `npm test`. Expected: `Test Files 79 passed` and `Tests 1203 passed` (or the numbers in
   the [README](../README.md#current-numbers) if they changed). Time: 80 s. A test that fails under CPU load
   passes on a second `npm test`; report it only if it fails twice.
5. **Reference matrix, no Docker.** Run `npm run matrix:reference`. Expected: the last lines read
   `123 of 123 cells as specified (pass 119, fail 0, error 0, not supported 4)`. Time: 40 s.
6. **Browser tests.** Run `npm run e2e`. Do not run anything else that builds the UI at the same time.
   Expected: `12 passed`. Time: 60 s.
7. **Reference mode in the browser.** Run `npm run build && npm start`, open <http://localhost:28100>. Expected:
   the Playground page with the three columns, `Inji stack not configured: reference roles only` in the header.
   Choose Reference issuer, Reference wallet, Reference verifier, SD-JWT VC, Happy path and press **Run**.
   Expected: result `Pass` within 5 s, and the inspector lists the exchanges. Stop the server with Ctrl+C.
8. **Preflight for the bundle.** Run `npm run demo -- --preflight`. Expected: `ports free` lists all eight ports and the last line is `preflight passed`,
   with Docker memory of at least 3.5 GiB. Time: 5 s.
9. **Stack smoke test.** Run `npm run stack:smoke`. Expected: twelve `check ok` lines, then `SMOKE PASS`, and
   no `ps02-` container left (`docker ps` shows none). Time: 210 s with the images present (the first run
   pulls images and takes longer).
10. **Start the stack.** Run `npm run stack:up`. Expected: `stack is up`. Time: 90 to 130 s.
11. **Live tests.** Run `npm run test:live`. Expected: `Test Files 2 passed`, `Tests 20 passed`. Time: 60 s.
12. **Live matrices, with a host-mode server.** In a second terminal run
    `PLAYGROUND_STACK=host PLAYGROUND_PUBLIC_URL=https://ref.ps02.test npm start`. In the first terminal run
    `npm run matrix:live`, then `npm run matrix:live -- --spec live-holder-web`. Expected:
    `16 of 16 cells as specified (pass 11, fail 4, error 0, not supported 1)` in about 80 s, and
    `10 of 10 cells as specified (pass 4, fail 6, error 0, not supported 0)` in about 45 s. The `fail` cells are
    gaps in Inji modules, so they are expected. A cell that differs from its spec is the failure to report.
13. **Live browser test.** Run `npm run e2e:live`. Expected: `1 passed` (Inji Certify to the Inji Verify web
    component, `Valid`). Time: 10 s.
14. **Check the pages by eye.** With the host-mode server running, open `/`, `/runs`, `/matrix`, `/gaps`,
    `/about`. Expected: every page renders and the browser console shows no red error other than one
    `Content Security Policy` line about `eval` (the schema library's feature test, harmless). Time: 3 min.
15. **Stop the host-mode server and the stack.** Press Ctrl+C in the second terminal, then run
    `npm run stack:down`. Expected: no `ps02-` container in `docker ps`. Time: 15 s.
16. **One-command bundle.** Run `npm run demo`. Expected: `DEMO PASS` and the table of five cells, all
    `pass`, then the bundle stays up on <http://localhost:28100>. Time: 6 to 7 minutes (image build, 90 to
    180 s for the bundle, 30 s for the cells).
17. **Walk the video script.** Follow [video-script.md](video-script.md) shot by shot against the running
    bundle, without recording. Expected: every shot works as written, and every run you start ends with the
    result the script names. Time: 15 minutes. Note each wait over 3 seconds, because you cut it in editing.
18. **Stop the bundle.** Run `npm run down`. Expected: no `ps02-` container left.
19. **Record your result.** Write the date, the operating system, the Docker memory setting and each step's
    result (pass, or the first differing line) in the team chat.

## What this checklist does not cover

- Inji Wallet mobile on a phone. No run is recorded, so do not show one in the video.
- The hosted GitHub Actions workflows, which cannot start until the account billing problem is fixed.

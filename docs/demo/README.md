# Demo

How to prepare the playground for the demo, with the commands that do it. The cells are the ones
of [packages/cli/specs/demo.yaml](../../packages/cli/specs/demo.yaml), which `npm run demo` runs and checks
before anything is shown.

## Before recording

1. Docker Desktop (or Docker Engine with Compose 2.24 or newer) running, with 6 to 8 GB of memory
   ([set-up, memory](../setup.md#memory-and-start-times)).
2. Nothing else on ports 28000-28999; stop a development stack with `npm run stack:down`.
3. Check, start and run the demo cells:

   ```bash
   npm run demo -- --preflight   # Docker, Compose version, memory, free ports
   npm run demo                  # builds the playground image, starts the bundle, runs the cells, leaves it up
   ```

   It prints a table of the cells and `DEMO PASS` when every cell gave the verdict its spec expects.

4. Open <http://localhost:28100>. The history page already shows the demo runs.
5. The bundle's public URL is `https://ref.ps02.test`, so the Inji Web cells run in the bundle too (`TC_PG_DEMO_05`).
   For the whole Inji Web matrix, start a host-mode server instead: see [set-up](../setup.md#local-inji-stack)
   and `npm run matrix:live -- --spec live-holder-web`.

Stop everything afterwards with `npm run down`.

## Script, video and slides

The shot-by-shot script of the video (4 minutes 50 seconds, each shot with its narration and the rubric
criterion it proves) and the ten-slide outline are in [video-script.md](../video-script.md). The checklist to
run before recording is [manual-test-checklist.md](../manual-test-checklist.md).

Numbers to quote: [README, Current numbers](../../README.md#current-numbers), the only place they are kept.
Live cells that fail are blocked by gaps the [gap register](../gaps/README.md) describes, each with an issue
draft. Every HTTP message of every run is recorded, and exports are redacted before they leave the server.

Record at 1280 by 720 or larger with the browser zoomed to 110 % so inspector text stays readable.

# Cook Along: testing phase plan

Goal: find and fix the bugs behind "the timer isn't on the pan" using automated tests, before real footage is needed. Scope is everything built so far, with the AR anchoring pipeline first.

## How to run this

- **Run one sub-phase per session.** Start a fresh session (or `/clear`) and say:
  `Run sub-phase 1.1 from docs/testing-plan.md`
  A fresh session reads only this file and the code it needs, which costs far less than continuing one long conversation.
- **Every sub-phase appends its results to `docs/testing-log.md`.** The next sub-phase reads the log, so nothing needs re-explaining.
- **Set the model and effort before starting** (model picker in the app, or `/model`). Recommendations are in the table.
- **No deploys in any sub-phase.** Commits are local only, and only where noted.
- **Kitchen photos stay out of git.** Test fixtures built from your pan photos go in `tests/fixtures/private/`, which is gitignored.

## Model and effort key

| Model / effort | Use it for |
|---|---|
| Opus 5.5, high | subtle logic, coordinate maths, deciding root causes |
| Opus 5.5, medium | focused fixes once the cause is known |
| Sonnet 5.5, medium | writing test code, running tests, reading results |
| Sonnet 5.5, low | small mechanical changes, summaries |
| Haiku 5.5, low | installs, commits, file shuffling |

## Plan

Priority: **P1** = on the critical path to fixing anchoring. **P2** = valuable, skippable if short on time. **P3** = nice to have.

| ID | Sub-phase | What it's for | Est. | Model | Effort | Pri |
|---|---|---|---|---|---|---|
| **0.1** | Snapshot | Commit current state to a `testing-phase` branch so every fix is reviewable and reversible | 5m | Haiku 5.5 | low | P1 |
| **1.1** | Code review: AR pipeline | Find bugs in detection, tracking, mapping and rendering before writing any tests | 30m | Opus 5.5 | high | P1 |
| **1.2** | Dead code inventory | List leftovers from the four earlier tracker attempts, safe to delete or not | 10m | Sonnet 5.5 | low | P3 |
| **2.1** | Install Playwright | Chromium and WebKit test browsers | 10m | Haiku 5.5 | low | P1 |
| **2.2** | Synthetic test clips | Animate your pan photos with known motion, so the pan's true position is known in every frame | 25m | Sonnet 5.5 | medium | P1 |
| **3.1** | Playwright config | iPhone 16 Pro viewport, touch, fake camera fed from the clips | 20m | Sonnet 5.5 | medium | P1 |
| **3.2** | Mock the vision route | Scripted Gemini answers: accurate, wrong, empty, failing, slow. Reproducible, uses no quota | 20m | Sonnet 5.5 | medium | P1 |
| **3.3** | Measurement | Per-frame error between where the timer is drawn and where the pan really is | 30m | Opus 5.5 | high | P1 |
| **4.1** | Baseline run: Chromium | Measure today's behaviour across clips, camera shapes and Gemini scenarios | 20m | Sonnet 5.5 | medium | P1 |
| **4.2** | Baseline run: WebKit | Same, on the engine closest to Safari | 15m | Sonnet 5.5 | medium | P2 |
| **4.3** | Triage | Match each measured failure to a code review finding; rank the fixes | 15m | Opus 5.5 | high | P1 |
| **5.1** | Fix: camera crop mapping | Draw the timer in screen coordinates, not raw camera coordinates | 30m | Opus 5.5 | high | P1 |
| **5.2** | Fix: hide when lost | Hide the timer when tracking fails instead of freezing it in place | 20m | Opus 5.5 | medium | P1 |
| **5.3** | Fix: size ceiling | Stop the box growing frame on frame (the giant timer) | 15m | Opus 5.5 | medium | P1 |
| **5.4** | Fix: re-seed blending | Stop each Gemini answer snapping the timer to a possibly wrong place | 25m | Opus 5.5 | high | P2 |
| **5.5** | Fix: tracker aspect | Stop squashing the portrait camera feed into a 4:3 canvas | 15m | Sonnet 5.5 | medium | P2 |
| **5.6** | Remove dead code | Delete what 1.2 found | 10m | Sonnet 5.5 | low | P3 |
| **6.1** | Functional end-to-end | Everything that isn't AR: flows, page turn, swipe, timer controls, no-scroll | 30m | Sonnet 5.5 | medium | P2 |
| **7.1** | Performance | CPU per frame under phone-level throttling, as a proxy for heat | 15m | Sonnet 5.5 | medium | P3 |
| **8.1** | Report | Before and after numbers, what's left, what still needs your phone | 10m | Sonnet 5.5 | low | P1 |

**Totals:** P1 critical path ≈ 4h 05m. Everything ≈ 6h 10m.

If you're short on time, run the P1 rows in order and skip the rest. That path alone should answer whether the anchoring can be fixed.

## Sub-phase details

### 0.1 Snapshot
- **Do:** create branch `testing-phase`, commit the current working tree. No push.
- **Needs you:** approve the commit.
- **Done when:** `git status` is clean; the commit hash is in the log.

### 1.1 Code review: AR pipeline
- **Scope:** `app/cook/page.tsx` (vision, anchor and render sections), `lib/useFlow.ts`, `lib/anchor.ts`, `lib/useVision.ts`, `app/api/look/route.ts`.
- **Confirm or rule out each known suspect:**
  1. Camera crop: boxes are in full-frame camera coordinates, but `object-cover` crops the feed to fit the screen, and the overlay is drawn as if screen = full frame.
  2. The tracker freezes at its last position when it loses the pan instead of hiding.
  3. Size compounds frame on frame with no absolute ceiling.
  4. Every Gemini answer re-seeds and snaps the timer, including inaccurate answers.
  5. The tracking canvas is a fixed 240x180 (4:3), squashing a portrait feed.
  6. The tilt is computed from a box whose shape is distorted by (1).
  7. Polling stops once Gemini confidently sees the pan (`settledRef`), so when the tracker loses the pan and freezes "waiting for the model", no re-detection ever comes. Together with (2) this is the likely cause of the timer stuck on a wall.
- **Out:** findings with `file:line`, severity and evidence, in the log. **No fixes.**

### 1.2 Dead code inventory
- **Scope:** `lib/usePan.ts`, `useStation.ts`, `useColour.ts`, `stationColour.ts`, `useMarkers.ts`, `markers.ts`, `useMotion.ts`, `app/markers/`.
- **Out:** each module marked used, unused or partly used, with a safe-to-delete verdict.

### 2.1 Install Playwright
- **Do:** `npm i -D @playwright/test`, then `npx playwright install chromium webkit` (a few hundred MB).
- **Done when:** a smoke test opens the home page in both browsers.

### 2.2 Synthetic test clips
- **Source:** `~/Downloads/IMG_9895.HEIC`, `IMG_9896.HEIC`, `IMG_9897.HEIC`. Convert to JPEG into `tests/fixtures/private/`.
- **Clips:** A static (control), B slow slide, C zoom in and out, D handheld shake, E pan leaves frame and returns, F no pan at all (a crop of wall or counter).
- **Each clip in three camera shapes:** 480x640 (4:3 portrait), 720x1280 (16:9 portrait), 640x480 (landscape). The shape matters because of suspect 1.
- **Formats:** `.y4m` for Chromium's fake camera, `.mp4` for the WebKit stub.
- **Ground truth:** a hand-checked pan box on each source photo, transformed per frame, saved as JSON in camera coordinates.
- **Limit:** this is 2D motion of still photos. It tests the mapping and tracker mechanics, not real 3D motion, steam or lighting. That's what your recording is for.

### 3.1 Playwright config
- iPhone 16 Pro: 402x874 viewport, scale factor 3, touch, mobile.
- Chromium flags: `--use-fake-ui-for-media-stream`, `--use-fake-device-for-media-stream`, `--use-file-for-fake-video-capture=<clip>`.
- Camera permission granted; video and trace recording on.
- **Done when:** the cook screen shows a clip as its camera.

### 3.2 Mock the vision route
- Intercept `/api/look` with `page.route`. Scenarios: accurate box (from ground truth), offset box (Gemini-style error), `panBox: null`, 503 then fallback, timeout, 15s delay.
- **Done when:** each scenario is selectable per test and reproducible.

### 3.3 Measurement
- Add `data-testid` to the ring and timer. Test-only attributes; no behaviour change.
- At each sample, read the drawn rectangle. Map the ground-truth box from camera to screen coordinates with **object-cover maths written independently in the test**, never imported from the app, so the measuring stick can't share the app's bug.
- **Per run:** centre error in px, size ratio, and visible-or-hidden. **Summary:** median and p90 error, % of frames on the pan, % of frames visible with no pan in shot.
- **Out:** a CSV per run, plus a summary.

### 4.1 Baseline run: Chromium
- Every clip x every camera shape x the key mock scenarios (accurate, offset, failure).
- **Out:** a summary table and run videos in `tests/results/baseline/`.

### 4.2 Baseline run: WebKit
- No fake-camera flags in WebKit: stub `getUserMedia` to return a canvas stream playing the `.mp4`.
- Smaller matrix: clips B, D and E, in two shapes.

### 4.3 Triage
- Map each baseline failure to a 1.1 finding: confirmed, refuted, or new.
- Re-rank the Phase 5 order if the numbers say otherwise.

### Phase 5 fixes
Every fix follows the same loop: **implement, re-run the relevant baseline subset, record before and after numbers in the log, commit locally on your OK.**

- **5.1 Camera crop mapping:** convert camera-normalised boxes to screen coordinates using the object-cover scale and offset. Apply to the ring, the timer, and the tilt.
- **5.2 Hide when lost:** the tracker returns nothing after N failed frames; the timer and ring hide; no stale frozen box.
- **5.3 Size ceiling:** bound the size absolutely, relative to the seed box, not per frame.
- **5.4 Re-seed blending:** a new Gemini box eases in; one that disagrees badly with a confident track is rejected.
- **5.5 Tracker aspect:** size the tracking canvas to the camera's shape.
- **5.6 Remove dead code** found in 1.2.

### 6.1 Functional end-to-end
- Home, recipe, ingredients (omit onions and peppers), cook; steps reflect the omissions.
- Page turn forwards and backwards; swipe left and right; play and pause.
- Voice button present. Home and recipe don't scroll at 402x874; the ingredients back button stays fixed.

### 7.1 Performance
- Chromium with 4x CPU throttling. Measure tracker time per frame, achieved FPS, and long tasks. Flag anything over 33ms per frame.

### 8.1 Report
- Before and after metrics; what's fixed; what's left; a checklist for your phone.
- **Deploy is your decision**, made after reading this.

## After your recording (separate, later)

| ID | Sub-phase | What it's for | Est. | Model | Effort |
|---|---|---|---|---|---|
| 9.1 | Prepare real footage | Convert your clip; mark the pan in a sample of frames as ground truth | 25m | Opus 5.5 | high |
| 9.2 | Real-footage run | Run the same harness on real motion, steam and light; compare with the synthetic results | 20m | Sonnet 5.5 | medium |

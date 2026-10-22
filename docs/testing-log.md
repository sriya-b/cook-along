# Cook Along: testing log

Each sub-phase in `docs/testing-plan.md` appends a section here when it finishes:
what it did, what it found, the numbers, and anything the next sub-phase needs to know.
Newest at the bottom.

---

## 0.1 Snapshot (done)

- **Branch:** `testing-phase`, created from `main` at `f304e54`.
- **Commit:** `d7ab284` "Snapshot before the testing phase", local only, not pushed.
- **Contents:** 23 files: the AR pipeline, cookbook page turn, ingredients checklist, chop linework.
- **Checked before staging:** no API keys or tokens in any staged file; no kitchen photos; no media files.
- **In the snapshot:** `docs/previews/chop-teal.mp4` (the teal preview, ~300KB, no personal photos). **Not in the snapshot:** `chop-over-camera.mp4`, which shows your kitchen and is gitignored on purpose.
- **Working tree after:** clean.
- **Next:** 1.1 code review, against the `testing-phase` branch.

## 1.1 Code review: AR pipeline (done)

Read-only review of `app/cook/page.tsx`, `lib/useFlow.ts`, `lib/anchor.ts`, `lib/useVision.ts`, `app/api/look/route.ts`, plus `lib/useCamera.ts` for the camera constraints. **No fixes made.**

**Result: all 7 suspects confirmed. Three are worse than described. 9 new findings.**

### Summary, ranked

| # | Finding | Severity | Status |
|---|---|---|---|
| F1 | Camera crop: boxes are drawn in full-frame camera coordinates on a cropped screen | High | suspect 1, confirmed |
| F2 | When tracking is lost, the tracker re-seeds on the stale box and follows whatever is there (wall, tile) | High | suspect 2, **worse** |
| F3 | Polling stops once settled, so no re-detection ever comes | High | suspect 7, confirmed |
| F4 | **The timer, and its play button, only exist when a pan is detected**, so if vision fails the timer can never be started | High | **new** |
| F5 | Box size compounds per frame with no absolute bound; the ring has no size cap at all | High | suspect 3, **worse** |
| F6 | Tilt is never zero, even with no crop, because it divides normalised h by normalised w | Medium | suspect 6, **worse** |
| F7 | Every Gemini answer snaps the ring to the new box | Medium | suspect 4, confirmed |
| F8 | The tracking canvas is a fixed 4:3, stretching a portrait feed | Medium | suspect 5, confirmed |
| F9 | Points are chosen by total gradient, not minimum eigenvalue, so edge points slide along the rim (aperture problem) | Medium | new |
| F10 | No forward-backward check; scale uses a mean that outliers distort | Medium | new |
| F11 | After a step change, the first look can be swallowed by the 9s throttle, delaying the first answer ~14s plus latency | Medium | new |
| F12 | The ring (raw, 15fps) and the timer (eased, 60fps) move out of sync | Low | new |
| F13 | Point selection keeps the first 44 of a 63-point row-major grid, biasing towards the top of the box | Low | new |
| F14 | The box goes stale and stays drawn when the camera stops | Low | new |
| F15 | The timer can sit off the top of the screen or over the cookbook | Low | new |
| F16 | `useAnchor` runs a requestAnimationFrame loop forever, even with no box; `seedRef` in `useFlow` is set but never read | Low | new, cleanup |

### Details

**F1, camera crop (High).** The video fills the screen with `object-cover` ([page.tsx:453](app/cook/page.tsx:453)), which crops the feed to the screen's shape. But boxes are normalised to the **full** frame: Gemini receives the whole frame ([useVision.ts:38](lib/useVision.ts:38)) and returns 0–1000 of it ([route.ts:35-38](app/api/look/route.ts:35)), and flow draws the whole frame into its canvas ([useFlow.ts:197](lib/useFlow.ts:197)). The overlay then uses those numbers directly as screen percentages ([page.tsx:553-556](app/cook/page.tsx:553), [anchor.ts:99-100](lib/anchor.ts:99)). Nothing converts between the two.
- `useCamera` requests no resolution ([useCamera.ts:30](lib/useCamera.ts:30)), so the feed's shape is the browser default and unknown for your iPhone.
- **Worked example**, 402x874 screen with a 480x640 portrait feed: the cover scale is 1.366, so the video is drawn 656px wide with 127px cropped off each side. A pan at x 0.2–0.4 is truly at screen x 4–135px, but gets drawn at 80–161px. Widths come out at 61% of true size, and everything is pulled towards the centre horizontally. Vertical placement is correct in this case.
- **Correction:** I earlier said this makes the ring "about 60% too wide". For a portrait 4:3 feed it is the opposite: too narrow, by the same factor. The giant rings in the screenshots came from F5, not from this.

**F2, re-seed on stale box (High, worse than suspected).** When fewer than 8 points survive, the tracker clears its points but keeps the box ([useFlow.ts:224-228](lib/useFlow.ts:224)). On the very next frame, an empty point list triggers `choosePoints` on that same stale box ([useFlow.ts:208-210](lib/useFlow.ts:208)), so it **starts tracking whatever texture is now there**: wall, tile, counter. The box never becomes null, so the ring and timer keep rendering. This is the mechanism behind "ring on the tile floor". It is not a freeze, it is a silent switch of target.

**F3, polling stops (High).** One confident look at the right station sets `settledRef` ([page.tsx:278](app/cook/page.tsx:278)); every later `takeOne` returns immediately ([page.tsx:256](app/cook/page.tsx:256)) until the step changes ([page.tsx:245-247](app/cook/page.tsx:245)). With F2, the tracker "waits for the model" ([useFlow.ts:225](lib/useFlow.ts:225)) and the model never looks again for the rest of the step.

**F4, the timer depends on detection (High, new).** The whole timer UI, including the play button, only renders when `anchor` exists ([page.tsx:563](app/cook/page.tsx:563)). `anchor` needs `tracked`, which needs `panBox`, which only comes from a **real** Gemini answer ([page.tsx:266-271](app/cook/page.tsx:266)). With no key, quota exhausted, a timeout, or a mock fallback (which always returns `panBox: null`, [route.ts:52](app/api/look/route.ts:52)), **the timer never appears and cannot be started**. Detection is also cleared on every step change ([page.tsx:155](app/cook/page.tsx:155)), so even when vision works, the timer is missing for the first ~15–30s of each timed step: exactly the moment it's needed.

**F5, size compounding (High, worse).** The per-frame scale is clamped to 0.93–1.08 ([useFlow.ts:246-247](lib/useFlow.ts:246)) but applied to the previous frame's box ([useFlow.ts:249-253](lib/useFlow.ts:249)), with no bound relative to the seed. At 15fps the box can grow 1.08^15, about **3.2x per second**. The timer's scale is clamped for display ([anchor.ts:104](lib/anchor.ts:104)), but **the ring uses the raw size** ([page.tsx:555-556](app/cook/page.tsx:555)) and has no cap. `seedRef` is stored ([useFlow.ts:93](lib/useFlow.ts:93)) but never read, so the bound was clearly intended and never wired.

**F6, tilt (Medium, worse).** `flat = box.h / box.w` ([anchor.ts:34](lib/anchor.ts:34)) divides two numbers normalised to **different axes**: h to frame height, w to frame width. For a 480x640 feed, a pan seen straight down gives h/w = 0.75 in normalised units, so tilt = acos(0.75) = **41° when it should be 0°**. The tilt is wrong with or without F1. It needs pixel units.

**F7, re-seed snapping (Medium).** Each real answer calls `setPanBox` with a fresh object ([page.tsx:271](app/cook/page.tsx:271)). That resets the tracker's box and calls `setBox(seed)` immediately ([useFlow.ts:92-98](lib/useFlow.ts:92)). The timer eases, but the ring jumps. In practice F3 limits this to before settling.

**F8, canvas squash (Medium).** Fixed 240x180 ([useFlow.ts:8-9](lib/useFlow.ts:8)). With a 480x640 portrait feed, x is sampled at 0.5 and y at 0.28: one canvas pixel is 2 video pixels across but 3.6 down. Vertical motion has poor resolution and speckles smear. Placement stays consistent, because x and y are both normalised, but tracking quality drops.

**F9, aperture problem (Medium, new).** The point filter sums `ix² + iy²` ([useFlow.ts:124-132](lib/useFlow.ts:124)), which is the trace of the structure tensor, despite the constant being named `MIN_EIGEN`. Straight edges pass it: the pan's rim, the grates. Points on a straight edge can't measure motion along that edge, so they slide. The tracker's only other guard is `det < 1e-4` ([useFlow.ts:174](lib/useFlow.ts:174)), which is nearly always true.

**F10, outliers (Medium, new).** There is no forward-backward check. Translation uses a median ([useFlow.ts:232-233](lib/useFlow.ts:232)), which resists outliers, but scale uses a **mean** spread over all points ([useFlow.ts:236-245](lib/useFlow.ts:236)). A few points latched onto a hand or steam inflate it, which feeds F5.

**F11, slow first look after a step change (Medium, new).** A step change restarts the poll effect, which calls `takeOne` immediately ([page.tsx:290](app/cook/page.tsx:290)). If the previous look was under 9s ago, `look()` returns null from the throttle ([useVision.ts:62](lib/useVision.ts:62)), and the next try is 14s later ([page.tsx:291](app/cook/page.tsx:291)). The same happens if a call is still in flight. Combined with model latency, the first answer for a new step can take ~25s, while "Detecting…" shows.

**F12, ring and timer out of sync (Low).** The ring draws `tracked` directly, so it steps at 15fps ([page.tsx:549-557](app/cook/page.tsx:549)). The timer draws `anchor`, eased at 60fps ([anchor.ts:65-91](lib/anchor.ts:65)). During motion the timer trails the ring by roughly 130ms.

**F13, point bias (Low).** A 9x7 grid gives 63 candidates and `slice(0, 44)` keeps the first 44 in row order ([useFlow.ts:115-135](lib/useFlow.ts:115)), dropping most of the bottom rows. Tracking concentrates on the top of the box: the far rim, and the hob behind it.

**F14, stale box (Low).** When `active` goes false, the tracking loop stops but `box` is never cleared ([useFlow.ts:100-101](lib/useFlow.ts:100), [262-266](lib/useFlow.ts:262)), so the ring can stay drawn over the camera-error screen.

**F15, timer placement (Low).** `top = box.y - box.h * 0.34` ([anchor.ts:37](lib/anchor.ts:37)) can go negative, or land under the cookbook, which covers about the top 23% of the screen. The timer is drawn after the book in the DOM, so it overlaps the book rather than hiding behind it.

**F16, cleanup (Low).** `useAnchor`'s requestAnimationFrame loop never idles ([anchor.ts:65-91](lib/anchor.ts:65)). `seedRef` is unused (see F5).

### What this means for the plan

- **F4 is not in Phase 5 and should be.** It's the one finding that makes a feature unusable rather than inaccurate. Suggested fix: the timer always exists; it **anchors to the pan when there is one** and falls back to a fixed position otherwise. This sits alongside your rule that it should anchor to the pan, rather than against it.
- **F2 + F3 should be fixed together** in 5.2: "hide when lost" must also resume polling, or the timer just disappears for the rest of the step.
- **F6 should join 5.1**, because the same pixel-unit conversion fixes both.
- **F9 and F10 are the case for OpenCV's tracker** (`goodFeaturesToTrack` uses the minimum eigenvalue, plus the forward-backward check) if the 4.1 baseline shows tracking slipping after F1–F5 are fixed.
- **For 3.1:** the harness should log `video.videoWidth/videoHeight`, so we learn the real feed shape that F1 and F6 depend on.

## Fix: F2 + F5, timer always on screen, ring removed (done, not deployed)

Asked for: fix F2 and F5; keep the timer on screen at all times, following the pan and holding to the screen edge on the pan's side when the pan is out of shot; remove the ring. F1, F6 and F8 were fixed alongside, because clamping to the screen edge needs real screen coordinates.

### What changed

- **Tracking the scene, not the pan's texture** ([lib/flowTracker.ts](lib/flowTracker.ts)). The pan doesn't move on the hob, so on screen it moves exactly as the whole scene does. The tracker now follows points spread across the whole frame and moves the box by their median motion.
  - **F2 fixed.** Losing track holds the box still and picks fresh points across the frame. It never adopts whatever is inside the stale box.
  - **F5 fixed.** Size is set only by the model, and never compounds.
  - The box can leave the frame (up to 2.5 frame-widths), so the tracker still knows which side the pan went.
  - **F9:** minimum-eigenvalue point selection. **F13:** points are thinned evenly, not first-n.
  - Pure module with no React or DOM, so it runs in Node.
- **F8 fixed** ([lib/useFlow.ts](lib/useFlow.ts)). The canvas takes the camera's shape (long side 240).
- **F1 + F6 fixed** ([lib/placement.ts](lib/placement.ts)). Camera coordinates go through the same scale-and-crop as `object-cover`, and tilt is computed in pixels.
- **Timer placement** ([lib/placement.ts](lib/placement.ts)):
  - Hangs above the pan, leaning with it.
  - Clamped between the cookbook (214px) and the assistant panel (232px from the bottom), 12px from the sides.
  - When clamped, it sits flat at the edge nearest the pan.
  - Centred in the open area before any pan is found.
  - Scale is 0.7–1.3 and always fits the width.
- **F4 fixed.** The timer renders whenever the step has one, found or not ([page.tsx](app/cook/page.tsx)).
- **Ring removed** (JSX and `.pan-ring` CSS). **F12 is moot.**
- **The pan box now survives a step change**, and a "no pan in view" answer no longer erases it. The tracker knows better where the pan went.
- **F14 is mostly moot**: the timer only shows on timer steps.
- **Model pinned** to `gemini-3.5-flash-lite`, which is what the `-latest` alias already pointed to. No speed change.

### Tests

The tests run with `npm test`. They use a synthetic worktop: a textured world plus a camera window moving over it, so the pan's true position is known at every frame.

| Test | Result |
|---|---|
| Shaky handheld path, 600 frames, up to ~9px/frame | Worst error **0.42px** (180x240 frame) |
| Size over 400 frames of motion | **Identical** to the seed every frame |
| Camera pans left 600px (pan exits the right edge), then back | Off-screen error **5px** after 3.8 frame-widths; **5px** once back |
| Camera pans right (pan exits the left edge) | Box wholly off the left, as expected |
| 6 frames of flat grey (hand over lens), then a cut to a different counter | Biggest single-frame move **2.65px** (true 1px), then tracks 19.0px of 19px |
| object-cover mapping, 3:4 feed on a 393x852 screen | Matches the hand-computed crop (123px each side) |
| Rim seen straight down | Tilt **0°** (it was 41° before F6) |
| Pan off the right, left, top, bottom and a corner | Timer clamps to the matching edge, flat |
| Timer fits on screen for pan sizes 0.05–4 and positions −3 to 3 | Always |

All 14 pass. `tsc` and `next build` are clean.

### Not done, or not verified

- **Not tested on the phone yet.** The synthetic scene moves in pure translation. A real phone also rotates and moves closer, and the hob has steam and glare. Drift will build up between model readings.
- **F3 is still open.** Polling stops once the model is confident about the station, so nothing corrects drift for the rest of the step. This now matters more, since the tracker is the only thing moving the timer between readings.
- **Seed latency.** The model's box describes the frame it was sent, about 0.8s earlier now. Motion in that window isn't added back. It's small at current latency, but grows with a slow answer.
- `useAnchor`'s animation loop still never idles (F16).

## Fix: faster checks, F3, F11 (done, not deployed)

Gemini 3.5 Flash Lite answers in about a second, so the old 14s gap between checks was most of the wait.

**Free-tier limits.** Google doesn't publish free-tier numbers for 3.5 Flash Lite. The rate-limit docs only say limits are per project and that the daily limit resets at midnight Pacific. A third-party catalog lists 30 a minute and 1,500 a day, which is unconfirmed. Your real numbers are at aistudio.google.com/rate-limit.

**Pacing** ([page.tsx](app/cook/page.tsx)):
- **Before the station is found:** the next check starts 5s after the last answer, so about every 6s.
- **After the station is found:** every 10s. It keeps checking so the pan's position keeps being corrected (**F3 fixed**: checks slow down instead of stopping).
- **Most this can send:** about 10 a minute, a third of the 30 listed.
- **A typical omelette (about 10 minutes):** roughly 70–100 calls.
- **A skipped check** (one in flight, or too soon after the last) retries after 1s, not a whole interval later (**F11 fixed**).
- **Over quota (429):** the route no longer retries, which only spent more quota. It tells the client, which waits 60s.
- **Hidden tab:** no checks.
- **Throttle:** the client-side minimum gap is down from 9s to 4s.
- **Once the station is found, the tip only changes** if the cook has left the station or the step looks done, so it doesn't reword itself every 10s.
- **Auto-advance can't be scheduled twice** now that checks continue.

**Checked:** `tsc` and `next build` are clean, and the 14 unit tests still pass. **Not checked:** the real call rate and latency on the phone.

## Feature: spoken questions answered by Gemini (done, not deployed)

The mic and the browser's speech-to-text already existed. Replies came from a keyword list ([knowledge.ts](lib/knowledge.ts)), with a generic fallback for anything off-list, and a loose keyword could give the wrong answer.

**How it works now:**
- **Live words:** the cook's words show in the feedback line while they talk. Tapping the mic again stops listening and sends what was heard.
- **Questions go to Gemini** through a new route, [app/api/ask/route.ts](app/api/ask/route.ts). It sends the question, the current step, the recipe (with dropped ingredients removed), the author's notes from knowledge.ts and the current camera frame. The answer is at most two short sentences and has a 12s deadline.
- **Dropping an ingredient** stays local and instant, because it rewrites the recipe.
- **If Gemini fails, runs out of quota or times out,** the reply falls back to the keyword list, then to the generic line.
- **A late answer** to an old question, or from a previous step, is dropped.
- **A denied microphone** now says "Allow the microphone to talk to me." instead of failing silently.

**Live test** (local production build, real API, no frame):

| Asked on | Question | Answer | Time |
|---|---|---|---|
| Step 5 | "is the butter melted enough to pour the eggs in" | "You are still sauteing the onions and peppers. Keep going on high heat before adding the eggs." | 1.18s |
| Step 7 (no onion) | "how do I know when to flip it" | "Give it another thirty seconds on medium. The top stops jiggling when the base is ready to flip." | 1.13s |
| Step 5 | "can I use olive oil" | "Yes, olive oil works fine. Just keep sauteing those veggies on high heat." | 0.76s |

**Not checked:** speech recognition on the iPhone in Safari, or a question that depends on the camera frame.

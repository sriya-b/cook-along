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

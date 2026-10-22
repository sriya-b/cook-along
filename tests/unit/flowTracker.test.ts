import { test } from "node:test";
import assert from "node:assert/strict";
import { FlowTracker, type Box } from "../../lib/flowTracker.ts";
import { makeWorld, rng, view } from "./scene.ts";

// the tracker's frame for a portrait phone: 3:4, long side 240
const W = 180;
const H = 240;
const world = makeWorld(1400, 1200, 7);

/** the pan in world pixels. it never moves; only the camera does. */
const PAN = { x: 600, y: 520, w: 110, h: 80 };

/** where the pan truly is, in 0..1 of the camera frame */
function truth(ox: number, oy: number): Box {
  return { x: (PAN.x - ox) / W, y: (PAN.y - oy) / H, w: PAN.w / W, h: PAN.h / H };
}

/** run the tracker along a camera path, seeded with the truth at frame 0 */
function run(path: { x: number; y: number }[], frame = (i: number, p: { x: number; y: number }) => view(world, p.x, p.y, W, H)) {
  const t = new FlowTracker(W, H);
  t.update(frame(0, path[0]));
  t.seed(truth(path[0].x, path[0].y));
  const out: (Box | null)[] = [t.current()];
  for (let i = 1; i < path.length; i++) out.push(t.update(frame(i, path[i])));
  return out;
}

const px = (b: Box, tr: Box) => Math.hypot((b.x - tr.x) * W, (b.y - tr.y) * H);

test("follows a shaky handheld camera for 600 frames", () => {
  const rand = rng(3);
  const path = [{ x: 520, y: 430 }];
  let vx = 0;
  let vy = 0;
  for (let i = 1; i < 600; i++) {
    // a hand: drifting velocity plus jitter, up to ~9px a frame
    vx = Math.max(-6, Math.min(6, vx * 0.9 + (rand() - 0.5) * 2.4));
    vy = Math.max(-6, Math.min(6, vy * 0.9 + (rand() - 0.5) * 2.4));
    const prev = path[i - 1];
    path.push({
      x: Math.max(380, Math.min(820, prev.x + vx + (rand() - 0.5) * 3)),
      y: Math.max(300, Math.min(700, prev.y + vy + (rand() - 0.5) * 3)),
    });
  }
  const boxes = run(path);
  let worst = 0;
  for (let i = 0; i < path.length; i++) worst = Math.max(worst, px(boxes[i]!, truth(path[i].x, path[i].y)));
  const end = px(boxes.at(-1)!, truth(path.at(-1)!.x, path.at(-1)!.y));
  console.log(`  worst error ${worst.toFixed(2)}px, after 600 frames ${end.toFixed(2)}px (frame ${W}x${H})`);
  assert.ok(worst < 6, `worst error ${worst}px`);
});

test("size never changes, however long it runs (F5)", () => {
  const path = Array.from({ length: 400 }, (_, i) => ({
    x: 560 + 120 * Math.sin(i / 25),
    y: 460 + 80 * Math.sin(i / 37),
  }));
  const boxes = run(path);
  const seed = boxes[0]!;
  for (const b of boxes) {
    assert.equal(b!.w, seed.w);
    assert.equal(b!.h, seed.h);
  }
});

test("turning the camera left carries the pan off the right edge, and back", () => {
  // camera pans left 5px a frame for 120 frames, then back again
  const out = Array.from({ length: 120 }, (_, i) => ({ x: 560 - 5 * i, y: 470 }));
  const path = [...out, ...out.slice().reverse()];
  const boxes = run(path);
  const far = boxes[119]!;
  const tr = truth(path[119].x, path[119].y);
  console.log(`  pan centre at the far point: tracked ${(far.x + far.w / 2).toFixed(3)}, truth ${(tr.x + tr.w / 2).toFixed(3)} (frame widths)`);
  assert.ok(far.x > 1, "pan should be wholly off the right edge");
  assert.ok(Math.abs(far.x - tr.x) * W < 8, `off-screen error ${(far.x - tr.x) * W}px`);
  const back = px(boxes.at(-1)!, truth(path.at(-1)!.x, path.at(-1)!.y));
  console.log(`  error once back where it started: ${back.toFixed(2)}px`);
  assert.ok(back < 8);
});

test("turning the camera right carries the pan off the left edge", () => {
  const path = Array.from({ length: 120 }, (_, i) => ({ x: 560 + 5 * i, y: 470 }));
  const boxes = run(path);
  const far = boxes.at(-1)!;
  assert.ok(far.x + far.w < 0, "pan should be wholly off the left edge");
});

test("an unreadable frame holds still instead of jumping (F2)", () => {
  // steady slow pan, a few frames of a hand over the lens (flat grey), then
  // a cut to a completely different counter: the box must not leap
  const other = makeWorld(1400, 1200, 99);
  const path = Array.from({ length: 160 }, (_, i) => ({ x: 500 + i, y: 450 }));
  const boxes = run(path, (i, p) => {
    if (i >= 60 && i < 66) return new Float32Array(W * H).fill(90);
    if (i >= 100) return view(other, p.x, p.y, W, H);
    return view(world, p.x, p.y, W, H);
  });
  let worst = 0;
  for (let i = 1; i < boxes.length; i++) {
    worst = Math.max(worst, px(boxes[i]!, boxes[i - 1]!));
  }
  console.log(`  biggest single-frame move ${worst.toFixed(2)}px (true motion is 1px a frame)`);
  assert.ok(worst < 4, `jumped ${worst}px in one frame`);
  // and it is still following once the scene is readable again
  const last = boxes.at(-1)!;
  const before = boxes[140]!;
  const moved = (before.x - last.x) * W;
  console.log(`  over the last 19 frames it moved ${moved.toFixed(1)}px (truth 19px)`);
  assert.ok(Math.abs(moved - 19) < 3);
});

test("knows nothing until seeded, and forgets on null", () => {
  const t = new FlowTracker(W, H);
  assert.equal(t.update(view(world, 500, 400, W, H)), null);
  t.seed({ x: 0.2, y: 0.3, w: 0.4, h: 0.3 });
  assert.deepEqual(t.update(view(world, 500, 400, W, H)), { x: 0.2, y: 0.3, w: 0.4, h: 0.3 });
  t.seed(null);
  assert.equal(t.update(view(world, 502, 400, W, H)), null);
});

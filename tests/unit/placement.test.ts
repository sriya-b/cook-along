import { test } from "node:test";
import assert from "node:assert/strict";
import { cameraToScreen, placeTimer, SAFE, TIMER_HALF, type View } from "../../lib/placement.ts";

// an iphone 15 screen with a 3:4 portrait camera feed behind it
const PHONE: View = { width: 393, height: 852, videoWidth: 480, videoHeight: 640 };

const near = (a: number, b: number, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test("object-cover mapping: the sides of a 3:4 feed are cropped (F1)", () => {
  // the feed is scaled to the screen height, 852/640 = 1.33125, so it is
  // 639px wide and 123px hangs off each side
  const s = 852 / 640;
  const crop = (480 * s - 393) / 2;
  const left = cameraToScreen(0, 0, PHONE);
  near(left.x, -crop);
  near(left.y, 0);
  const mid = cameraToScreen(0.5, 0.5, PHONE);
  near(mid.x, 393 / 2);
  near(mid.y, 852 / 2);
  // a point a quarter of the way across the camera is left of a quarter of the screen
  near(cameraToScreen(0.25, 0, PHONE).x, 0.25 * 480 * s - crop);
  // before the camera reports its size, the mapping is the identity
  const plain = { ...PHONE, videoWidth: 0, videoHeight: 0 };
  near(cameraToScreen(0.3, 0.6, plain).x, 0.3 * 393);
  near(cameraToScreen(0.3, 0.6, plain).y, 0.6 * 852);
});

test("no pan yet: the timer sits in the middle of the open screen", () => {
  const p = placeTimer(null, PHONE);
  near(p.x, 393 / 2);
  near(p.y, (SAFE.top + 852 - SAFE.bottom) / 2);
  assert.equal(p.tilt, 0);
});

test("pan in view: the timer hangs above it, leaning", () => {
  const p = placeTimer({ x: 0.3, y: 0.5, w: 0.4, h: 0.15 }, PHONE);
  assert.equal(p.parked, false);
  near(p.x, cameraToScreen(0.5, 0, PHONE).x);
  assert.ok(p.y < cameraToScreen(0, 0.5, PHONE).y, "above the rim");
  assert.ok(p.tilt > 30, `a flat ellipse leans a lot, got ${p.tilt}`);
});

test("a rim seen straight down does not lean (F6)", () => {
  // round on the sensor: 0.4 of 480px wide is 0.3 of 640px tall
  const p = placeTimer({ x: 0.3, y: 0.4, w: 0.4, h: 0.3 }, PHONE);
  near(p.tilt, 0, 0.001);
});

test("pan off the right: the timer waits at the right edge, flat", () => {
  const p = placeTimer({ x: 1.6, y: 0.45, w: 0.4, h: 0.15 }, PHONE);
  assert.equal(p.parked, true);
  near(p.x, 393 - SAFE.side - TIMER_HALF.w * p.scale);
  assert.equal(p.tilt, 0);
});

test("pan off the left: the timer waits at the left edge", () => {
  const p = placeTimer({ x: -1.2, y: 0.45, w: 0.4, h: 0.15 }, PHONE);
  assert.equal(p.parked, true);
  near(p.x, SAFE.side + TIMER_HALF.w * p.scale);
});

test("pan behind the cookbook or the assistant: the timer stays between them", () => {
  const up = placeTimer({ x: 0.3, y: -0.5, w: 0.4, h: 0.15 }, PHONE);
  near(up.y, SAFE.top + TIMER_HALF.h * up.scale);
  const down = placeTimer({ x: 0.3, y: 1.8, w: 0.4, h: 0.15 }, PHONE);
  near(down.y, 852 - SAFE.bottom - TIMER_HALF.h * down.scale);
  // and in a corner when it is off both ways
  const corner = placeTimer({ x: 2, y: 2, w: 0.4, h: 0.15 }, PHONE);
  assert.equal(corner.parked, true);
  near(corner.x, 393 - SAFE.side - TIMER_HALF.w * corner.scale);
});

test("the timer always fits on screen, at any pan size", () => {
  for (const w of [0.05, 0.2, 0.6, 1.5, 4]) {
    for (const x of [-3, 0, 0.5, 3]) {
      const p = placeTimer({ x, y: 0.4, w, h: w * 0.4 }, PHONE);
      const hw = TIMER_HALF.w * p.scale;
      assert.ok(p.x - hw >= SAFE.side - 0.01 && p.x + hw <= 393 - SAFE.side + 0.01, `w=${w} x=${x}`);
    }
  }
});

test("the safe area starts just below the cookbook", async () => {
  const { bookBottom } = await import("../../lib/bookGeometry.ts");
  const { safeBelow } = await import("../../lib/placement.ts");
  // a 402pt phone: the book is 386pt wide and raised off the top
  near(bookBottom(402), (696 - 148) * (386 / 990), 0.01);
  assert.equal(safeBelow(bookBottom(402)).top, Math.round((696 - 148) * (386 / 990) + 8));
  const p = placeTimer({ x: 0.3, y: -0.5, w: 0.4, h: 0.15 }, { ...PHONE, width: 402 }, safeBelow(bookBottom(402)));
  assert.ok(p.y - TIMER_HALF.h * p.scale >= bookBottom(402), "timer clears the book");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { applyMatrix, bend, onPage, outline, pageBottom, pageTop, quadMatrix, SPINE, type Pt } from "../../lib/bookGeometry.ts";

const near = (a: number, b: number, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test("quadMatrix puts each corner of the rectangle on the quad", () => {
  const quads: [Pt, Pt, Pt, Pt][] = [
    [[10, 20], [110, 20], [110, 80], [10, 80]], // plain move and scale
    [[10, 20], [110, 30], [100, 90], [5, 75]], // a tapered, leaning quad
    [[400, 40], [470, 52], [470, 600], [400, 610]], // a strip near the spine
  ];
  for (const q of quads) {
    const m = quadMatrix(70, 300, q);
    const corners: Pt[] = [[0, 0], [70, 0], [70, 300], [0, 300]];
    corners.forEach(([x, y], i) => {
      const [X, Y] = applyMatrix(m, x, y);
      near(X, q[i][0]);
      near(Y, q[i][1]);
    });
  }
});

test("the pages mirror about the spine and dip into it", () => {
  for (const d of [20, 100, 300]) {
    near(pageTop(SPINE - d), pageTop(SPINE + d));
    near(pageBottom(SPINE - d), pageBottom(SPINE + d));
  }
  // the top edge is highest mid-page and lower at the spine
  assert.ok(pageTop(371) < pageTop(SPINE));
  assert.ok(pageTop(371) < pageTop(99));
  assert.equal(onPage(300, 0), pageTop(300));
  assert.equal(onPage(300, 1), pageBottom(300));
});

test("bent strips tile the content with no gaps and follow the page", () => {
  const { width, strips } = bend(100, 452, 0.08, 0.66, 14);
  near(width, 352);
  for (let i = 1; i < strips.length; i++) {
    // each strip starts where the last one's slice ended, and overlaps it
    near(strips[i].offset, strips[i - 1].offset + width / 14);
    assert.ok(strips[i - 1].x + strips[i - 1].width > strips[i].x);
  }
  // a strip's top left lands on the page's curve
  const s = strips[13];
  const m = s.transform.slice(9, -1).split(",").map(Number);
  const [X, Y] = applyMatrix(m, 0, 0);
  near(X, s.x);
  near(Y, onPage(s.x, 0.08));
});

test("outline is a closed polygon in the face's own coordinates", () => {
  const poly = outline("right", SPINE);
  assert.ok(poly.startsWith("polygon(0.0px"));
  assert.equal(poly.split(",").length, 50);
});

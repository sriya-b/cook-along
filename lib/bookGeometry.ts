// the shape of the cookbook's pages, traced from public/book.png, and the
// maths for laying flat content onto those curved pages. pure, no react,
// so it can be tested in node. every number is in the image's own pixels.

/** the book image, cropped to the cover */
export const BOOK_W = 990;
export const BOOK_H = 696;
/** the spine, and the outer edge of the right page */
export const SPINE = 493;
export const RIGHT_EDGE = 925;
const LEFT_EDGE = 2 * SPINE - RIGHT_EDGE + 4; // 65, the left page's outer edge
/** how far the book is pushed up off the top of the screen, so the cover's
 *  top edge is cropped away rather than wasting space */
export const RAISE = 148;

/** the left page's top edge: rises towards the middle of the page and
 *  dips into the spine */
const TOP: [number, number][] = [[65, 37], [99, 34], [181, 28], [281, 17], [371, 12], [431, 17], [471, 27], [493, 35]];
/** ...and its bottom edge, which climbs towards the spine */
const BOTTOM: [number, number][] = [[65, 617], [131, 620], [231, 614], [331, 605], [411, 598], [461, 593], [493, 589]];

function along(pts: [number, number][], x: number): number {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return pts[pts.length - 1][1];
}

/** the right page mirrors the left about the spine */
export const pageTop = (x: number) => along(TOP, x <= SPINE ? x : 2 * SPINE - x);
export const pageBottom = (x: number) => along(BOTTOM, x <= SPINE ? x : 2 * SPINE - x);
/** a point on the page: v is 0 at the page's top edge and 1 at its bottom */
export const onPage = (x: number, v: number) => pageTop(x) + v * (pageBottom(x) - pageTop(x));

export type Pt = [number, number];

/**
 * a css matrix3d that takes the rectangle (0, 0, w, h) onto a quad
 * (top left, top right, bottom right, bottom left). a projective map, so
 * it can taper and lean, which an affine skew can't.
 */
export function quadMatrix(w: number, h: number, q: [Pt, Pt, Pt, Pt]): number[] {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const sx = x0 - x1 + x2 - x3;
  const sy = y0 - y1 + y2 - y3;
  let a: number, b: number, d: number, e: number;
  let g = 0;
  let k = 0;
  if (Math.abs(sx) < 1e-9 && Math.abs(sy) < 1e-9) {
    a = x1 - x0; b = x3 - x0; d = y1 - y0; e = y3 - y0;
  } else {
    const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
    const den = dx1 * dy2 - dx2 * dy1;
    g = (sx * dy2 - dx2 * sy) / den;
    k = (dx1 * sy - sx * dy1) / den;
    a = x1 - x0 + g * x1; b = x3 - x0 + k * x3;
    d = y1 - y0 + g * y1; e = y3 - y0 + k * y3;
  }
  // column major, with the unit square scaled to w by h
  return [a / w, d / w, 0, g / w, b / h, e / h, 0, k / h, 0, 0, 1, 0, x0, y0, 0, 1];
}

/** where a point of the rectangle lands under a quadMatrix, for tests */
export function applyMatrix(m: number[], x: number, y: number): Pt {
  const X = m[0] * x + m[4] * y + m[12];
  const Y = m[1] * x + m[5] * y + m[13];
  const W = m[3] * x + m[7] * y + m[15];
  return [X / W, Y / W];
}

export type Strip = {
  /** where this strip's slice starts inside the content, in pixels */
  offset: number;
  /** the slice's left edge on the page */
  x: number;
  width: number;
  height: number;
  transform: string;
};

/**
 * flat content laid onto the page between x0 and x1, from v0 down to v1.
 * it is cut into thin vertical strips and each strip is fitted to the
 * page's curves, so a photo dips into the gutter exactly as the paper
 * does. `height` is the flat content's height before it is bent.
 */
export function bend(x0: number, x1: number, v0: number, v1: number, n: number) {
  const width = x1 - x0;
  const height = (onPage(x0, v1) - onPage(x0, v0) + (onPage(x1, v1) - onPage(x1, v0))) / 2;
  const step = width / n;
  const strips: Strip[] = [];
  for (let i = 0; i < n; i++) {
    const a = x0 + i * step;
    // a hair of overlap so no seam shows between neighbours
    const b = Math.min(x1, a + step + 1.2);
    const m = quadMatrix(b - a, height, [
      [a, onPage(a, v0)],
      [b, onPage(b, v0)],
      [b, onPage(b, v1)],
      [a, onPage(a, v1)],
    ]);
    strips.push({ offset: i * step, x: a, width: b - a, height, transform: `matrix3d(${m.join(",")})` });
  }
  return { width, height, strips };
}

/** the page's outline as a css clip path, shifted into a face whose left
 *  edge sits at `ox` on the book */
export function outline(side: "left" | "right", ox: number): string {
  const a = side === "left" ? LEFT_EDGE : SPINE;
  const b = side === "left" ? SPINE : RIGHT_EDGE;
  const xs = Array.from({ length: 25 }, (_, i) => a + ((b - a) * i) / 24);
  const pts = [
    ...xs.map((x) => [x, pageTop(x) - 1]),
    ...xs.reverse().map((x) => [x, pageBottom(x) + 1]),
  ];
  return `polygon(${pts.map(([x, y]) => `${(x - ox).toFixed(1)}px ${y.toFixed(1)}px`).join(",")})`;
}

/** css pixels per image pixel, for a book drawn across a screen this wide
 *  with an 8px gutter on each side */
export const bookScale = (screenWidth: number) => (screenWidth - 16) / BOOK_W;

/** the lowest the book reaches on screen, in css pixels: the cover's
 *  bottom bump, after the raise */
export const bookBottom = (screenWidth: number) => (BOOK_H - RAISE) * bookScale(screenWidth);

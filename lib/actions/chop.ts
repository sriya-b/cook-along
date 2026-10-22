// a few seconds of white linework showing how to chop, drawn as a pure
// function of time. the same frames play in the app and render to video,
// so what you approve in the preview is exactly what the cook sees.

/** one full play, in seconds */
export const CHOP_DURATION = 3.4;

const SIZE = 300;

// --- timing (seconds) ------------------------------------------------------
const DRAW = { board: [0, 0.45], onion: [0.15, 0.6], knife: [0.3, 0.75] } as const;
const CHOP_START = 0.8;
const CHOP_EACH = 0.62;
const FADE_START = 3.0;
const FADE_LEN = 0.4;

// --- the scene ---------------------------------------------------------------
/** where each chop lands, right to left across the onion */
const CUTS = [140, 129, 118];
const ONION = { cx: 118, cy: 192, rx: 31, ry: 29 };
/** onion's right edge before any cut */
const ONION_RIGHT = ONION.cx + ONION.rx + 2;
/** knife tip height when raised and when on the board */
const KNIFE_UP = 146;
const KNIFE_DOWN = 220;
const KNIFE_SCALE = 0.9;
/** knife leans this far from upright, top towards the right */
const KNIFE_LEAN = 16;

// --- line weights, echoing the watercolour's soft outline and finer detail ---
const MAIN = 2.6;
const FINE = 1.5;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeIn = (x: number) => Math.pow(clamp01(x), 3);
const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
const easeInOut = (x: number) => {
  const v = clamp01(x);
  return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2;
};

/** 0 to 1, how far a stroke has drawn itself in */
function drawn(t: number, [a, b]: readonly [number, number]) {
  return easeOut((t - a) / (b - a));
}

/** stroke attributes. pathLength="1" lets every shape draw on with the same
 *  dash maths regardless of how long it really is. */
function line(width: number, progress = 1, extra = "") {
  const off = (1 - progress).toFixed(4);
  return `fill="none" stroke="#fff" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${off}" ${extra}`;
}

// --- pieces ------------------------------------------------------------------

/** a closed outline with softened corners, so nothing reads as drafted */
function rounded(points: [number, number][], r: number) {
  const n = points.length;
  let d = "";
  for (let i = 0; i < n; i++) {
    const [px, py] = points[(i - 1 + n) % n];
    const [cx, cy] = points[i];
    const [nx, ny] = points[(i + 1) % n];
    const a = Math.hypot(cx - px, cy - py);
    const b = Math.hypot(nx - cx, ny - cy);
    const inX = cx - ((cx - px) / a) * r;
    const inY = cy - ((cy - py) / a) * r;
    const outX = cx + ((nx - cx) / b) * r;
    const outY = cy + ((ny - cy) / b) * r;
    d += `${i === 0 ? "M" : "L"}${inX.toFixed(1)} ${inY.toFixed(1)} Q${cx} ${cy} ${outX.toFixed(1)} ${outY.toFixed(1)} `;
  }
  return d + "Z";
}

function board(p: number) {
  // a board seen from a little above: the far edge is shorter, so it reads
  // as lying flat on the counter rather than standing up
  const top = rounded([[60, 202], [236, 202], [262, 238], [34, 238]], 7);
  const lip = "M36 241 C36 245, 38 246, 42 246 L254 246 C258 246, 260 245, 260 241";
  const hole = `<ellipse cx="222" cy="210" rx="7" ry="3" ${line(FINE, p)} />`;
  const grain = [
    "M168 216 C190 215, 210 216, 232 214",
    "M60 230 C110 228, 170 230, 240 227",
  ]
    .map((d) => `<path d="${d}" ${line(FINE, p, 'opacity="0.55"')} />`)
    .join("");
  return `<path d="${top}" ${line(MAIN, p)} /><path d="${lip}" ${line(MAIN, p)} />${hole}${grain}`;
}

/** the whole onion: bulb, the curved segment lines, a sprout and roots */
function onionShape(p: number) {
  const { cx, cy, rx, ry } = ONION;
  const top = cy - ry;
  const bottom = cy + ry;
  const bulb = `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" ${line(MAIN, p)} />`;
  const segs = [-19, -9, 9, 19]
    .map((k) => `<path d="M${cx} ${top + 1} Q${cx + k * 1.6} ${cy} ${cx} ${bottom - 1}" ${line(FINE, p)} />`)
    .join("");
  const sprout = `<path d="M${cx} ${top} C${cx + 1} ${top - 6}, ${cx + 4} ${top - 10}, ${cx + 7} ${top - 13}" ${line(FINE, p)} />`;
  const roots = [-5, 0, 5]
    .map((k) => `<path d="M${cx + k * 0.6} ${bottom} L${cx + k} ${bottom + 4}" ${line(FINE, p)} />`)
    .join("");
  return bulb + segs + sprout + roots;
}

/** the onion's bulb as a solid black shape, used to hide what is behind it */
function onionSilhouette() {
  const { cx, cy, rx, ry } = ONION;
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#000" stroke="#000" stroke-width="4" />`;
}

/** half the onion's height at a given x, for sizing a cut face */
function halfHeightAt(x: number) {
  const { cx, rx, ry } = ONION;
  const d = (x - cx) / rx;
  return d >= 1 ? 0 : ry * Math.sqrt(1 - d * d);
}

/** the rings you see on a cut face */
function rings(x: number, p: number) {
  const h = halfHeightAt(x);
  if (h < 2) return "";
  const { cy } = ONION;
  return [1, 0.66, 0.34]
    .map((f, i) => `<ellipse cx="${x}" cy="${cy}" rx="${(4.2 * f).toFixed(2)}" ry="${(h * f).toFixed(2)}" ${line(i === 0 ? FINE + 0.3 : FINE, p)} />`)
    .join("");
}

/** the knife's outline as a solid black shape, used to hide what is behind it */
function knifeSilhouette(tipX: number, tipY: number) {
  const fill = 'fill="#000" stroke="#000" stroke-width="4" stroke-linejoin="round"';
  return `<g transform="translate(${tipX.toFixed(2)} ${tipY.toFixed(2)}) rotate(${KNIFE_LEAN}) scale(${KNIFE_SCALE})">
    <path d="M0 0 C-4 -30, -7 -60, -7 -88 L20 -88 C20 -56, 13 -24, 0 0 Z" ${fill} />
    <path d="M-8 -88 L21 -88 L21 -96 L-8 -96 Z" ${fill} />
    <path d="M-6 -96 L19 -96 C20 -117, 20 -135, 16 -148 C11 -154, 2 -154, -2 -148 C-6 -135, -7 -117, -6 -96 Z" ${fill} />
  </g>`;
}

function knife(tipX: number, tipY: number, p: number) {
  const blade = "M0 0 C-4 -30, -7 -60, -7 -88 L20 -88 C20 -56, 13 -24, 0 0 Z";
  const edge = "M3 -10 C0 -36, -2 -60, -2 -82";
  const bolster = "M-8 -88 L21 -88 L21 -96 L-8 -96 Z";
  const handle = "M-6 -96 L19 -96 C20 -117, 20 -135, 16 -148 C11 -154, 2 -154, -2 -148 C-6 -135, -7 -117, -6 -96 Z";
  const rivets = [
    [6.5, -110, 2.3],
    [6.5, -125, 2.3],
    [6.5, -139, 2],
  ]
    .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" ${line(FINE, p)} />`)
    .join("");
  return `<g transform="translate(${tipX.toFixed(2)} ${tipY.toFixed(2)}) rotate(${KNIFE_LEAN}) scale(${KNIFE_SCALE})">
    <path d="${blade}" ${line(MAIN, p)} />
    <path d="${edge}" ${line(FINE, p, 'opacity="0.6"')} />
    <path d="${bolster}" ${line(MAIN, p)} />
    <path d="${handle}" ${line(MAIN, p)} />
    ${rivets}
  </g>`;
}

// --- the chop timeline -------------------------------------------------------

/** where the knife is at time t */
function knifePose(t: number) {
  if (t < CHOP_START) return { x: CUTS[0], y: KNIFE_UP };
  const i = Math.min(CUTS.length - 1, Math.floor((t - CHOP_START) / CHOP_EACH));
  const u = (t - CHOP_START - i * CHOP_EACH) / CHOP_EACH;
  const here = CUTS[i];
  const nextX = CUTS[Math.min(i + 1, CUTS.length - 1)];
  if (u < 0.45) return { x: here, y: lerp(KNIFE_UP, KNIFE_DOWN, easeIn(u / 0.45)) };
  if (u < 0.55) return { x: here, y: KNIFE_DOWN };
  const v = (u - 0.55) / 0.45;
  return { x: lerp(here, nextX, easeInOut(v)), y: lerp(KNIFE_DOWN, KNIFE_UP, easeOut(v)) };
}

/** when chop i strikes the board */
function impactAt(i: number) {
  return CHOP_START + i * CHOP_EACH + 0.45 * CHOP_EACH;
}

export type ChopOptions = {
  /** prefix for svg ids, so several clips can share a page */
  id?: string;
  /** soft shadow under the lines, for legibility over a camera feed */
  shadow?: boolean;
};

/** the whole scene at time t (seconds), as an svg string */
export function chopFrame(t: number, opts: ChopOptions = {}): string {
  const id = opts.id ?? "chop";
  const pBoard = drawn(t, DRAW.board);
  const pOnion = drawn(t, DRAW.onion);
  const pKnife = drawn(t, DRAW.knife);
  const opacity = 1 - clamp01((t - FADE_START) / FADE_LEN);

  // which cuts have landed, and the onion's remaining right edge
  const landed = CUTS.map((_, i) => t >= impactAt(i));
  let bodyRight = ONION_RIGHT;
  landed.forEach((hit, i) => {
    if (hit) bodyRight = CUTS[i];
  });

  const defs: string[] = [];
  const parts: string[] = [];
  /** solid shapes for everything onion-shaped, so the board can hide behind them */
  const onionSil: string[] = [];

  // the uncut body of the onion
  defs.push(`<clipPath id="${id}-body"><rect x="0" y="0" width="${bodyRight}" height="${SIZE}" /></clipPath>`);
  parts.push(`<g clip-path="url(#${id}-body)">${onionShape(pOnion)}</g>`);
  onionSil.push(`<g clip-path="url(#${id}-body)">${onionSilhouette()}</g>`);
  if (bodyRight < ONION_RIGHT) parts.push(rings(bodyRight, 1));

  // each slice that has been cut off tips over to the right
  CUTS.forEach((left, i) => {
    if (!landed[i]) return;
    const right = i === 0 ? ONION_RIGHT : CUTS[i - 1];
    const s = easeOut((t - impactAt(i)) / 0.3);
    // every later cut pushes this slice a little further, so they fan out
    // instead of piling into one tangle of rings
    const pushes = CUTS.reduce(
      (n, _, j) => n + (j > i ? easeOut((t - impactAt(j)) / 0.3) : 0),
      0,
    );
    const angle = 17 * s + 3 * pushes;
    const shift = 7 * s + 6 * pushes;
    const pivotY = ONION.cy + ONION.ry - 1;
    const move = `translate(${shift.toFixed(2)} 0) rotate(${angle.toFixed(2)} ${right} ${pivotY})`;
    defs.push(`<clipPath id="${id}-s${i}"><rect x="${left}" y="0" width="${right - left}" height="${SIZE}" /></clipPath>`);
    parts.push(
      `<g transform="${move}"><g clip-path="url(#${id}-s${i})">${onionShape(1)}</g>${rings(left, 1)}</g>`,
    );
    onionSil.push(`<g transform="${move}"><g clip-path="url(#${id}-s${i})">${onionSilhouette()}</g></g>`);
  });

  const pose = knifePose(t);
  const knifeSil = knifeSilhouette(pose.x, pose.y);

  // what is in front hides what is behind: the board disappears under the
  // onion and the knife, and the onion disappears under the knife. without
  // this, the board's back edge ran straight through the onion.
  defs.push(
    `<mask id="${id}-under" maskUnits="userSpaceOnUse" x="0" y="0" width="${SIZE}" height="${SIZE}"><rect width="${SIZE}" height="${SIZE}" fill="#fff" />${onionSil.join("")}${knifeSil}</mask>`,
    `<mask id="${id}-behind-knife" maskUnits="userSpaceOnUse" x="0" y="0" width="${SIZE}" height="${SIZE}"><rect width="${SIZE}" height="${SIZE}" fill="#fff" />${knifeSil}</mask>`,
  );

  const shadow = opts.shadow !== false;
  if (shadow) {
    defs.push(
      // a dark halo traced around every white line, so it stays readable
      // over a busy, pale camera feed. the same trick maps use for labels
      // laid over aerial photos.
      `<filter id="${id}-soft" x="-20%" y="-20%" width="140%" height="140%">` +
        `<feMorphology in="SourceAlpha" operator="dilate" radius="1.3" result="grow" />` +
        `<feGaussianBlur in="grow" stdDeviation="1.7" result="blur" />` +
        `<feFlood flood-color="#000" flood-opacity="0.62" />` +
        `<feComposite in2="blur" operator="in" result="halo" />` +
        `<feMerge><feMergeNode in="halo" /><feMergeNode in="SourceGraphic" /></feMerge>` +
      `</filter>`,
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="100%" height="100%">
<defs>${defs.join("")}</defs>
<g opacity="${opacity.toFixed(3)}" ${shadow ? `filter="url(#${id}-soft)"` : ""}>
  <g mask="url(#${id}-under)">${board(pBoard)}</g>
  <g mask="url(#${id}-behind-knife)">${parts.join("")}</g>
  ${knife(pose.x, pose.y, pKnife)}
</g>
</svg>`;
}

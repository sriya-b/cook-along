// a few seconds of chopping, drawn as a pure function of time in the soft
// white style: the knife rocks down three times and each cut peels a slice
// off the onion, which slides out to fan beside it. the same frames play
// in the app and render to video, so what is approved is what the cook sees.

import { clamp01, easeIn, easeInOut, easeOut, f, frame, lerp, phase } from "./style.ts";

/** one full play, in seconds */
export const CHOP_DURATION = 3.4;

// --- timing (seconds) ------------------------------------------------------
const BOARD_IN = [0, 0.45] as const;
const ONION_IN = [0.15, 0.6] as const;
const KNIFE_IN = [0.3, 0.75] as const;
/** when each cut lands */
const IMPACTS = [1.0, 1.6, 2.2];
const DOWN = 0.2;
const UP = 0.34;
const FADE = [3.0, 3.4] as const;

/** where each slice ends up, fanned out from the onion's cut face */
const SLICES = [
  { x: 166, y: 193, ry: 19, rot: 8 },
  { x: 178, y: 196, ry: 17.5, rot: 15 },
  { x: 190, y: 200, ry: 15.5, rot: 22 },
];
const CUT_FACE = { x: 153, y: 190 };

/** how far down the knife is: 0 raised, 1 on the board */
function knifeDown(t: number) {
  for (const at of IMPACTS) {
    if (t >= at - DOWN && t < at) return easeIn((t - (at - DOWN)) / DOWN);
    if (t >= at && t < at + UP) return 1 - easeOut((t - at) / UP);
  }
  return 0;
}

function board(id: string) {
  return (
    `<g filter="url(#${id}-grain)">` +
    `<path d="M80,250 Q86,258 96,257 L254,222 Q266,219 266,210 L266,203 Q262,212 252,214 L94,249 Q84,251 80,243 Z" fill="url(#${id}-boardEdge)"/>` +
    `<path d="M64,170 Q46,173 52,190 L76,240 Q82,252 96,249 L250,215 Q268,211 260,195 L236,150 Q228,136 212,140 Z" fill="url(#${id}-boardTop)"/>` +
    `</g>` +
    `<path d="M80,243 Q84,251 94,249 L252,214" fill="none" stroke="#fff" stroke-opacity="0.55" stroke-width="1" stroke-linecap="round"/>` +
    `<ellipse cx="230" cy="168" rx="9" ry="4.2" transform="rotate(-12 230 168)" fill="none" stroke="#fff" stroke-opacity="0.55" stroke-width="1.1"/>`
  );
}

/** the knife, pivoting about its tip: down lowers it onto the onion */
function knife(id: string, down: number) {
  const at = `translate(150 ${f(lerp(164, 182, down))}) rotate(${f(lerp(-30, -7, down))})`;
  return (
    `<g transform="${at}">` +
    `<g filter="url(#${id}-grain)">` +
    `<path d="M118,-30 L18,-28 Q5,-24 0,-6 Q44,4 118,4 Z" fill="url(#${id}-blade)"/>` +
    `<rect x="124" y="-25" width="60" height="22" rx="10" fill="url(#${id}-handle)"/>` +
    `</g>` +
    `<path d="M2,-5 Q44,4 117,4" fill="none" stroke="#fff" stroke-opacity="0.95" stroke-width="1.4" stroke-linecap="round"/>` +
    `<path d="M118,-31 L118,5" stroke="#fff" stroke-opacity="0.6" stroke-width="1.6" stroke-linecap="round"/>` +
    `<circle cx="142" cy="-14" r="1.6" fill="#fff" fill-opacity="0.75"/>` +
    `<circle cx="166" cy="-14" r="1.6" fill="#fff" fill-opacity="0.75"/>` +
    `</g>`
  );
}

export type ChopOptions = {
  /** prefix for svg ids, so several clips can share a page */
  id?: string;
};

export function chopFrame(t: number, opts: ChopOptions = {}): string {
  const id = opts.id ?? "chop";
  const pBoard = easeOut(phase(t, BOARD_IN));
  const pOnion = easeOut(phase(t, ONION_IN));
  const pKnife = easeOut(phase(t, KNIFE_IN));
  const opacity = 1 - easeInOut(phase(t, FADE));
  const down = knifeDown(t);

  // each slice appears at its cut and slides out to its place in the fan
  const slices = SLICES.map((s, i) => {
    const k = easeOut(clamp01((t - IMPACTS[i]) / 0.32));
    if (t < IMPACTS[i]) return "";
    const x = lerp(CUT_FACE.x + 2, s.x, k);
    const y = lerp(CUT_FACE.y, s.y, k);
    const ry = lerp(22, s.ry, k);
    return (
      `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(lerp(6.5, 4.8, k))}" ry="${f(ry)}" fill="url(#${id}-slice)" transform="rotate(${f(s.rot * k)} ${f(x)} ${f(y)})"/>`
    );
  }).join("");
  const rings = SLICES.map((s, i) => {
    if (t < IMPACTS[i] + 0.2) return "";
    const k = clamp01((t - IMPACTS[i] - 0.2) / 0.3);
    return `<path d="M${f(s.x - 2)},${f(s.y - s.ry + 5)} Q${f(s.x + 2)},${f(s.y)} ${f(s.x - 3)},${f(s.y + s.ry - 3)}" fill="none" stroke="#fff" stroke-opacity="${f(0.5 * k)}" stroke-width="0.9" stroke-linecap="round"/>`;
  }).join("");
  // bits and specks scatter after the first cut
  const bits = clamp01((t - IMPACTS[0]) / 0.4);
  // motion arcs above the heel, just after each stroke
  const swish = Math.max(...IMPACTS.map((at) => (t > at && t < at + 0.3 ? 1 - (t - at) / 0.3 : 0)));

  return frame(
    id,
    opacity,
    `<ellipse cx="236" cy="152" rx="20" ry="13" fill="#fff" fill-opacity="${f(0.22 * pBoard)}" filter="url(#${id}-haze)"/>` +
      `<g opacity="${f(pBoard)}" transform="translate(0 ${f(8 * (1 - pBoard))})">${board(id)}</g>` +
      `<g opacity="${f(pOnion)}">` +
      `<g filter="url(#${id}-grain)">` +
      `<ellipse cx="120" cy="190" rx="31" ry="24" fill="url(#${id}-onion)"/>` +
      `<ellipse cx="${CUT_FACE.x}" cy="${CUT_FACE.y}" rx="6.5" ry="22" fill="url(#${id}-slice)"/>` +
      slices +
      `</g>` +
      `<g fill="none" stroke="#fff" stroke-linecap="round">` +
      `<path d="M150,175 Q156,190 150,206" stroke-opacity="0.7" stroke-width="1.1"/>` +
      `<path d="M153,181 Q157,190 153,200" stroke-opacity="0.55" stroke-width="0.9"/>` +
      `<path d="M104,168 Q100,158 106,150" stroke-opacity="0.8" stroke-width="1.2"/>` +
      `</g>` +
      rings +
      `</g>` +
      `<g fill="#fff" opacity="${f(bits)}">` +
      `<rect x="198" y="219" width="6" height="5" rx="1.6" fill-opacity="0.55" transform="rotate(18 201 221)"/>` +
      `<rect x="208" y="212" width="5" height="4" rx="1.4" fill-opacity="0.45" transform="rotate(-10 210 214)"/>` +
      `<circle cx="140" cy="226" r="1" fill-opacity="0.7"/><circle cx="147" cy="231" r="0.8" fill-opacity="0.6"/>` +
      `<circle cx="186" cy="224" r="0.8" fill-opacity="0.6"/><circle cx="214" cy="198" r="0.9" fill-opacity="0.55"/>` +
      `</g>` +
      `<g opacity="${f(pKnife)}" transform="translate(${f(14 * (1 - pKnife))} ${f(-14 * (1 - pKnife))})">${knife(id, down)}</g>` +
      `<g fill="none" stroke="#fff" stroke-linecap="round" stroke-width="1" opacity="${f(swish)}">` +
      `<path d="M262,96 Q272,110 268,124" stroke-opacity="0.6"/>` +
      `<path d="M252,102 Q259,112 257,122" stroke-opacity="0.4"/>` +
      `</g>`,
  );
}

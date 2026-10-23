// the shared look of every action clip: see-through white fills that glow,
// fine grain like the speckle in the illustration, a few hairlines, and a
// dark halo so the white stays readable over a bright counter. each clip
// draws its own shapes; this holds what they all have in common.

export const SIZE = 300;

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeIn = (x: number) => Math.pow(clamp01(x), 3);
export const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
export const easeInOut = (x: number) => {
  const v = clamp01(x);
  return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2;
};
/** 0 before a, 1 after b, linear between */
export const phase = (t: number, [a, b]: readonly [number, number]) => clamp01((t - a) / (b - a));
/** numbers for svg attributes: short, and never in exponent form */
export const f = (n: number) => (Math.abs(n) < 1e-4 ? "0" : n.toFixed(2));

type Stops = [number, number][];
const stops = (s: Stops) => s.map(([o, a]) => `<stop offset="${o}" stop-color="#fff" stop-opacity="${a}"/>`).join("");

function grain(id: string, name: string, speck: number, bloom: number) {
  return (
    `<filter id="${id}-${name}" x="-10%" y="-10%" width="120%" height="120%">` +
    `<feGaussianBlur in="SourceGraphic" stdDeviation="1.1" result="soft"/>` +
    `<feGaussianBlur in="SourceGraphic" stdDeviation="${bloom}" result="bloomRaw"/>` +
    `<feComponentTransfer in="bloomRaw" result="bloom"><feFuncA type="linear" slope="0.8"/></feComponentTransfer>` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="4" result="noise"/>` +
    `<feColorMatrix in="noise" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 -3.2 1.9" result="dots"/>` +
    `<feComposite in="dots" in2="soft" operator="in" result="speck"/>` +
    `<feComponentTransfer in="speck" result="speckSoft"><feFuncA type="linear" slope="${speck}"/></feComponentTransfer>` +
    `<feMerge><feMergeNode in="bloom"/><feMergeNode in="soft"/><feMergeNode in="speckSoft"/></feMerge>` +
    `</filter>`
  );
}

/** every filter and gradient the clips use, with ids prefixed so several
 *  clips can share a page */
export function defs(id: string) {
  const radial = (name: string, s: Stops, cx = 0.35, cy = 0.3, r = 0.85) =>
    `<radialGradient id="${id}-${name}" cx="${cx}" cy="${cy}" r="${r}">${stops(s)}</radialGradient>`;
  const linear = (name: string, s: Stops, x2 = 0, y2 = 1) =>
    `<linearGradient id="${id}-${name}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops(s)}</linearGradient>`;
  return (
    grain(id, "grain", 0.85, 4) +
    grain(id, "grainLight", 0.35, 6) +
    `<filter id="${id}-haze" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="5"/></filter>` +
    `<filter id="${id}-halo" x="-20%" y="-20%" width="140%" height="140%">` +
    `<feGaussianBlur in="SourceAlpha" stdDeviation="9" result="b"/>` +
    `<feFlood flood-color="#160e08" flood-opacity="0.5"/>` +
    `<feComposite in2="b" operator="in" result="shadow"/>` +
    `<feMerge><feMergeNode in="shadow"/><feMergeNode in="SourceGraphic"/></feMerge></filter>` +
    radial("rim", [[0, 0.62], [0.6, 0.3], [1, 0.12]], 0.35, 0.3, 0.9) +
    radial("floor", [[0, 0.1], [1, 0.02]], 0.45, 0.4, 0.7) +
    linear("wall", [[0, 0.18], [1, 0.45]]) +
    linear("handle", [[0, 0.55], [1, 0.2]]) +
    radial("bowl", [[0, 0.85], [0.6, 0.4], [1, 0.14]], 0.3, 0.3, 0.9) +
    radial("bit", [[0, 0.95], [1, 0.35]], 0.35, 0.3, 0.8) +
    radial("egg", [[0, 0.72], [0.6, 0.38], [1, 0.16]], 0.4, 0.35, 0.8) +
    radial("eggUnder", [[0, 0.5], [0.6, 0.28], [1, 0.12]], 0.5, 0.6, 0.8) +
    linear("spat", [[0, 0.75], [1, 0.35]], 1, 0) +
    radial("onion", [[0, 0.95], [0.5, 0.5], [1, 0.1]], 0.36, 0.32, 0.75) +
    radial("slice", [[0, 0.92], [1, 0.3]], 0.4, 0.35, 0.8) +
    linear("blade", [[0, 0.22], [0.7, 0.5], [1, 0.85]]) +
    linear("boardTop", [[0, 0.5], [0.45, 0.2], [1, 0.04]], 1, 1) +
    linear("boardEdge", [[0, 0.42], [1, 0.18]])
  );
}

/** the skillet every pan clip shares, moved down by dy */
export function pan(id: string, dy = 0) {
  return (
    `<g transform="translate(0 ${f(dy)})">` +
    `<g filter="url(#${id}-grainLight)">` +
    `<path d="M48,206 Q50,252 140,254 Q230,252 232,206 Q228,240 140,242 Q52,240 48,206 Z" fill="url(#${id}-wall)"/>` +
    `<path d="M58,204 A82,38 0 0 1 222,204 A70,30 0 0 0 70,210 Z" fill="#fff" fill-opacity="0.26"/>` +
    `<ellipse cx="140" cy="214" rx="70" ry="29" fill="url(#${id}-floor)"/>` +
    `</g>` +
    `<g filter="url(#${id}-grain)">` +
    `<path fill-rule="evenodd" fill="url(#${id}-rim)" d="M48,204 a92,44 0 1 0 184,0 a92,44 0 1 0 -184,0 Z M58,206 a82,38 0 1 0 164,0 a82,38 0 1 0 -164,0 Z"/>` +
    `<path d="M226,196 L284,174 Q292,171 294,178 Q296,185 288,188 L230,212 Z" fill="url(#${id}-handle)"/>` +
    `</g>` +
    `<path d="M70,197 Q140,160 210,197" fill="none" stroke="#fff" stroke-opacity="0.7" stroke-width="1.2" stroke-linecap="round"/>` +
    `<ellipse cx="282" cy="180" rx="4" ry="2.4" transform="rotate(-20 282 180)" fill="none" stroke="#fff" stroke-opacity="0.6" stroke-width="1"/>` +
    `</g>`
  );
}

/** a spatula whose blade ends at (x, y), handle running down to the right */
export function spatula(id: string, x: number, y: number, rot: number, opacity = 1) {
  const at = `translate(${f(x)} ${f(y)}) rotate(${f(rot)})`;
  return (
    `<g transform="${at}" opacity="${f(opacity)}">` +
    `<g filter="url(#${id}-grain)">` +
    `<path d="M-38,-12 L-2,-12 Q2,-12 2,-8 L2,8 Q2,12 -2,12 L-38,12 Q-42,12 -42,8 L-42,-8 Q-42,-12 -38,-12 Z" fill="url(#${id}-spat)"/>` +
    `<path d="M0,-4 L98,40 Q105,44 101,50 Q97,55 91,51 L-4,6 Z" fill="url(#${id}-handle)"/>` +
    `</g>` +
    `<path d="M-34,-4 L-8,-4 M-34,4 L-8,4" stroke="#fff" stroke-opacity="0.55" stroke-width="1" stroke-linecap="round"/>` +
    `</g>`
  );
}

/** an ellipse with a soft, irregular edge, like a cooked omelette */
export function blob(cx: number, cy: number, rx: number, ry: number, rot: number, wobble = 0.05, seed = 3) {
  const n = 36;
  const c = Math.cos((rot * Math.PI) / 180);
  const s = Math.sin((rot * Math.PI) / 180);
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const t = (2 * Math.PI * i) / n;
    const r = 1 + wobble * (0.6 * Math.sin(3 * t + seed) + 0.4 * Math.sin(7 * t + 2 * seed));
    const x = rx * r * Math.cos(t);
    const y = ry * r * Math.sin(t);
    pts.push([cx + x * c - y * s, cy + x * s + y * c]);
  }
  const mid = (a: [number, number], b: [number, number]) => `${f((a[0] + b[0]) / 2)},${f((a[1] + b[1]) / 2)}`;
  let d = `M${mid(pts[n - 1], pts[0])}`;
  for (let i = 0; i < n; i++) d += ` Q${f(pts[i][0])},${f(pts[i][1])} ${mid(pts[i], pts[(i + 1) % n])}`;
  return d + " Z";
}

/** a hairline that draws itself on: p from 0 (nothing) to 1 (whole) */
export function drawOn(d: string, p: number, opacity: number, width = 1.2) {
  if (p <= 0 || opacity <= 0) return "";
  return `<path d="${d}" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="${f(1 - clamp01(p))}" fill="none" stroke="#fff" stroke-opacity="${f(opacity)}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/** steam: three hairline curls drifting up and flickering, at strength k */
export function steam(t: number, k: number, at: [number, number][] = [[186, 188], [198, 194], [95, 192]]) {
  if (k <= 0) return "";
  const rise = (t * 9) % 6;
  return (
    `<g transform="translate(0 ${f(-rise)})" fill="none" stroke="#fff" stroke-linecap="round">` +
    at
      .map(([x, y], i) => `<path d="M${x},${y} q-4,-7 0,-13 q4,-6 0,-12" stroke-opacity="${f((0.35 + 0.25 * Math.sin(t * 7 + i * 2)) * k)}" stroke-width="${i ? 0.9 : 1}"/>`)
      .join("") +
    `</g>`
  );
}

/** the whole frame: defs, the halo over everything, and a global fade */
export function frame(id: string, opacity: number, body: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="100%" height="100%">
<defs>${defs(id)}</defs>
<g opacity="${f(opacity)}" filter="url(#${id}-halo)">${body}</g>
</svg>`;
}

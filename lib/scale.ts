import type { Ingredient } from "./recipe";

const VULGAR: Record<string, string> = {
  "0.25": "¼",
  "0.33": "⅓",
  "0.5": "½",
  "0.67": "⅔",
  "0.75": "¾",
};

/** snap to the nearest cooking-friendly fraction so we never show 0.8333 cup */
function nearestFraction(value: number): number {
  const steps = [0, 0.25, 0.33, 0.5, 0.67, 0.75, 1];
  let best = steps[0];
  for (const s of steps) {
    if (Math.abs(s - value) < Math.abs(best - value)) best = s;
  }
  return best;
}

/** 1.25 -> "1¼", 0.25 -> "¼", 3 -> "3" */
export function formatAmount(value: number): string {
  if (value >= 10) return String(Math.round(value));

  const whole = Math.floor(value);
  const frac = nearestFraction(value - whole);

  // the fraction rounded up into the next whole number
  if (frac === 1) return String(whole + 1);

  const glyph = VULGAR[String(frac)];
  if (!glyph) return whole ? String(whole) : String(Math.round(value * 10) / 10);
  return whole ? `${whole}${glyph}` : glyph;
}

/** the quantity line for one ingredient at the chosen servings */
export function scaledQuantity(
  ingredient: Ingredient,
  servings: number,
  baseServings: number,
): string {
  if (ingredient.amount === null) return "";
  const scaled = (ingredient.amount * servings) / baseServings;
  const amount = formatAmount(scaled);
  return ingredient.unit ? `${amount} ${ingredient.unit}` : amount;
}

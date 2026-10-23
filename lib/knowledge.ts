// everything the assistant knows about this one recipe, drawn from the
// source page's tips, faq and notes. the chat matches against this
// instead of calling a model, so answers come back instantly and the
// demo has no network dependency.

export type Answer = {
  id: string;
  /** lowercase single words or short phrases to match against */
  keywords: string[];
  /** one tip at a time, short, sentence case. shown in the assistant zone. */
  text: string;
  /** when set, this answer is preferred while on one of these steps */
  steps?: number[];
};

export const answers: Answer[] = [
  // --- substitutions -----------------------------------------------------
  {
    id: "no-cheddar",
    keywords: ["no cheddar", "out of cheddar", "different cheese", "which cheese", "what cheese", "cheese instead"],
    text: "Mozzarella, gruyere or jack all melt well. Parmesan or feta work too, just sharper. Use the same quarter cup.",
  },
  {
    id: "paneer-halloumi",
    keywords: ["paneer", "halloumi"],
    text: "Those two will not melt. Cube them small and fold them in as a chewy filling instead.",
  },
  {
    id: "no-cheese",
    keywords: ["no cheese", "without cheese", "skip cheese", "dairy free", "vegan cheese"],
    text: "Skip it and add a pinch more salt to the eggs. The recipe goes light on salt only because cheese is salty.",
  },
  {
    // bell peppers are handled by the omission flow in lib/recipe.ts, which
    // rewrites the steps rather than just answering. this covers onions.
    id: "no-onion",
    keywords: ["no onion", "out of onions", "other vegetables", "different veg"],
    text: "Tomatoes, mushrooms or grated carrot all work. Keep it to a quarter cup so the egg still sets flat.",
  },
  {
    id: "no-coriander",
    keywords: ["no coriander", "no cilantro", "hate coriander", "instead of coriander"],
    text: "Parsley or basil work the same way. A few leaves, finely chopped.",
  },
  {
    id: "no-garam-masala",
    keywords: ["no garam masala", "garam masala", "no chili powder", "italian herbs", "less spicy", "not spicy"],
    text: "Leave the garam masala and chili out and use Italian herbs instead. Two pinches, same moment.",
  },
  {
    id: "butter",
    keywords: ["butter", "oil or butter", "use butter", "no oil"],
    text: "Butter works and is the traditional choice. Use unsalted so you keep control of the salt.",
  },

  // --- troubleshooting ---------------------------------------------------
  {
    id: "sticking",
    keywords: ["sticking", "stuck", "stick to the pan", "glued"],
    text: "The pan was not hot enough when the egg went in. Leave it alone for another twenty seconds, it usually releases on its own.",
    steps: [5],
  },
  {
    id: "broke-flipping",
    keywords: ["broke", "broken", "fell apart", "tore", "ripped", "cannot flip", "flip"],
    text: "No harm done. It broke because the base was not set yet. Wait until the edges lift cleanly before the next one.",
    steps: [5],
  },
  {
    id: "cheese-not-melting",
    keywords: ["not melting", "cheese wont melt", "still solid", "cheese hard"],
    text: "Drop the heat to low and give it thirty seconds. High heat browns the outside before the cheese gives.",
    steps: [6, 7],
  },
  {
    id: "too-salty",
    keywords: ["too salty", "salty", "salt"],
    text: "Cheddar brings a lot of salt. Next time go light in the eggs. For now a squeeze of lemon balances it.",
  },
  {
    id: "runny",
    keywords: ["runny", "wet", "not set", "liquid", "raw", "undercooked"],
    text: "Give it another thirty seconds on medium. The top stops jiggling when the base is ready to flip.",
    steps: [5],
  },
  {
    id: "burning",
    keywords: ["burning", "burnt", "smoking", "too dark", "browning fast"],
    text: "Heat is too high. Pull the pan off for a few seconds and bring it back on medium.",
  },
  {
    id: "dry",
    keywords: ["dry", "rubbery", "overcooked", "tough"],
    text: "It only needs about three minutes of cooking in total. Next one, move it along a little faster.",
  },

  // --- technique ---------------------------------------------------------
  {
    id: "fluffy",
    keywords: ["fluffy", "fluffier", "airy", "rise"],
    text: "Whisk the whites to stiff peaks on their own, then fold the beaten yolks back in. Blending the eggs works too.",
    steps: [2],
  },
  {
    id: "sweet-onions",
    keywords: ["sweet onions", "caramelize", "caramelise", "onions sweeter"],
    text: "Cook them low and slow instead of one minute on high. They turn sweet on their own, no sugar needed.",
    steps: [3],
  },
  {
    id: "turmeric",
    keywords: ["turmeric", "black pepper", "why turmeric"],
    text: "Add a crack of black pepper with it. The pepper helps your body take up the curcumin in the turmeric.",
    steps: [4],
  },

  // --- the recipe itself -------------------------------------------------
  {
    id: "how-long",
    keywords: ["how long", "time", "how many minutes", "total time"],
    text: "Two minutes of prep and about three of cooking. You are nearly there.",
  },
  {
    id: "nutrition",
    keywords: ["calories", "nutrition", "protein", "healthy"],
    text: "About 188 calories a serving, with 11g of protein and 14g of fat.",
  },
];

/**
 * pick the best answer for a question. a keyword hit scores by how many
 * words it matches, and an answer scoped to the current step wins ties.
 */
export function findAnswer(query: string, currentStep?: number): Answer | null {
  const q = query.toLowerCase();
  let best: Answer | null = null;
  let bestScore = 0;

  for (const a of answers) {
    let score = 0;
    for (const k of a.keywords) {
      if (q.includes(k)) score = Math.max(score, k.split(" ").length * 2);
    }
    if (score === 0) continue;
    if (currentStep && a.steps?.includes(currentStep)) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best;
}

export const FALLBACK =
  "Not sure on that one. Keep going with the step on screen and it will be fine.";

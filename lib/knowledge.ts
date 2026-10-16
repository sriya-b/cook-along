// everything the assistant knows about this one recipe, drawn from the
// source page's tips, faq and notes. the chat matches against this
// instead of calling a model, so answers come back instantly and the
// demo has no network dependency.

export type Answer = {
  id: string;
  /** lowercase single words or short phrases to match against */
  keywords: string[];
  /** one tip at a time, short, lowercase. shown in the assistant zone. */
  text: string;
  /** when set, this answer is preferred while on one of these steps */
  steps?: number[];
};

export const answers: Answer[] = [
  // --- substitutions -----------------------------------------------------
  {
    id: "no-cheddar",
    keywords: ["no cheddar", "out of cheddar", "different cheese", "which cheese", "what cheese", "cheese instead"],
    text: "mozzarella, gruyere or jack all melt well. parmesan or feta work too, just sharper. use the same quarter cup.",
  },
  {
    id: "paneer-halloumi",
    keywords: ["paneer", "halloumi"],
    text: "those two will not melt. cube them small and fold them in as a chewy filling instead.",
  },
  {
    id: "no-cheese",
    keywords: ["no cheese", "without cheese", "skip cheese", "dairy free", "vegan cheese"],
    text: "skip it and add a pinch more salt to the eggs. the recipe goes light on salt only because cheese is salty.",
  },
  {
    id: "no-onion",
    keywords: ["no onion", "out of onions", "no bell pepper", "no peppers", "other vegetables", "different veg"],
    text: "tomatoes, mushrooms or grated carrot all work. keep it to a quarter cup so the egg still sets flat.",
  },
  {
    id: "no-coriander",
    keywords: ["no coriander", "no cilantro", "hate coriander", "instead of coriander"],
    text: "parsley or basil work the same way. a few leaves, finely chopped.",
  },
  {
    id: "no-garam-masala",
    keywords: ["no garam masala", "garam masala", "no chili powder", "italian herbs", "less spicy", "not spicy"],
    text: "leave the garam masala and chili out and use italian herbs instead. two pinches, same moment.",
  },
  {
    id: "butter",
    keywords: ["butter", "oil or butter", "use butter", "no oil"],
    text: "butter works and is the traditional choice. use unsalted so you keep control of the salt.",
  },

  // --- troubleshooting ---------------------------------------------------
  {
    id: "sticking",
    keywords: ["sticking", "stuck", "stick to the pan", "glued"],
    text: "the pan was not hot enough when the egg went in. leave it alone for another twenty seconds, it usually releases on its own.",
    steps: [7],
  },
  {
    id: "broke-flipping",
    keywords: ["broke", "broken", "fell apart", "tore", "ripped", "cannot flip", "flip"],
    text: "no harm done. it broke because the base was not set yet. wait until the edges lift cleanly before the next one.",
    steps: [7],
  },
  {
    id: "cheese-not-melting",
    keywords: ["not melting", "cheese wont melt", "still solid", "cheese hard"],
    text: "drop the heat to low and give it thirty seconds. high heat browns the outside before the cheese gives.",
    steps: [8, 9],
  },
  {
    id: "too-salty",
    keywords: ["too salty", "salty", "salt"],
    text: "cheddar brings a lot of salt. next time go light in the eggs. for now a squeeze of lemon balances it.",
  },
  {
    id: "runny",
    keywords: ["runny", "wet", "not set", "liquid", "raw", "undercooked"],
    text: "give it another thirty seconds on medium. the top stops jiggling when the base is ready to flip.",
    steps: [7],
  },
  {
    id: "burning",
    keywords: ["burning", "burnt", "smoking", "too dark", "browning fast"],
    text: "heat is too high. pull the pan off for a few seconds and bring it back on medium.",
  },
  {
    id: "dry",
    keywords: ["dry", "rubbery", "overcooked", "tough"],
    text: "it only needs about three minutes of cooking in total. next one, move it along a little faster.",
  },

  // --- technique ---------------------------------------------------------
  {
    id: "fluffy",
    keywords: ["fluffy", "fluffier", "airy", "rise"],
    text: "whisk the whites to stiff peaks on their own, then fold the beaten yolks back in. blending the eggs works too.",
    steps: [2],
  },
  {
    id: "sweet-onions",
    keywords: ["sweet onions", "caramelize", "caramelise", "onions sweeter"],
    text: "cook them low and slow instead of one minute on high. they turn sweet on their own, no sugar needed.",
    steps: [5],
  },
  {
    id: "turmeric",
    keywords: ["turmeric", "black pepper", "why turmeric"],
    text: "add a crack of black pepper with it. the pepper helps your body take up the curcumin in the turmeric.",
    steps: [6],
  },

  // --- the recipe itself -------------------------------------------------
  {
    id: "how-long",
    keywords: ["how long", "time", "how many minutes", "total time"],
    text: "two minutes of prep and about three of cooking. you are nearly there.",
  },
  {
    id: "nutrition",
    keywords: ["calories", "nutrition", "protein", "healthy"],
    text: "about 188 calories a serving, with 11g of protein and 14g of fat.",
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
  "not sure on that one. keep going with the step on screen and it will be fine.";

// one hardcoded recipe for the prototype. any link pasted on the home
// screen resolves to this. swasthi's cheese omelette, split into nine
// steps so each one sits at exactly one station.

export type Station = "board" | "bowl" | "pan";

/** ingredients the cook can tell us they do not have, mid-recipe */
export type OmitKey = "bellpepper" | "onion";

export type Ingredient = {
  /** null for things measured by feel, like a pinch of salt */
  amount: number | null;
  unit: string;
  item: string;
  /** shown smaller, never scaled */
  note?: string;
  /** when this key is omitted, the line changes or disappears */
  omitKey?: OmitKey;
  /** the line reads this instead of dropping out entirely */
  itemWithout?: string;
};

export type Heat = "off" | "low" | "medium" | "high";

/** one rewrite of a step, used when every key in `when` has been dropped */
export type StepWithout = {
  when: OmitKey[];
  text: string;
  /** null clears the step's timer: there is nothing left to wait for */
  timer?: number | null;
};

export type Step = {
  n: number;
  station: Station;
  /** the one line shown in the recipe zone. short on purpose. */
  text: string;
  /** shown in the recipe zone for this step, in place of the dish photo */
  image?: string;
  /** replacement lines once ingredients have been dropped. the rule with
   *  the most keys matched wins, so dropping both the onions and the
   *  peppers reads correctly rather than picking one rewrite at random. */
  without?: StepWithout[];
  /** seconds, when the step is a wait worth timing */
  timer?: number;
  /** burner setting for this step. drives the heat tip. */
  heat?: Heat;
  /** what "done" looks like, for the assistant zone */
  cue?: string;
  /** said instead of the cue once this step's station is recognised */
  confirm?: string;
  /** put this question to the cook when the station is recognised, instead
   *  of a plain confirmation. answering yes drops the ingredient. */
  askAbout?: OmitKey;
  /** move straight on once the station is recognised. never on a timed step,
   *  where the cook still has to stand and wait. */
  advanceOnDetect?: boolean;
};

export type Recipe = {
  title: string;
  sourceName: string;
  sourceUrl: string;
  image: string;
  baseServings: number;
  /** minutes, as the recipe card states them */
  prepMinutes: number;
  cookMinutes: number;
  ingredients: Ingredient[];
  steps: Step[];
};

export const STATION_LABEL: Record<Station, string> = {
  board: "cutting board",
  bowl: "mixing bowl",
  pan: "pan",
};

/**
 * what the assistant says when the cook drops an ingredient. the keywords
 * only count as "I do not have this" when they land next to one of the
 * LACK phrases below, so "add the peppers" never triggers a rewrite.
 */
export const OMISSIONS: Record<
  OmitKey,
  { label: string; keywords: string[]; substitute: string; question: string }
> = {
  onion: {
    label: "onions",
    keywords: ["onion", "onions"],
    substitute: "a shallot, a little leek, or nothing at all",
    question: "I don't see any onions. Do you want to move on without them?",
  },
  bellpepper: {
    label: "bell peppers",
    keywords: ["bell pepper", "bellpepper", "capsicum", "peppers", "pepper"],
    substitute: "mushrooms or grated carrot",
    question:
      "I don't see any bell peppers. Do you want to move on without them?",
  },
};

const LACK = [
  "no ",
  "don't have",
  "dont have",
  "do not have",
  "didn't get",
  "didnt get",
  "without",
  "out of",
  "skip",
  "ran out",
  "missing",
  "haven't",
  "havent",
  "forgot",
];

const YES = [
  "yes", "yeah", "yep", "yup", "sure", "ok", "okay", "fine", "please",
  "move on", "go ahead", "go on", "carry on", "without", "skip", "do it",
  "correct", "right", "true",
];
const NO = ["no", "nope", "nah", "i have", "i do have", "i've got", "keep", "wait", "stop"];

/** did the cook just agree to the question we put to them? */
export function readAnswer(query: string): boolean | null {
  const q = ` ${query.toLowerCase().replace(/[^a-z' ]/g, " ")} `;
  const hit = (list: string[]) => list.some((w) => q.includes(` ${w} `));
  // "no" is checked first so "no, i have some" is not read as a yes
  if (hit(NO)) return false;
  if (hit(YES)) return true;
  return null;
}

/** the omission the cook just described, if any */
export function findOmission(query: string): OmitKey | null {
  const q = query.toLowerCase();
  if (!LACK.some((l) => q.includes(l))) return null;
  for (const key of Object.keys(OMISSIONS) as OmitKey[]) {
    if (OMISSIONS[key].keywords.some((k) => q.includes(k))) return key;
  }
  return null;
}

/** the step, rewritten for whatever has been dropped */
export function resolveStep(
  step: Step,
  omitted: ReadonlySet<OmitKey>,
): { text: string; timer: number | null } {
  let best: StepWithout | null = null;
  for (const rule of step.without ?? []) {
    if (!rule.when.every((k) => omitted.has(k))) continue;
    if (!best || rule.when.length > best.when.length) best = rule;
  }
  if (!best) return { text: step.text, timer: step.timer ?? null };
  return {
    text: best.text,
    timer: best.timer === undefined ? (step.timer ?? null) : best.timer,
  };
}

/** the step line alone, for callers that do not care about the timer */
export function stepText(step: Step, omitted: ReadonlySet<OmitKey>): string {
  return resolveStep(step, omitted).text;
}

/** the ingredient list, rewritten for whatever has been dropped */
export function visibleIngredients(
  ingredients: Ingredient[],
  omitted: ReadonlySet<OmitKey>,
): Ingredient[] {
  return ingredients
    .map((i) => {
      if (!i.omitKey || !omitted.has(i.omitKey)) return i;
      if (!i.itemWithout) return null;
      return { ...i, item: i.itemWithout };
    })
    .filter((i): i is Ingredient => i !== null);
}

export const recipe: Recipe = {
  title: "cheese omelette",
  sourceName: "Cheese Omelette Recipe - Swasthi’s Recipes",
  sourceUrl:
    "https://www.indianhealthyrecipes.com/simple-cheese-omelette-recipe/",
  image: "/omelette.jpg",
  baseServings: 1,
  prepMinutes: 2,
  cookMinutes: 3,
  ingredients: [
    { amount: 2, unit: "", item: "eggs" },
    { amount: 2, unit: "tbsp", item: "onions", omitKey: "onion" },
    {
      amount: 2,
      unit: "tbsp",
      item: "bell peppers",
      note: "or other vegetables",
      omitKey: "bellpepper",
    },
    { amount: 0.25, unit: "cup", item: "cheese", note: "cheddar or mozzarella" },
    { amount: 1.25, unit: "tsp", item: "oil" },
    { amount: null, unit: "", item: "salt", note: "a little, cheese is salty" },
    { amount: null, unit: "", item: "coriander leaves", note: "a few, chopped" },
    { amount: 2, unit: "pinches", item: "red chili powder" },
    { amount: 1, unit: "pinch", item: "turmeric" },
    { amount: 2, unit: "pinches", item: "garam masala", note: "or italian herbs" },
  ],
  steps: [
    {
      n: 1,
      station: "board",
      image: "/steps/chopped.webp",
      text: "Chop the onions, bell peppers and coriander.",
      without: [
        { when: ["bellpepper"], text: "Chop the onions and coriander." },
        { when: ["onion"], text: "Chop the bell peppers and coriander." },
        { when: ["onion", "bellpepper"], text: "Chop the coriander." },
      ],
      askAbout: "bellpepper",
      cue: "Small, even pieces cook through in the one minute they get.",
    },
    {
      n: 2,
      station: "bowl",
      image: "/steps/eggs.webp",
      text: "Crack the eggs into a bowl and whisk them well.",
      cue: "Whisk until the yolk and white are one colour, no streaks.",
      confirm: "Looks good, the eggs are whisked well.",
      advanceOnDetect: true,
    },
    {
      n: 3,
      station: "bowl",
      text: "Add the salt and coriander to the eggs.",
      cue: "Go light on salt here. The cheese brings plenty of its own.",
      confirm: "Salt and coriander in. That is the bowl done — over to the pan.",
      advanceOnDetect: true,
    },
    {
      n: 4,
      station: "pan",
      text: "Heat the oil in a pan until just hot.",
      confirm: "Pan it is. Just hot, not smoking — the oil should shimmer.",
      heat: "medium",
      cue: "Just hot, not smoking. The oil should shimmer, not haze.",
    },
    {
      n: 5,
      station: "pan",
      image: "/steps/pan-veg.webp",
      text: "Add the onions and peppers. Saute on high heat.",
      without: [
        { when: ["bellpepper"], text: "Add the onions. Saute on high heat." },
        { when: ["onion"], text: "Add the peppers. Saute on high heat." },
        {
          when: ["onion", "bellpepper"],
          text: "No vegetables to saute, so just warm the oil through.",
          timer: null,
        },
      ],
      timer: 60,
      heat: "high",
      cue: "The onions turn glassy at the edges. One minute is enough.",
    },
    {
      n: 6,
      station: "pan",
      text: "Stir in the spices and spread it all evenly.",
      heat: "high",
      cue: "Spread it flat so the egg sets in one even layer.",
    },
    {
      n: 7,
      station: "pan",
      text: "Lower the heat, pour in the eggs. Cook until the base sets, then flip.",
      timer: 90,
      heat: "medium",
      cue: "The base is set when the edges lift cleanly and the top is no longer runny.",
    },
    {
      n: 8,
      station: "pan",
      text: "Sprinkle the grated cheese over the top.",
      heat: "low",
      cue: "Both sides should be cooked before the cheese goes on.",
    },
    {
      n: 9,
      station: "pan",
      text: "Fold it in half and cook on low until the cheese melts.",
      timer: 30,
      heat: "low",
      cue: "Low heat only. High heat browns the outside before the cheese gives.",
    },
  ],
};

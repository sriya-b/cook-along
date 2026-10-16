// one hardcoded recipe for the prototype. any link pasted on the home
// screen resolves to this. swasthi's cheese omelette, split into nine
// steps so each one sits at exactly one station.

export type Station = "board" | "bowl" | "pan";

export type Ingredient = {
  /** null for things measured by feel, like a pinch of salt */
  amount: number | null;
  unit: string;
  item: string;
  /** shown smaller, never scaled */
  note?: string;
};

export type Heat = "off" | "low" | "medium" | "high";

export type Step = {
  n: number;
  station: Station;
  /** the one line shown in the recipe zone. short on purpose. */
  text: string;
  /** seconds, when the step is a wait worth timing */
  timer?: number;
  /** burner setting for this step. drives the heat tip. */
  heat?: Heat;
  /** what "done" looks like, for the assistant zone */
  cue?: string;
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
    { amount: 0.25, unit: "cup", item: "onions and bell peppers", note: "heaped" },
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
      text: "chop the onions, bell peppers and coriander.",
      cue: "small, even pieces cook through in the one minute they get.",
    },
    {
      n: 2,
      station: "bowl",
      text: "crack the eggs into a bowl and whisk them well.",
      cue: "whisk until the yolk and white are one colour, no streaks.",
    },
    {
      n: 3,
      station: "bowl",
      text: "add the salt and coriander to the eggs.",
      cue: "go light on salt here. the cheese brings plenty of its own.",
    },
    {
      n: 4,
      station: "pan",
      text: "heat the oil in a pan until just hot.",
      heat: "medium",
      cue: "just hot, not smoking. the oil should shimmer, not haze.",
    },
    {
      n: 5,
      station: "pan",
      text: "add the onions and peppers. saute on high heat.",
      timer: 60,
      heat: "high",
      cue: "the onions turn glassy at the edges. one minute is enough.",
    },
    {
      n: 6,
      station: "pan",
      text: "stir in the spices and spread it all evenly.",
      heat: "high",
      cue: "spread it flat so the egg sets in one even layer.",
    },
    {
      n: 7,
      station: "pan",
      text: "lower the heat, pour in the eggs. cook until the base sets, then flip.",
      timer: 90,
      heat: "medium",
      cue: "the base is set when the edges lift cleanly and the top is no longer runny.",
    },
    {
      n: 8,
      station: "pan",
      text: "sprinkle the grated cheese over the top.",
      heat: "low",
      cue: "both sides should be cooked before the cheese goes on.",
    },
    {
      n: 9,
      station: "pan",
      text: "fold it in half and cook on low until the cheese melts.",
      timer: 30,
      heat: "low",
      cue: "low heat only. high heat browns the outside before the cheese gives.",
    },
  ],
};

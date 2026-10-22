import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { answers } from "@/lib/knowledge";
import { recipe, stepText, visibleIngredients, STATION_LABEL, type OmitKey } from "@/lib/recipe";

// the same pinned model as /api/look, for the same reason
const MODEL = "gemini-3.5-flash-lite";

export const maxDuration = 30;

/** a spoken question wants an answer while the cook is still holding the
 *  spatula. past this, the written fallback is the better reply. */
const DEADLINE_MS = 12000;

export type AskRequest = {
  question: string;
  stepN: number;
  omitted?: string[];
  /** what the camera sees right now, base64 jpeg, optional */
  frame?: string | null;
};

export type AskResult = {
  answer: string | null;
  /** google refused for quota */
  limited?: boolean;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function buildPrompt(question: string, stepN: number, omitted: OmitKey[], hasFrame: boolean) {
  const gone = new Set(omitted);
  const steps = recipe.steps
    .map((s) => `${s.n}. [${STATION_LABEL[s.station]}] ${stepText(s, gone)}`)
    .join("\n");
  const ingredients = visibleIngredients(recipe.ingredients, gone)
    .map((i) => `- ${[i.amount, i.unit, i.item].filter(Boolean).join(" ")}`)
    .join("\n");
  const notes = answers.map((a) => `- ${a.text}`).join("\n");
  const step = recipe.steps[stepN - 1];

  return `You are a calm friend standing next to someone cooking ${recipe.title} for the first time. They just asked you something out loud, with their hands full.

Ingredients:
${ingredients}

The recipe:
${steps}

Notes from the recipe's author, to draw on where they fit:
${notes}

They are on step ${stepN}: ${step ? stepText(step, gone) : ""}
${omitted.length ? `They do not have: ${omitted.join(", ")}. Never tell them to add these.\n` : ""}${hasFrame ? "The photo is what their phone camera sees right now. Use it if the question is about how things look.\n" : ""}
What they said: "${question}"

Answer in at most two short sentences, about thirty words, in sentence case. Say what to do, not why at length. No lists, no em dashes, no markdown. It will be shown in large type over the camera.
If the question is not about cooking, answer briefly and kindly steer back to the step.
If they ask to move on, go back, or start the timer, tell them to swipe or tap the timer, since you cannot do those yourself.`;
}

export async function POST(req: Request) {
  let body: AskRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const question = typeof body.question === "string" ? body.question.trim().slice(0, 400) : "";
  const stepN = Number(body.stepN);
  if (!question || !Number.isInteger(stepN) || stepN < 1 || stepN > recipe.steps.length) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const key = process.env.GEMINI_API_KEY;
  // no key: the client falls back to its own keyword answers
  if (!key || process.env.MOCK_VISION === "1") {
    return NextResponse.json({ answer: null } satisfies AskResult);
  }

  const frame = typeof body.frame === "string" && body.frame.length > 100 ? body.frame : null;
  const omitted = (body.omitted ?? []).filter((k): k is OmitKey => k === "onion" || k === "bellpepper");

  try {
    const ai = new GoogleGenAI({ apiKey: key });
    const call = ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [
            ...(frame ? [{ inlineData: { mimeType: "image/jpeg", data: frame } }] : []),
            { text: buildPrompt(question, stepN, omitted, Boolean(frame)) },
          ],
        },
      ],
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: { answer: { type: Type.STRING } },
          required: ["answer"],
        },
      },
    });

    const response = await Promise.race([call, sleep(DEADLINE_MS).then(() => null)]);
    if (!response) {
      console.warn("[ask] deadline hit");
      return NextResponse.json({ answer: null } satisfies AskResult);
    }

    const parsed = JSON.parse(response.text ?? "{}") as { answer?: unknown };
    const answer = typeof parsed.answer === "string" ? parsed.answer.trim() : "";
    return NextResponse.json({ answer: answer || null } satisfies AskResult);
  } catch (err) {
    const limited = (err as { status?: number })?.status === 429 || /429|RESOURCE_EXHAUSTED|quota/i.test(String(err));
    console.error("[ask] failed:", limited ? "out of quota" : err);
    return NextResponse.json({ answer: null, limited } satisfies AskResult);
  }
}

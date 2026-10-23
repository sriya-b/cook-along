import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { recipe, STATION_LABEL } from "@/lib/recipe";
import { isLookResult, type LookRequest, type LookResult } from "@/lib/vision";

// pinned, not the "-latest" alias: an alias can be repointed by google at any
// time, which would silently change behaviour mid-demo. the alias resolved to
// this exact model when it was checked on 2026-10-21.
const MODEL = "gemini-3.5-flash-lite";

/** frames are small but still bigger than the default body budget */
export const maxDuration = 60;

/** the whole route must answer well inside the function budget. a cook
 *  waiting on a pan would rather have the written cue now than the
 *  model's line late, and a platform timeout returns neither. */
const DEADLINE_MS = 25000;

/** the flash models return 503 under load often enough to matter, and a
 *  cook staring at a pan should not see a shrug because google was busy */
const RETRIES = 1;
const RETRY_DELAY_MS = 500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isOverloaded(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  if (status === 503) return true;
  return /503|overload|UNAVAILABLE|high demand/i.test(String(err));
}

/** out of quota. retrying straight away only spends more of it. */
function isLimited(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  if (status === 429) return true;
  return /429|RESOURCE_EXHAUSTED|quota/i.test(String(err));
}

/** [ymin, xmin, ymax, xmax] over 0-1000 -> a 0..1 rectangle */
function toBox(raw: unknown): LookResult["panBox"] {
  if (!Array.isArray(raw) || raw.length !== 4) return null;
  const [ymin, xmin, ymax, xmax] = raw.map(Number);
  if ([ymin, xmin, ymax, xmax].some((n) => !Number.isFinite(n))) return null;
  const x = Math.min(xmin, xmax) / 1000;
  const y = Math.min(ymin, ymax) / 1000;
  const w = Math.abs(xmax - xmin) / 1000;
  const h = Math.abs(ymax - ymin) / 1000;
  // a box covering everything, or nothing, is not a pan
  if (w < 0.03 || h < 0.03 || w > 0.98 || h > 0.98) return null;
  return { x, y, w, h };
}

function mockFor(stepN: number): LookResult {
  const step = recipe.steps[stepN - 1];
  return {
    tip: step?.cue ?? "keep going, you're on track.",
    stepLooksComplete: false,
    confidence: 0.5,
    seesStep: stepN,
    seesStation: null,
    panBox: null,
    boardBox: null,
    bowlBox: null,
    mocked: true,
  };
}

/**
 * a pretend sighting of this step's station, for checking the action clips
 * and the anchoring without a camera or a request. only with
 * MOCK_VISION=boxes; it is never a fallback.
 */
function demoFor(stepN: number): LookResult {
  const step = recipe.steps[stepN - 1];
  const at: LookResult["panBox"] = { x: 0.22, y: 0.5, w: 0.56, h: 0.2 };
  return {
    tip: step?.cue ?? "Looks good.",
    stepLooksComplete: false,
    confidence: 0.9,
    seesStep: stepN,
    seesStation: step?.station ?? null,
    panBox: step?.station === "pan" ? at : null,
    boardBox: step?.station === "board" ? { x: 0.16, y: 0.48, w: 0.68, h: 0.22 } : null,
    bowlBox: step?.station === "bowl" ? { x: 0.25, y: 0.46, w: 0.5, h: 0.22 } : null,
  };
}

/** everything the model needs to judge one frame, as plain text */
function buildPrompt(stepN: number, omitted: string[]) {
  const step = recipe.steps[stepN - 1];
  const dropped = omitted.length
    ? `The cook does not have: ${omitted.join(", ")}. Never tell them to add these.\n`
    : "";

  const all = recipe.steps
    .map((s) => `${s.n}. [${STATION_LABEL[s.station]}] ${s.text}`)
    .join("\n");

  return `You are a calm friend standing next to someone cooking ${recipe.title}, watching their counter through their phone camera. You speak first and you speak briefly.

The full recipe:
${all}

They should currently be on step ${stepN}: ${step?.text ?? ""}
${step?.cue ? `What done looks like: ${step.cue}\n` : ""}${dropped}
Look at the photo and answer:

- tip: ONE short line in sentence case, at most fourteen words. Start with a capital, end with a full stop. No em dashes.
  - If you can see the food or the station for this step, say what to do about what you can actually see: "The onions need another minute.", "That base is set, flip it."
  - If you can see cooking things but not the right station, point them at it: "Point at your cutting board when you're ready to chop."
  - If you can see no kitchen at all, say so plainly and kindly: "I can see a desk, not a kitchen. Point me at your counter."
  - Never just repeat the step back to them.
- stepLooksComplete: true only when the food clearly shows step ${stepN} is finished. False if you cannot see the food.
- confidence: 0 to 1, how sure you are about what you are looking at. Be honest and go low when the photo does not show cooking.
- seesStep: which step number the photo actually looks like, or null when you cannot tell. It may differ from ${stepN} if they are ahead or behind.
- panBox: if a frying pan or skillet is visible, its bounding box as [ymin, xmin, ymax, xmax] normalised to 0-1000. Box the pan itself, the rim and body, not the handle and not the hob around it. Null when no pan is in shot.
- boardBox: the same for a chopping board: the whole board, not what is on it or the counter around it. Null when no board is in shot.
- bowlBox: the same for a mixing bowl: its rim and body, not the counter around it. Null when no bowl is in shot.
- seesStation: which of the three work areas is in shot: "board" for a chopping board, "bowl" for a mixing bowl, "pan" for a frying pan on a hob. Null if none of them is visible. Judge this generously: a board at the edge of the frame, or partly covered in vegetables, still counts. You do not need a close up.`;
}

export async function POST(req: Request) {
  let body: LookRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const stepN = Number(body.stepN);
  if (!Number.isInteger(stepN) || stepN < 1 || stepN > recipe.steps.length) {
    return NextResponse.json({ error: "bad stepN" }, { status: 400 });
  }

  const key = process.env.GEMINI_API_KEY;
  // no key is the normal case while building the ui, not an error. the mock
  // keeps the whole flow exercisable without spending a request.
  if (process.env.MOCK_VISION === "boxes") {
    return NextResponse.json(demoFor(stepN));
  }
  if (!key || process.env.MOCK_VISION === "1") {
    return NextResponse.json(mockFor(stepN));
  }

  if (typeof body.frame !== "string" || body.frame.length < 100) {
    return NextResponse.json({ error: "no frame" }, { status: 400 });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: key });
    const request = {
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: "image/jpeg", data: body.frame } },
            { text: buildPrompt(stepN, body.omitted ?? []) },
          ],
        },
      ],
      config: {
        // the free tier is slow. "low" roughly halves the wait against the
        // default, and "none" is rejected outright on these models.
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            tip: { type: Type.STRING },
            stepLooksComplete: { type: Type.BOOLEAN },
            confidence: { type: Type.NUMBER },
            seesStep: { type: Type.INTEGER, nullable: true },
            panBox: { type: Type.ARRAY, nullable: true, items: { type: Type.INTEGER } },
            boardBox: { type: Type.ARRAY, nullable: true, items: { type: Type.INTEGER } },
            bowlBox: { type: Type.ARRAY, nullable: true, items: { type: Type.INTEGER } },
            seesStation: {
              type: Type.STRING,
              nullable: true,
              enum: ["board", "bowl", "pan"],
            },
          },
          required: ["tip", "stepLooksComplete", "confidence", "seesStation", "panBox", "boardBox", "bowlBox"],
        },
      },
    };

    const attempt = async () => {
      for (let i = 0; i <= RETRIES; i++) {
        try {
          return await ai.models.generateContent(request);
        } catch (err) {
          if (i === RETRIES || !isOverloaded(err)) throw err;
          await sleep(RETRY_DELAY_MS * (i + 1));
        }
      }
      return null;
    };

    // whichever lands first: the model, or our own deadline
    const timedOut = Symbol("timed out");
    const response = await Promise.race([
      attempt(),
      sleep(DEADLINE_MS).then(() => timedOut as unknown as null),
    ]);
    if ((response as unknown) === timedOut || !response) {
      console.warn("[look] deadline hit, falling back to the written cue");
      return NextResponse.json(mockFor(stepN));
    }

    const parsed: unknown = JSON.parse(response?.text ?? "{}");
    if (!isLookResult(parsed)) {
      return NextResponse.json(mockFor(stepN));
    }

    const raw = parsed as { panBox?: unknown; boardBox?: unknown; bowlBox?: unknown };
    const result = parsed as LookResult;
    result.panBox = toBox(raw.panBox);
    result.boardBox = toBox(raw.boardBox);
    result.bowlBox = toBox(raw.bowlBox);

    return NextResponse.json(parsed);
  } catch (err) {
    // a failed look must never stall the cook. fall back to the written cue.
    if (isLimited(err)) {
      console.warn("[look] out of quota, telling the client to back off");
      return NextResponse.json({ ...mockFor(stepN), limited: true });
    }
    console.error("[look] vision call failed:", err);
    return NextResponse.json(mockFor(stepN));
  }
}

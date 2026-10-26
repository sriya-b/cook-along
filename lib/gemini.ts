// one request to gemini, hedged. the free tier slows down without warning
// when google is busy (calls that took 2s took 20s), so if the first model
// has not answered within a few seconds, or refuses, the same request also
// goes to a second model and whichever answers first wins. a hedge costs
// at most one extra request, and only when the first is already late.

import type { GoogleGenAI } from "@google/genai";

type Request = Parameters<GoogleGenAI["models"]["generateContent"]>[0];
type Response = Awaited<ReturnType<GoogleGenAI["models"]["generateContent"]>>;

/** tried first: fastest and most accurate when google is not busy */
export const PRIMARY = "gemini-3.5-flash-lite";
/** the backup: an older lite model, often on spare capacity when the
 *  newest one is swamped */
export const BACKUP = "gemini-3.1-flash-lite";
/** how long the primary gets before the backup joins in */
const HEDGE_AFTER_MS = 3000;

/** google said this project is out of quota; no amount of racing helps */
export function isLimited(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  if (status === 429) return true;
  return /429|RESOURCE_EXHAUSTED|quota/i.test(String(err));
}

export async function generateHedged(ai: GoogleGenAI, request: Omit<Request, "model">): Promise<Response> {
  const forBackup = (): Request => {
    // the older model has no thinking levels; drop the setting rather than
    // have it rejected
    const config = { ...(request.config ?? {}) };
    delete (config as { thinkingConfig?: unknown }).thinkingConfig;
    return { ...request, config, model: BACKUP } as Request;
  };

  return new Promise<Response>((resolve, reject) => {
    let settled = false;
    let failures = 0;
    let started = 1;
    let backupStarted = false;
    const errors: unknown[] = [];

    const win = (r: Response) => {
      if (settled) return;
      settled = true;
      clearTimeout(hedge);
      resolve(r);
    };
    const lose = (err: unknown) => {
      errors.push(err);
      failures++;
      // out of quota: say so straight away, the backup shares the quota
      if (isLimited(err) && !settled) {
        settled = true;
        clearTimeout(hedge);
        reject(err);
        return;
      }
      if (!backupStarted) startBackup();
      else if (failures >= started && !settled) {
        settled = true;
        reject(errors[0]);
      }
    };
    const startBackup = () => {
      if (backupStarted || settled) return;
      backupStarted = true;
      started++;
      clearTimeout(hedge);
      ai.models.generateContent(forBackup()).then(win, lose);
    };

    const hedge = setTimeout(startBackup, HEDGE_AFTER_MS);
    ai.models.generateContent({ ...request, model: PRIMARY } as Request).then(win, lose);
  });
}

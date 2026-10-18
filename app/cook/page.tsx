"use client";

import Image from "next/image";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  recipe,
  findOmission,
  stepText,
  visibleIngredients,
  OMISSIONS,
  STATION_LABEL,
  type OmitKey,
} from "@/lib/recipe";
import { scaledQuantity } from "@/lib/scale";
import { findAnswer, FALLBACK } from "@/lib/knowledge";
import { useCamera } from "@/lib/useCamera";
import { useStation } from "@/lib/useStation";

/** how long the cook's own line sits alone before the answer lands */
const REPLY_DELAY = 800;
/** ...and how long the answer is readable before the recipe moves itself on */
const ADVANCE_DELAY = 2600;
/** an ordinary answer clears itself so the station line can come back */
const EXCHANGE_LIFE = 9000;

function mmss(total: number) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** "cutting board" -> "Cutting board", for the start of a sentence */
function sentence(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** one round of chat, shown in the assistant zone */
type Exchange = { you: string; reply: string | null };

function CookScreen() {
  const params = useSearchParams();
  const servings = Math.min(Math.max(Number(params.get("servings")) || 1, 1), 12);

  const { videoRef, state, message } = useCamera();
  const [index, setIndex] = useState(0);
  const step = recipe.steps[index];

  // --- ingredients the cook has told us they do not have -------------------
  const [omitted, setOmitted] = useState<Set<OmitKey>>(new Set());
  const text = stepText(step, omitted);

  // --- the one tip in the assistant zone ---------------------------------
  const [tip, setTip] = useState<string | null>(null);
  const fadeRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTip = useCallback((text: string, sticky: boolean) => {
    setTip(text);
    if (fadeRef.current) clearTimeout(fadeRef.current);
    // tips fade after a few seconds unless they need action, like a timer
    if (!sticky) fadeRef.current = setTimeout(() => setTip(null), 6000);
  }, []);

  // --- which station are we pointed at --------------------------------------
  const { at, ready } = useStation(videoRef, state === "live");
  const stationFound = at(step.station) !== null;
  // only claim to be looking when something can actually report a station
  const searching = state === "live" && ready && !stationFound;

  const seenRef = useRef(false);
  useEffect(() => {
    seenRef.current = false;
  }, [step]);

  useEffect(() => {
    if (!stationFound || seenRef.current) return;
    seenRef.current = true;
    const label = sentence(STATION_LABEL[step.station]);
    showTip(`${label} detected. ${step.cue ?? ""}`.trim(), Boolean(step.timer));
  }, [stationFound, step, showTip]);

  // --- countdown for steps that are a wait --------------------------------
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    setRemaining(step.timer ?? null);
    showTip(step.cue ?? step.text, Boolean(step.timer));
  }, [step, showTip]);

  useEffect(() => {
    if (remaining === null || remaining <= 0) return;
    const id = setInterval(() => setRemaining((r) => (r === null ? null : r - 1)), 1000);
    return () => clearInterval(id);
  }, [remaining]);

  useEffect(() => {
    if (remaining === 0) showTip("That is time. Take a look before you move on.", true);
  }, [remaining, showTip]);

  // --- chat ---------------------------------------------------------------
  const [draft, setDraft] = useState("");
  const [exchange, setExchange] = useState<Exchange | null>(null);
  const chatRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearChatTimers = useCallback(() => {
    chatRef.current.forEach(clearTimeout);
    chatRef.current = [];
  }, []);

  useEffect(() => clearChatTimers, [clearChatTimers]);

  const next = useCallback(
    () => setIndex((i) => Math.min(i + 1, recipe.steps.length - 1)),
    [],
  );

  function ask(input: string) {
    const q = input.trim();
    if (!q) return;
    setDraft("");
    clearChatTimers();

    // the cook's own line goes up first, then the answer lands after it
    setExchange({ you: q, reply: null });

    // "I don't have bell peppers" rewrites the recipe rather than answering
    const omit = findOmission(q);
    const dropping = omit !== null && !omitted.has(omit);

    const reply = dropping
      ? `Got it! You can use ${OMISSIONS[omit].substitute} instead, otherwise updating the recipe...`
      : (findAnswer(q, step.n)?.text ?? FALLBACK);

    chatRef.current.push(
      setTimeout(() => {
        if (dropping) setOmitted((prev) => new Set(prev).add(omit));
        setExchange({ you: q, reply });
      }, REPLY_DELAY),
    );

    // dropping an ingredient is a decision, so the recipe carries on by itself
    if (dropping) {
      chatRef.current.push(
        setTimeout(() => {
          setExchange(null);
          next();
        }, REPLY_DELAY + ADVANCE_DELAY),
      );
    } else {
      chatRef.current.push(
        setTimeout(() => setExchange(null), REPLY_DELAY + EXCHANGE_LIFE),
      );
    }
  }

  // a new step is a clean slate for the assistant zone
  useEffect(() => {
    setExchange(null);
  }, [step]);

  // quantities named in this step, so the numbers sit next to the action
  const lower = text.toLowerCase();
  const quantities = visibleIngredients(recipe.ingredients, omitted)
    .filter((i) => lower.includes(i.item.split(" ")[0].toLowerCase()))
    .map((i) => `${scaledQuantity(i, servings, recipe.baseServings)} ${i.item}`.trim())
    .join(" · ");

  // the station line takes over the assistant zone while we are still looking
  const feedback = searching ? `Detecting ${STATION_LABEL[step.station]}...` : tip;

  return (
    // 100dvh, not inset-0: safari's toolbar shrinks the visible viewport and
    // would otherwise push the assistant zone off the bottom of the screen.
    <div className="fixed inset-x-0 top-0 h-[100dvh] overflow-hidden bg-black">
      {/* the live counter. everything else is a fixed panel over it. */}
      <video
        ref={videoRef}
        playsInline
        muted
        className="absolute inset-0 h-full w-full object-cover"
      />
      {state !== "live" && (
        <div className="absolute inset-0 flex items-center justify-center px-10 text-center text-[15px] text-white/70">
          {message ?? "Opening the camera..."}
        </div>
      )}

      {/* the counter lights up green while we are hunting for the station.
          the panels above and below are opaque, so this reads as a wash over
          the worktop itself. */}
      {searching && (
        <div className="pointer-events-none absolute inset-0 animate-pulse bg-[#22c55e]/25" />
      )}

      {/* recipe zone: current step only, never floating over the food */}
      <div className="absolute inset-x-0 top-0 h-[198.5px] rounded-b-[24px] bg-[#2f2f2f]/92 backdrop-blur-sm">
        <Image
          src={step.image ?? recipe.image}
          alt=""
          width={1200}
          height={1800}
          className="absolute left-[10.5px] top-[13px] h-[174px] w-[175px] rounded-[16px] object-cover"
        />

        <div className="absolute left-[212px] top-[33px] w-[150px] text-white">
          <p className="text-[18px] font-semibold leading-tight">
            step {step.n}/{recipe.steps.length}
          </p>
          <p className="mt-[8px] text-[15px] leading-[1.35]">{text}</p>
          {quantities && (
            <p className="mt-[6px] text-[12px] leading-[1.3] text-white/70">{quantities}</p>
          )}
        </div>

        <button
          onClick={() => setIndex((i) => Math.max(i - 1, 0))}
          disabled={index === 0}
          aria-label="previous step"
          className="absolute left-0 top-1/2 flex h-12 w-10 -translate-y-1/2 items-center justify-center text-[26px] text-white disabled:opacity-25"
        >
          &#8249;
        </button>
        <button
          onClick={next}
          disabled={index === recipe.steps.length - 1}
          aria-label="next step"
          className="absolute right-0 top-1/2 flex h-12 w-10 -translate-y-1/2 items-center justify-center text-[26px] text-white disabled:opacity-25"
        >
          &#8250;
        </button>
      </div>

      {/* the timer sits dead centre so it reads at arm's length */}
      {remaining !== null && (
        <div className="absolute left-1/2 top-[295px] -translate-x-1/2 bg-black/35 px-[14px] py-[6px]">
          <span className="text-[56px] font-semibold leading-none text-white tabular-nums">
            {mmss(Math.max(remaining, 0))}
          </span>
        </div>
      )}

      {/* assistant zone: the last exchange, then the chat. anchored to the
          bottom at its traced 208.5px (874 - 665.5) so the chat bar stays on
          screen whatever the browser chrome does. that 208.5 is a minimum
          rather than a fixed height: a long answer grows the panel upward
          instead of being clipped behind the chat bar. */}
      <div className="absolute inset-x-0 bottom-0 min-h-[208.5px] rounded-t-[24px] bg-background pt-[25px] pb-[60px]">
        <div className="mx-[32px] min-h-[42px] w-[340px]">
          {exchange ? (
            <>
              <p className="text-[13px] leading-[1.3] text-muted">{exchange.you}</p>
              {exchange.reply && (
                <p className="mt-[6px] text-[16px] leading-[1.35]">{exchange.reply}</p>
              )}
            </>
          ) : (
            <p className="text-[16px] leading-[1.35]">{feedback}</p>
          )}
        </div>

        <div className="mx-[32px] mt-[7.5px] flex h-[74px] w-[340px] items-center rounded-[20px] bg-field pl-[18px] pr-[15px]">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask(draft)}
            placeholder="chat"
            className="h-full flex-1 bg-transparent text-[16px] placeholder:text-muted focus:outline-none"
          />
          <button
            onClick={() => ask(draft)}
            disabled={!draft.trim()}
            aria-label="send"
            className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[12px] bg-foreground text-[15px] font-semibold text-background disabled:opacity-25"
          >
            go
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CookPage() {
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-black" />}>
      <CookScreen />
    </Suspense>
  );
}

"use client";

import Image from "next/image";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { recipe } from "@/lib/recipe";
import { scaledQuantity } from "@/lib/scale";
import { findAnswer, FALLBACK } from "@/lib/knowledge";
import { useCamera } from "@/lib/useCamera";

function mmss(total: number) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function CookScreen() {
  const params = useSearchParams();
  const servings = Math.min(Math.max(Number(params.get("servings")) || 1, 1), 12);

  const { videoRef, state, message } = useCamera();
  const [index, setIndex] = useState(0);
  const step = recipe.steps[index];

  // --- the one tip in the assistant zone ---------------------------------
  const [tip, setTip] = useState<string | null>(null);
  const fadeRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTip = useCallback((text: string, sticky: boolean) => {
    setTip(text);
    if (fadeRef.current) clearTimeout(fadeRef.current);
    // tips fade after a few seconds unless they need action, like a timer
    if (!sticky) fadeRef.current = setTimeout(() => setTip(null), 6000);
  }, []);

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
    if (remaining === 0) showTip("that is time. take a look before you move on.", true);
  }, [remaining, showTip]);

  // --- chat ---------------------------------------------------------------
  const [draft, setDraft] = useState("");

  function ask(text: string) {
    const q = text.trim();
    if (!q) return;
    const hit = findAnswer(q, step.n);
    showTip(hit ? hit.text : FALLBACK, true);
    setDraft("");
  }

  function listen() {
    type SR = new () => {
      lang: string;
      start: () => void;
      onresult: (e: { results: { 0: { 0: { transcript: string } } } }) => void;
    };
    const w = window as unknown as { SpeechRecognition?: SR; webkitSpeechRecognition?: SR };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      showTip("this browser cannot listen. type it instead.", false);
      return;
    }
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.onresult = (e) => ask(e.results[0][0].transcript);
    rec.start();
  }

  // quantities named in this step, so the numbers sit next to the action
  const quantities = recipe.ingredients
    .filter((i) => step.text.includes(i.item.split(" ")[0]))
    .map((i) => `${scaledQuantity(i, servings, recipe.baseServings)} ${i.item}`.trim())
    .join(" · ");

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      {/* the live counter. everything else is a fixed panel over it. */}
      <video
        ref={videoRef}
        playsInline
        muted
        className="absolute inset-0 h-full w-full object-cover"
      />
      {state !== "live" && (
        <div className="absolute inset-0 flex items-center justify-center px-10 text-center text-[15px] text-white/70">
          {message ?? "opening the camera..."}
        </div>
      )}

      {/* recipe zone: current step only, never floating over the food */}
      <div className="absolute inset-x-0 top-0 h-[198.5px] rounded-b-[24px] bg-[#2f2f2f]/92 backdrop-blur-sm">
        <Image
          src={recipe.image}
          alt=""
          width={1200}
          height={1800}
          className="absolute left-[10.5px] top-[13px] h-[174px] w-[175px] rounded-[16px] object-cover"
        />

        <div className="absolute left-[212px] top-[33px] w-[150px] text-white">
          <p className="text-[18px] font-semibold leading-tight">
            step {step.n}/{recipe.steps.length}
          </p>
          <p className="mt-[8px] text-[15px] leading-[1.35]">{step.text}</p>
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
          onClick={() => setIndex((i) => Math.min(i + 1, recipe.steps.length - 1))}
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

      {/* assistant zone: one tip at a time, then the chat */}
      <div className="absolute inset-x-0 bottom-0 top-[665.5px] rounded-t-[24px] bg-background">
        <p className="absolute left-[32px] top-[25px] w-[340px] text-[16px] leading-[1.35]">
          {tip}
        </p>

        <div className="absolute left-[32px] top-[74.5px] flex h-[74px] w-[340px] items-center rounded-[20px] bg-field pl-[18px] pr-[15px]">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask(draft)}
            placeholder="chat"
            className="h-full flex-1 bg-transparent text-[16px] placeholder:text-muted focus:outline-none"
          />
          <button
            onClick={listen}
            aria-label="ask out loud"
            className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[12px] bg-foreground text-background"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z" />
              <path d="M18 11a1 1 0 1 0-2 0 4 4 0 0 1-8 0 1 1 0 1 0-2 0 6 6 0 0 0 5 5.91V19h-2a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-2.09A6 6 0 0 0 18 11Z" />
            </svg>
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

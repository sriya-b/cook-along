"use client";

import Image from "next/image";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  recipe,
  findOmission,
  readAnswer,
  resolveStep,
  visibleIngredients,
  OMISSIONS,
  STATION_LABEL,
  type OmitKey,
  type Step,
} from "@/lib/recipe";
import { scaledQuantity } from "@/lib/scale";
import { findAnswer, FALLBACK } from "@/lib/knowledge";
import { useCamera } from "@/lib/useCamera";
import { useVision } from "@/lib/useVision";
import type { LookResult } from "@/lib/vision";
import { useAnchor, anchorStyle } from "@/lib/anchor";
import { useFlow } from "@/lib/useFlow";


/** how long the cook's own line sits alone before the answer lands */
const REPLY_DELAY = 800;
/** ...and how long the answer is readable before the recipe moves itself on */
const ADVANCE_DELAY = 2600;
/** an ordinary answer clears itself so the station line can come back */
const EXCHANGE_LIFE = 9000;
/** how long the confirmation is readable before a hands-free step moves on */
const CONFIRM_DELAY = 2200;
/** how often to take another look while it is still unsure. the free tier
 *  answers in 15s or so, so anything tighter just queues up behind itself. */
const LOOK_EVERY = 14000;
/** below this the model is guessing, so we keep looking */
const LOOK_FLOOR = 0.6;
/** ...and it has to be this sure before its word moves the recipe on */
const LOOK_ADVANCE = 0.75;
/** every step spends at least this long visibly looking for its station,
 *  so the green wash and the "Detecting..." line are always seen before
 *  anything is said about the station. */
const MIN_SEARCH = 2000;

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

/** the left-hand page of the spread: the picture, printed on the paper */
function LeftPage({ step }: { step: Step }) {
  return (
    <div className="flex h-full items-center justify-center p-[14px]">
      <Image
        src={step.image ?? recipe.image}
        alt=""
        width={1200}
        height={1800}
        className="h-[150px] w-full rounded-[2px] object-cover"
      />
    </div>
  );
}

/** the right-hand page of the spread, live or mid-turn */
function RightPage({
  step,
  text,
  quantities,
  total,
}: {
  step: Step;
  text: string;
  quantities: string;
  total: number;
}) {
  return (
    <div className="flex h-full flex-col justify-center py-[14px] pl-[16px] pr-[18px] text-[var(--paper-ink)]">
      <p className="text-[17px] font-semibold leading-tight">
        Step {step.n}/{total}
      </p>
      <p className="mt-[7px] text-[14px] leading-[1.35]">{text}</p>
      {quantities && (
        <p className="mt-[5px] text-[11px] leading-[1.3] opacity-60">{quantities}</p>
      )}
    </div>
  );
}

function CookScreen() {
  const params = useSearchParams();
  const servings = Math.min(Math.max(Number(params.get("servings")) || 1, 1), 12);

  const { videoRef, state, message } = useCamera();
  const [index, setIndex] = useState(0);
  const step = recipe.steps[index];

  // --- ingredients the cook has told us they do not have -------------------
  // the checklist before cooking seeds this; the chat can still add to it.
  const [omitted, setOmitted] = useState<Set<OmitKey>>(() => {
    const seed = (params.get("omit") ?? "")
      .split(",")
      .filter((k): k is OmitKey => k in OMISSIONS);
    return new Set(seed);
  });
  /** a question we have put to the cook and are waiting on */
  const [pending, setPending] = useState<OmitKey | null>(null);
  const resolved = resolveStep(step, omitted);
  const text = resolved.text;

  // --- turning the page ----------------------------------------------------
  // the outgoing page keeps rendering while it swings, so the turn uncovers
  // the new page rather than swapping the text underneath the reader.
  const [turningFrom, setTurningFrom] = useState<{
    step: Step;
    text: string;
    quantities: string;
    /** forward lifts the right page, back lifts the left one */
    dir: "fwd" | "back";
  } | null>(null);
  const lastPage = useRef<{ step: Step; text: string; quantities: string } | null>(null);

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
  // gemini decides this now, not pixel colour. the old heuristic needed the
  // board to fill the middle of the frame, so you had to lean right over it;
  // the model recognises one from across the counter.
  const [seen, setSeen] = useState<LookResult | null>(null);
  // the pan's last known place, kept apart from `seen` on purpose: a look
  // that failed or was throttled says nothing about where the pan is, and
  // letting it null this was making the ring blink out every few seconds.
  const [panBox, setPanBox] = useState<LookResult["panBox"]>(null);
  useEffect(() => {
    setSeen(null);
    setPanBox(null);
  }, [step]);

  const stationFound = seen?.seesStation === step.station;
  // the model says roughly where the pan is every fifteen seconds; the
  // local tracker follows it frame by frame in between, which is what
  // makes the cue stay stuck to it rather than lag behind.
  // optical flow follows the pan's own surface frame to frame. the
  // speckles that made it unrecognisable are what make it followable.
  const tracked = useFlow(videoRef, state === "live", panBox);
  const anchor = useAnchor(tracked);
  // "detecting" means we have not heard back yet for this step. once the
  // model has spoken, whatever it said, its own words are better than a
  // spinner that never stops.
  const searching = state === "live" && !seen;

  const next = useCallback(
    () => setIndex((i) => Math.min(i + 1, recipe.steps.length - 1)),
    [],
  );
  const back = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);

  // swipe to turn the page. a swipe has to be mostly sideways and long
  // enough that reaching across the counter does not fire it.
  const touch = useRef<{ x: number; y: number } | null>(null);
  const SWIPE_MIN = 55;

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  }

  function onTouchEnd(e: React.TouchEvent) {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) next();
    else back();
  }

  const seenRef = useRef(false);
  const advanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // a new step forgets the last sighting and drops any advance still pending
  useEffect(() => {
    seenRef.current = false;
    if (advanceRef.current) clearTimeout(advanceRef.current);
    advanceRef.current = null;
    return () => {
      if (advanceRef.current) clearTimeout(advanceRef.current);
    };
  }, [step]);


  // --- countdown for steps that are a wait --------------------------------
  const [remaining, setRemaining] = useState<number | null>(null);
  /** the clock does not run until the cook starts it. a countdown that
   *  starts itself is a countdown you have already half missed. */
  const [running, setRunning] = useState(false);

  useEffect(() => {
    setRemaining(resolved.timer);
    setRunning(false);
    showTip(step.cue ?? resolved.text, Boolean(resolved.timer));
  }, [step, showTip]);

  // steps that finish the moment you are in the right place: seeing the
  // station is the whole completion test, so recognising it moves us on.
  useEffect(() => {
    if (!stationFound || seenRef.current) return;
    seenRef.current = true;
    if (!step.advanceOnDetect) return;
    // the timer is deliberately NOT cleaned up when stationFound changes:
    // detection flickers as the phone moves, and a flicker inside this
    // window used to cancel the advance for good.
    advanceRef.current = setTimeout(next, CONFIRM_DELAY);
  }, [stationFound, step, next]);

  // --- gemini watches, and speaks first ------------------------------------
  // it looks whether or not the local detector recognises anything, because
  // the useful thing to say when the phone is pointed at a desk is "point me
  // at your counter", and only the model can tell us that.
  const { look } = useVision(videoRef);
  /** stop looking once it has told us something it was sure about */
  const settledRef = useRef(false);

  useEffect(() => {
    settledRef.current = false;
  }, [step]);

  useEffect(() => {
    if (state !== "live") return;

    let cancelled = false;

    async function takeOne() {
      // a question on screen is the cook's to answer, not ours to talk over
      if (cancelled || settledRef.current || pending) return;
      const result = await look(step.n, [...omitted]);
      if (cancelled || !result) return;

      // a mocked reply means the model could not answer: quota, a timeout,
      // or an overload. record it anyway so the screen stops saying it is
      // looking and falls back to the written cue.
      setSeen(result);
      // a failed or mocked look has nothing useful to say about the pan,
      // so leave the last known box alone rather than wiping it
      if (result.mocked || result.error) {
        if (result.error) showTip(result.tip, false);
        return;
      }
      // only a real answer moves, or clears, the pan
      setPanBox(result.panBox);
      // one line at a time, replacing whatever was there
      showTip(result.tip, true);

      // only stop looking once it has actually placed us at this step's
      // station. a confident "that is a desk" is not a reason to give up.
      const atStation = result.seesStation === step.station;
      if (atStation && result.confidence >= LOOK_FLOOR) settledRef.current = true;

      if (resolved.timer) return;
      if (
        atStation &&
        result.stepLooksComplete &&
        result.confidence >= LOOK_ADVANCE
      ) {
        advanceRef.current = setTimeout(next, ADVANCE_DELAY);
      }
    }

    takeOne();
    const id = setInterval(takeOne, LOOK_EVERY);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [state, step, pending, omitted, look, showTip, next, resolved.timer]);

  useEffect(() => {
    if (!running || remaining === null || remaining <= 0) return;
    const id = setInterval(() => setRemaining((r) => (r === null ? null : r - 1)), 1000);
    return () => clearInterval(id);
  }, [running, remaining]);

  useEffect(() => {
    if (remaining === 0) showTip("That is time. Take a look before you move on.", true);
  }, [remaining, showTip]);

  // --- chat ---------------------------------------------------------------
  const [listening, setListening] = useState(false);
  const [exchange, setExchange] = useState<Exchange | null>(null);
  const chatRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearChatTimers = useCallback(() => {
    chatRef.current.forEach(clearTimeout);
    chatRef.current = [];
  }, []);

  useEffect(() => clearChatTimers, [clearChatTimers]);

  /** speak to the assistant. the browser does the transcription. */
  function listen() {
    type Recogniser = {
      lang: string;
      interimResults: boolean;
      start: () => void;
      stop: () => void;
      onresult: ((e: { results: { 0: { 0: { transcript: string } } } }) => void) | null;
      onend: (() => void) | null;
      onerror: (() => void) | null;
    };
    const w = window as unknown as {
      SpeechRecognition?: new () => Recogniser;
      webkitSpeechRecognition?: new () => Recogniser;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      showTip("This browser cannot listen yet.", false);
      return;
    }
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.onresult = (e) => ask(e.results[0][0].transcript);
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    setListening(true);
    rec.start();
  }

  function ask(input: string) {
    const q = input.trim();
    if (!q) return;
    clearChatTimers();

    // the cook's own line goes up first, then the answer lands after it
    setExchange({ you: q, reply: null });

    // answering the question we just put to them takes priority, so a bare
    // "yes" means yes to that rather than nothing at all
    const answer = pending ? readAnswer(q) : null;
    if (pending && answer === false) {
      setPending(null);
      chatRef.current.push(
        setTimeout(
          () =>
            setExchange({
              you: q,
              reply: `Keeping the ${OMISSIONS[pending].label} in, then. ${step.cue ?? ""}`.trim(),
            }),
          REPLY_DELAY,
        ),
      );
      return;
    }

    // either they said yes to the question, or told us outright
    const omit = pending && answer === true ? pending : findOmission(q);
    const dropping = omit !== null && !omitted.has(omit);
    if (dropping) setPending(null);

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
    setPending(null);
  }, [step]);

  // quantities named in this step, so the numbers sit next to the action
  const lower = text.toLowerCase();
  const quantities = visibleIngredients(recipe.ingredients, omitted)
    .filter((i) => lower.includes(i.item.split(" ")[0].toLowerCase()))
    .map((i) => `${scaledQuantity(i, servings, recipe.baseServings)} ${i.item}`.trim())
    .join(" · ");

  // start a turn when the step changes, and remember this page as the one
  // that will swing away next time
  useEffect(() => {
    const prev = lastPage.current;
    if (prev && prev.step !== step) {
      setTurningFrom({ ...prev, dir: step.n > prev.step.n ? "fwd" : "back" });
      const id = setTimeout(() => setTurningFrom(null), 1000);
      lastPage.current = { step, text, quantities };
      return () => clearTimeout(id);
    }
    lastPage.current = { step, text, quantities };
  }, [step, text, quantities]);

  // there is always something in the assistant zone: the station line while
  // we are looking, then whatever was last said, and the step's own cue
  // underneath that, so a faded tip never leaves the panel empty.
  const feedback = searching
    ? `Detecting ${STATION_LABEL[step.station]}...`
    : (tip ?? step.cue ?? text);

  return (
    // 100dvh, not inset-0: safari's toolbar shrinks the visible viewport and
    // would otherwise push the assistant zone off the bottom of the screen.
    <div
      className="fixed inset-x-0 top-0 h-[100dvh] touch-pan-y overflow-hidden bg-black"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
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

      {/* --- the cookbook ------------------------------------------------ */}
      {/* keyed on the step so react remounts it, which replays the turn */}
      <div
        className="absolute inset-x-0 top-0 px-[8px] pt-[6px]"
        style={{ perspective: "1400px" }}
      >
        <div className="book book-gloss relative flex h-[198px] overflow-hidden rounded-b-[10px] rounded-t-[4px]">
          {/* which half shows the old page depends on the direction:
              the half the leaf has not covered yet is the old one. */}
          <div className="w-1/2">
            <LeftPage
              step={
                turningFrom && turningFrom.dir === "fwd" ? turningFrom.step : step
              }
            />
          </div>

          <div className="w-1/2">
            {turningFrom && turningFrom.dir === "back" ? (
              <RightPage
                step={turningFrom.step}
                text={turningFrom.text}
                quantities={turningFrom.quantities}
                total={recipe.steps.length}
              />
            ) : (
              <RightPage
                step={step}
                text={text}
                quantities={quantities}
                total={recipe.steps.length}
              />
            )}
          </div>

          {turningFrom && (
            <>
              <div
                className={`reveal-shadow ${
                  turningFrom.dir === "back" ? "reveal-shadow-back" : ""
                }`}
              />

              {/* one sheet. going forward it carries the old text over and
                  lands new-picture-up; going back it carries the old
                  picture over and lands new-text-up. */}
              <div
                className={`leaf ${turningFrom.dir === "back" ? "leaf-back-dir" : ""}`}
              >
                <div className="leaf-face">
                  {turningFrom.dir === "fwd" ? (
                    <RightPage
                      step={turningFrom.step}
                      text={turningFrom.text}
                      quantities={turningFrom.quantities}
                      total={recipe.steps.length}
                    />
                  ) : (
                    <LeftPage step={turningFrom.step} />
                  )}
                  <div className="leaf-shade" />
                </div>
                <div className="leaf-face leaf-face-back">
                  {turningFrom.dir === "fwd" ? (
                    <LeftPage step={step} />
                  ) : (
                    <RightPage
                      step={step}
                      text={text}
                      quantities={quantities}
                      total={recipe.steps.length}
                    />
                  )}
                  <div className="leaf-shade" />
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* the timer. once the model has found the pan it leaves the middle
          of the screen and goes to sit over it, leaning with the pan's own
          plane so it reads as part of the counter rather than on the glass. */}
      {/* the ring sits on the rim itself. the box the model returns is the
          rim's ellipse as the camera sees it, so drawing it at those exact
          bounds lands it on the pan without any 3d maths at all. this is
          what makes the cue read as stuck to the pan rather than over it. */}
      {tracked && (
        <div
          className="pan-ring pointer-events-none absolute rounded-[50%]"
          style={{
            left: `${tracked.x * 100}%`,
            top: `${tracked.y * 100}%`,
            width: `${tracked.w * 100}%`,
            height: `${tracked.h * 100}%`,
          }}
        />
      )}

      {/* the timer leans with the pan's own plane and sits just above the
          ring, so the two read as one thing lying on the hob. */}
      {remaining !== null && anchor && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ perspective: "760px" }}
        >
          <div
            className="absolute origin-center transition-none"
            style={anchorStyle(anchor)}
          >
            <div className="flex items-center gap-[10px] rounded-[16px] bg-black/55 px-[16px] py-[8px] shadow-[0_10px_26px_rgba(0,0,0,0.5)] backdrop-blur-sm">
              <span
                className={`text-[48px] font-semibold leading-none tabular-nums ${
                  running ? "text-white" : "text-white/70"
                }`}
                style={{ textShadow: "0 2px 8px rgba(0,0,0,0.5)" }}
              >
                {mmss(Math.max(remaining, 0))}
              </span>
              <button
                onClick={() => setRunning((r) => !r)}
                aria-label={running ? "pause the timer" : "start the timer"}
                className="pointer-events-auto flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full bg-white text-black active:scale-95"
              >
                {running ? (
                  <svg width="16" height="18" viewBox="0 0 16 18" fill="currentColor" aria-hidden>
                    <rect x="1" y="1" width="5" height="16" rx="1.5" />
                    <rect x="10" y="1" width="5" height="16" rx="1.5" />
                  </svg>
                ) : (
                  <svg width="17" height="19" viewBox="0 0 17 19" fill="currentColor" aria-hidden>
                    <path d="M2 2.2c0-1 1.1-1.6 1.9-1.1l11 7.3c.8.5.8 1.6 0 2.1l-11 7.3c-.8.5-1.9-.1-1.9-1.1V2.2Z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* what the camera is hunting for, in the middle of the counter */}
      {searching && (
        <div className="absolute left-1/2 top-[57%] -translate-x-1/2 bg-black/35 px-[13px] py-[4px]">
          <span className="font-display text-[19px] leading-none text-white">
            Detecting {STATION_LABEL[step.station]}...
          </span>
        </div>
      )}

      {/* --- assistant: one line, and a way to talk back ------------------ */}
      {/* a blur that ramps rather than a slab. backdrop-filter cannot be
          gradated, so this is five layers, each blurring a little harder
          and each masked to start lower than the last. stacked, they read
          as one blur that deepens towards the bottom of the screen. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[210px]">
        <div
          className="absolute inset-0 backdrop-blur-[1px]"
          style={{
            maskImage: "linear-gradient(to bottom, transparent 0%, black 18%)",
            WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 18%)",
          }}
        />
        <div
          className="absolute inset-0 backdrop-blur-[3px]"
          style={{
            maskImage: "linear-gradient(to bottom, transparent 18%, black 38%)",
            WebkitMaskImage: "linear-gradient(to bottom, transparent 18%, black 38%)",
          }}
        />
        <div
          className="absolute inset-0 backdrop-blur-[7px]"
          style={{
            maskImage: "linear-gradient(to bottom, transparent 38%, black 58%)",
            WebkitMaskImage: "linear-gradient(to bottom, transparent 38%, black 58%)",
          }}
        />
        <div
          className="absolute inset-0 backdrop-blur-[14px]"
          style={{
            maskImage: "linear-gradient(to bottom, transparent 58%, black 78%)",
            WebkitMaskImage: "linear-gradient(to bottom, transparent 58%, black 78%)",
          }}
        />
        <div
          className="absolute inset-0 backdrop-blur-[24px]"
          style={{
            maskImage: "linear-gradient(to bottom, transparent 78%, black 96%)",
            WebkitMaskImage: "linear-gradient(to bottom, transparent 78%, black 96%)",
          }}
        />
      </div>

      <div className="absolute inset-x-0 bottom-0 flex items-end gap-[14px] px-[28px] pb-[34px]">
        <p className="font-display flex-1 text-[23px] leading-[1.25] text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.35)]">
          {exchange?.reply ?? exchange?.you ?? feedback}
        </p>
        <button
          onClick={listen}
          aria-label="talk to the assistant"
          aria-pressed={listening}
          className={`flex h-[62px] w-[62px] shrink-0 items-center justify-center rounded-[16px] text-white transition-transform ${
            listening ? "scale-110 bg-[#1a1a1a] ring-4 ring-white/50" : "bg-[#1f1f1f]"
          }`}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z" />
            <path d="M18 11a1 1 0 1 0-2 0 4 4 0 0 1-8 0 1 1 0 1 0-2 0 6 6 0 0 0 5 5.91V19h-2a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-2.09A6 6 0 0 0 18 11Z" />
          </svg>
        </button>
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

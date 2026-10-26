"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
} from "@/lib/recipe";
import { scaledQuantity } from "@/lib/scale";
import { findAnswer, FALLBACK } from "@/lib/knowledge";
import { useCamera } from "@/lib/useCamera";
import { useVision, grabFrame } from "@/lib/useVision";
import type { AskResult } from "@/app/api/ask/route";
import { boxFor, type LookResult } from "@/lib/vision";
import { useAnchor, anchorStyle } from "@/lib/anchor";
import { useFlow, type Boxes } from "@/lib/useFlow";
import { placeClip, safeBelow, type View } from "@/lib/placement";
import { bookBottom } from "@/lib/bookGeometry";
import { ACTIONS, type ActionName } from "@/lib/actions/index";
import { ActionClip } from "@/components/ActionClip";
import { play } from "@/lib/sound";
import { Cookbook, type Page } from "@/components/Cookbook";


/** how long the cook's own line sits alone before the answer lands */
const REPLY_DELAY = 800;
/** ...and how long the answer is readable before the recipe moves itself on */
const ADVANCE_DELAY = 2600;
/** an ordinary answer clears itself so the station line can come back */
const EXCHANGE_LIFE = 9000;
/** how long the confirmation is readable before a hands-free step moves on */
const CONFIRM_DELAY = 2200;
/** the pause between one answer and the next look while it is still
 *  hunting for the station. flash lite answers in about a second, so a
 *  look lands roughly every six. */
const LOOK_EVERY = 5000;
/** ...and once it has found the station. it keeps looking, slower, so the
 *  pan's position is corrected before the tracker drifts far (F3). */
const LOOK_SETTLED = 10000;
/** google said we are over quota: wait this long before asking again */
const LOOK_LIMITED = 60000;
/** the look was skipped (one already in flight, or too soon after the
 *  last): try again shortly rather than a whole interval later (F11) */
const LOOK_RETRY = 1000;
/** how long each first-time hint stays up */
const HINT_MS = 4000;
/** once settled, a tip still refreshes if it is older than this */
const TIP_REFRESH = 20000;
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

function CookScreen() {
  const params = useSearchParams();
  const servings = Math.min(Math.max(Number(params.get("servings")) || 1, 1), 12);

  const { videoRef, state, message } = useCamera();
  const [index, setIndex] = useState(0);
  // first-time hints, four seconds each: the mic straight away, and how
  // to turn the page once the cook first reaches step 2
  const [swipeHint, setSwipeHint] = useState(false);
  const [micHint, setMicHint] = useState(true);
  const swipeShownRef = useRef(false);
  useEffect(() => {
    const t = setTimeout(() => setMicHint(false), HINT_MS);
    return () => clearTimeout(t);
  }, []);
  const swipeTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    // leaving step 2 always takes the hint down. clearing its timers here
    // without hiding it is what left it stuck on screen after a fast swipe.
    if (index !== 1) {
      swipeTimers.current.forEach(clearTimeout);
      swipeTimers.current = [];
      setSwipeHint(false);
      return;
    }
    if (swipeShownRef.current) return;
    swipeShownRef.current = true;
    // after the page has finished turning, so the hint plays on a still book
    swipeTimers.current = [
      setTimeout(() => setSwipeHint(true), 1500),
      setTimeout(() => setSwipeHint(false), 1500 + HINT_MS),
    ];
  }, [index]);
  useEffect(() => () => swipeTimers.current.forEach(clearTimeout), []);
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
  // where the pan, board and bowl were last seen, kept apart from `seen`
  // on purpose: a look that failed or was throttled says nothing about
  // where anything is. they also outlive the step, because nothing on the
  // counter has moved just because the page turned.
  const [boxes, setBoxes] = useState<Boxes>({ pan: null, board: null, bowl: null });
  // the action clip playing now, if any. `id` restarts it. a clip always
  // plays to the end: turning the page or losing the object doesn't cut it.
  const [clip, setClip] = useState<{ name: ActionName; id: number } | null>(null);
  const clipRef = useRef(clip);
  useEffect(() => {
    clipRef.current = clip;
  }, [clip]);
  // a clip's sound starts with it and stops with it
  useEffect(() => {
    if (!clip) return;
    const { sound, soundAt } = ACTIONS[clip.name];
    return sound ? play(sound, 1, soundAt ?? 0) : undefined;
  }, [clip]);
  /** each step's clip plays once, the first time its station is found */
  const playedRef = useRef(false);
  /** this step's station has been confidently seen, so its clip is due */
  const dueRef = useRef(false);
  const stepRef = useRef(step);
  useEffect(() => {
    setSeen(null);
    playedRef.current = false;
    dueRef.current = false;
    stepRef.current = step;
  }, [step]);

  const stationFound = seen?.seesStation === step.station;
  // the model says roughly where the pan is every so often; in between,
  // the tracker follows how the whole scene moves, which is what keeps the
  // timer stuck to the pan rather than lagging behind it.
  const tracked = useFlow(videoRef, state === "live", boxes);
  const anchor = useAnchor(tracked.pan ?? null, videoRef);
  const trackedRef = useRef(tracked);
  useEffect(() => {
    trackedRef.current = tracked;
  }, [tracked]);

  /** the screen and camera, for placing things over what the camera sees */
  const viewNow = useCallback((): View | null => {
    const v = videoRef.current;
    if (!v || !v.clientWidth) return null;
    return { width: v.clientWidth, height: v.clientHeight, videoWidth: v.videoWidth, videoHeight: v.videoHeight };
  }, [videoRef]);

  /** play a clip, but only if its station has been located and is on
   *  screen: a clip with nothing to sit on is just a cartoon. one already
   *  playing is never cut short; the next look tries again after it. */
  const playAction = useCallback(
    (name: ActionName, box: LookResult["panBox"]) => {
      const view = viewNow();
      if (clipRef.current || !box || !view) return false;
      if (!placeClip(box, ACTIONS[name].fit, view).visible) return false;
      // the clip gets its own copy of the box, which only the camera's
      // motion moves. a fresh answer from the model mid-clip would
      // otherwise make it jump and resize while it plays.
      setBoxes((prev) => ({ ...prev, clip: box }));
      const next = { name, id: Date.now() };
      clipRef.current = next;
      setClip(next);
      return true;
    },
    [viewNow],
  );
  const endAction = useCallback(() => {
    clipRef.current = null;
    setClip(null);
    setBoxes((prev) => ({ ...prev, clip: null }));
    // a clip that was due while this one played goes straight on, rather
    // than waiting for the next look
    const s = stepRef.current;
    if (s.action && dueRef.current && !playedRef.current) {
      const name = s.action;
      if (playAction(name, trackedRef.current[ACTIONS[name].station] ?? null)) playedRef.current = true;
    }
  }, [playAction]);
  // "detecting" means we have not heard back yet for this step. once the
  // model has spoken, whatever it said, its own words are better than a
  // spinner that never stops.
  const searching = state === "live" && !seen;

  const next = useCallback(
    () => setIndex((i) => Math.min(i + 1, recipe.steps.length - 1)),
    [],
  );
  const back = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);
  /** move on from step n, but only if we are still on it. a delayed
   *  advance that fires after the cook has already swiped must not push
   *  them a second page on. */
  const advanceFrom = useCallback(
    (n: number) => setIndex((i) => (i === n - 1 ? Math.min(i + 1, recipe.steps.length - 1) : i)),
    [],
  );
  /** a page is turning; swipes wait for it to land */
  const turningRef = useRef(false);
  const onTurning = useCallback((t: boolean) => {
    if (t && !turningRef.current) play("page-turn", 0.8);
    turningRef.current = t;
  }, []);

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
    // a swipe while the page is still turning is a swipe at a page the
    // cook has not seen yet; it used to skip straight over it
    if (turningRef.current) return;
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
  /** the clock starts when the step has actually begun: the cook taps it,
   *  or the model sees it, like eggs in the pan. it does not count down
   *  while they are still finishing the step before. */
  const [running, setRunning] = useState(false);
  const runningRef = useRef(running);
  const remainingRef = useRef(remaining);
  /** a short timer for finishing the step before, like vegetables that
   *  need more sautéing before the eggs go in. while it runs it takes the
   *  timer's place; the step's own timer comes back, full, after it. */
  const [catchUp, setCatchUp] = useState<{ left: number; what: string; running: boolean } | null>(null);
  const catchUpRef = useRef(catchUp);
  useEffect(() => {
    runningRef.current = running;
    remainingRef.current = remaining;
    catchUpRef.current = catchUp;
  }, [running, remaining, catchUp]);

  useEffect(() => {
    setRemaining(resolved.timer);
    setRunning(false);
    setCatchUp(null);
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
    const from = step.n;
    advanceRef.current = setTimeout(() => advanceFrom(from), CONFIRM_DELAY);
  }, [stationFound, step, advanceFrom]);

  // --- gemini watches, and speaks first ------------------------------------
  // it looks whether or not the local detector recognises anything, because
  // the useful thing to say when the phone is pointed at a desk is "point me
  // at your counter", and only the model can tell us that.
  const { look } = useVision(videoRef);
  /** it has placed us at this step's station. looks slow down after this
   *  but do not stop, and the tip stops changing with every answer. */
  const settledRef = useRef(false);
  /** the last tip shown, when, and which step the model thought it saw */
  const tipAtRef = useRef(0);
  const seesStepRef = useRef<number | null>(null);
  /** the cook asked for a fresh look: show its answer whatever it is */
  const forceTipRef = useRef(false);
  /** set by the look loop: take a look right now */
  const lookNowRef = useRef<() => void>(() => {});

  useEffect(() => {
    settledRef.current = false;
    seesStepRef.current = null;
  }, [step]);

  useEffect(() => {
    if (state !== "live") return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    /** bumps when a look is asked for, so only one chain of looks runs */
    let chain = 0;
    /** the first look at a page skips the usual gap: a cook who has just
     *  turned the page is waiting to hear about it */
    let first = true;

    /** one look, and how long to wait before the next. each look is
     *  scheduled from when the last one answered, so a slow answer never
     *  stacks up behind another. */
    async function takeOne(): Promise<number> {
      // a question on screen is the cook's to answer, not ours to talk
      // over; a hidden tab has nobody to talk to. a look the cook asked
      // for goes ahead regardless.
      if (!forceTipRef.current && (pending || document.hidden)) return LOOK_EVERY;
      const result = await look(step.n, [...omitted], first);
      if (cancelled) return LOOK_EVERY;
      if (!result) return LOOK_RETRY;
      first = false;
      if (result.limited) return LOOK_LIMITED;

      // a mocked reply means the model could not answer: a timeout or an
      // overload. record it anyway so the screen stops saying it is
      // looking and falls back to the written cue.
      setSeen(result);
      const pace = settledRef.current ? LOOK_SETTLED : LOOK_EVERY;
      // a failed or mocked look has nothing useful to say about the pan,
      // so leave the last known box alone rather than wiping it
      if (result.mocked || result.error) {
        if (result.error) showTip(result.tip, false);
        return pace;
      }
      // only a real sighting moves anything. "no pan in view" is what the
      // model says when the camera has turned away, and the tracker knows
      // better than that where it went.
      const found: Boxes = {};
      for (const st of ["pan", "board", "bowl"] as const) {
        const b = boxFor(result, st);
        if (b) found[st] = b;
      }
      if (Object.keys(found).length) setBoxes((prev) => ({ ...prev, ...found }));

      const atStation = result.seesStation === step.station;
      // the step's clip plays once its station is confidently in view and
      // located, sitting on that station
      if (step.action && !playedRef.current && atStation && result.confidence >= LOOK_FLOOR) {
        dueRef.current = true;
        const action = ACTIONS[step.action];
        if (playAction(step.action, boxFor(result, action.station))) playedRef.current = true;
      }
      // a new line every few seconds would be chatter. once it has found
      // the station, the tip changes when there is news: the cook has
      // wandered off, the food has moved on a step, the step looks done,
      // or the last line is old. and always when the cook asked.
      const movedOn = result.seesStep !== seesStepRef.current;
      seesStepRef.current = result.seesStep;
      const stale = Date.now() - tipAtRef.current > TIP_REFRESH;
      if (forceTipRef.current || !settledRef.current || !atStation || result.stepLooksComplete || movedOn || stale) {
        showTip(result.tip, true);
        tipAtRef.current = Date.now();
        forceTipRef.current = false;
      }
      if (atStation && result.confidence >= LOOK_FLOOR) settledRef.current = true;

      // the step has begun (the model sees this step's own food, like eggs
      // in the pan), so its clock starts. a clock the cook started is left
      // alone, and one still waiting does not count down meanwhile.
      // still finishing the step before: a short catch-up timer first,
      // and the step's own clock waits for it. once the food is on this
      // step, a catch-up still running is over.
      let catchingUp = Boolean(catchUpRef.current);
      if (atStation && result.confidence >= LOOK_FLOOR) {
        if (result.catchUp && result.seesStep !== step.n && !catchingUp && !runningRef.current) {
          setCatchUp({ left: result.catchUp.seconds, what: result.catchUp.what, running: true });
          catchingUp = true;
        } else if (catchingUp && result.seesStep === step.n) {
          setCatchUp(null);
          catchingUp = false;
        }
      }
      if (
        resolved.timer &&
        !catchingUp &&
        !runningRef.current &&
        remainingRef.current === resolved.timer &&
        atStation &&
        result.seesStep === step.n &&
        result.confidence >= LOOK_FLOOR
      ) {
        setRunning(true);
      }

      if (
        !resolved.timer &&
        !advanceRef.current &&
        atStation &&
        result.stepLooksComplete &&
        result.confidence >= LOOK_ADVANCE
      ) {
        const from = step.n;
        advanceRef.current = setTimeout(() => advanceFrom(from), ADVANCE_DELAY);
      }
      return settledRef.current ? LOOK_SETTLED : LOOK_EVERY;
    }

    async function loop(mine: number) {
      const wait = await takeOne();
      if (!cancelled && mine === chain) timer = setTimeout(() => loop(mine), wait);
    }

    // tapping the feedback line asks for a look now, in place of waiting
    lookNowRef.current = () => {
      if (timer) clearTimeout(timer);
      first = true;
      forceTipRef.current = true;
      showTip("Taking a fresh look...", true);
      loop(++chain);
    };

    loop(chain);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [state, step, pending, omitted, look, showTip, advanceFrom, resolved.timer, playAction]);

  // the catch-up counts down on its own, and when it is done the step's
  // own timer is back, full, waiting for the step to begin
  useEffect(() => {
    if (!catchUp?.running || catchUp.left <= 0) return;
    const id = setInterval(
      () => setCatchUp((c) => (c && c.running ? { ...c, left: c.left - 1 } : c)),
      1000,
    );
    return () => clearInterval(id);
  }, [catchUp?.running, catchUp?.left]);
  useEffect(() => {
    if (!catchUp || catchUp.left > 0) return;
    setCatchUp(null);
    play("timer");
    showTip(`Good, that's enough ${catchUp.what}. ${resolved.text}`, true);
  }, [catchUp, showTip, resolved.text]);

  useEffect(() => {
    if (!running || remaining === null || remaining <= 0) return;
    const id = setInterval(() => setRemaining((r) => (r === null ? null : r - 1)), 1000);
    return () => clearInterval(id);
  }, [running, remaining]);

  useEffect(() => {
    if (remaining !== 0) return;
    // a finished clock is a stopped one, so it shows play again
    setRunning(false);
    play("timer");
    // some timers end in an action, like flipping the omelette; the rest
    // just mean it is worth a look
    showTip(step.whenTimeIsUp ?? "That is time. Take a look before you move on.", true);
    // and show how, on the pan where it is now, if we know where that is
    if (step.actionWhenTimeIsUp) {
      const name = step.actionWhenTimeIsUp;
      playAction(name, trackedRef.current[ACTIONS[name].station] ?? null);
    }
  }, [remaining, showTip, step, playAction]);

  // --- chat ---------------------------------------------------------------
  const [listening, setListening] = useState(false);
  const [exchange, setExchange] = useState<Exchange | null>(null);
  const chatRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearChatTimers = useCallback(() => {
    chatRef.current.forEach(clearTimeout);
    chatRef.current = [];
  }, []);

  useEffect(() => clearChatTimers, [clearChatTimers]);

  type Recogniser = {
    lang: string;
    interimResults: boolean;
    continuous: boolean;
    start: () => void;
    stop: () => void;
    onresult:
      | ((e: {
          results: { length: number; [i: number]: { isFinal: boolean; 0: { transcript: string } } };
        }) => void)
      | null;
    onend: (() => void) | null;
    onerror: ((e: { error?: string }) => void) | null;
  };
  const recRef = useRef<Recogniser | null>(null);
  /** bumps with every question, so a slow answer to an old one is dropped */
  const askIdRef = useRef(0);

  /** speak to the assistant. the browser does the transcription, and the
   *  words appear in the feedback line as they are heard. tapping again
   *  while it listens stops it and sends what it has. */
  function listen() {
    if (recRef.current) {
      recRef.current.stop();
      return;
    }
    const w = window as unknown as {
      SpeechRecognition?: new () => Recogniser;
      webkitSpeechRecognition?: new () => Recogniser;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      showTip("This browser cannot listen yet.", false);
      return;
    }
    clearChatTimers();
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    let heard = "";
    let sent = false;
    const send = () => {
      if (sent || !heard.trim()) return;
      sent = true;
      ask(heard);
    };
    rec.onresult = (e) => {
      let text = "";
      let final = false;
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
        final = e.results[i].isFinal;
      }
      heard = text;
      // their own words, live, in the same place the reply will land
      if (!sent) setExchange({ you: sentence(text), reply: null });
      if (final) send();
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
      // safari sometimes ends without marking the last result final
      send();
      if (!sent) setExchange(null);
    };
    rec.onerror = (e) => {
      recRef.current = null;
      setListening(false);
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        showTip("Allow the microphone to talk to me.", false);
      }
    };
    recRef.current = rec;
    setListening(true);
    setExchange({ you: "Listening...", reply: null });
    rec.start();
  }

  // stop listening if the screen goes away mid-sentence
  useEffect(() => () => recRef.current?.stop(), []);

  /** the model's answer to a spoken question, or null to use our own */
  async function askModel(q: string): Promise<AskResult> {
    const video = videoRef.current;
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: q,
          stepN: step.n,
          omitted: [...omitted],
          frame: video ? grabFrame(video) : null,
        }),
      });
      if (!res.ok) return { answer: null };
      return (await res.json()) as AskResult;
    } catch {
      return { answer: null };
    }
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

    // dropping an ingredient rewrites the recipe, so it stays local and
    // instant, and the recipe carries on by itself
    if (dropping) {
      const reply = `Got it! You can use ${OMISSIONS[omit].substitute} instead, otherwise updating the recipe...`;
      chatRef.current.push(
        setTimeout(() => {
          setOmitted((prev) => new Set(prev).add(omit));
          setExchange({ you: q, reply });
        }, REPLY_DELAY),
      );
      chatRef.current.push(
        setTimeout(() => {
          setExchange(null);
          next();
        }, REPLY_DELAY + ADVANCE_DELAY),
      );
      return;
    }

    // anything else goes to the model, which sees the recipe, the step and
    // the counter. the author's notes are the fallback when it can't answer.
    const id = ++askIdRef.current;
    const startedAt = Date.now();
    askModel(q).then(({ answer: said }) => {
      if (id !== askIdRef.current) return;
      const reply = said ?? findAnswer(q, step.n)?.text ?? FALLBACK;
      // their own line stays up a beat even when the answer is instant
      const wait = Math.max(0, REPLY_DELAY - (Date.now() - startedAt));
      chatRef.current.push(
        setTimeout(() => {
          if (id !== askIdRef.current) return;
          setExchange({ you: q, reply });
          chatRef.current.push(setTimeout(() => setExchange(null), EXCHANGE_LIFE));
        }, wait),
      );
    });
  }

  // a new step is a clean slate for the assistant zone
  useEffect(() => {
    askIdRef.current++;
    setExchange(null);
    setPending(null);
  }, [step]);

  // the amounts that go in at this step, so the numbers sit next to the
  // action. a step can name them; otherwise the step text decides.
  const lower = text.toLowerCase();
  const quantities = visibleIngredients(recipe.ingredients, omitted)
    .filter((i) =>
      step.uses ? step.uses.includes(i.item) : lower.includes(i.item.split(" ")[0].toLowerCase()),
    )
    .map((i) => `${scaledQuantity(i, servings, recipe.baseServings)} ${i.item}`.trim())
    .join(" · ");

  // the spread on show. the cookbook turns a page whenever this changes.
  const page = useMemo<Page>(
    () => ({
      n: step.n,
      total: recipe.steps.length,
      image: step.image ?? recipe.image,
      text,
      quantities,
    }),
    [step, text, quantities],
  );

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
      data-step={step.n}
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
      <Cookbook page={page} onTurning={onTurning} />

      {/* how to turn the page: a fingertip sweeping right to left across
          the book, leaving a short trail */}
      {swipeHint && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[214px]" aria-hidden>
          <div className="swipe-hint absolute top-[94px] h-[36px] w-[36px] rounded-full border-[3px] border-white bg-[var(--orange)]/85 shadow-[0_0_0_6px_rgba(250,91,0,0.25),0_4px_14px_rgba(0,0,0,0.35)]" />
          <div className="swipe-trail absolute top-[111px] h-[4px] rounded-full bg-gradient-to-r from-[var(--orange)]/0 to-[var(--orange)]/70" />
          <div className="absolute inset-x-0 top-[148px] flex justify-center">
            <span className="rounded-[10px] bg-white px-[12px] py-[7px] text-[14px] font-semibold text-[var(--paper-ink)] shadow-[0_6px_18px_rgba(0,0,0,0.3)]">
              Swipe to turn the page
            </span>
          </div>
        </div>
      )}

      {/* the action clip sits on its station: its drawn board, bowl or pan
          is scaled and moved onto the real one, and follows it like the
          timer does. a dark glow behind keeps the white readable. */}
      {(() => {
        if (!clip) return null;
        const action = ACTIONS[clip.name];
        const box = tracked.clip ?? tracked[action.station];
        const view = viewNow();
        if (!box || !view) return null;
        const at = placeClip(box, action.fit, view, { safe: safeBelow(bookBottom(view.width)) });
        return (
          <div
            className="pointer-events-none absolute"
            style={{
              left: at.left,
              top: at.top,
              width: at.size,
              height: at.size,
              transition: "left 90ms linear, top 90ms linear, width 240ms ease, height 240ms ease",
            }}
          >
            <div
              className="absolute inset-[-8%] rounded-full"
              style={{
                background:
                  "radial-gradient(closest-side, rgba(22,15,10,0.62) 0%, rgba(22,15,10,0.45) 55%, rgba(22,15,10,0) 100%)",
              }}
            />
            <ActionClip
              key={clip.id}
              frame={action.frame}
              duration={action.duration}
              playing
              onDone={endAction}
              className="absolute inset-0"
            />
          </div>
        );
      })()}

      {/* the timer hangs just above the pan, leaning with its plane so it
          reads as lying on the hob rather than stuck to the glass. when the
          pan is out of shot it waits at the screen edge on the pan's side,
          so it can always be read and started, found or not. */}
      {(catchUp || remaining !== null) && anchor && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ perspective: "760px" }}
        >
          <div
            className="absolute origin-center transition-none"
            style={anchorStyle(anchor)}
          >
            {/* the whole container is the button: tap to start, tap again
                to pause. the mark beside the digits always shows what a tap
                will do, play while stopped and pause while running, and it
                sits in a fixed slot so the digits never shift. */}
            <button
              onClick={() => {
                // a catch-up pauses and resumes like any timer
                if (catchUp) {
                  setCatchUp((c) => (c ? { ...c, running: !c.running } : c));
                  return;
                }
                // play on a finished clock starts it over
                if (remaining === 0) setRemaining(resolved.timer);
                setRunning((r) => (remaining === 0 ? true : !r));
              }}
              aria-label={(catchUp ? catchUp.running : running) ? "pause the timer" : "start the timer"}
              className="timer-orange pointer-events-auto flex items-center gap-[7px] rounded-[14px] px-[15px] py-[9px] text-white active:scale-[0.97]"
            >
              <span className="flex h-[14px] w-[12px] shrink-0 items-center justify-center" aria-hidden>
                {(catchUp ? catchUp.running : running) ? (
                  <svg width="11" height="13" viewBox="0 0 16 18" fill="currentColor">
                    <rect x="0.5" y="1" width="6" height="16" rx="1.6" />
                    <rect x="9.5" y="1" width="6" height="16" rx="1.6" />
                  </svg>
                ) : (
                  <svg width="11" height="13" viewBox="0 0 17 19" fill="currentColor">
                    <path d="M2 2.2c0-1 1.1-1.6 1.9-1.1l11 7.3c.8.5.8 1.6 0 2.1l-11 7.3c-.8.5-1.9-.1-1.9-1.1V2.2Z" />
                  </svg>
                )}
              </span>
              <span className="text-[34px] font-semibold leading-none tracking-[-0.02em] tabular-nums">
                {mmss(Math.max(catchUp ? catchUp.left : (remaining ?? 0), 0))}
              </span>
            </button>
            {catchUp && (
              <p className="mt-[6px] text-center text-[13px] leading-none text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]">
                finish {catchUp.what} first
              </p>
            )}
          </div>
        </div>
      )}

      {/* what the camera is hunting for, in the middle of the counter */}
      {searching && (
        <div className="absolute left-1/2 top-[57%] -translate-x-1/2 rounded-[10px] bg-black/45 px-[13px] py-[7px] backdrop-blur-sm">
          <span className="font-ui whitespace-nowrap text-[18px] leading-none text-white">
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

      <div className="absolute inset-x-0 bottom-0 flex items-center gap-[24px] px-[28px] pb-[34px]">
        {/* tap the line for a fresh look and a new answer, right now */}
        <button
          onClick={() => lookNowRef.current()}
          aria-label="get fresh feedback"
          className="flex-1 text-left text-[18px] leading-[1.35] tracking-[-0.01em] text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.35)] active:opacity-70"
        >
          {exchange?.reply ?? exchange?.you ?? feedback}
        </button>
        <div className="relative shrink-0">
        {micHint && (
          <div className="mic-hint pointer-events-none absolute bottom-[62px] right-[-6px] whitespace-nowrap" aria-hidden>
            <div className="rounded-[10px] bg-white px-[12px] py-[7px] text-[14px] font-semibold text-[var(--paper-ink)] shadow-[0_6px_18px_rgba(0,0,0,0.3)]">
              Tap to ask questions!
            </div>
            <div className="absolute bottom-[-6px] right-[24px] h-[12px] w-[12px] rotate-45 bg-white" />
          </div>
        )}
        <button
          onClick={() => {
            setMicHint(false);
            listen();
          }}
          aria-label="talk to the assistant"
          aria-pressed={listening}
          className={`btn-orange flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-[13px] text-white transition-transform ${
            listening ? "scale-110 ring-4 ring-white/50" : ""
          }`}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
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

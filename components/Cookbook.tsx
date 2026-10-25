"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  BOOK_H,
  BOOK_W,
  RAISE,
  RIGHT_EDGE,
  SPINE,
  bend,
  bookScale,
  outline,
} from "@/lib/bookGeometry";

/** one spread's worth of content */
export type Page = {
  n: number;
  total: number;
  image: string;
  text: string;
  quantities: string;
};

/** how long a page takes to turn */
const TURN_MS = 1450;
/** the leaf is a chain of hinged strips, so it curls instead of folding */
const SEGS = 10;
/** how far the outer edge trails the spine side at the top of the turn */
const BEND_DEG = 46;
/** strips per photo and per block of text. photos show the curve more. */
const PHOTO_STRIPS = 14;
const TEXT_STRIPS = 8;

const PHOTO = { x0: 100, x1: 452, v0: 0.3, v1: 0.88 };
const WORDS = { x0: 540, x1: 880, v0: 0.3, v1: 0.97 };

const ease = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;

/**
 * flat content bent onto the page. only strips overlapping `only` are
 * drawn, so a narrow face of the turning leaf renders two or three
 * strips instead of all of them.
 */
function Bent({
  box,
  n,
  only,
  children,
}: {
  box: { x0: number; x1: number; v0: number; v1: number };
  n: number;
  only?: [number, number];
  children: (w: number, h: number) => React.ReactNode;
}) {
  const { width, height, strips } = bend(box.x0, box.x1, box.v0, box.v1, n);
  return (
    <>
      {strips
        .filter((s) => !only || (s.x + s.width > only[0] && s.x < only[1]))
        .map((s) => (
          <div
            key={s.offset}
            className="absolute left-0 top-0 overflow-hidden"
            style={{ width: s.width, height: s.height, transform: s.transform, transformOrigin: "0 0" }}
          >
            <div className="absolute top-0" style={{ left: -s.offset, width, height }}>
              {children(width, height)}
            </div>
          </div>
        ))}
    </>
  );
}

function Photo({ page, only }: { page: Page; only?: [number, number] }) {
  return (
    <Bent box={PHOTO} n={PHOTO_STRIPS} only={only}>
      {(w, h) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={page.image}
          alt=""
          draggable={false}
          className="block rounded-[6px] object-cover"
          style={{ width: w, height: h }}
        />
      )}
    </Bent>
  );
}

/**
 * how much to shrink the page's text so a long step still fits above the
 * bottom of the page. an estimate from character counts rather than a
 * measurement: the text is drawn many times over, once per strip, and
 * measuring every copy each turn would cost more than it saves.
 */
function fitScale(page: Page, w: number, h: number): number {
  // mansalva at -5% tracking runs about 0.42em a character
  const lines = (text: string, px: number) => Math.ceil(text.length / Math.floor(w / (px * 0.42)));
  for (let s = 1; s > 0.76; s -= 0.04) {
    const body = lines(page.text, 42 * s) * 42 * s * 1.42;
    const qty = page.quantities ? 12 + lines(page.quantities, 30 * s) * 30 * s * 1.3 : 0;
    if (56 * s * 1.1 + 14 + body + qty <= h) return s;
  }
  return 0.76;
}

function Words({ page, only }: { page: Page; only?: [number, number] }) {
  return (
    <Bent box={WORDS} n={TEXT_STRIPS} only={only}>
      {(w, h) => {
        const s = fitScale(page, w, h);
        return (
          <div className="font-display text-[var(--paper-ink)]" style={{ width: w, height: h }}>
            <p className="leading-[1.1] text-[var(--orange)]" style={{ fontSize: 56 * s }}>
              Step {page.n}/{page.total}
            </p>
            <p className="mt-[14px] leading-[1.42]" style={{ fontSize: 42 * s }}>
              {page.text}
            </p>
            {page.quantities && (
              <p className="mt-[12px] leading-[1.3] opacity-60" style={{ fontSize: 30 * s }}>
                {page.quantities}
              </p>
            )}
          </div>
        );
      }}
    </Bent>
  );
}

/** the paper itself, a full-size copy of the book image */
function Paper() {
  return (
    <div
      className="absolute inset-0"
      style={{ backgroundImage: "url(/book.png)", backgroundSize: `${BOOK_W}px ${BOOK_H}px` }}
    />
  );
}

type Turn = {
  /** what lies under the leaf, left and right */
  under: [Page, Page];
  /** what the leaf carries on its front (a right page) and back (a left page) */
  front: Page;
  back: Page;
  dir: 1 | -1;
};

/**
 * the cookbook at the top of the cook screen. it watches `page` and, when
 * the step changes, turns a page: forward lifts the right page over to
 * the left, back lifts the left page over to the right. the turning page
 * carries the old step on one side and the new one on the other, so the
 * turn uncovers the new spread rather than swapping it in place.
 */
export function Cookbook({
  page,
  onTurning,
}: {
  page: Page;
  /** told when a page starts and stops turning */
  onTurning?: (turning: boolean) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(0);
  const [turn, setTurn] = useState<Turn | null>(null);
  const shown = useRef(page);

  // the book always spans the screen, less a gutter each side
  useLayoutEffect(() => {
    const el = boxRef.current?.parentElement;
    if (!el) return;
    const fit = () => setK(bookScale(el.clientWidth));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // a new step starts a turn from whatever is on show now
  useEffect(() => {
    const from = shown.current;
    shown.current = page;
    if (from.n === page.n) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setTurn(
      page.n > from.n
        ? { under: [from, page], front: from, back: page, dir: 1 }
        : { under: [page, from], front: page, back: from, dir: -1 },
    );
  }, [page]);

  // --- the turn, driven frame by frame -------------------------------------
  const segRefs = useRef<(HTMLDivElement | null)[]>([]);
  const shadeRefs = useRef<(HTMLDivElement | null)[]>([]);
  const castRight = useRef<HTMLDivElement>(null);
  const castLeft = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onTurning?.(Boolean(turn));
  }, [turn, onTurning]);

  useEffect(() => {
    if (!turn) return;
    let raf = 0;
    const start = performance.now();
    // a busy phone can starve the animation frames; the page still has to
    // land, or the book keeps showing the old step after the app has moved
    const landAnyway = setTimeout(() => setTurn(null), TURN_MS + 250);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / TURN_MS);
      // p is 0 with the leaf lying on the right, 1 lying on the left
      const p = turn.dir === 1 ? ease(t) : 1 - ease(t);
      pose(p, turn.dir);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setTurn(null);
    };
    const pose = (p: number, dir: 1 | -1) => {
      const th = -180 * p;
      // the outer edge trails, so the page bows while it travels
      const d = (BEND_DEG * Math.sin(Math.PI * p) * dir) / (SEGS - 1);
      let angle = th;
      for (let i = 0; i < SEGS; i++) {
        const seg = segRefs.current[i];
        if (seg) seg.style.transform = `rotateY(${i === 0 ? th : d}deg)`;
        if (i > 0) angle += d;
        // lit from the front: a strip turned edge-on goes dark. each one
        // ramps into the next, so the curl reads as one smooth surface.
        const shade = (deg: number) => (0.55 * (1 - Math.abs(Math.cos((deg * Math.PI) / 180)))).toFixed(3);
        const a = shade(angle - d / 2);
        const b = shade(angle + d / 2);
        const front = shadeRefs.current[i * 2];
        const back = shadeRefs.current[i * 2 + 1];
        if (front) front.style.background = `linear-gradient(90deg, rgba(60,32,12,${a}), rgba(60,32,12,${b}))`;
        if (back) back.style.background = `linear-gradient(270deg, rgba(60,32,12,${a}), rgba(60,32,12,${b}))`;
      }
      // the shadow it throws on the page it is leaving or landing on
      const lift = Math.sin(Math.PI * p);
      const reach = Math.abs(Math.cos(Math.PI * p)) * (RIGHT_EDGE - SPINE);
      const o = 0.34 * lift;
      const cast = (from: number) =>
        `rgba(40,20,5,0) ${from}px, rgba(40,20,5,${o}) ${from}px, rgba(40,20,5,${o * 0.35}) ${from + reach * 0.7}px, rgba(40,20,5,0) ${from + reach + 60}px`;
      if (castRight.current)
        castRight.current.style.background = p < 0.5 ? `linear-gradient(90deg, ${cast(SPINE)})` : "none";
      if (castLeft.current)
        castLeft.current.style.background = p >= 0.5 ? `linear-gradient(270deg, ${cast(BOOK_W - SPINE)})` : "none";
    };
    pose(turn.dir === 1 ? 0 : 1, turn.dir);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(landAnyway);
    };
  }, [turn]);

  const left = turn ? turn.under[0] : page;
  const right = turn ? turn.under[1] : page;
  const leafW = RIGHT_EDGE - SPINE;
  const segW = leafW / SEGS;

  // the leaf: segment i is nested in segment i-1, so each hinge bends
  // relative to the one before it
  let leaf: React.ReactNode = null;
  if (turn) {
    for (let i = SEGS - 1; i >= 0; i--) {
      const frontX = SPINE + i * segW;
      const backX = SPINE - (i + 1) * segW;
      leaf = (
        <div
          ref={(el) => {
            segRefs.current[i] = el;
          }}
          className="absolute top-0"
          style={{
            left: i === 0 ? 0 : segW,
            width: segW + 0.8,
            height: BOOK_H,
            transformStyle: "preserve-3d",
            transformOrigin: "0 50%",
          }}
        >
          <div
            className="absolute inset-0 overflow-hidden [backface-visibility:hidden]"
            style={{ clipPath: outline("right", frontX) }}
          >
            <div className="absolute top-0" style={{ left: -frontX, width: BOOK_W, height: BOOK_H }}>
              <Paper />
              <Words page={turn.front} only={[frontX, frontX + segW]} />
            </div>
            <div
              ref={(el) => {
                shadeRefs.current[i * 2] = el;
              }}
              className="absolute inset-0"
            />
          </div>
          <div
            className="absolute inset-0 overflow-hidden [backface-visibility:hidden]"
            style={{ clipPath: outline("left", backX), transform: "rotateY(180deg)" }}
          >
            <div className="absolute top-0" style={{ left: -backX, width: BOOK_W, height: BOOK_H }}>
              <Paper />
              <Photo page={turn.back} only={[backX, backX + segW]} />
            </div>
            <div
              ref={(el) => {
                shadeRefs.current[i * 2 + 1] = el;
              }}
              className="absolute inset-0"
            />
          </div>
          {leaf}
        </div>
      );
    }
  }

  return (
    <div
      ref={boxRef}
      data-showing={`${left.n}/${right.n}${turn ? " turning" : ""}`}
      className="pointer-events-none absolute left-[8px]"
      style={{ top: -RAISE * k, width: BOOK_W * k, height: BOOK_H * k }}
    >
      <div className="origin-top-left" style={{ width: BOOK_W, height: BOOK_H, transform: `scale(${k})` }}>
      <div
        className="relative"
        style={{
          width: BOOK_W,
          height: BOOK_H,
          perspective: "4200px",
          perspectiveOrigin: `${SPINE}px 140px`,
        }}
      >
        <Paper />
        <Photo page={left} />
        <Words page={right} />
        <div ref={castRight} className="absolute inset-0" style={{ clipPath: outline("right", 0) }} />
        <div ref={castLeft} className="absolute inset-0" style={{ clipPath: outline("left", 0) }} />
        {turn && (
          <div
            className="absolute top-0"
            style={{ left: SPINE, width: leafW, height: BOOK_H, transformStyle: "preserve-3d" }}
          >
            {leaf}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

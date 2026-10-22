"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { recipe, type Ingredient } from "@/lib/recipe";
import { scaledQuantity } from "@/lib/scale";
import { findAnswer } from "@/lib/knowledge";

/**
 * what to say when the cook says they do not have something. the question
 * is put to the same matcher the chat uses, so there is one place where
 * substitutions live rather than two that can drift apart.
 */
function substituteFor(item: Ingredient): string | null {
  return findAnswer(`no ${item.item}`)?.text ?? null;
}

function Check({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px] border-[1.5px] ${
        on ? "border-foreground bg-foreground" : "border-field-border bg-field"
      }`}
    >
      {on && (
        <svg width="12" height="9" viewBox="0 0 12 9" fill="none" aria-hidden>
          <path
            d="M1 4.5L4.2 7.5L11 1"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  );
}

function IngredientsScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const servings = Math.min(Math.max(Number(params.get("servings")) || 1, 1), 12);

  /** items the cook has said they do not have, by list index */
  const [missing, setMissing] = useState<Set<number>>(new Set());
  const [draft, setDraft] = useState("");
  const [reply, setReply] = useState<string | null>(null);

  function toggle(i: number) {
    setMissing((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  // only the dropped items the cook screen already knows how to rewrite
  // around can travel with us. the rest are advice on this screen only.
  const omitParam = useMemo(() => {
    const keys = [...missing]
      .map((i) => recipe.ingredients[i]?.omitKey)
      .filter((k): k is NonNullable<typeof k> => Boolean(k));
    return [...new Set(keys)].join(",");
  }, [missing]);

  function start() {
    const q = new URLSearchParams({ servings: String(servings) });
    if (omitParam) q.set("omit", omitParam);
    router.push(`/cook?${q}`);
  }

  function ask(text: string) {
    const q = text.trim();
    if (!q) return;
    setReply(
      findAnswer(q)?.text ??
        "not sure on that one. tap anything you are missing and we will work around it.",
    );
    setDraft("");
  }

  return (
    <main className="mx-auto w-full max-w-[402px] px-[57px] pb-[40px] pt-[2px]">
      <Link
        href="/recipe"
        aria-label="back"
        className="fixed left-[14px] top-[20px] z-20 flex h-11 w-11 items-center justify-center rounded-full bg-background/85 backdrop-blur-sm"
      >
        <svg width="13" height="20" viewBox="0 0 13 20" fill="none" aria-hidden>
          <path
            d="M11 1.5L2.5 10L11 18.5"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Link>

      <h1 className="font-display mt-[88px] text-center text-[36px]">
        ingredients
      </h1>
      <p className="mt-[10px] text-center text-[15px] leading-none text-muted">
        tap anything you don&rsquo;t have.
      </p>

      <ul className="mt-[22px]">
        {recipe.ingredients.map((ing, i) => {
          const gone = missing.has(i);
          const swap = gone ? substituteFor(ing) : null;
          const amount = scaledQuantity(ing, servings, recipe.baseServings);
          return (
            <li key={ing.item} className="border-b border-field-border last:border-0">
              <button
                onClick={() => toggle(i)}
                aria-pressed={gone}
                className="flex w-full items-start gap-[12px] py-[13px] text-left"
              >
                <span className="mt-[1px]">
                  <Check on={!gone} />
                </span>
                <span className="flex-1">
                  <span
                    className={`block text-[15px] leading-[1.3] ${
                      gone ? "text-muted line-through" : ""
                    }`}
                  >
                    {amount ? `${amount} ` : ""}
                    {ing.item}
                  </span>
                  {ing.note && !gone && (
                    <span className="mt-[2px] block text-[12px] leading-[1.3] text-muted">
                      {ing.note}
                    </span>
                  )}
                  {swap && (
                    <span className="mt-[4px] block text-[12px] leading-[1.35]">
                      {swap}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {reply && (
        <p className="mt-[18px] text-[14px] leading-[1.35]">{reply}</p>
      )}

      {/* same matcher as the cook screen, asked while hands are still clean */}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && ask(draft)}
        placeholder="ask about a swap"
        className="mt-[18px] h-[56px] w-full rounded-[var(--radius-control)] border border-field-border bg-field px-[18px] text-[15px] placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-foreground/15"
      />

      <button
        onClick={start}
        className="mt-[16px] h-[56px] w-full rounded-[var(--radius-control)] btn-orange text-[15px] font-semibold active:opacity-90"
      >
        start cooking &rarr;
      </button>
    </main>
  );
}

export default function IngredientsPage() {
  return (
    <Suspense fallback={null}>
      <IngredientsScreen />
    </Suspense>
  );
}

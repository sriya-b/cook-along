"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { recipe } from "@/lib/recipe";

// traced from the figma reference at 402pt wide. the hero sits in a
// 282pt box, slightly narrower than the 288pt control column.
export default function RecipePage() {
  const router = useRouter();
  const [servings, setServings] = useState("");

  function start() {
    const n = Number(servings);
    const safe = Number.isFinite(n) && n > 0 ? Math.min(Math.round(n), 12) : 1;
    router.push(`/ingredients?servings=${safe}`);
  }

  return (
    <main className="relative mx-auto h-[100dvh] w-full max-w-[402px] overflow-hidden px-[57px]">
      <Link
        href="/"
        aria-label="back"
        className="absolute left-[14px] top-[20px] flex h-11 w-11 items-center justify-center"
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

      <h1 className="font-display mt-[clamp(70px,16vh,144.5px)] text-center text-[36px]">
        {recipe.title}
      </h1>

      <Image
        src={recipe.image}
        alt={recipe.title}
        width={1200}
        height={1800}
        priority
        className="mx-auto mt-[11.5px] h-[252px] w-[282px] rounded-[22px] object-cover"
      />

      <a
        href={recipe.sourceUrl}
        target="_blank"
        rel="noreferrer"
        className="mx-auto mt-[14px] block w-fit text-center text-[12px] leading-none underline underline-offset-[3px]"
      >
        {recipe.sourceName}
      </a>

      {/* scales every quantity on the cook screen. empty cooks it as written. */}
      <input
        type="number"
        min={1}
        max={12}
        inputMode="numeric"
        value={servings}
        onChange={(e) => setServings(e.target.value)}
        placeholder="enter servings"
        className="mt-[25px] h-[56px] w-full rounded-[var(--radius-control)] border border-field-border bg-field px-[18px] text-[15px] placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-foreground/15"
      />

      <button
        onClick={start}
        className="mt-[16px] h-[56px] w-full rounded-[var(--radius-control)] btn-orange text-[15px] font-semibold active:opacity-90"
      >
        start &rarr;
      </button>
    </main>
  );
}

import Image from "next/image";

// every size here is traced from the figma reference at 402pt wide:
// 288pt content column, 56pt controls, 36pt display type, 15pt ui type.
export default function Home() {
  return (
    <main className="mx-auto flex h-[100dvh] w-full max-w-[402px] flex-col overflow-hidden px-[57px]">
      {/* the png carries transparent margin around the drawing, so it is
          sized larger than the drawing itself and pulled in with margins */}
      <Image
        src="/hero.png"
        alt=""
        width={528}
        height={528}
        priority
        className="mx-auto mt-[clamp(40px,10vh,89px)] h-[266px] w-[266px] max-w-none object-contain"
      />

      <h1 className="font-display -mt-[24px] text-center text-[36px]">
        hi there!
      </h1>
      <p className="mt-[9.5px] text-center text-[15px] leading-none text-muted">
        let&rsquo;s make a great dish together.
      </p>

      {/* paste-a-link is the primary entry point. for the prototype any
          link resolves to the one demo recipe. */}
      <form action="/recipe" className="mt-[24px] flex flex-col gap-[24px]">
        <input
          type="url"
          name="url"
          inputMode="url"
          autoComplete="off"
          placeholder="enter recipe link"
          className="h-[56px] w-full rounded-[var(--radius-control)] border border-field-border bg-field px-[18px] text-[15px] placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-foreground/15"
        />
        <button
          type="submit"
          className="h-[56px] w-full rounded-[var(--radius-control)] btn-orange text-[16px] font-bold active:opacity-90"
        >
          start &rarr;
        </button>
      </form>
    </main>
  );
}

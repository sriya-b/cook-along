import Image from "next/image";
import Link from "next/link";

// every size here is traced from the figma reference at 402pt wide:
// 288pt content column, 56pt controls, 36/24pt display type, 15pt ui type.
export default function Home() {
  return (
    <main className="mx-auto flex h-[100dvh] w-full max-w-[402px] flex-col overflow-hidden px-[57px]">
      <Image
        src="/dish-placeholder.png"
        alt=""
        width={470}
        height={430}
        priority
        className="mx-auto mt-[clamp(56px,13vh,116px)] h-[185px] w-[188px] object-contain"
      />

      <h1 className="font-display mt-[45.5px] text-center text-[36px]">
        hi there!
      </h1>
      <p className="mt-[9.5px] text-center text-[15px] leading-none text-muted">
        let&rsquo;s make a great dish together.
      </p>

      {/* paste-a-link is the primary entry point. for the prototype any
          link resolves to the one demo recipe. */}
      <form action="/recipe" className="mt-[24px] flex flex-col gap-4">
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
          className="h-[56px] w-full rounded-[var(--radius-control)] btn-orange text-[15px] font-semibold active:opacity-90"
        >
          start &rarr;
        </button>
      </form>

      <div className="mt-auto pb-[clamp(28px,8vh,72px)] pt-[clamp(20px,5vh,40px)]">
        <h2 className="font-display text-center text-[24px]">
          got a quick question?
        </h2>
        <p className="mt-[10px] text-center text-[15px] leading-none text-muted">
          show us your pan. we&rsquo;ll help you fix it.
        </p>
        <Link
          href="/quick-help"
          className="mt-[21px] flex h-[56px] w-full items-center justify-center rounded-[var(--radius-control)] border-[1.5px] border-foreground text-[15px] font-semibold active:opacity-90"
        >
          get quick help &rarr;
        </Link>
      </div>
    </main>
  );
}

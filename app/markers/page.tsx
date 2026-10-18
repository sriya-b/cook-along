import Image from "next/image";
import Link from "next/link";

// printable station markers. the svgs in /public/markers are generated from
// the same ARUCO_MIP_36h12 dictionary the cook screen detects with, so what
// prints here is exactly what the camera is looking for.
const MARKERS = [
  { file: "board", id: 1, label: "cutting board", step: "step 1" },
  { file: "bowl", id: 2, label: "mixing bowl", step: "steps 2–3" },
  { file: "pan", id: 3, label: "pan", step: "steps 4–9" },
];

export default function MarkersPage() {
  return (
    <main className="mx-auto w-full max-w-[402px] flex-1 px-[57px] pb-[72px] print:max-w-none print:px-0">
      <Link
        href="/"
        className="mt-[20px] inline-block text-[15px] underline underline-offset-[3px] print:hidden"
      >
        &larr; back
      </Link>

      <h1 className="font-display mt-[24px] text-center text-[36px] print:hidden">
        station markers
      </h1>
      <p className="mt-[9.5px] text-center text-[15px] leading-[1.35] text-muted print:hidden">
        Print this page, then tape one marker at each station.
      </p>

      <ol className="mt-[24px] list-decimal space-y-[8px] pl-[18px] text-[15px] leading-[1.35] print:hidden">
        <li>Print at 100% scale, with no &ldquo;fit to page&rdquo;.</li>
        <li>Each marker should measure about 8cm across once printed.</li>
        <li>Tape it flat beside the station, not on it, so food never covers it.</li>
        <li>Keep the white border — the detector needs it to find the edges.</li>
      </ol>

      <div className="mt-[32px] space-y-[32px] print:mt-0 print:space-y-0">
        {MARKERS.map((m) => (
          <div
            key={m.file}
            className="flex flex-col items-center print:h-screen print:justify-center print:break-after-page"
          >
            <Image
              src={`/markers/${m.file}.svg`}
              alt={`marker ${m.id} for the ${m.label}`}
              width={288}
              height={288}
              unoptimized
              className="h-[288px] w-[288px] print:h-[80mm] print:w-[80mm]"
            />
            <p className="mt-[12px] text-[15px] font-semibold">{m.label}</p>
            <p className="mt-[2px] text-[12px] text-muted">
              marker {m.id} &middot; {m.step}
            </p>
          </div>
        ))}
      </div>
    </main>
  );
}

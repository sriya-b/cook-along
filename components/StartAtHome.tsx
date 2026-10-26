"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { installAudioUnlock } from "@/lib/sound";

const STARTED = "cook-along-started";

/**
 * the app always opens on "hi there". a reload, a link straight to a deeper
 * page, or a tab safari restores later all go back to the start, rather
 * than dropping the cook mid-recipe with a camera they did not ask for.
 * moving between pages inside the app is untouched: this only looks at
 * how the page was loaded, once.
 */
export function StartAtHome() {
  const router = useRouter();

  // sounds need one tap on the page before safari lets them play
  useEffect(() => installAudioUnlock(), []);

  useEffect(() => {
    const atHome = () => window.location.pathname === "/";
    let started = false;
    try {
      started = sessionStorage.getItem(STARTED) === "1";
      if (atHome()) sessionStorage.setItem(STARTED, "1");
    } catch {
      // private mode can refuse storage; then every fresh load starts over
    }

    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const freshLoad = nav?.type === "reload" || nav?.type === "back_forward";
    if (!atHome() && (freshLoad || !started)) {
      try {
        sessionStorage.setItem(STARTED, "1");
      } catch {}
      router.replace("/");
    }

    // safari can also bring the page back from memory without loading it
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted && !atHome()) router.replace("/");
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, [router]);

  return null;
}

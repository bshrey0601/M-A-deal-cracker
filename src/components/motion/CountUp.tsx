import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { easeOut, hasNumber, tweenText } from "../../lib/countUp";

// useLayoutEffect warns during server rendering (the panel tests render to string).
const useIsoLayoutEffect = typeof document !== "undefined" ? useLayoutEffect : useEffect;

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Counts the numbers in `text` up from zero when it first appears. Later changes (the user editing an
 * input) show at once, so the figure on screen always matches the model. Server render, print and
 * reduced-motion users get the final text with no animation.
 */
export function CountUp({ text, duration = 800 }: { text: string; duration?: number }) {
  const [frame, setFrame] = useState<string | null>(null);
  const first = useRef(text);
  const latest = useRef(text);
  latest.current = text;

  useIsoLayoutEffect(() => {
    if (!hasNumber(text) || prefersReducedMotion() || typeof requestAnimationFrame !== "function") return;
    let raf = 0;
    const start = performance.now();
    setFrame(tweenText(text, 0));
    const tick = (now: number) => {
      const p = easeOut((now - start) / duration);
      // Done, or the value changed under us: show the real text.
      if (p >= 1 || latest.current !== text) { setFrame(null); return; }
      setFrame(tweenText(text, p));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); setFrame(null); };
  }, []);

  // A frame only ever stands in for the text it was computed from.
  return <span className="tabular-nums">{frame !== null && text === first.current ? frame : text}</span>;
}

/** CountUp when given a plain string, otherwise the content unchanged. */
export function MaybeCountUp({ children }: { children: React.ReactNode }) {
  return typeof children === "string" ? <CountUp text={children} /> : <>{children}</>;
}

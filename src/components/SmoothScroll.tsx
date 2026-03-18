"use client";

import { useEffect } from "react";

export function SmoothScroll() {
  useEffect(() => {
    // Lenis-like smooth scroll using native JS
    let current = 0;
    let target = 0;
    const ease = 0.08;
    let rafId: number;

    const lerp = (start: number, end: number, t: number) => start + (end - start) * t;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      target += e.deltaY * 0.25; // Much slower scroll speed
      target = Math.max(0, Math.min(target, document.body.scrollHeight - window.innerHeight));
    };

    const update = () => {
      current = lerp(current, target, ease);
      // Snap if very close
      if (Math.abs(current - target) < 0.5) current = target;
      window.scrollTo(0, current);
      rafId = requestAnimationFrame(update);
    };

    // Sync initial position
    current = window.scrollY;
    target = window.scrollY;

    window.addEventListener("wheel", onWheel, { passive: false });
    rafId = requestAnimationFrame(update);

    return () => {
      window.removeEventListener("wheel", onWheel);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return null;
}

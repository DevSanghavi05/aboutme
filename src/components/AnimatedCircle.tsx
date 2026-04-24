"use client";

import { useRef, useMemo, useState, useCallback } from "react";
import Image from "next/image";
import { motion, useScroll, useTransform, useMotionValueEvent, AnimatePresence } from "framer-motion";
import { Github, Linkedin, Mail, Code, ChevronLeft, ChevronRight, Phone } from "lucide-react";
import ShinyText from "./ShinyText";
import { TypewriterRole } from "./TypewriterRole";
import CountUp from "./CountUp";
import CardCarousel from "./CardCarousel";

// ── Generate radial tick lines like the Face ID reference ──
const TOTAL_TICKS = 60;
const RADIUS = 270; // Inner end of tick — pushed out for spacing from circle
const TICK_LENGTH = 18; // Default short tick length

function generateTicks() {
  const round = (n: number) => Math.round(n * 10000) / 10000;
  const ticks = [];
  for (let i = 0; i < TOTAL_TICKS; i++) {
    const angle = (i / TOTAL_TICKS) * 360;
    const rad = (angle * Math.PI) / 180;
    const x1 = round(300 + RADIUS * Math.cos(rad));
    const y1 = round(300 + RADIUS * Math.sin(rad));
    const x2 = round(300 + (RADIUS + TICK_LENGTH) * Math.cos(rad));
    const y2 = round(300 + (RADIUS + TICK_LENGTH) * Math.sin(rad));
    ticks.push({ x1, y1, x2, y2, angle, index: i });
  }
  return ticks;
}

// ── Radial Tick Ring with scroll-driven warp ──
function TickRing({ scrollProgress }: { scrollProgress: any }) {
  const ticks = useMemo(() => generateTicks(), []);

  // The warp position sweeps around the ring as you scroll (0→360 degrees)
  const warpAngle = useTransform(scrollProgress, [0, 1], [0, 720]);

  // Use a ref + useMotionValueEvent to avoid re-renders on every scroll tick
  const warpRef = useRef(0);
  useMotionValueEvent(warpAngle, "change", (v) => {
    warpRef.current = v % 360;
    // Update DOM directly for performance
    ticks.forEach((tick) => {
      const el = document.getElementById(`tick-${tick.index}`);
      if (!el) return;
      // Calculate angular distance from warp center
      let dist = Math.abs(tick.angle - warpRef.current);
      if (dist > 180) dist = 360 - dist;
      // Warp zone: lines within ~40 degrees get darker + slightly longer
      const warpRadius = 40;
      if (dist < warpRadius) {
        const intensity = 1 - dist / warpRadius; // 1 at center, 0 at edge
        const darkness = Math.round(160 - intensity * 120); // 160 → 40
        const extraLen = intensity * 10;
        el.setAttribute("stroke", `rgb(${darkness}, ${darkness}, ${darkness})`);
        el.setAttribute("stroke-width", `${5 + intensity * 3}`);
        // Extend the outer point
        const rad = (tick.angle * Math.PI) / 180;
        const newX2 = 300 + (RADIUS + TICK_LENGTH + extraLen) * Math.cos(rad);
        const newY2 = 300 + (RADIUS + TICK_LENGTH + extraLen) * Math.sin(rad);
        el.setAttribute("x2", String(newX2));
        el.setAttribute("y2", String(newY2));
      } else {
        el.setAttribute("stroke", "rgb(200, 200, 200)");
        el.setAttribute("stroke-width", "5");
        el.setAttribute("x2", String(tick.x2));
        el.setAttribute("y2", String(tick.y2));
      }
    });
  });

  return (
    <svg viewBox="0 0 600 600" className="absolute inset-[-60px] md:inset-[-60px] w-[460px] h-[460px] md:w-[640px] md:h-[640px] pointer-events-none">
      {ticks.map((tick) => (
        <line
          key={tick.index}
          id={`tick-${tick.index}`}
          x1={tick.x1}
          y1={tick.y1}
          x2={tick.x2}
          y2={tick.y2}
          stroke="rgb(200, 200, 200)"
          strokeWidth="5"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

export function AnimatedCircle() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll();

  // ── Image & Name transitions ──
  const imageOpacity = useTransform(scrollYProgress, [0, 0.08], [1, 0]);
  const imageScale = useTransform(scrollYProgress, [0, 0.08], [1, 0.9]);

  const nameOpacity = useTransform(scrollYProgress, [0.08, 0.15, 0.2, 0.25], [0, 1, 1, 0]);
  const nameY = useTransform(scrollYProgress, [0.08, 0.15], [30, 0]);

  // ── Card sections (each appears INSIDE the circle) ──
  const card1Opacity = useTransform(scrollYProgress, [0.2, 0.3], [0, 1]);
  const card1Y = useTransform(scrollYProgress, [0.2, 0.3], [40, 0]);
  const card1Out = useTransform(scrollYProgress, [0.35, 0.42], [1, 0]);
  const card1Display = useTransform(card1Opacity, (v) => (v > 0.05 ? "flex" : "none"));

  const card2Opacity = useTransform(scrollYProgress, [0.4, 0.5], [0, 1]);
  const card2Y = useTransform(scrollYProgress, [0.4, 0.5], [40, 0]);
  const card2Out = useTransform(scrollYProgress, [0.6, 0.68], [1, 0]);
  const card2Display = useTransform(card2Opacity, (v) => (v > 0.05 ? "flex" : "none"));

  const card3Opacity = useTransform(scrollYProgress, [0.66, 0.76], [0, 1]);
  const card3Y = useTransform(scrollYProgress, [0.66, 0.76], [40, 0]);
  const card3Display = useTransform(card3Opacity, (v) => (v > 0.05 ? "flex" : "none"));

  return (
    <div ref={containerRef} className="h-[400vh] w-full relative bg-[#fdfdfd]">
      <div className="sticky top-0 h-screen w-full flex items-center justify-center overflow-hidden">

        {/* Central Circle Container — 520px desktop */}
        <div className="relative flex items-center justify-center z-10 w-[340px] h-[340px] md:w-[520px] md:h-[520px]">

          {/* Radial Tick Ring (Face ID style) with warp effect */}
          <TickRing scrollProgress={scrollYProgress} />

          {/* Inner clipping circle for content */}
          <div className="absolute inset-0 rounded-full border-2 border-zinc-200 overflow-hidden bg-white flex items-center justify-center">

            {/* Layer 1: Profile Image */}
            <motion.div
              className="absolute inset-0"
              style={{ opacity: imageOpacity, scale: imageScale }}
            >
              <Image
                src="/profile.jpg"
                alt="Dev Sanghavi"
                fill
                className="object-cover"
                priority
              />
            </motion.div>

            {/* Layer 2: Name — Jvalaj-inspired hero */}
            <motion.div
              className="absolute inset-0 flex flex-col items-start justify-center bg-white z-10 px-8 md:px-14 pointer-events-none"
              style={{ opacity: nameOpacity, y: nameY }}
            >
              <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-zinc-400 leading-tight">
                <ShinyText
                  text="Dev"
                  color="#1a1a1a"
                  shineColor="#888888"
                  speed={3}
                  className="font-black text-zinc-900"
                />{" "}
                is a <TypewriterRole />.
              </h1>
              <div className="mt-8 space-y-1">
                <p className="text-zinc-400 text-sm md:text-base font-medium">Houston, TX</p>
                <p className="text-zinc-400 text-sm md:text-base font-medium">12 yrs</p>
                <p className="text-zinc-400 text-sm md:text-base font-medium">6th grade</p>
              </div>
            </motion.div>

            {/* Layer 3: Card 1 — Education */}
            <motion.div
              className="absolute inset-0 flex items-center justify-center bg-white z-20 p-6 md:p-10 pointer-events-auto"
              style={{ opacity: card1Opacity, y: card1Y, display: card1Display }}
            >
              <motion.div className="w-full max-w-sm flex flex-col items-center justify-center space-y-3" style={{ opacity: card1Out }}>
                <p className="text-[10px] font-bold text-zinc-300 uppercase tracking-[0.3em] mb-2 self-center">Education</p>

                <div className="flex flex-wrap justify-center gap-3 w-full">
                  {/* Card 1: School */}
                  <div className="cursor-target flex-1 min-w-[140px] flex items-center justify-center px-4 py-5 rounded-2xl border-2 border-dashed border-zinc-200/60 bg-white transition-colors duration-300 hover:border-zinc-300 hover:bg-zinc-50/50">
                    <p className="font-black text-zinc-800 tracking-[0.15em] uppercase text-xs text-center">Lanier MS</p>
                  </div>

                  {/* Card 2: Duolingo */}
                  <div className="cursor-target flex-1 min-w-[140px] flex items-center justify-center px-4 py-5 rounded-2xl border-2 border-dashed border-zinc-200/60 bg-white transition-colors duration-300 hover:border-zinc-300 hover:bg-zinc-50/50">
                    <p className="font-black text-zinc-800 tracking-[0.15em] uppercase text-xs text-center">
                      Duolingo <CountUp to={900} duration={2} className="inline-block" />+
                    </p>
                  </div>
                </div>

                {/* Card 3: Sololearn */}
                <div className="cursor-target w-full flex flex-col items-center justify-center px-6 py-5 rounded-2xl border-2 border-dashed border-zinc-200/60 bg-white transition-colors duration-300 hover:border-zinc-300 hover:bg-zinc-50/50">
                  <p className="font-black text-zinc-800 tracking-[0.15em] uppercase text-xs text-center">Sololearn Certified In</p>
                  <p className="text-[9px] font-bold text-zinc-400 tracking-[0.2em] uppercase mt-2 text-center">Data Analytics · Prompt Eng · ML</p>
                </div>
              </motion.div>
            </motion.div>

            {/* Layer 4: Card 2 — Accomplishments */}
            <motion.div
              className="absolute inset-0 flex items-center justify-center bg-white z-30 p-4 md:p-6 pointer-events-auto"
              style={{ opacity: card2Opacity, y: card2Y, display: card2Display }}
            >
              <motion.div className="w-full h-full flex flex-col items-center justify-center relative" style={{ opacity: card2Out }}>
                <p className="text-[10px] font-bold text-zinc-300 uppercase tracking-[0.3em] mb-2">Accomplishments</p>
                <CardCarousel
                  items={[
                    { title: 'Churro', subtitle: 'AI Pricing Automation', link: 'https://churro.live' },
                    { title: 'Verde', subtitle: 'Software for Forest Analytics', link: 'https://verdeearth.org' },
                    { title: 'Vex Robotics', subtitle: 'Regionals Qualification' },
                    { title: 'SEFH', subtitle: '3rd Place Environmental Engineering' },
                  ]}
                />
              </motion.div>
            </motion.div>

            {/* Layer 5: Card 3 — Contact */}
            <motion.div
              className="absolute inset-0 flex items-center justify-center bg-white z-40 p-6 md:p-10 pointer-events-auto"
              style={{ opacity: card3Opacity, y: card3Y, display: card3Display }}
            >
              <div className="w-full max-w-sm">
                <p className="text-[10px] font-bold text-zinc-300 uppercase tracking-[0.3em] mb-4 text-center">Contact</p>
                <div className="flex flex-col gap-3">
                  <a href="mailto:devrsanghavi05@gmail.com" className="cursor-target flex items-center gap-3 p-4 rounded-2xl border-2 border-dashed border-zinc-200/60 bg-white hover:border-zinc-300 hover:bg-zinc-50/50 transition-colors">
                    <Mail className="w-5 h-5 text-zinc-500" />
                    <div>
                      <p className="font-black text-zinc-800 tracking-[0.1em] uppercase text-xs">Email</p>
                      <p className="text-[9px] font-bold text-zinc-400 tracking-wide mt-0.5">devrsanghavi05@gmail.com</p>
                    </div>
                  </a>
                  <a href="tel:7133633348" className="cursor-target flex items-center gap-3 p-4 rounded-2xl border-2 border-dashed border-zinc-200/60 bg-white hover:border-zinc-300 hover:bg-zinc-50/50 transition-colors">
                    <Phone className="w-5 h-5 text-zinc-500" />
                    <div>
                      <p className="font-black text-zinc-800 tracking-[0.1em] uppercase text-xs">Phone</p>
                      <p className="text-[9px] font-bold text-zinc-400 tracking-wide mt-0.5">(713) 363-3348</p>
                    </div>
                  </a>
                </div>
              </div>
            </motion.div>

          </div>
        </div>

        <p className="absolute bottom-10 left-1/2 -translate-x-1/2 text-xs text-zinc-500 tracking-[0.2em] uppercase font-medium">press p to play</p>

      </div>
    </div>
  );
}

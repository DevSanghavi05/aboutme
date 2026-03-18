"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface CardItem {
  title: string;
  subtitle: string;
  emoji?: string;
  link?: string;
}

interface CardCarouselProps {
  items: CardItem[];
}

export default function CardCarousel({ items }: CardCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0); // -1 = left, 1 = right

  const goNext = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setDirection(1);
      setCurrentIndex((prev) => (prev + 1) % items.length);
    },
    [items.length]
  );

  const goPrev = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setDirection(-1);
      setCurrentIndex((prev) => (prev - 1 + items.length) % items.length);
    },
    [items.length]
  );

  const variants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 120 : -120,
      opacity: 0,
      scale: 0.9,
    }),
    center: {
      x: 0,
      opacity: 1,
      scale: 1,
    },
    exit: (dir: number) => ({
      x: dir > 0 ? -120 : 120,
      opacity: 0,
      scale: 0.9,
    }),
  };

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center">
      {/* Card display area */}
      <div className="relative w-[200px] h-[140px] md:w-[260px] md:h-[170px] flex items-center justify-center">
        <AnimatePresence custom={direction} mode="wait">
          <motion.div
            key={currentIndex}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              x: { type: "spring", stiffness: 300, damping: 30 },
              opacity: { duration: 0.2 },
              scale: { duration: 0.2 },
            }}
            className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-zinc-200/60 bg-white"
          >
            {items[currentIndex].emoji && (
              <span className="text-3xl md:text-4xl mb-2">
                {items[currentIndex].emoji}
              </span>
            )}
            <p className="font-black text-zinc-800 tracking-[0.12em] uppercase text-xs md:text-sm text-center px-4">
              {items[currentIndex].title}
            </p>
            <p className="text-[9px] md:text-[10px] font-bold text-zinc-400 tracking-[0.15em] uppercase mt-1.5 text-center px-4">
              {items[currentIndex].subtitle}
            </p>
            {items[currentIndex].link && (
              <a
                href={items[currentIndex].link}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="mt-2 text-[9px] font-bold text-zinc-500 hover:text-zinc-800 tracking-[0.1em] uppercase transition-colors"
              >
                Visit →
              </a>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-4 mt-4">
        <button
          onClick={goPrev}
          className="w-8 h-8 rounded-full border border-zinc-200 bg-white hover:bg-zinc-50 flex items-center justify-center transition-colors cursor-pointer"
          aria-label="Previous card"
        >
          <ChevronLeft className="w-4 h-4 text-zinc-500" />
        </button>

        {/* Dot indicators */}
        <div className="flex items-center gap-1.5">
          {items.map((_, i) => (
            <div
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                i === currentIndex
                  ? "bg-zinc-800 w-3"
                  : "bg-zinc-300"
              }`}
            />
          ))}
        </div>

        <button
          onClick={goNext}
          className="w-8 h-8 rounded-full border border-zinc-200 bg-white hover:bg-zinc-50 flex items-center justify-center transition-colors cursor-pointer"
          aria-label="Next card"
        >
          <ChevronRight className="w-4 h-4 text-zinc-500" />
        </button>
      </div>
    </div>
  );
}

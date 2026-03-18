"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface BentoCardProps {
  title?: string;
  subtitle?: string;
  className?: string;
  style?: any;
  children?: React.ReactNode;
}

export function BentoCard({ title, subtitle, className, style, children }: BentoCardProps) {
  return (
    <motion.div
      style={style}
      className={cn(
        "relative p-8 bento-card",
        "flex flex-col gap-4 min-w-[300px]",
        className
      )}
      whileHover={{ y: -5, boxShadow: "0 10px 40px rgba(0,0,0,0.06)" }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      {(title || subtitle) && (
        <div className="flex flex-col gap-1 mb-2">
          {title && <h3 className="text-2xl font-semibold tracking-tight text-zinc-800">{title}</h3>}
          {subtitle && <p className="text-sm font-medium text-zinc-500 uppercase tracking-wider">{subtitle}</p>}
        </div>
      )}
      {children}
    </motion.div>
  );
}

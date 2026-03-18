"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface FloatingCardProps {
  title: string;
  description: string;
  className?: string;
  style?: any;
  icon?: React.ReactNode;
}

export function FloatingCard({ title, description, className, style, icon }: FloatingCardProps) {
  return (
    <motion.div
      style={style}
      className={cn(
        "absolute p-6 rounded-2xl glass",
        "flex flex-col gap-3 min-w-[250px] max-w-[300px]",
        className
      )}
      initial={{ opacity: 0, scale: 0.8 }}
      whileHover={{ scale: 1.05, backgroundColor: "rgba(255, 255, 255, 0.1)" }}
      transition={{ duration: 0.3 }}
    >
      {icon && <div className="p-3 bg-white/10 rounded-xl w-fit">{icon}</div>}
      <h3 className="text-xl font-semibold tracking-tight text-white">{title}</h3>
      <p className="text-sm text-white/70 leading-relaxed">{description}</p>
    </motion.div>
  );
}

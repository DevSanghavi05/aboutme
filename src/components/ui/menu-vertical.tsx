"use client";

import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";

import Link from "next/link";

type MenuItem = {
  label: string;
  href: string;
};

interface MenuVerticalProps {
  menuItems: MenuItem[];
  activeHref?: string;
  color?: string;
  skew?: number;
}

const MotionLink = motion.create(Link);

export const MenuVertical = ({
  menuItems = [],
  activeHref,
  color = "#ff6900",
  skew = 0,
}: MenuVerticalProps) => {
  return (
    <div className="flex w-fit flex-row items-center gap-3 sm:gap-6">
      {menuItems.map((item, index) => {
        const isActive = item.href === activeHref;

        return (
          <MotionLink
            key={`${item.href}-${index}`}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className="group/nav flex cursor-pointer items-center gap-1 text-zinc-900"
            initial={false}
            animate={isActive ? "active" : "initial"}
            whileHover="hover"
          >
            <motion.div
              variants={{
                initial: { x: "-100%", color: "inherit", opacity: 0 },
                active: { x: 0, color, opacity: 1 },
                hover: { x: 0, color, opacity: 1 },
              }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="z-0"
            >
              <ArrowRight strokeWidth={3} className="size-6 sm:size-7" />
            </motion.div>

            <motion.span
              variants={{
                initial: { x: 0, color: "inherit", skewX: 0 },
                active: { x: 0, color: "inherit", skewX: 0 },
                hover: { x: 0, color: "inherit", skewX: skew },
              }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="text-xl font-semibold no-underline sm:text-2xl"
            >
              {item.label}
            </motion.span>
          </MotionLink>
        );
      })}
    </div>
  );
};

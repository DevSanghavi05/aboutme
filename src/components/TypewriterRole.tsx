"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";

const ROLES = ["student", "developer", "creator", "builder", "engineer"];
const TYPING_SPEED = 80;
const DELETE_SPEED = 50;
const PAUSE_AFTER_TYPED = 2000;
const PAUSE_AFTER_DELETED = 300;

export function TypewriterRole() {
  const [roleIndex, setRoleIndex] = useState(0);
  const [displayed, setDisplayed] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const currentRole = ROLES[roleIndex];

  useEffect(() => {
    let timeout: NodeJS.Timeout;

    if (!isDeleting) {
      // Typing
      if (displayed.length < currentRole.length) {
        timeout = setTimeout(() => {
          setDisplayed(currentRole.slice(0, displayed.length + 1));
        }, TYPING_SPEED);
      } else {
        // Finished typing - pause, then start deleting
        timeout = setTimeout(() => setIsDeleting(true), PAUSE_AFTER_TYPED);
      }
    } else {
      // Deleting
      if (displayed.length > 0) {
        timeout = setTimeout(() => {
          setDisplayed(displayed.slice(0, -1));
        }, DELETE_SPEED);
      } else {
        // Finished deleting - move to next role
        timeout = setTimeout(() => {
          setIsDeleting(false);
          setRoleIndex((prev) => (prev + 1) % ROLES.length);
        }, PAUSE_AFTER_DELETED);
      }
    }

    return () => clearTimeout(timeout);
  }, [displayed, isDeleting, currentRole]);

  return (
    <span className="inline-flex items-baseline">
      <span className="font-bold text-zinc-900 border-b-[3px] border-zinc-800">
        {displayed}
      </span>
      <motion.span
        className="inline-block w-[3px] h-[1em] bg-zinc-800 ml-[2px] relative top-[2px]"
        animate={{ opacity: [1, 0] }}
        transition={{ duration: 0.6, repeat: Infinity, repeatType: "reverse" }}
      />
    </span>
  );
}

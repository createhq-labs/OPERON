import type { Variants } from "framer-motion";

export const spring = {
  snappy: { type: "spring", stiffness: 520, damping: 38, mass: 0.7 },
  soft:   { type: "spring", stiffness: 300, damping: 30, mass: 0.85 },
} as const;

export const motionPreset = {
  page: {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    exit:    { opacity: 0, y: 8 },
    transition: spring.soft,
  },
  fadeScale: {
    initial: { opacity: 0, scale: 0.97, y: -4 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit:    { opacity: 0, scale: 0.97, y: -4 },
    transition: spring.snappy,
  },
  sheet: {
    initial: { opacity: 0, x: -18, scale: 0.98 },
    animate: { opacity: 1, x: 0, scale: 1 },
    exit:    { opacity: 0, x: -18, scale: 0.98 },
    transition: spring.soft,
  },
} as const;

export const listStagger: Variants = {
  hidden: { opacity: 1 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.035, delayChildren: 0.03 },
  },
};

export const listItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  show:   { opacity: 1, y: 0, transition: spring.soft },
};

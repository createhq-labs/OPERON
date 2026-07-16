import type { Variants } from "framer-motion";

/** Canonical timing: controls 150-200ms, panels/routes 200-300ms. */
export const motionTransition = {
  control: { duration: 0.16, ease: [0.44, 0, 0.56, 1] },
  panel:   { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
  route:   { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
} as const;

export const spring = {
  snappy: { type: "spring", stiffness: 520, damping: 38, mass: 0.7 },
  soft:   { type: "spring", stiffness: 300, damping: 30, mass: 0.85 },
} as const;

export const motionPreset = {
  page: {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit:    { opacity: 0, y: 4 },
    transition: motionTransition.route,
  },
  fadeScale: {
    initial: { opacity: 0, scale: 0.97, y: -4 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit:    { opacity: 0, scale: 0.97, y: -4 },
    transition: spring.snappy,
  },
  sheet: {
    initial: { opacity: 0, x: -16 },
    animate: { opacity: 1, x: 0 },
    exit:    { opacity: 0, x: -16 },
    transition: motionTransition.panel,
  },
  panel: {
    initial: { opacity: 0, y: 8, scale: 0.99 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit:    { opacity: 0, y: 4, scale: 0.99 },
    transition: motionTransition.panel,
  },
  popover: {
    initial: { opacity: 0, y: -4, scale: 0.99 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit:    { opacity: 0, y: -2, scale: 0.99 },
    transition: motionTransition.control,
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

/** Clip-path wipe reveal — for headings/statements that should uncover rather than fade in. */
export const maskReveal: Variants = {
  hidden: { clipPath: "inset(0 0 100% 0)" },
  show:   { clipPath: "inset(0 0 0% 0)", transition: spring.soft },
};

/** Shared reveal for every image in the reader — scale down to rest + fade in on scroll. */
export const imageReveal: Variants = {
  hidden: { opacity: 0, scale: 1.06 },
  show:   { opacity: 1, scale: 1, transition: spring.soft },
};

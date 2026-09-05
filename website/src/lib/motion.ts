import { useReducedMotion, type Variants } from "framer-motion";

export const EASE: [number, number, number, number] = [0.2, 0.7, 0.2, 1];

export const rise: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } },
};

export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

export const inView = { once: true, margin: "-80px" } as const;

/** True unless the visitor asked the OS for reduced motion. */
export function useMotionOk(): boolean {
  return !useReducedMotion();
}

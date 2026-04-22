import type { Variants, Transition } from 'framer-motion';

export const easeOutExpo: Transition = {
  duration: 0.35,
  ease: [0.16, 1, 0.3, 1],
};

export const pageVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

export const fadeUp: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: easeOutExpo },
};

export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.3 } },
};

export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1, transition: easeOutExpo },
};

export const slideInRight: Variants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0, transition: easeOutExpo },
};

export const stagger = (delay = 0.05): Variants => ({
  animate: { transition: { staggerChildren: delay } },
});

export const staggerItem: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } },
};

export const cardHover = {
  y: -2,
  boxShadow: '0 8px 24px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.04)',
  transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] },
};

export const buttonTap = {
  scale: 0.97,
  transition: { duration: 0.1 },
};

export const counterVariants: Variants = {
  initial: { opacity: 0, scale: 0.8 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
};

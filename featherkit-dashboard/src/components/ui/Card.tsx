import { cn } from '@/lib/cn';
import { motion } from 'framer-motion';
import { cardHover } from '@/lib/motion';
import type { HTMLAttributes } from 'react';

const base = 'bg-elevated border border-border rounded-xl';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(base, className)} {...props} />;
}

export function MotionCard({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <motion.div
      className={cn(base, className)}
      whileHover={cardHover}
      {...(props as any)}
    />
  );
}

import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';
import { motion } from 'framer-motion';
import { buttonTap } from '@/lib/motion';
import { forwardRef, type ButtonHTMLAttributes } from 'react';

const button = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'bg-white/[.05] text-ink border border-border-light hover:bg-white/[.08]',
        accent: 'bg-accent text-bg border border-accent hover:bg-accent/90 shadow-[0_0_0_1px_rgba(34,211,238,0.2),0_0_12px_rgba(34,211,238,0.15)]',
        outline: 'bg-transparent text-ink border border-border hover:border-border-light hover:bg-white/[.03]',
        ghost: 'bg-transparent text-ink-3 hover:text-ink hover:bg-white/[.04]',
        danger: 'bg-err/10 text-err border border-err/30 hover:bg-err/20',
      },
      size: {
        sm: 'h-9 px-3 text-sm',
        md: 'h-10 px-4 text-base',
        lg: 'h-12 px-5 text-lg',
        icon: 'h-9 w-9 p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <motion.button
      ref={ref}
      className={cn(button({ variant, size }), className)}
      whileTap={buttonTap}
      {...(props as any)}
    />
  ),
);
Button.displayName = 'Button';

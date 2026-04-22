import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';
import type { HTMLAttributes } from 'react';

const badge = cva(
  'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium font-mono border transition-colors duration-200',
  {
    variants: {
      tone: {
        default: 'bg-white/[.04] text-ink-2 border-border',
        accent: 'bg-accent-dim text-accent border-accent/20',
        ok: 'bg-ok/10 text-ok border-ok/20',
        warn: 'bg-warn/10 text-warn border-warn/20',
        err: 'bg-err/10 text-err border-err/20',
        muted: 'bg-white/[.02] text-ink-5 border-border',
        frame: 'bg-role-frame/10 text-role-frame border-role-frame/20',
        build: 'bg-role-build/10 text-role-build border-role-build/20',
        critic: 'bg-role-critic/10 text-role-critic border-role-critic/20',
        sync: 'bg-role-sync/10 text-role-sync border-role-sync/20',
      },
    },
    defaultVariants: { tone: 'default' },
  },
);

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>;

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badge({ tone }), className)} {...props} />;
}

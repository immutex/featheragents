import { cn } from '@/lib/cn';

export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('text-xs text-ink-5 uppercase tracking-[0.15em] font-semibold', className)}>{children}</div>;
}

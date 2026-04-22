import { cn } from '@/lib/cn';

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd className={cn('inline-flex items-center justify-center px-2 h-6 rounded border border-border text-xs font-mono text-ink-4 bg-white/[.03]', className)}>
      {children}
    </kbd>
  );
}

import { cn } from '@/lib/cn';

const tones: Record<string, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  err: 'bg-err',
  info: 'bg-info',
  accent: 'bg-accent',
  muted: 'bg-ink-5',
};

export function Dot({ tone = 'muted', size = 6, pulse = false, className }: { tone?: string; size?: number; pulse?: boolean; className?: string }) {
  return (
    <span
      className={cn('inline-block rounded-full shrink-0', tones[tone] || tones.muted, pulse && 'animate-pulse-soft', className)}
      style={{ width: size, height: size }}
    />
  );
}

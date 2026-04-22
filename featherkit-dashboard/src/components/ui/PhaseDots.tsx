import { cn } from '@/lib/cn';

const phases = ['frame', 'build', 'critic', 'sync'] as const;
type P = (typeof phases)[number];

const toneFor: Record<P, string> = {
  frame: 'bg-role-frame',
  build: 'bg-role-build',
  critic: 'bg-role-critic',
  sync: 'bg-role-sync',
};

export function PhaseDots({ current }: { current?: P }) {
  const idx = current ? phases.indexOf(current) : -1;
  return (
    <div className="flex items-center gap-1.5">
      {phases.map((p, i) => {
        const active = i === idx;
        const past = i < idx;
        return (
          <span
            key={p}
            className={cn(
              'h-2 rounded-full transition-all duration-300 out-expo',
              active ? `w-5 ${toneFor[p]}` : past ? 'w-2 bg-ink-5' : 'w-2 bg-white/[.06]',
              active && 'shadow-[0_0_8px_currentColor]',
            )}
          />
        );
      })}
    </div>
  );
}

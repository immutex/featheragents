import { cn } from '@/lib/cn';

export function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-5 w-9 rounded-full transition-all duration-300 out-expo border',
        checked ? 'bg-accent/30 border-accent/40' : 'bg-white/[.04] border-border',
        disabled && 'opacity-40 pointer-events-none',
      )}
    >
      <span
        className={cn(
          'absolute top-[3px] h-3.5 w-3.5 rounded-full transition-all duration-300 out-expo',
          checked ? 'left-[18px] bg-accent shadow-[0_0_10px_rgba(34,211,238,0.6)]' : 'left-[3px] bg-ink-4',
        )}
      />
    </button>
  );
}

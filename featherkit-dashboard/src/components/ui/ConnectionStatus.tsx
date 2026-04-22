import { cn } from '@/lib/cn';

export function ConnectionStatus({ connected }: { connected: boolean }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-elevated px-2.5 py-1 text-[10.5px] font-mono text-ink-4">
      <span
        className={cn(
          'inline-flex h-2 w-2 rounded-full',
          connected ? 'bg-ok shadow-[0_0_10px_rgba(74,222,128,0.45)]' : 'bg-ink-5',
        )}
      />
      {connected ? 'ws connected' : 'ws reconnecting'}
    </div>
  );
}

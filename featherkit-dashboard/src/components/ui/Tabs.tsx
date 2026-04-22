import { cn } from '@/lib/cn';

export interface TabDef {
  id: string;
  label: string;
  count?: number;
  notify?: boolean;
}

export function Tabs({ tabs, active, onChange, className }: { tabs: TabDef[]; active: string; onChange: (id: string) => void; className?: string }) {
  return (
    <div className={cn('flex items-center gap-1 border-b border-border -mb-px', className)}>
      {tabs.map(t => {
        const on = active === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-all duration-200',
              on ? 'text-ink border-accent' : 'text-ink-4 border-transparent hover:text-ink-2',
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={cn('text-xs font-mono', on ? 'text-accent' : 'text-ink-5')}>{t.count}</span>
            )}
            {t.notify && !on && (
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-warn opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-warn" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

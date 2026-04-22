import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/cn';
import { useMemoryTimeline, type ApiMemoryScope, type ApiMemoryType } from '@/lib/queries';

const toneByType: Record<ApiMemoryType, 'accent' | 'default' | 'ok' | 'warn'> = {
  semantic: 'accent',
  episodic: 'default',
  procedural: 'ok',
  summary: 'warn',
};

function formatTimestamp(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function MemoryTimeline({
  scope,
  onScopeChange,
  selectedMemoryId,
  onSelectMemory,
}: {
  scope: ApiMemoryScope;
  onScopeChange: (scope: ApiMemoryScope) => void;
  selectedMemoryId: string | null;
  onSelectMemory: (id: string) => void;
}) {
  const timelineQuery = useMemoryTimeline(scope);

  return (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-ink-5">Timeline</div>
          <div className="mt-1 text-sm text-ink-4">Reverse-chronological memory writes and invalidations.</div>
        </div>
        <select
          value={scope}
          onChange={(event) => onScopeChange(event.target.value as ApiMemoryScope)}
          className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink outline-none"
        >
          {['repo', 'branch', 'session', 'global'].map((option) => (
            <option key={option} value={option} className="bg-surface text-ink">
              {option}
            </option>
          ))}
        </select>
      </div>

      <div className="fk-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {timelineQuery.isLoading && <div className="text-sm text-ink-4">Loading timeline…</div>}
        {timelineQuery.error && <div className="text-sm text-err">{timelineQuery.error instanceof Error ? timelineQuery.error.message : 'Unable to load timeline.'}</div>}

        <div className="space-y-3">
          {timelineQuery.data?.map((memory) => {
            const isSuperseded = Boolean(memory.invalidAt) || memory.supersededByIds.length > 0 || !memory.isActive;
            return (
              <button
                key={memory.id}
                onClick={() => onSelectMemory(memory.id)}
                className={cn(
                  'group relative w-full rounded-xl border px-4 py-3 text-left transition-all',
                  selectedMemoryId === memory.id ? 'border-accent bg-accent/[0.06]' : 'border-border bg-bg hover:border-border-light hover:bg-white/[0.03]',
                  isSuperseded && 'opacity-60',
                )}
              >
                <div className="absolute left-[-9px] top-5 h-3 w-3 rounded-full border border-bg bg-accent shadow-[0_0_0_3px_rgba(34,211,238,0.18)]" />
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-ink-5">
                      <span className="font-mono">{formatTimestamp(memory.createdAt ?? memory.updatedAt)}</span>
                      <Badge tone={toneByType[memory.type]}>{memory.type}</Badge>
                      <Badge tone="muted">{memory.scope}</Badge>
                      {isSuperseded && <Badge tone="err">superseded</Badge>}
                    </div>
                    <div className={cn('truncate text-sm font-semibold tracking-tight text-ink', isSuperseded && 'line-through decoration-err/60')}>
                      {memory.title}
                    </div>
                    {memory.invalidAt && (
                      <div className="mt-1 text-xs text-ink-5">invalid at {formatTimestamp(memory.invalidAt)}</div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}

          {!timelineQuery.isLoading && (timelineQuery.data?.length ?? 0) === 0 && (
            <div className="rounded-xl border border-dashed border-border p-6 text-sm text-ink-4">No memories yet for this scope.</div>
          )}
        </div>
      </div>
    </Card>
  );
}

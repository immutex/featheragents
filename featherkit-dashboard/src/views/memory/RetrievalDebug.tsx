import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Tabs } from '@/components/ui/Tabs';
import { useRetrievalTrace } from '@/lib/queries';

function formatTimestamp(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function RetrievalDebug({ taskId }: { taskId: string | null }) {
  const traceQuery = useRetrievalTrace(taskId);
  const traces = traceQuery.data ?? [];
  const [activePhase, setActivePhase] = useState<string | null>(null);

  const selectedTrace = useMemo(() => {
    if (traces.length === 0) return null;
    return traces.find((trace) => trace.phase === activePhase) ?? traces.at(-1) ?? null;
  }, [activePhase, traces]);

  const tabs = traces.map((trace) => ({ id: trace.phase, label: trace.phase }));

  if (!taskId) {
    return (
      <Card className="flex h-full items-center justify-center p-6 text-center text-sm text-ink-4">
        No active task. Retrieval debug appears here when a task has a recorded memory trace.
      </Card>
    );
  }

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-border px-4 py-3.5">
        <div className="text-xs uppercase tracking-[0.2em] text-ink-5">Retrieval debug</div>
        <div className="mt-1 text-base font-semibold tracking-tight">Task {taskId}</div>
        <div className="mt-1 text-sm text-ink-4">Shows the latest retrieval trace emitted by mem-d for this task.</div>
      </div>

      <div className="fk-scroll flex-1 overflow-y-auto px-4 py-4">
        {traceQuery.isLoading && <div className="text-sm text-ink-4">Loading retrieval trace…</div>}
        {traceQuery.error && <div className="text-sm text-err">{traceQuery.error instanceof Error ? traceQuery.error.message : 'Unable to load retrieval trace.'}</div>}

        {!traceQuery.isLoading && traces.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-6 text-sm text-ink-4">No retrieval trace yet for this task.</div>
        )}

        {traces.length > 0 && selectedTrace && (
          <div className="space-y-4">
            <Tabs tabs={tabs} active={selectedTrace.phase} onChange={setActivePhase} />

            <div className="grid grid-cols-3 gap-3">
              <Metric label="Token budget" value={String(selectedTrace.trace.tokenBudget)} />
              <Metric label="Used" value={String(selectedTrace.trace.used)} />
              <Metric label="Recorded" value={formatTimestamp(selectedTrace.recordedAt)} />
            </div>

            <section>
              <div className="mb-2 text-xs uppercase tracking-[0.2em] text-ink-5">Included memories</div>
              <div className="space-y-2">
                {selectedTrace.trace.included.map((memory) => (
                  <div key={`${selectedTrace.phase}-${memory.memoryId}`} className="rounded-lg border border-border bg-bg px-3 py-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium text-ink">{memory.title ?? memory.memoryId}</div>
                      <Badge tone="muted">{memory.memoryId}</Badge>
                      {memory.score !== undefined && <Badge tone="accent">score {memory.score.toFixed(2)}</Badge>}
                    </div>
                    <div className="mt-2 text-ink-3">{memory.reasons?.join(' • ') ?? 'No reason string recorded.'}</div>
                    {memory.usedTokens !== undefined && <div className="mt-1 text-xs text-ink-5">used {memory.usedTokens} tokens</div>}
                  </div>
                ))}
              </div>
            </section>

            <section>
              <div className="mb-2 text-xs uppercase tracking-[0.2em] text-ink-5">Near misses</div>
              <div className="space-y-2">
                {selectedTrace.trace.dropped.slice(0, 3).map((memory) => (
                  <div key={`${selectedTrace.phase}-${memory.memoryId}`} className="rounded-lg border border-border bg-bg px-3 py-3 text-sm text-ink-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium text-ink">{memory.title ?? memory.memoryId}</div>
                      {memory.score !== undefined && <Badge tone="warn">score {memory.score.toFixed(2)}</Badge>}
                    </div>
                    <div className="mt-2">{memory.reasons?.join(' • ') ?? 'Budget or ranking cutoff.'}</div>
                  </div>
                ))}
                {selectedTrace.trace.dropped.length === 0 && (
                  <div className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-ink-5">No dropped candidates recorded.</div>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-bg px-3 py-3">
      <div className="text-xs uppercase tracking-[0.2em] text-ink-5">{label}</div>
      <div className="mt-1 text-sm font-medium text-ink">{value}</div>
    </div>
  );
}

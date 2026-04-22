import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import type { ApiMemoryDetailData, ApiMemoryType } from '@/lib/queries';

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

export function MemoryInspector({
  detail,
  isLoading,
  selectedMemoryId,
}: {
  detail: ApiMemoryDetailData | null;
  isLoading: boolean;
  selectedMemoryId: string | null;
}) {
  if (isLoading) {
    return (
      <Card className="flex h-full items-center justify-center p-6 text-sm text-ink-4">Loading memory inspector…</Card>
    );
  }

  if (!selectedMemoryId || !detail) {
    return (
      <Card className="flex h-full items-center justify-center p-6 text-center text-sm text-ink-4">
        Select a memory node or timeline row to inspect its full content, entities, edges, and retrieval history.
      </Card>
    );
  }

  const memory = detail.memory;

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-border px-4 py-3.5">
        <div className="text-xs uppercase tracking-[0.2em] text-ink-5">Inspector</div>
        <div className="mt-1 text-base font-semibold tracking-tight">{memory.title}</div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge tone={toneByType[memory.type]}>{memory.type}</Badge>
          <Badge tone="muted">{memory.scope}</Badge>
          {!memory.isActive && <Badge tone="err">inactive</Badge>}
        </div>
      </div>

      <div className="fk-scroll flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <ActionRow />
        <Field label="Content" value={memory.content} multiline />
        <Field label="Normalized content" value={detail.normalizedContent ?? '—'} multiline />
        <FieldGrid>
          <Field label="Confidence" value={memory.confidence?.toFixed(2) ?? '—'} />
          <Field label="Salience" value={memory.salience?.toFixed(2) ?? '—'} />
          <Field label="Source" value={memory.source ?? '—'} />
          <Field label="Created" value={formatTimestamp(memory.createdAt)} />
          <Field label="Updated" value={formatTimestamp(memory.updatedAt)} />
          <Field label="Invalidated" value={formatTimestamp(memory.invalidAt)} />
        </FieldGrid>

        <section>
          <div className="mb-2 text-xs uppercase tracking-[0.2em] text-ink-5">Entities</div>
          <div className="flex flex-wrap gap-2">
            {detail.entities.length > 0 ? detail.entities.map((entity) => (
              <div key={entity.id} className="rounded-lg border border-border bg-bg px-3 py-2 text-sm">
                <div className="font-medium text-ink">{entity.value}</div>
                <div className="text-xs text-ink-5">{entity.kind}{entity.role ? ` · ${entity.role}` : ''}</div>
              </div>
            )) : <EmptyLine label="No linked entities." />}
          </div>
        </section>

        <section>
          <div className="mb-2 text-xs uppercase tracking-[0.2em] text-ink-5">Edges</div>
          <div className="space-y-2">
            {detail.edges.length > 0 ? detail.edges.map((edge) => (
              <div key={edge.id} className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink-3">
                <div className="font-mono text-xs text-ink-5">{edge.fromMemoryId} → {edge.toMemoryId}</div>
                <div className="mt-1 flex items-center gap-2">
                  <Badge tone="muted">{edge.relation}</Badge>
                  {edge.weight !== null && <span className="text-xs text-ink-5">weight {edge.weight.toFixed(2)}</span>}
                </div>
              </div>
            )) : <EmptyLine label="No edges recorded." />}
          </div>
        </section>

        <section>
          <div className="mb-2 text-xs uppercase tracking-[0.2em] text-ink-5">Retrieval history</div>
          <div className="space-y-2">
            {detail.accessLog.length > 0 ? detail.accessLog.map((entry) => (
              <div key={entry.id} className="rounded-lg border border-border bg-bg px-3 py-2 text-sm">
                <div className="font-mono text-xs text-ink-5">{formatTimestamp(entry.accessedAt)}</div>
                <div className="mt-1 text-ink-3">{entry.reason ?? 'memory access'}</div>
                {entry.actor && <div className="mt-1 text-xs text-ink-5">actor: {entry.actor}</div>}
              </div>
            )) : <EmptyLine label="No retrieval history yet." />}
          </div>
        </section>

        <section>
          <div className="mb-2 text-xs uppercase tracking-[0.2em] text-ink-5">Supersession chain</div>
          <div className="rounded-lg border border-border bg-bg px-3 py-3 text-sm text-ink-3">
            <div>Supersedes: {detail.supersession.supersedes.length > 0 ? detail.supersession.supersedes.join(', ') : '—'}</div>
            <div className="mt-1">Superseded by: {detail.supersession.supersededBy.length > 0 ? detail.supersession.supersededBy.join(', ') : '—'}</div>
          </div>
        </section>
      </div>
    </Card>
  );
}

function ActionRow() {
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" disabled title="Read-only in v1">
        Pin
      </Button>
      <Button variant="danger" size="sm" disabled title="Read-only in v1">
        Invalidate
      </Button>
      <Button variant="ghost" size="sm" disabled title="Merge is planned for v2">
        Merge (v2)
      </Button>
    </div>
  );
}

function Field({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-[0.2em] text-ink-5">{label}</div>
      <div className={cn('mt-1.5 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink-3', multiline && 'whitespace-pre-wrap leading-relaxed')}>
        {value}
      </div>
    </div>
  );
}

function FieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

function EmptyLine({ label }: { label: string }) {
  return <div className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-ink-5">{label}</div>;
}

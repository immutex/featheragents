import { useEffect, useMemo, useState } from 'react';

import { Card } from '@/components/ui/Card';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { Tabs } from '@/components/ui/Tabs';
import { useMemoryDetail, useMemoryTimeline, useStateQuery, type ApiMemoryScope } from '@/lib/queries';

import { MemoryGraph } from './memory/MemoryGraph';
import { MemoryInspector } from './memory/MemoryInspector';
import { MemoryTimeline } from './memory/MemoryTimeline';
import { RetrievalDebug } from './memory/RetrievalDebug';

type MemoryTab = 'graph' | 'timeline' | 'inspector';

export function MemoryView() {
  const [activeTab, setActiveTab] = useState<MemoryTab>('graph');
  const [scope, setScope] = useState<ApiMemoryScope>('repo');
  const [selectedMemoryId, setSelectedMemoryId] = useState<string | null>(null);

  const { data: state } = useStateQuery();
  const timelineQuery = useMemoryTimeline(scope);
  const detailQuery = useMemoryDetail(selectedMemoryId);

  const activeTaskId = state?.currentTask ?? null;
  const memoryEnabled = state?.config?.memory?.enabled ?? true;
  const memoryCount = timelineQuery.data?.length ?? 0;

  useEffect(() => {
    if (!selectedMemoryId && timelineQuery.data && timelineQuery.data.length > 0) {
      setSelectedMemoryId(timelineQuery.data[0].id);
    }
  }, [selectedMemoryId, timelineQuery.data]);

  const tabs = useMemo(
    () => [
      { id: 'graph', label: 'Graph', count: memoryCount },
      { id: 'timeline', label: 'Timeline', count: memoryCount },
      { id: 'inspector', label: 'Inspector', notify: Boolean(activeTaskId) },
    ],
    [activeTaskId, memoryCount],
  );

  if (!memoryEnabled) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Card className="max-w-xl p-6 text-center">
          <SectionLabel className="mb-2">Memory</SectionLabel>
          <h1 className="text-xl font-semibold tracking-tight">Memory is disabled</h1>
          <p className="mt-2 text-sm text-ink-4">
            Enable <code className="font-mono text-ink-3">config.memory.enabled</code> to explore graph, timeline, and retrieval debug data.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden px-8 pt-6 pb-6">
      <div className="mb-5">
        <SectionLabel className="mb-1">Memory System</SectionLabel>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Visible memory</h1>
            <p className="mt-1 text-sm text-ink-4">
              Inspect the live memory graph, browse the write timeline, and trace which memories were retrieved for the current task.
            </p>
          </div>
        </div>
      </div>

      <Tabs tabs={tabs} active={activeTab} onChange={(id) => setActiveTab(id as MemoryTab)} className="mb-4" />

      {activeTab === 'graph' && (
        <div className="flex min-h-0 flex-1 gap-4 overflow-hidden">
          <MemoryGraph
            scope={scope}
            onScopeChange={setScope}
            selectedMemoryId={selectedMemoryId}
            onSelectMemory={setSelectedMemoryId}
            onOpenInspector={() => undefined}
          />
          <div className="w-[360px] shrink-0 overflow-hidden">
            <MemoryInspector detail={detailQuery.data ?? null} isLoading={detailQuery.isLoading} selectedMemoryId={selectedMemoryId} />
          </div>
        </div>
      )}

      {activeTab === 'timeline' && (
        <div className="flex min-h-0 flex-1 gap-4 overflow-hidden">
          <MemoryTimeline
            scope={scope}
            onScopeChange={setScope}
            selectedMemoryId={selectedMemoryId}
            onSelectMemory={(id) => {
              setSelectedMemoryId(id);
              setActiveTab('inspector');
            }}
          />
          <div className="w-[360px] shrink-0 overflow-hidden">
            <MemoryInspector detail={detailQuery.data ?? null} isLoading={detailQuery.isLoading} selectedMemoryId={selectedMemoryId} />
          </div>
        </div>
      )}

      {activeTab === 'inspector' && (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_380px] gap-4 overflow-hidden">
          <RetrievalDebug taskId={activeTaskId} />
          <MemoryInspector detail={detailQuery.data ?? null} isLoading={detailQuery.isLoading} selectedMemoryId={selectedMemoryId} />
        </div>
      )}
    </div>
  );
}

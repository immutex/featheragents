import { useCallback, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';

import { Sidebar, type TabId } from './components/Sidebar';
import { HomeView } from './views/Home';
import { ProjectsView } from './views/Projects';
import { ConnectionsView } from './views/Connections';
import { AgentsView } from './views/Agents';
import { MemoryView } from './views/Memory';
import { Toast } from './components/ui/Toast';
import { USE_MOCK } from './lib/env';
import { pageVariants } from './lib/motion';
import { useDashboardProjects, useStateQuery } from './lib/queries';
import { type OrchestratorEvent, useOrchestratorEvents } from './lib/ws';
import { useEventStore } from './store/events';

interface SavedState {
  activeTab?: TabId;
  selectedProject?: string;
}

const queryClient = new QueryClient();

function loadSaved(): SavedState {
  try {
    return JSON.parse(localStorage.getItem('fk_state_v2') || '{}') as SavedState;
  } catch {
    return {};
  }
}

function mapEvent(event: OrchestratorEvent) {
  const ts = new Date().toLocaleTimeString('en-US', { hour12: false });

  switch (event.type) {
    case 'phase:start':
      return {
        id: `${event.type}-${event.taskId}-${event.phase}-${Date.now()}`,
        ts,
        kind: 'phase' as const,
        tone: 'accent' as const,
        task: event.taskId,
        message: `${event.phase} phase started`,
      };
    case 'phase:stdout':
      return {
        id: `${event.type}-${Date.now()}`,
        ts,
        kind: 'phase' as const,
        tone: 'info' as const,
        message: event.line,
      };
    case 'phase:complete':
      return {
        id: `${event.type}-${event.taskId}-${event.phase}-${Date.now()}`,
        ts,
        kind: 'phase' as const,
        tone: event.status === 'ok' ? ('ok' as const) : ('warn' as const),
        task: event.taskId,
        message: `${event.phase} phase completed (${event.status})`,
      };
    case 'phase:failed':
      return {
        id: `${event.type}-${event.taskId}-${event.phase}-${Date.now()}`,
        ts,
        kind: 'phase' as const,
        tone: 'err' as const,
        task: event.taskId,
        message: `${event.phase} phase failed: ${event.reason}`,
      };
    case 'gate:awaiting':
      return {
        id: `${event.type}-${event.taskId}-${event.phase}-${Date.now()}`,
        ts,
        kind: 'gate' as const,
        tone: 'warn' as const,
        task: event.taskId,
        message: `${event.phase} gate is awaiting approval`,
      };
    case 'gate:approved':
      return {
        id: `${event.type}-${event.taskId}-${event.phase}-${Date.now()}`,
        ts,
        kind: 'gate' as const,
        tone: 'ok' as const,
        task: event.taskId,
        message: `${event.phase} gate approved`,
      };
    case 'task:done':
      return {
        id: `${event.type}-${event.taskId}-${Date.now()}`,
        ts,
        kind: 'phase' as const,
        tone: 'ok' as const,
        task: event.taskId,
        message: 'Task completed',
      };
    case 'orchestrator:lock-acquired':
      return {
        id: `${event.type}-${event.pid}-${Date.now()}`,
        ts,
        kind: 'orchestrator' as const,
        tone: 'info' as const,
        message: `Orchestrator lock acquired (pid ${event.pid})`,
      };
    case 'orchestrator:lock-released':
      return {
        id: `${event.type}-${Date.now()}`,
        ts,
        kind: 'orchestrator' as const,
        tone: 'info' as const,
        message: 'Orchestrator lock released',
      };
    case 'orchestrator:stale-lock-cleared':
      return {
        id: `${event.type}-${event.stalePid}-${Date.now()}`,
        ts,
        kind: 'orchestrator' as const,
        tone: 'warn' as const,
        message: `Cleared stale lock from pid ${event.stalePid}`,
      };
    case 'ping':
      return null;
  }
}

function AppShell() {
  const saved = loadSaved();
  const [activeTab, setActiveTab] = useState<TabId>(saved.activeTab || 'home');
  const [selectedProject, setSelectedProject] = useState(saved.selectedProject || 'workspace');
  const [toast, setToast] = useState<{ tone: 'accent' | 'ok' | 'warn' | 'err'; title: string; desc?: string } | null>(null);
  const projects = useDashboardProjects();
  const { data: state } = useStateQuery();
  const pushEvent = useEventStore((store) => store.push);
  const replaceEvents = useEventStore((store) => store.replace);

  const effectiveSelectedProject = useMemo(() => {
    if (projects.some((project) => project.id === selectedProject)) {
      return selectedProject;
    }

    return projects[0]?.id ?? 'workspace';
  }, [projects, selectedProject]);

  useEffect(() => {
    if (USE_MOCK) {
      void import('./data/mock').then(({ FK_DATA }) => {
        replaceEvents(FK_DATA.events);
      });
    }
  }, [replaceEvents]);

  useEffect(() => {
    if (selectedProject !== effectiveSelectedProject) {
      setSelectedProject(effectiveSelectedProject);
    }
  }, [effectiveSelectedProject, selectedProject]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => setToast(null), 3_500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const handleEvent = useCallback((event: OrchestratorEvent) => {
    const mapped = mapEvent(event);
    if (mapped) {
      pushEvent(mapped);
    }
  }, [pushEvent]);

  const { connected } = useOrchestratorEvents(handleEvent);
  const memoryEnabled = state?.config?.memory?.enabled ?? USE_MOCK;

  function persist(tab: TabId, project: string) {
    try {
      localStorage.setItem('fk_state_v2', JSON.stringify({ activeTab: tab, selectedProject: project }));
    } catch {
      // ignore persistence failures in the dashboard shell
    }
  }

  function nav(tab: TabId) {
    setActiveTab(tab);
    persist(tab, effectiveSelectedProject);
  }

  function pickProject(id: string) {
    setSelectedProject(id);
    persist(activeTab, id);
  }

  function showToast(nextToast: { tone: 'accent' | 'ok' | 'warn' | 'err'; title: string; desc?: string }) {
    setToast(nextToast);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setToast({ tone: 'accent', title: 'Command palette', desc: 'Not wired yet.' });
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!memoryEnabled && activeTab === 'memory') {
      setActiveTab('home');
    }
  }, [activeTab, memoryEnabled]);

  const orchestratorStatus = state?.orchestrator?.status ?? 'idle';
  const pid = state?.orchestrator?.pid;

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-ink">
      <Sidebar
        activeTab={activeTab}
        onNav={nav}
        selectedProject={effectiveSelectedProject}
        onSelectProject={pickProject}
        projects={projects}
        connected={connected}
        orchestratorStatus={orchestratorStatus}
        pid={pid}
        showMemory={memoryEnabled}
      />
      <main className="flex flex-1 flex-col overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="flex flex-1 flex-col overflow-hidden"
          >
            {activeTab === 'home' && <HomeView onNav={nav} />}
            {activeTab === 'projects' && <ProjectsView selectedProject={effectiveSelectedProject} onToast={showToast} />}
            {activeTab === 'agents' && <AgentsView />}
            {activeTab === 'memory' && memoryEnabled && <MemoryView />}
            {activeTab === 'connections' && <ConnectionsView />}
          </motion.div>
        </AnimatePresence>
      </main>
      <AnimatePresence>
        {toast && (
          <motion.div className="fixed bottom-6 right-6 z-50">
            <Toast {...toast} onClose={() => setToast(null)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppShell />
    </QueryClientProvider>
  );
}

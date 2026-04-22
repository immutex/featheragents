import { useState } from 'react';
import { FK_DATA, type AgentConfig } from '@/data/mock';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { MotionCard, Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { cn } from '@/lib/cn';
import { motion, AnimatePresence } from 'framer-motion';
import { stagger, staggerItem, fadeUp } from '@/lib/motion';
import { Bot, Plus, Trash2, Save, X, MessageSquare, Wrench } from 'lucide-react';

export function AgentsView() {
  const [agents, setAgents] = useState(FK_DATA.agents);
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  function handleDelete(id: string) {
    setAgents(a => a.filter(x => x.id !== id));
    if (editing === id) setEditing(null);
  }

  function handleSave(agent: AgentConfig) {
    setAgents(a => a.map(x => (x.id === agent.id ? agent : x)));
    setEditing(null);
    setCreating(false);
  }

  function handleCreate(agent: AgentConfig) {
    setAgents(a => [...a, agent]);
    setCreating(false);
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-8 pt-6 pb-4 border-b border-border bg-surface/40">
        <div className="flex items-center justify-between">
          <div>
            <SectionLabel className="mb-1">Configuration</SectionLabel>
            <h1 className="text-xl font-semibold tracking-tight">Agents</h1>
          </div>
          <Button variant="accent" size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} />Create Agent
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto fk-scroll p-8">
        <AnimatePresence mode="wait">
          {(editing || creating) ? (
            <motion.div key="editor" variants={fadeUp} initial="initial" animate="animate" exit={{ opacity: 0, transition: { duration: 0.15 } }}>
              <AgentEditor
                agent={editing ? agents.find(a => a.id === editing)! : undefined}
                onSave={editing ? handleSave : handleCreate}
                onCancel={() => { setEditing(null); setCreating(false); }}
              />
            </motion.div>
          ) : (
            <motion.div
              key="grid"
              initial="initial"
              animate="animate"
              variants={stagger(0.08)}
              className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5"
            >
              {agents.map(agent => (
                <motion.div key={agent.id} variants={staggerItem}>
                  <AgentCard
                    agent={agent}
                    onEdit={() => setEditing(agent.id)}
                    onDelete={agent.builtIn ? undefined : () => handleDelete(agent.id)}
                  />
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

const colorMap: Record<string, string> = {
  frame: 'bg-role-frame/10 text-role-frame border-role-frame/20',
  build: 'bg-role-build/10 text-role-build border-role-build/20',
  critic: 'bg-role-critic/10 text-role-critic border-role-critic/20',
  sync: 'bg-role-sync/10 text-role-sync border-role-sync/20',
  accent: 'bg-accent-dim text-accent border-accent/20',
};

const colorBorder: Record<string, string> = {
  frame: 'border-t-role-frame',
  build: 'border-t-role-build',
  critic: 'border-t-role-critic',
  sync: 'border-t-role-sync',
  accent: 'border-t-accent',
};

function AgentCard({ agent, onEdit, onDelete }: { agent: AgentConfig; onEdit: () => void; onDelete?: () => void }) {
  return (
    <MotionCard className={cn('overflow-hidden hover:border-border-light transition-colors', colorBorder[agent.roleColor])}>
      <div className={cn('h-1', {
        'bg-role-frame': agent.roleColor === 'frame',
        'bg-role-build': agent.roleColor === 'build',
        'bg-role-critic': agent.roleColor === 'critic',
        'bg-role-sync': agent.roleColor === 'sync',
        'bg-accent': agent.roleColor === 'accent',
      })} />
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center border', colorMap[agent.roleColor])}>
              <Bot size={20} />
            </div>
            <div>
              <div className="text-base font-semibold">{agent.name}</div>
              <div className="text-xs text-ink-4 font-mono">{agent.model}</div>
            </div>
          </div>
          {agent.builtIn && <Badge tone="muted">Built-in</Badge>}
        </div>

        <div className="space-y-2 text-sm mb-4">
          <div className="flex items-center gap-2 text-ink-3">
            <MessageSquare size={14} className="text-ink-4 shrink-0" />
            <span className="truncate">{agent.systemPrompt.slice(0, 80)}…</span>
          </div>
          <div className="flex items-center gap-2 text-ink-3">
            <Wrench size={14} className="text-ink-4 shrink-0" />
            <span>{agent.skills.length} skill{agent.skills.length !== 1 ? 's' : ''}</span>
            <span className="text-ink-5">·</span>
            <span>{agent.mcpServers.length} MCP server{agent.mcpServers.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={onEdit}>Edit</Button>
          {onDelete && (
            <Button variant="ghost" size="icon" onClick={onDelete}><Trash2 size={14} className="text-ink-4 hover:text-err" /></Button>
          )}
        </div>
      </div>
    </MotionCard>
  );
}

function AgentEditor({
  agent,
  onSave,
  onCancel,
}: {
  agent?: AgentConfig;
  onSave: (a: AgentConfig) => void;
  onCancel: () => void;
}) {
  const isEdit = !!agent;
  const [name, setName] = useState(agent?.name || '');
  const [systemPrompt, setSystemPrompt] = useState(agent?.systemPrompt || '');
  const [model, setModel] = useState(agent?.model || '');
  const [roleColor, setRoleColor] = useState(agent?.roleColor || 'accent');
  const [selectedSkills, setSelectedSkills] = useState<string[]>(agent?.skills || []);
  const [selectedMcps, setSelectedMcps] = useState<string[]>(agent?.mcpServers || []);

  const allSkills = FK_DATA.skills;
  const allMcps = FK_DATA.mcpServers;
  const colors = ['frame', 'build', 'critic', 'sync', 'accent'];

  function handleSave() {
    const a: AgentConfig = {
      id: agent?.id || `agent-custom-${Date.now()}`,
      name: name || 'Untitled Agent',
      builtIn: agent?.builtIn || false,
      roleColor,
      systemPrompt,
      model: model || 'anthropic/claude-sonnet-4-6',
      skills: selectedSkills,
      mcpServers: selectedMcps,
    };
    onSave(a);
  }

  function toggleSkill(id: string) {
    setSelectedSkills(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  }
  function toggleMcp(name: string) {
    setSelectedMcps(s => s.includes(name) ? s.filter(x => x !== name) : [...s, name]);
  }

  return (
    <div className="max-w-[800px]">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">{isEdit ? `Edit ${agent!.name}` : 'Create Agent'}</h2>
          <Button variant="ghost" size="icon" onClick={onCancel}><X size={16} /></Button>
        </div>

        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-ink-5 uppercase tracking-wider mb-1.5 block">Name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
                placeholder="Agent name"
              />
            </div>
            <div>
              <label className="text-xs text-ink-5 uppercase tracking-wider mb-1.5 block">Model</label>
              <input
                value={model}
                onChange={e => setModel(e.target.value)}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-ink font-mono focus:border-accent focus:outline-none"
                placeholder="provider/model"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-ink-5 uppercase tracking-wider mb-1.5 block">Color</label>
            <div className="flex gap-2">
              {colors.map(c => (
                <button
                  key={c}
                  onClick={() => setRoleColor(c)}
                  className={cn(
                    'w-8 h-8 rounded-lg border-2 transition-all duration-200',
                    roleColor === c ? 'scale-110 border-white/30' : 'border-transparent hover:border-white/10',
                    c === 'frame' && 'bg-role-frame',
                    c === 'build' && 'bg-role-build',
                    c === 'critic' && 'bg-role-critic',
                    c === 'sync' && 'bg-role-sync',
                    c === 'accent' && 'bg-accent',
                  )}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-ink-5 uppercase tracking-wider mb-1.5 block">System Prompt</label>
            <textarea
              value={systemPrompt}
              onChange={e => setSystemPrompt(e.target.value)}
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-ink resize-none focus:border-accent focus:outline-none h-32"
              placeholder="Instructions for the agent..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-ink-5 uppercase tracking-wider mb-1.5 block">Skills</label>
              <Card className="p-3 space-y-2">
                {allSkills.map(s => (
                  <label key={s.id} className="flex items-center gap-2.5 cursor-pointer">
                    <Toggle checked={selectedSkills.includes(s.id)} onChange={() => toggleSkill(s.id)} />
                    <div>
                      <div className="text-sm font-medium">{s.name}</div>
                      <div className="text-xs text-ink-4">{s.desc}</div>
                    </div>
                  </label>
                ))}
              </Card>
            </div>
            <div>
              <label className="text-xs text-ink-5 uppercase tracking-wider mb-1.5 block">MCP Servers</label>
              <Card className="p-3 space-y-2">
                {allMcps.map(m => (
                  <label key={m.name} className="flex items-center gap-2.5 cursor-pointer">
                    <Toggle checked={selectedMcps.includes(m.name)} onChange={() => toggleMcp(m.name)} />
                    <div>
                      <div className="text-sm font-medium">{m.name}</div>
                      <div className="text-xs text-ink-4">{m.tools} tools · {m.status}</div>
                    </div>
                  </label>
                ))}
              </Card>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button variant="accent" size="sm" onClick={handleSave}><Save size={14} />Save Agent</Button>
            <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

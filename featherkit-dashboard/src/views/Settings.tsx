import { useState } from 'react';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { Kbd } from '@/components/ui/Kbd';
import { Badge } from '@/components/ui/Badge';
import { Palette, Sliders, Keyboard, Shield, Package, Info } from 'lucide-react';
import { cn } from '@/lib/cn';
import { motion, AnimatePresence } from 'framer-motion';
import { fadeUp } from '@/lib/motion';

const sections = [
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'defaults', label: 'Defaults', icon: Sliders },
  { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'pi', label: 'Pi library', icon: Package },
  { id: 'about', label: 'About', icon: Info },
];

export function SettingsView() {
  const [active, setActive] = useState('appearance');
  return (
    <div className="h-full flex overflow-hidden">
      <div className="w-[220px] shrink-0 border-r border-border bg-surface/60">
        <div className="px-4 pt-5 pb-2">
          <SectionLabel>Settings</SectionLabel>
        </div>
        <div className="px-3 space-y-0.5">
          {sections.map(s => {
            const on = active === s.id;
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                onClick={() => setActive(s.id)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-200',
                  on ? 'bg-white/[.05] text-ink' : 'text-ink-3 hover:text-ink hover:bg-white/[.03]',
                )}
              >
                <Icon size={15} className={on ? 'text-accent' : 'text-ink-4'} />
                {s.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto fk-scroll">
        <div className="px-8 pt-6 pb-10 max-w-[780px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              variants={fadeUp}
              initial="initial"
              animate="animate"
              exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }}
            >
              {active === 'appearance' && <Appearance />}
              {active === 'defaults' && <Defaults />}
              {active === 'shortcuts' && <Shortcuts />}
              {active === 'security' && <Security />}
              {active === 'pi' && <Pi />}
              {active === 'about' && <About />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function Row({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3.5 border-b border-border/50">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {desc && <div className="text-sm text-ink-4 mt-0.5">{desc}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Appearance() {
  const [dark, setDark] = useState(true);
  const [reduced, setReduced] = useState(false);
  return (
    <div>
      <h2 className="text-2xl font-semibold tracking-tight mb-1">Appearance</h2>
      <p className="text-sm text-ink-4 mb-5">Tune the visual language of FeatherKit.</p>
      <Card className="p-5">
        <Row label="Theme" desc="Dark only for now — light mode coming in v0.7">
          <div className="flex gap-1">
            <Button variant={dark ? 'accent' : 'outline'} size="sm" onClick={() => setDark(true)}>Dark</Button>
            <Button variant={!dark ? 'accent' : 'outline'} size="sm" onClick={() => setDark(false)} disabled>Light</Button>
          </div>
        </Row>
        <Row label="Density" desc="Compactness of UI elements">
          <select className="bg-bg border border-border rounded-lg px-3 py-1.5 text-sm text-ink-2 focus:outline-none focus:border-accent">
            <option>Comfortable</option><option>Compact</option><option>Spacious</option>
          </select>
        </Row>
        <Row label="Grid dot size" desc="Used on canvas & hero backgrounds">
          <input type="range" min="18" max="36" defaultValue="24" className="w-32 accent-accent" />
        </Row>
        <Row label="Reduced motion" desc="Disable animations">
          <Toggle checked={reduced} onChange={setReduced} />
        </Row>
        <Row label="Accent color" desc="Primary highlight color">
          <div className="flex gap-2">
            {['#22d3ee', '#a78bfa', '#fbbf24', '#f472b6'].map(c => (
              <button key={c} className="w-6 h-6 rounded-full border-2 border-border-light transition-transform hover:scale-110" style={{ background: c }} />
            ))}
          </div>
        </Row>
      </Card>
    </div>
  );
}

function Defaults() {
  const roles = [
    { role: 'frame', model: 'anthropic/claude-sonnet-4-6', gate: 'scope-check', timeout: 300 },
    { role: 'build', model: 'openai/gpt-5.4', gate: 'typecheck + test', timeout: 600 },
    { role: 'critic', model: 'openrouter/z-ai/glm-5.1', gate: 'diff-review', timeout: 240 },
    { role: 'sync', model: 'openai/gpt-5.4-mini', gate: 'handoff', timeout: 180 },
  ];
  return (
    <div>
      <h2 className="text-2xl font-semibold tracking-tight mb-1">Defaults</h2>
      <p className="text-sm text-ink-4 mb-5">Per-role model and gate defaults. Overridable per workflow.</p>
      <Card className="p-0 overflow-hidden">
        <div className="grid grid-cols-[80px_1fr_150px_80px] px-5 py-2.5 text-xs text-ink-5 uppercase tracking-wider border-b border-border bg-elevated/50">
          <span>Role</span><span>Model</span><span>Gate</span><span>Timeout</span>
        </div>
        {roles.map((r, i) => (
          <div key={r.role} className={cn('grid grid-cols-[80px_1fr_150px_80px] px-5 py-3 items-center', i < roles.length - 1 && 'border-b border-border/50')}>
            <Badge tone={r.role as any} className="justify-self-start">{r.role}</Badge>
            <span className="font-mono text-sm text-ink-2">{r.model}</span>
            <span className="font-mono text-sm text-ink-3">{r.gate}</span>
            <span className="font-mono text-sm text-ink-4">{r.timeout}s</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

function Shortcuts() {
  const shortcuts = [
    { keys: ['⌘', 'K'], label: 'Command palette' },
    { keys: ['⌘', 'T'], label: 'Toggle theme' },
    { keys: ['⌘', 'S'], label: 'Save workflow' },
    { keys: ['N'], label: 'New node (workflow)' },
    { keys: ['F'], label: 'Fit canvas' },
    { keys: ['Space', '+ drag'], label: 'Pan canvas' },
    { keys: ['⌘', '1..4'], label: 'Switch sidebar tab' },
    { keys: ['⌘', '/'], label: 'Focus search' },
    { keys: ['⌘', 'P'], label: 'Open project' },
    { keys: ['⌘', 'R'], label: 'Run orchestrator' },
    { keys: ['⌘', '.'], label: 'Pause active task' },
    { keys: ['Esc'], label: 'Close drawer' },
  ];
  return (
    <div>
      <h2 className="text-2xl font-semibold tracking-tight mb-1">Keyboard shortcuts</h2>
      <p className="text-sm text-ink-4 mb-5">All shortcuts are customizable in <code className="font-mono text-ink-3">~/.config/featherkit/keymap.json</code>.</p>
      <Card className="p-0 overflow-hidden">
        {shortcuts.map((s, i) => (
          <div key={i} className={cn('flex items-center justify-between px-5 py-3', i < shortcuts.length - 1 && 'border-b border-border/50')}>
            <span className="text-sm text-ink-2">{s.label}</span>
            <span className="flex gap-1">{s.keys.map(k => <Kbd key={k}>{k}</Kbd>)}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

function Security() {
  return (
    <div>
      <h2 className="text-2xl font-semibold tracking-tight mb-1">Security</h2>
      <p className="text-sm text-ink-4 mb-5">Dashboard server binds to loopback and requires a token.</p>
      <Card className="p-5">
        <Row label="Dashboard token" desc="Required for all /api and /events requests">
          <div className="flex items-center gap-2">
            <code className="font-mono text-sm text-ink-2 bg-bg px-2.5 py-1 rounded-lg border border-border">fk_•••••••••••••••4c7a</code>
            <Button variant="outline" size="sm">Rotate</Button>
          </div>
        </Row>
        <Row label="Bind address" desc="Only 127.0.0.1 bindings are permitted">
          <code className="font-mono text-sm text-ink-2">127.0.0.1:7721</code>
        </Row>
        <Row label="Export / Import" desc="state.json and workflow snapshots">
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm">Export</Button>
            <Button variant="outline" size="sm">Import</Button>
          </div>
        </Row>
      </Card>
    </div>
  );
}

function Pi() {
  const items = [
    { name: '@mariozechner/pi-ai', version: '0.8.2', desc: 'OAuth clients for Codex, Copilot, Gemini, Antigravity' },
    { name: '@mariozechner/pi-tui', version: '0.4.0', desc: 'Headed TUI rendering for `feather orchestrate`' },
    { name: 'claude (CLI harness)', version: 'system', desc: 'Default runtime for all Claude agents' },
  ];
  return (
    <div>
      <h2 className="text-2xl font-semibold tracking-tight mb-1">Pi library</h2>
      <p className="text-sm text-ink-4 mb-5">FeatherKit leans on the Pi toolkit for agent harness + auth.</p>
      <div className="space-y-3">
        {items.map(it => (
          <Card key={it.name} className="p-4 flex items-center gap-4">
            <Package size={16} className="text-ink-4 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono font-medium">{it.name}</span>
                <Badge tone="muted">v{it.version}</Badge>
              </div>
              <div className="text-sm text-ink-4 mt-0.5">{it.desc}</div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function About() {
  return (
    <div>
      <h2 className="text-2xl font-semibold tracking-tight mb-1">About</h2>
      <Card className="p-8 text-center">
        <div className="inline-flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-accent to-accent/50 shadow-[0_0_16px_rgba(34,211,238,0.3)]" />
          <span className="font-serif text-3xl">FeatherKit</span>
        </div>
        <div className="text-sm text-ink-4 mb-5">Lean multi-model workflow CLI · v0.6.0</div>
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm">Changelog</Button>
          <Button variant="outline" size="sm">Docs</Button>
          <Button variant="outline" size="sm">GitHub</Button>
        </div>
      </Card>
    </div>
  );
}

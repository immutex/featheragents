import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { chmod, mkdir, readFile, rm, stat, utimes, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

import type { FeatherConfig, TaskEntry } from '../../src/config/schema.js';
import { defaultConfig } from '../../src/config/defaults.js';
import { saveState } from '../../src/mcp/state-io.js';
import {
  discoverLatestClaudeSessionId,
  getClaudeProjectKey,
  getClaudeProjectSessionsDir,
} from '../../src/orchestrator/session.js';
import { runClaudeCodePhase } from '../../src/orchestrator/runner.js';

const createPiLoaderMock = vi.fn();

function makeTmpDir(): string {
  return join(tmpdir(), `fa-orch-test-${randomUUID()}`);
}

function makeTask(overrides: Partial<TaskEntry> = {}): TaskEntry {
  return {
    id: 'ORCH-B-1',
    title: 'Claude Code runner test',
    status: 'active',
    progress: [],
    ...overrides,
  };
}

async function writeMockClaude(binDir: string): Promise<void> {
  await mkdir(binDir, { recursive: true });

  const scriptPath = join(binDir, 'claude');
  const script = `#!/usr/bin/env bash
set -euo pipefail

mode="\${MOCK_CLAUDE_MODE:-complete}"
task_id="\${MOCK_CLAUDE_TASK_ID:-ORCH-B-1}"
phase="\${MOCK_CLAUDE_PHASE:-build}"
state_path="\${MOCK_CLAUDE_STATE_PATH:-}"
record_path="\${MOCK_CLAUDE_RECORD_PATH:-}"
session_id="\${MOCK_CLAUDE_SESSION_ID:-11111111-1111-1111-1111-111111111111}"

prompt=""
session_id_arg=""
args_string="$*"

while (($#)); do
  case "$1" in
    -p)
      shift
      prompt="\${1:-}"
      ;;
    --session-id)
      shift
      session_id_arg="\${1:-}"
      ;;
  esac
  shift || true
done

if [[ -n "$record_path" ]]; then
  {
    printf 'args=%s\n' "$args_string"
    printf 'session_id_arg=%s\n' "$session_id_arg"
    printf 'prompt<<EOF\n%s\nEOF\n' "$prompt"
  } > "$record_path"
fi

key="\${PWD//\//-}"
sessions_dir="$HOME/.claude/projects/$key"
mkdir -p "$sessions_dir"

printf 'line one\n'
sleep 0.025
printf 'line two\n'

if [[ "$mode" != 'no-session-file' ]]; then
  printf '{"type":"mock"}\n' >> "$sessions_dir/$session_id.jsonl"
fi

if [[ "$mode" == 'complete' && -n "$state_path" ]]; then
  node --input-type=module -e "import { readFile, writeFile } from 'node:fs/promises'; const statePath = process.env.MOCK_CLAUDE_STATE_PATH; const taskId = process.env.MOCK_CLAUDE_TASK_ID ?? 'ORCH-B-1'; const phase = process.env.MOCK_CLAUDE_PHASE ?? 'build'; const state = JSON.parse(await readFile(statePath, 'utf8')); const task = state.tasks.find((entry) => entry.id === taskId); if (task) { task.phaseCompletions = [...(task.phaseCompletions ?? []), { phase, summary: 'Mock phase complete', completedAt: new Date().toISOString() }]; } await writeFile(statePath, JSON.stringify(state, null, 2) + '\\n');"
fi

if [[ "$mode" == 'timeout' ]]; then
  sleep 10
  exit 0
fi

if [[ "$mode" == 'fail' ]]; then
  printf 'mock stderr failure\n' >&2
  exit 7
fi

exit 0
`;

  await writeFile(scriptPath, script, 'utf8');
  await chmod(scriptPath, 0o755);
}

describe('session helpers', () => {
  let tmpDir: string;
  let previousCwd: string;
  let previousHome: string | undefined;

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    previousCwd = process.cwd();
    previousHome = process.env.HOME;
    await mkdir(tmpDir, { recursive: true });
    process.chdir(tmpDir);
    process.env.HOME = tmpDir;
  });

  afterEach(async () => {
    process.chdir(previousCwd);
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('encodes the cwd by replacing slashes with dashes', () => {
    expect(getClaudeProjectKey('/home/mutex/Projects/featheragents')).toBe('-home-mutex-Projects-featheragents');
  });

  it('discovers the newest session id in the project sessions directory', async () => {
    const sessionsDir = getClaudeProjectSessionsDir(tmpDir, tmpDir);
    await mkdir(sessionsDir, { recursive: true });

    const older = join(sessionsDir, '00000000-0000-0000-0000-000000000001.jsonl');
    const newer = join(sessionsDir, '00000000-0000-0000-0000-000000000002.jsonl');
    await writeFile(older, '{}\n', 'utf8');
    await writeFile(newer, '{}\n', 'utf8');

    const olderTime = new Date(Date.now() - 5_000);
    const newerTime = new Date(Date.now() - 1_000);
    await utimes(older, olderTime, olderTime);
    await utimes(newer, newerTime, newerTime);

    await expect(discoverLatestClaudeSessionId(tmpDir)).resolves.toBe('00000000-0000-0000-0000-000000000002');
  });
});

describe('runClaudeCodePhase', () => {
  let tmpDir: string;
  let previousCwd: string;
  let previousHome: string | undefined;
  let previousPath: string | undefined;

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    previousCwd = process.cwd();
    previousHome = process.env.HOME;
    previousPath = process.env.PATH;

    await mkdir(tmpDir, { recursive: true });
    await mkdir(join(tmpDir, 'project-docs', 'tasks'), { recursive: true });
    await mkdir(join(tmpDir, '.project-state'), { recursive: true });
    await writeFile(join(tmpDir, 'project-docs', 'tasks', 'ORCH-B-1.md'), '# Task\n', 'utf8');

    process.chdir(tmpDir);
    process.env.HOME = tmpDir;

    const binDir = join(tmpDir, 'bin');
    await writeMockClaude(binDir);
    process.env.PATH = `${binDir}:${previousPath ?? ''}`;
  });

  afterEach(async () => {
    delete process.env.MOCK_CLAUDE_MODE;
    delete process.env.MOCK_CLAUDE_TASK_ID;
    delete process.env.MOCK_CLAUDE_PHASE;
    delete process.env.MOCK_CLAUDE_STATE_PATH;
    delete process.env.MOCK_CLAUDE_RECORD_PATH;
    delete process.env.MOCK_CLAUDE_SESSION_ID;
    delete process.env.MOCK_CLAUDE_SESSION_DELAY_MS;
    createPiLoaderMock.mockReset();
    process.chdir(previousCwd);
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function setupState(task: TaskEntry): Promise<string> {
    const statePath = join(tmpDir, '.project-state', 'state.json');
    await saveState(
      {
        version: 1,
        currentTask: task.id,
        tasks: [task],
        lastUpdated: new Date().toISOString(),
      },
      undefined,
      tmpDir,
    );

    process.env.MOCK_CLAUDE_TASK_ID = task.id;
    process.env.MOCK_CLAUDE_STATE_PATH = statePath;

    return statePath;
  }

  function makeConfig(): FeatherConfig {
    const config = defaultConfig('orch-runner-test');
    config.models = config.models.map((entry) => ({ ...entry, provider: 'anthropic' }));
    config.orchestrator.timeouts.phaseMinutes = 0.01;
    config.orchestrator.claudeCodeBinary = join(tmpDir, 'bin', 'claude');
    return config;
  }

  it('spawns claude without a session id on the first run and streams stdout lines', async () => {
    const task = makeTask({
      phaseCompletions: [
        {
          phase: 'build',
          summary: 'Pre-seeded completion for runner status check',
          completedAt: new Date().toISOString(),
        },
      ],
    });
    const recordPath = join(tmpDir, 'first-run.json');
    await setupState(task);
    process.env.MOCK_CLAUDE_MODE = 'stuck';
    process.env.MOCK_CLAUDE_PHASE = 'build';
    process.env.MOCK_CLAUDE_RECORD_PATH = recordPath;
    process.env.MOCK_CLAUDE_SESSION_ID = '22222222-2222-2222-2222-222222222222';

    const lines: string[] = [];
    const result = await runClaudeCodePhase(task, 'build', (line) => {
      lines.push(line);
    }, makeConfig(), '<memory>\nRemember the router rewrite context.\n</memory>');

    expect(result.status).toBe('ok');
    expect(lines).toEqual(['line one', 'line two']);
    expect(result.stdout).toBe('line one\nline two');

    const recorded = await readFile(recordPath, 'utf8');
    expect(recorded).toContain('args=--print -p Run the /build skill on task ORCH-B-1.');
    expect(recorded).toContain('Task file: project-docs/tasks/ORCH-B-1.md');
    expect(recorded).toContain('phase="build", and a 1–3 sentence summary.');
    expect(recorded).toContain('<memory>');
    expect(recorded).toContain('Remember the router rewrite context.');
    expect(recorded).toContain('session_id_arg=');

    const persistedState = JSON.parse(await readFile(join(tmpDir, '.project-state', 'state.json'), 'utf8'));
    expect(persistedState.tasks[0].sessionId).toBe('22222222-2222-2222-2222-222222222222');
    expect(task.sessionId).toBe('22222222-2222-2222-2222-222222222222');
  });

  it('reuses sessionId with --session-id on subsequent runs', async () => {
    const task = makeTask({
      sessionId: '33333333-3333-3333-3333-333333333333',
      phaseCompletions: [
        {
          phase: 'critic',
          summary: 'Pre-seeded critic completion for runner status check',
          completedAt: new Date().toISOString(),
        },
      ],
    });
    const recordPath = join(tmpDir, 'second-run.json');
    await setupState(task);
    process.env.MOCK_CLAUDE_MODE = 'stuck';
    process.env.MOCK_CLAUDE_PHASE = 'critic';
    process.env.MOCK_CLAUDE_RECORD_PATH = recordPath;

    const result = await runClaudeCodePhase(task, 'critic', () => undefined, makeConfig());

    expect(result.status).toBe('ok');

    const recorded = await readFile(recordPath, 'utf8');
    expect(recorded).toContain('args=--print --session-id 33333333-3333-3333-3333-333333333333 -p');
    expect(recorded).toContain('session_id_arg=33333333-3333-3333-3333-333333333333');
    expect(recorded).toContain('Include a verdict field: "pass"');
  });

  it('returns stuck when the subprocess exits without phase completion', async () => {
    const task = makeTask();
    await setupState(task);
    process.env.MOCK_CLAUDE_MODE = 'stuck';
    process.env.MOCK_CLAUDE_PHASE = 'build';

    const result = await runClaudeCodePhase(task, 'build', () => undefined, makeConfig());

    expect(result.status).toBe('stuck');
  });

  it('returns failed with stderr on non-zero exit and no phase completion', async () => {
    const task = makeTask();
    await setupState(task);
    process.env.MOCK_CLAUDE_MODE = 'fail';
    process.env.MOCK_CLAUDE_PHASE = 'build';

    const result = await runClaudeCodePhase(task, 'build', () => undefined, makeConfig());

    expect(result.status).toBe('failed');
    expect(result.stderr).toContain('mock stderr failure');
  });

  it('kills the subprocess on timeout and returns timeout', async () => {
    const task = makeTask();
    await setupState(task);
    process.env.MOCK_CLAUDE_MODE = 'timeout';
    process.env.MOCK_CLAUDE_PHASE = 'build';

    const config = makeConfig();
    config.orchestrator.timeouts.phaseMinutes = 0.0002;

    const result = await runClaudeCodePhase(task, 'build', () => undefined, config);

    expect(result.status).toBe('timeout');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('routes non-Claude roles through the pi loader and succeeds when phase completion is recorded', async () => {
    const task = makeTask();
    await setupState(task);

    createPiLoaderMock.mockResolvedValue({
      invokeProvider: vi.fn(async (_role: string, _prompt: string, onLine?: (line: string) => void) => {
        onLine?.('pi line one');
        onLine?.('pi line two');
        const statePath = join(tmpDir, '.project-state', 'state.json');
        const state = JSON.parse(await readFile(statePath, 'utf8')) as { tasks: Array<{ id: string; phaseCompletions?: unknown[] }> };
        state.tasks[0]!.phaseCompletions = [
          ...((state.tasks[0]!.phaseCompletions as unknown[]) ?? []),
          { phase: 'build', summary: 'Pi phase complete', completedAt: new Date().toISOString() },
        ];
        await writeFile(statePath, JSON.stringify(state, null, 2) + '\n', 'utf8');
        return { stdout: 'pi line one\npi line two', stderr: '', durationMs: 1 };
      }),
    });

    const config = makeConfig();
    config.models = config.models.map((entry) => entry.role === 'build' ? { ...entry, provider: 'openai' } : entry);

    const lines: string[] = [];
    const result = await runClaudeCodePhase(task, 'build', (line) => {
      lines.push(line);
    }, config, undefined, { createPiLoader: createPiLoaderMock as typeof import('../../src/integrations/pi-loader.js').createPiLoader });

    expect(result.status).toBe('ok');
    expect(lines).toEqual(['pi line one', 'pi line two']);
    expect(createPiLoaderMock).toHaveBeenCalledTimes(1);
  });
});

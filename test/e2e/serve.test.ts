import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, afterAll, afterEach, expect, it } from 'vitest';
import WebSocket from 'ws';

import { ProjectStateSchema } from '../../src/config/schema.js';
import { startServer, type DashboardServer } from '../../src/server/index.js';
import { DEFAULT_WORKFLOW } from '../../src/workflow/default.js';
import { WorkflowSchema } from '../../src/workflow/schema.js';
import { cleanup, createTmpProject, readToken, waitForHttp } from './helpers.js';

describe('e2e serve', () => {
  let tmpDir = '';
  let server: DashboardServer | null = null;

  async function cleanupTestResources(): Promise<void> {
    await server?.close();
    server = null;

    if (tmpDir) {
      await cleanup(tmpDir);
      tmpDir = '';
    }
  }

  afterEach(async () => {
    await cleanupTestResources();
  });

  afterAll(async () => {
    await cleanupTestResources();
  });

  it(
    'serves authenticated HTTP routes and websocket heartbeats',
    async () => {
      ({ tmpDir } = await createTmpProject('e2e-serve'));
      const config = JSON.parse(await readFile(join(tmpDir, 'featherkit', 'config.json'), 'utf8'));
      server = await startServer(config, 0, { cwd: tmpDir });
      await waitForHttp(`${server.url}/api/state`, 5_000);

      const token = await readToken(tmpDir, config.stateDir);
      const unauthorized = await fetch(`${server.url}/api/state`);
      expect(unauthorized.status).toBe(401);

      const headers = { Authorization: `Bearer ${token}` };
      const stateResponse = await fetch(`${server.url}/api/state`, { headers });
      expect(stateResponse.status).toBe(200);
      expect(ProjectStateSchema.parse(await stateResponse.json()).version).toBe(1);

      const workflowResponse = await fetch(`${server.url}/api/workflow`, { headers });
      expect(workflowResponse.status).toBe(200);
      expect(WorkflowSchema.parse(await workflowResponse.json()).version).toBe(1);

      const message = await new Promise<string>((resolve, reject) => {
        const ws = new WebSocket(`${server?.url.replace('http', 'ws')}/events?token=${token}`);
        const timer = setTimeout(() => reject(new Error('Timed out waiting for websocket heartbeat.')), 5_000);
        ws.on('message', (payload) => {
          clearTimeout(timer);
          ws.close();
          resolve(String(payload));
        });
        ws.on('error', reject);
      });

      expect(JSON.parse(message)).toMatchObject({ type: 'ping' });
    },
    30_000,
  );

  it('returns the built-in workflow when the saved workflow file is missing', async () => {
    ({ tmpDir } = await createTmpProject('e2e-serve-missing-workflow'));
    const config = JSON.parse(await readFile(join(tmpDir, 'featherkit', 'config.json'), 'utf8'));
    await rm(join(tmpDir, config.workflow), { force: true });

    server = await startServer(config, 0, { cwd: tmpDir });
    await waitForHttp(`${server.url}/api/state`, 5_000);

    const token = await readToken(tmpDir, config.stateDir);
    const workflowResponse = await fetch(`${server.url}/api/workflow`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(workflowResponse.status).toBe(200);
    expect(await workflowResponse.json()).toEqual(DEFAULT_WORKFLOW);
  });
});

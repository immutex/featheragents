import { Command } from 'commander';

import { loadConfig } from '../config/loader.js';
import { loadState } from '../mcp/state-io.js';
import { startServer } from '../server/index.js';
import { log } from '../utils/logger.js';

export interface ServeCommandOptions {
  port?: string;
}

export async function runServeCommand(options: ServeCommandOptions, cwd = process.cwd()): Promise<void> {
  const config = await loadConfig(cwd);
  const requestedPort = options.port ? Number(options.port) : 7721;

  if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65_535) {
    throw new Error(`Invalid port: ${options.port}`);
  }

  const state = await loadState(config.stateDir, cwd);
  const readOnly = state.orchestrator?.status === 'running';

  if (readOnly) {
    log.warn('Orchestrator lock is active — starting dashboard server in read-only mode.');
  }

  const server = await startServer(config, requestedPort, { cwd, readOnly });
  process.stdout.write(`Dashboard: ${server.url}?token=${server.token}\n`);
  if (server.readOnly) {
    process.stdout.write('Mode: read-only\n');
  }

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    process.stdout.write(`\nReceived ${signal}, shutting down…\n`);
    try {
      await server.close();
    } catch (error) {
      log.error(`Error during shutdown: ${String(error)}`);
    }
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

export const serveCommand = new Command('serve')
  .description('Run the local dashboard HTTP+WS backend')
  .option('--port <port>', 'Port to bind (default: 7721)', '7721')
  .action(async (options: ServeCommandOptions) => {
    try {
      await runServeCommand(options, process.cwd());
    } catch (error) {
      log.error(String(error));
      process.exit(1);
    }
  });

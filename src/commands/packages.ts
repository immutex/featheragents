import { Command } from 'commander';
import { loadConfig } from '../config/loader.js';
import { addPiPackage, createPiLoader, ensureProjectPiSettings, listPiPackages, removePiPackage } from '../integrations/pi-loader.js';
import { log } from '../utils/logger.js';

export const packagesCommand = new Command('pkg')
  .description('Manage project-local pi packages');

interface PackageListDeps {
  ensureProjectPiSettings: typeof ensureProjectPiSettings;
  listPiPackages: typeof listPiPackages;
  loadConfig: typeof loadConfig;
  createPiLoader: typeof createPiLoader;
  log: Pick<typeof log, 'info' | 'warn'>;
  writeStdout: (text: string) => void;
}

const defaultPackageListDeps: PackageListDeps = {
  ensureProjectPiSettings,
  listPiPackages,
  loadConfig,
  createPiLoader,
  log,
  writeStdout: (text) => {
    process.stdout.write(text);
  },
};

export async function runPackageList(cwd = process.cwd(), deps: PackageListDeps = defaultPackageListDeps): Promise<void> {
  await deps.ensureProjectPiSettings(cwd);
  const packages = await deps.listPiPackages(cwd);
  if (packages.length === 0) {
    deps.log.info('No project-local pi packages installed.');
    return;
  }

  deps.writeStdout('Packages:\n');
  for (const source of packages) {
    deps.writeStdout(`- ${source}\n`);
  }

  try {
    const config = await deps.loadConfig(cwd);
    const loader = await deps.createPiLoader(config, cwd);
    const [providers, skills, mcpServers] = await Promise.all([
      loader.listProviders(),
      loader.listSkills(),
      loader.listMcpServers(),
    ]);

    if (providers.length > 0) {
      deps.writeStdout('\nProviders:\n');
      for (const provider of providers) {
        deps.writeStdout(`- ${provider.provider} (${provider.models.join(', ')})\n`);
      }
    }

    if (skills.length > 0) {
      deps.writeStdout('\nSkills:\n');
      for (const skill of skills) {
        deps.writeStdout(`- ${skill.name} [${skill.source}]\n`);
      }
    }

    if (mcpServers.length > 0) {
      deps.writeStdout('\nMCP Servers:\n');
      for (const server of mcpServers) {
        deps.writeStdout(`- ${server.name} [${server.source}]\n`);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    deps.log.warn(`Could not inspect pi providers/skills/MCP servers: ${message}`);
  }
}

packagesCommand
  .command('add')
  .argument('<source>', 'Package source, e.g. npm:@scope/pkg')
  .description('Install a project-local pi package')
  .action(async (source: string) => {
    try {
      await ensureProjectPiSettings();
      await addPiPackage(source);
      log.success(`Installed ${source}`);
    } catch (error) {
      log.error(String(error));
      process.exit(1);
    }
  });

packagesCommand
  .command('remove')
  .argument('<source>', 'Installed package source')
  .description('Remove a project-local pi package')
  .action(async (source: string) => {
    try {
      await ensureProjectPiSettings();
      await removePiPackage(source);
      log.success(`Removed ${source}`);
    } catch (error) {
      log.error(String(error));
      process.exit(1);
    }
  });

packagesCommand
  .command('list')
  .description('List project-local pi packages')
  .action(async () => {
    try {
      await runPackageList();
    } catch (error) {
      log.error(String(error));
      process.exit(1);
    }
  });

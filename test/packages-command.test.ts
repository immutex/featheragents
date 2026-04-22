import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runPackageList } from '../src/commands/packages.js';

describe('runPackageList', () => {
  const ensureProjectPiSettingsMock = vi.fn();
  const listPiPackagesMock = vi.fn();
  const createPiLoaderMock = vi.fn();
  const loadConfigMock = vi.fn();
  const warnMock = vi.fn();
  const infoMock = vi.fn();
  const writeStdoutMock = vi.fn();

  beforeEach(() => {
    ensureProjectPiSettingsMock.mockReset();
    listPiPackagesMock.mockReset();
    createPiLoaderMock.mockReset();
    loadConfigMock.mockReset();
    warnMock.mockReset();
    infoMock.mockReset();
    writeStdoutMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('warns when metadata inspection fails but still lists installed packages', async () => {
    ensureProjectPiSettingsMock.mockResolvedValue(undefined);
    listPiPackagesMock.mockResolvedValue(['npm:@scope/pkg']);
    loadConfigMock.mockRejectedValue(new Error('config unavailable'));

    await runPackageList('/tmp/project', {
      ensureProjectPiSettings: ensureProjectPiSettingsMock,
      listPiPackages: listPiPackagesMock,
      loadConfig: loadConfigMock,
      createPiLoader: createPiLoaderMock,
      log: { warn: warnMock, info: infoMock },
      writeStdout: writeStdoutMock,
    });

    expect(ensureProjectPiSettingsMock).toHaveBeenCalledWith('/tmp/project');
    expect(writeStdoutMock).toHaveBeenCalledWith('Packages:\n');
    expect(writeStdoutMock).toHaveBeenCalledWith('- npm:@scope/pkg\n');
    expect(warnMock).toHaveBeenCalledWith(
      'Could not inspect pi providers/skills/MCP servers: config unavailable',
    );
  });
});

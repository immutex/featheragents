import { readdir, stat } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';

interface SessionCandidate {
  fileName: string;
  mtimeMs: number;
}

export function getClaudeProjectKey(cwd = process.cwd()): string {
  return cwd.replace(/\//g, '-');
}

export function getClaudeProjectSessionsDir(
  cwd = process.cwd(),
  homeDir = process.env.HOME || homedir(),
): string {
  return join(homeDir, '.claude', 'projects', getClaudeProjectKey(cwd));
}

export async function discoverLatestClaudeSessionId(
  cwd = process.cwd(),
  startedAtMs?: number,
  homeDir = process.env.HOME || homedir(),
): Promise<string | null> {
  const sessionsDir = getClaudeProjectSessionsDir(cwd, homeDir);

  let fileNames: string[];
  try {
    fileNames = await readdir(sessionsDir);
  } catch {
    return null;
  }

  const candidates = await Promise.all(
    fileNames
      .filter((fileName) => fileName.endsWith('.jsonl'))
      .map(async (fileName): Promise<SessionCandidate | null> => {
        try {
          const filePath = join(sessionsDir, fileName);
          const fileStat = await stat(filePath);
          if (!fileStat.isFile()) return null;
          return { fileName, mtimeMs: fileStat.mtimeMs };
        } catch {
          return null;
        }
      })
  );

  const sessionFiles = candidates
    .filter((candidate): candidate is SessionCandidate => candidate !== null)
    .sort((left, right) => right.mtimeMs - left.mtimeMs);

  if (sessionFiles.length === 0) return null;

  const recentSession =
    startedAtMs === undefined
      ? sessionFiles[0]
      : sessionFiles.find((candidate) => candidate.mtimeMs >= startedAtMs) ?? sessionFiles[0];

  if (!recentSession) return null;

  return recentSession.fileName.replace(/\.jsonl$/, '');
}

import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export async function createTempRuntime(prefix = 'nostromo-test-') {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), prefix));
  const dataDir = path.join(root, 'data');
  const logDir = path.join(root, 'logs');
  await fsp.mkdir(dataDir, { recursive: true });
  await fsp.mkdir(logDir, { recursive: true });
  return {
    root,
    dataDir,
    logDir,
    async cleanup() {
      await fsp.rm(root, { recursive: true, force: true });
    },
  };
}

const fsp = require('fs/promises');
const os = require('os');
const path = require('path');

const MIGRATION_MARKER = '.pa-nostromo-runtime-migration-v1.json';

function resolveAppDataRoot({ env = process.env, platform = process.platform, homeDir = os.homedir() } = {}) {
  if (platform === 'win32') return path.join(env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local'), 'PA-Nostromo');
  if (platform === 'darwin') return path.join(homeDir, 'Library', 'Application Support', 'PA-Nostromo');
  return path.join(env.XDG_DATA_HOME || path.join(homeDir, '.local', 'share'), 'pa-nostromo');
}

function pathsEqual(a, b) {
  const left = path.resolve(a);
  const right = path.resolve(b);
  return process.platform === 'win32'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

function resolveConfiguredDirectory(root, value, fallback) {
  const raw = String(value || '').trim();
  return raw ? path.resolve(root, raw) : fallback;
}

function resolveRuntimeStorage({ root, env = process.env, platform = process.platform, homeDir = os.homedir() } = {}) {
  if (!root) throw new Error('root is required to resolve runtime storage.');

  const legacyDataDir = path.resolve(root, 'data');
  const legacyLogDir = path.resolve(root, 'logs');
  const appDataRoot = resolveAppDataRoot({ env, platform, homeDir });
  const dataRaw = String(env.DATA_DIR || '').trim();
  const logRaw = String(env.LOG_DIR || '').trim();
  const dataUsesLegacyDefault = !dataRaw || pathsEqual(path.resolve(root, dataRaw), legacyDataDir);
  const logUsesLegacyDefault = !logRaw || pathsEqual(path.resolve(root, logRaw), legacyLogDir);

  return {
    appDataRoot,
    legacyDataDir,
    legacyLogDir,
    dataDir: dataUsesLegacyDefault ? path.join(appDataRoot, 'data') : resolveConfiguredDirectory(root, dataRaw, path.join(appDataRoot, 'data')),
    logDir: logUsesLegacyDefault ? path.join(appDataRoot, 'logs') : resolveConfiguredDirectory(root, logRaw, path.join(appDataRoot, 'logs')),
    migrateData: dataUsesLegacyDefault,
    migrateLogs: logUsesLegacyDefault,
  };
}

async function getDirectoryState(dir) {
  try {
    const stat = await fsp.lstat(dir);
    if (stat.isSymbolicLink()) throw new Error('Runtime storage directories cannot be symbolic links.');
    if (!stat.isDirectory()) throw new Error('Runtime storage path exists but is not a directory.');
    const entries = await fsp.readdir(dir);
    return { exists: true, empty: entries.length === 0 };
  } catch (error) {
    if (error?.code === 'ENOENT') return { exists: false, empty: true };
    throw error;
  }
}

async function buildManifest(root, relative = '') {
  const current = relative ? path.join(root, relative) : root;
  const entries = await fsp.readdir(current, { withFileTypes: true });
  const manifest = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const childRelative = relative ? path.join(relative, entry.name) : entry.name;
    const child = path.join(root, childRelative);
    const stat = await fsp.lstat(child);
    if (stat.isSymbolicLink()) throw new Error('Runtime storage migration refuses symbolic links.');
    if (stat.isDirectory()) {
      manifest.push(`dir:${childRelative}`);
      manifest.push(...await buildManifest(root, childRelative));
    } else if (stat.isFile()) {
      manifest.push(`file:${childRelative}:${stat.size}`);
    } else {
      throw new Error('Runtime storage migration found an unsupported filesystem entry.');
    }
  }

  return manifest;
}

async function migrateLegacyDirectory({ legacyDir, targetDir, label }) {
  if (pathsEqual(legacyDir, targetDir)) return { label, status: 'not_needed' };

  const source = await getDirectoryState(legacyDir);
  if (!source.exists || source.empty) return { label, status: 'no_legacy_data' };

  const destination = await getDirectoryState(targetDir);
  const marker = path.join(targetDir, MIGRATION_MARKER);
  if (destination.exists) {
    try {
      await fsp.access(marker);
      return { label, status: 'already_migrated' };
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }

  const sourceManifest = await buildManifest(legacyDir);
  await fsp.mkdir(path.dirname(targetDir), { recursive: true });
  await fsp.cp(legacyDir, targetDir, { recursive: true, force: false, errorOnExist: false, verbatimSymlinks: true });
  const targetManifest = await buildManifest(targetDir);
  const targetEntries = new Set(targetManifest);
  if (sourceManifest.some((entry) => !targetEntries.has(entry))) {
    throw new Error(`Runtime ${label} migration found a conflicting destination file; no existing file was overwritten and the legacy directory was preserved.`);
  }

  await fsp.writeFile(marker, JSON.stringify({ version: 1, migratedAt: new Date().toISOString(), source: 'legacy_repo_default' }), 'utf8');
  return { label, status: 'migrated' };
}

async function ensurePrivateRuntimeStorage(storage) {
  const results = [];
  if (storage.migrateData) results.push(await migrateLegacyDirectory({ legacyDir: storage.legacyDataDir, targetDir: storage.dataDir, label: 'data' }));
  if (storage.migrateLogs) results.push(await migrateLegacyDirectory({ legacyDir: storage.legacyLogDir, targetDir: storage.logDir, label: 'logs' }));
  await fsp.mkdir(storage.dataDir, { recursive: true });
  await fsp.mkdir(storage.logDir, { recursive: true });
  return results;
}

module.exports = {
  MIGRATION_MARKER,
  resolveAppDataRoot,
  resolveRuntimeStorage,
  migrateLegacyDirectory,
  ensurePrivateRuntimeStorage,
};

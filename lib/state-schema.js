'use strict';

// The browser deliberately owns most of the presentation-state normalization.
// This module enforces the durable contract at the file/API boundary without
// discarding forward-compatible dashboard settings that a newer browser knows.
const CURRENT_STATE_SCHEMA_VERSION = 2;
const MAX_STRING_LENGTH = 16_384;
const MAX_OBJECT_KEYS = 2_000;
const MAX_NESTING_DEPTH = 16;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const HTTP_URL_PATTERN = /^https?:\/\//i;

const COLLECTION_LIMITS = Object.freeze({
  projects: 500,
  tasks: 10_000,
  notes: 5_000,
  ideas: 5_000,
  reminders: 5_000,
  shortcuts: 1_000,
  changelog: 5_000,
  cryptoWatchlist: 1_000,
});

// `ideas` is accepted as a legacy value. The browser's existing migration
// converts it into Ideas notes before the next normal save.
const TASK_COLUMNS = new Set(['inbox', 'in_progress', 'waiting_blocked', 'ready_to_publish', 'done', 'ideas']);
const PROJECT_STATUSES = new Set(['planning', 'active', 'blocked', 'done', 'archived']);
const CAMERA_MODES = new Set(['stream', 'snapshot', 'local']);
const STREAM_STATUSES = new Set(['idle', 'loading', 'live', 'error']);

class StateSchemaError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'StateSchemaError';
    this.code = code;
    this.details = details;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function schemaError(code, message, details) {
  throw new StateSchemaError(code, message, details);
}

function validateString(value, path, maxLength = MAX_STRING_LENGTH) {
  if (typeof value !== 'string') schemaError('invalid_string', `${path} must be a string.`, { path });
  if (value.length > maxLength) schemaError('string_too_long', `${path} is too long.`, { path, maxLength });
}

function validateId(value, path, { required = false } = {}) {
  if (value == null || value === '') {
    if (required) schemaError('missing_id', `${path} is required.`, { path });
    return;
  }
  validateString(value, path, 128);
  if (!ID_PATTERN.test(value)) schemaError('invalid_id', `${path} is not a valid identifier.`, { path });
}

function validateTimestamp(value, path) {
  if (value == null || value === '') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  validateString(value, path, 128);
  if (!Number.isFinite(Date.parse(value))) {
    schemaError('invalid_timestamp', `${path} must be an ISO-compatible timestamp.`, { path });
  }
}

function validateUrl(value, path, { allowRelative = true, allowEmpty = true } = {}) {
  if (value == null || value === '') {
    if (allowEmpty) return;
    schemaError('missing_url', `${path} is required.`, { path });
  }
  validateString(value, path, 4_096);
  if (allowRelative && value.startsWith('/')) return;
  if (!HTTP_URL_PATTERN.test(value)) {
    schemaError('invalid_url', `${path} must use http(s) or a local absolute path.`, { path });
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('protocol');
  } catch {
    schemaError('invalid_url', `${path} is not a valid URL.`, { path });
  }
}

function validateJsonTree(value, path = 'state', depth = 0) {
  if (depth > MAX_NESTING_DEPTH) schemaError('state_too_deep', `${path} exceeds the maximum nesting depth.`, { path });
  if (value == null || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) schemaError('invalid_number', `${path} must be a finite number.`, { path });
    return;
  }
  if (typeof value === 'string') return validateString(value, path);
  if (Array.isArray(value)) {
    if (value.length > 20_000) schemaError('array_too_large', `${path} contains too many entries.`, { path });
    value.forEach((entry, index) => validateJsonTree(entry, `${path}[${index}]`, depth + 1));
    return;
  }
  if (!isPlainObject(value)) schemaError('invalid_value', `${path} must be JSON data.`, { path });
  const keys = Object.keys(value);
  if (keys.length > MAX_OBJECT_KEYS) schemaError('object_too_large', `${path} has too many fields.`, { path });
  for (const key of keys) {
    if (key.length > 256) schemaError('key_too_long', `${path} contains an oversized key.`, { path });
    validateJsonTree(value[key], `${path}.${key}`, depth + 1);
  }
}

function validateCollection(state, name, { requireId = true } = {}) {
  if (state[name] == null) return;
  if (!Array.isArray(state[name])) schemaError('invalid_collection', `state.${name} must be an array.`, { path: `state.${name}` });
  if (state[name].length > COLLECTION_LIMITS[name]) {
    schemaError('collection_too_large', `state.${name} exceeds its item limit.`, { path: `state.${name}`, limit: COLLECTION_LIMITS[name] });
  }
  state[name].forEach((entry, index) => {
    const path = `state.${name}[${index}]`;
    if (!isPlainObject(entry)) schemaError('invalid_collection_item', `${path} must be an object.`, { path });
    if (requireId) validateId(entry.id, `${path}.id`, { required: true });
    for (const field of ['title', 'name', 'summary', 'owner', 'nextAction', 'category', 'tag']) {
      if (entry[field] != null) validateString(entry[field], `${path}.${field}`, field === 'summary' || field === 'nextAction' ? 8_000 : 500);
    }
    for (const field of ['createdAt', 'updatedAt', 'lastUpdated', 'dueDate', 'publishedAt', 'addedAt']) {
      if (entry[field] != null) validateTimestamp(entry[field], `${path}.${field}`);
    }
    if (entry.url != null) validateUrl(entry.url, `${path}.url`);
  });
}

function validateKnownState(state) {
  for (const name of Object.keys(COLLECTION_LIMITS)) {
    if (name === 'cryptoWatchlist') continue;
    validateCollection(state, name, { requireId: name !== 'cryptoWatchlist' });
  }

  if (Array.isArray(state.cryptoWatchlist)) {
    state.cryptoWatchlist.forEach((coin, index) => validateString(coin, `state.cryptoWatchlist[${index}]`, 128));
  }

  if (Array.isArray(state.tasks)) {
    state.tasks.forEach((task, index) => {
      if (task.column != null && !TASK_COLUMNS.has(task.column)) {
        schemaError('invalid_enum', `state.tasks[${index}].column is not a supported task column.`, { path: `state.tasks[${index}].column` });
      }
      if (task.projectId != null) validateId(task.projectId, `state.tasks[${index}].projectId`);
    });
  }

  if (Array.isArray(state.projects)) {
    state.projects.forEach((project, index) => {
      if (project.status != null && !PROJECT_STATUSES.has(project.status)) {
        schemaError('invalid_enum', `state.projects[${index}].status is not supported.`, { path: `state.projects[${index}].status` });
      }
      for (const field of ['appLink', 'repoLink']) {
        if (project[field] != null) validateUrl(project[field], `state.projects[${index}].${field}`);
      }
    });
  }

  if (state.settings != null && !isPlainObject(state.settings)) schemaError('invalid_object', 'state.settings must be an object.', { path: 'state.settings' });
  if (state.layout != null && !isPlainObject(state.layout)) schemaError('invalid_object', 'state.layout must be an object.', { path: 'state.layout' });

  if (state.cameraFeed != null) {
    if (!isPlainObject(state.cameraFeed)) schemaError('invalid_object', 'state.cameraFeed must be an object.', { path: 'state.cameraFeed' });
    if (state.cameraFeed.mode != null && !CAMERA_MODES.has(state.cameraFeed.mode)) schemaError('invalid_enum', 'state.cameraFeed.mode is not supported.', { path: 'state.cameraFeed.mode' });
    if (state.cameraFeed.status != null && !STREAM_STATUSES.has(state.cameraFeed.status)) schemaError('invalid_enum', 'state.cameraFeed.status is not supported.', { path: 'state.cameraFeed.status' });
    if (state.cameraFeed.sourceUrl != null) validateUrl(state.cameraFeed.sourceUrl, 'state.cameraFeed.sourceUrl');
  }

  if (state.rss != null) {
    if (!isPlainObject(state.rss)) schemaError('invalid_object', 'state.rss must be an object.', { path: 'state.rss' });
    if (state.rss.feeds != null) {
      if (!Array.isArray(state.rss.feeds) || state.rss.feeds.length > 500) schemaError('invalid_collection', 'state.rss.feeds must be a bounded array.', { path: 'state.rss.feeds' });
      state.rss.feeds.forEach((feed, index) => {
        if (!isPlainObject(feed)) schemaError('invalid_collection_item', 'RSS feeds must be objects.', { path: `state.rss.feeds[${index}]` });
        validateId(feed.id, `state.rss.feeds[${index}].id`, { required: true });
        validateUrl(feed.url, `state.rss.feeds[${index}].url`, { allowRelative: false, allowEmpty: false });
        validateTimestamp(feed.addedAt, `state.rss.feeds[${index}].addedAt`);
      });
    }
  }

  if (state.musicPlayer != null) {
    if (!isPlainObject(state.musicPlayer)) schemaError('invalid_object', 'state.musicPlayer must be an object.', { path: 'state.musicPlayer' });
    for (const field of ['currentStreamUrl', 'favoriteStreamUrl']) {
      if (state.musicPlayer[field] != null) validateUrl(state.musicPlayer[field], `state.musicPlayer.${field}`);
    }
  }

  if (state.liveStreams != null) {
    if (!isPlainObject(state.liveStreams)) schemaError('invalid_object', 'state.liveStreams must be an object.', { path: 'state.liveStreams' });
    for (const field of ['embedUrl', 'externalUrl']) {
      if (state.liveStreams[field] != null) validateUrl(state.liveStreams[field], `state.liveStreams.${field}`);
    }
  }
}

function removeInternalMetadata(input) {
  const state = cloneJson(input);
  delete state.__integrity;
  delete state.__writeControl;
  delete state.__backupMeta;
  delete state.__snapshotMeta;
  return state;
}

function readSchemaVersion(input) {
  const explicit = input?.schemaVersion;
  if (explicit == null || explicit === '') return 1;
  if (!Number.isInteger(explicit) || explicit < 1) {
    schemaError('invalid_schema_version', 'state.schemaVersion must be a positive integer.', { path: 'state.schemaVersion' });
  }
  return explicit;
}

function migrateState(input) {
  const state = removeInternalMetadata(input);
  const fromVersion = readSchemaVersion(state);
  if (fromVersion > CURRENT_STATE_SCHEMA_VERSION) {
    schemaError('unsupported_future_schema', `State schema version ${fromVersion} is newer than this server supports.`, { fromVersion, supportedVersion: CURRENT_STATE_SCHEMA_VERSION });
  }

  let version = fromVersion;
  while (version < CURRENT_STATE_SCHEMA_VERSION) {
    if (version === 1) {
      // v2 adds an explicit root version. Existing browser normalizers continue
      // to fill optional UI defaults, while durable collections remain intact.
      state.schemaVersion = 2;
      version = 2;
      continue;
    }
    schemaError('unsupported_schema_migration', `No migration is available from state schema version ${version}.`, { version });
  }

  state.schemaVersion = CURRENT_STATE_SCHEMA_VERSION;
  return { state, fromVersion, migrated: fromVersion !== CURRENT_STATE_SCHEMA_VERSION };
}

function validateAndMigrateState(input) {
  if (!isPlainObject(input)) schemaError('invalid_state', 'State must be a JSON object.', { path: 'state' });
  const { state, fromVersion, migrated } = migrateState(input);
  validateJsonTree(state);
  validateKnownState(state);
  return { state, fromVersion, migrated, schemaVersion: CURRENT_STATE_SCHEMA_VERSION };
}

module.exports = {
  CURRENT_STATE_SCHEMA_VERSION,
  StateSchemaError,
  cloneJson,
  removeInternalMetadata,
  validateAndMigrateState,
};

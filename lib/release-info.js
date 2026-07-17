const packageMetadata = require('../package.json');
const { CURRENT_STATE_SCHEMA_VERSION } = require('./state-schema.js');

const PACKAGE_NAME = String(packageMetadata.name || 'pa-nostromo');
const APP_VERSION = String(packageMetadata.version || '0.0.0');
const STATE_SCHEMA_VERSION = CURRENT_STATE_SCHEMA_VERSION;

function getReleaseInfo() {
  return Object.freeze({
    packageName: PACKAGE_NAME,
    appVersion: APP_VERSION,
    stateSchemaVersion: STATE_SCHEMA_VERSION,
  });
}

module.exports = {
  PACKAGE_NAME,
  APP_VERSION,
  STATE_SCHEMA_VERSION,
  getReleaseInfo,
};

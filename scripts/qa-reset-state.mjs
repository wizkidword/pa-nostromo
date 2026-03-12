#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const args = new Set(process.argv.slice(2));
if (!args.has('--yes')) {
  console.error('Refusing to reset without --yes. This QA helper overwrites shared state for deterministic testing.');
  process.exit(1);
}

const cwd = process.cwd();
const fixturePath = path.join(cwd, 'data', 'qa-reset-state.json');
const payload = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

const allowLive = args.has('--allow-live');

payload.__writeControl = {
  overrideDowngrade: true,
  source: 'qa_script',
  explicitLiveOverride: allowLive,
};

const baseUrl = process.env.MC_BASE_URL || 'http://localhost:4187';
if (/localhost:4187$/.test(baseUrl) && !allowLive) {
  console.error('Refusing to target live default state endpoint (localhost:4187) without --allow-live.');
  console.error('Use MC_BASE_URL for isolated QA server, or pass --allow-live if you intentionally want live overwrite.');
  process.exit(1);
}

const response = await fetch(`${baseUrl}/api/state`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

if (!response.ok) {
  const text = await response.text();
  console.error(`QA reset failed (${response.status}): ${text}`);
  process.exit(1);
}

console.log('QA shared state reset complete.');
console.log('Now run in each test browser tab: window.__MISSION_CONTROL_QA__.resetLocalState()');

import { execSync } from 'node:child_process';

const checks = [
  ['npm run check', 'Static validation + guardrails'],
  ['npm run qa:smoke:1d1', 'Core API readiness'],
  ['npm run qa:smoke:1e1', 'State safety + cross-tab determinism'],
];

let failed = 0;
for (const [cmd, label] of checks) {
  process.stdout.write(`\n[RUN] ${label}\n`);
  try {
    execSync(cmd, { stdio: 'inherit' });
    process.stdout.write(`[PASS] ${label}\n`);
  } catch (err) {
    failed += 1;
    process.stdout.write(`[FAIL] ${label}\n`);
    if (failed > 0) break;
  }
}

if (failed) {
  process.exit(1);
}

console.log('\nPhase 1F release smoke checks passed.');

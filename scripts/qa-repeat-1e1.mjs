import { execSync } from 'node:child_process';

const runs = Math.max(1, Number.parseInt(process.argv[2] || process.env.RUNS || '3', 10) || 3);

for (let i = 1; i <= runs; i += 1) {
  process.stdout.write(`\n[RUN ${i}/${runs}] qa:smoke:1e1\n`);
  execSync('npm run qa:smoke:1e1', { stdio: 'inherit' });
}

console.log(`\nqa:smoke:1e1 passed ${runs}/${runs} serial runs.`);

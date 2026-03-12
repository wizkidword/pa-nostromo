#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '..', 'app.js');
const src = fs.readFileSync(appPath, 'utf8');

const errors = [];
const warnings = [];
const MAX_RENDER_STATE_WRITE_BASELINE = 44;

function checkFunctionLength(limit = 320) {
  const re = /function\s+([A-Za-z0-9_]+)\s*\([^)]*\)\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    const name = m[1];
    const startIdx = m.index;
    const bodyStart = re.lastIndex - 1;
    let depth = 0;
    let i = bodyStart;
    for (; i < src.length; i += 1) {
      const ch = src[i];
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    if (i >= src.length) continue;
    const startLine = src.slice(0, startIdx).split('\n').length;
    const endLine = src.slice(0, i).split('\n').length;
    const len = endLine - startLine + 1;
    if (len > limit) {
      errors.push(`Function ${name} is ${len} lines (limit ${limit}).`);
    }
  }
}

function checkRendererStateWrites() {
  const lines = src.split('\n');
  let inRender = false;
  let depth = 0;
  let count = 0;
  const hits = [];
  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx];
    if (!inRender) {
      const start = line.match(/^function\s+(render[A-Za-z0-9_]*)\s*\(/);
      if (start) {
        inRender = true;
        depth = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
      }
      continue;
    }

    const assignment = /\bstate\.[A-Za-z0-9_.$\[\]]+\s*=(?!=)/.test(line);
    const increment = /\bstate\.[A-Za-z0-9_.$\[\]]+\s*(\+\+|--)/.test(line);
    if (assignment || increment) {
      count += 1;
      hits.push(`line ${idx + 1}: ${line.trim()}`);
    }

    depth += (line.match(/\{/g) || []).length;
    depth -= (line.match(/\}/g) || []).length;
    if (depth <= 0) {
      inRender = false;
      depth = 0;
    }
  }

  if (count > MAX_RENDER_STATE_WRITE_BASELINE) {
    errors.push(`Direct state writes inside render* functions increased above baseline (${count} > ${MAX_RENDER_STATE_WRITE_BASELINE}).`);
    hits.slice(0, 10).forEach((h) => errors.push(`  ${h}`));
  } else if (count > 0) {
    warnings.push(`Renderer state-write count: ${count} (baseline max ${MAX_RENDER_STATE_WRITE_BASELINE}).`);
  }
}

checkFunctionLength();
checkRendererStateWrites();

if (warnings.length) {
  console.warn('Guardrails warnings:');
  warnings.forEach((w) => console.warn(`- ${w}`));
}

if (errors.length) {
  console.error('Guardrails check failed:\n');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}

console.log('Guardrails check passed.');

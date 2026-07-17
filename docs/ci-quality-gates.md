# CI quality gates

Every pull request and push to `main` runs the workflow in
`.github/workflows/guardrails.yml`. It uses `npm ci` and runs the following
independent checks:

- syntax and existing repository guardrails (`npm run check`);
- focused ESLint bug-prevention rules across tracked application, script, and
  test source (`npm run lint:eslint`);
- TypeScript `checkJs` on the shared outbound-request boundary modules
  (`lib/safe-fetch.js` and `lib/url-policy.js`, via `npm run typecheck`);
- the complete fast unit/integration suite with a V8 coverage report
  (`npm run test:coverage`);
- dependency audit for high-severity findings (`npm run audit:dependencies`);
- the Playwright dashboard smoke test;
- CodeQL JavaScript/TypeScript analysis; and
- Gitleaks secret scanning.

Coverage is reported and retained as a workflow artifact, not used as a global
percentage gate yet. The initial 2026-07-16 baseline is 71.25% statements,
72.22% branches, and 85.18% functions across `lib/` and `public/app/core/`.
This is intentional: the baseline includes a large legacy dashboard, while new
security-sensitive modules must continue to receive focused tests. Raise a
scoped coverage requirement only after the baseline has been reviewed and
documented in a follow-up change.

The static type check is deliberately scoped to the two JSDoc-compatible
request-boundary modules. Expand it module by module as existing legacy code
receives type annotations; do not suppress whole-file errors merely to make a
broader check appear green.

Run the same local checks with:

```powershell
npm ci
npm run check
npm run lint:eslint
npm run typecheck
npm run test:coverage
npm run audit:dependencies
npm run test:e2e
```

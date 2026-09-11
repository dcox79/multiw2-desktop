# Public source release validation

September 11, 2026. This repository starts from a sanitized snapshot of the local desktop implementation. Legacy private Git history, cloud deployment migrations, raw migration logs, and unused promotional assets are excluded. All executable desktop code and current regression tests are included.

## Checks

- 107 tests across 12 files passed; TypeScript, ESLint, and production build passed.
- Both localhost-only Playwright workflows passed during implementation: job and W-2 edits, benefits, scenarios, checklists, reports, and full 11-table backup/reset/restore. No external browser requests or uncaught browser errors occurred.
- Installed desktop validation covered fresh launch, occupied conventional port, second launch, renderer isolation, blocked outbound requests, shutdown, restart, update persistence, and native PDF generation.
- Forced process termination before SQLite COMMIT preserved all 11 tables, with a clean integrity and foreign-key check. The reproducible probe is `findings/check-interrupted-transaction.mjs`.
- The final package-content check verifies application LICENSE/NOTICE, third-party inventory, and Next/React license copies in addition to runtime and font assets. The collector preserves 232 unique notice files from 86 installed packages and both Geist font licenses on the tested Windows environment.
- Dependency audit reported zero vulnerabilities at review time. Gitleaks 8.30.1 and an independent pattern review found no credential matches in the source history reviewed before export. Public-snapshot scans are recorded in `PUBLICATION_REVIEW.md`.

## Reproduce

```powershell
npm ci
npm test
npm run type-check
npm run lint
npm run build
npm run test:local
npm run test:desktop
node findings/check-interrupted-transaction.mjs
```

Build and dependency installation require network access. Runtime tests use disposable local databases and do not contact or mutate production accounts. Never substitute real financial data for test fixtures.

## Limits

Supported calculation year: 2026. The app currently models jobs belonging to one earner, even when the filing-status selector is married filing jointly. Spouse ownership, family HSA eligibility, additional deductions, and other exclusions remain described in README.md and TAX_REVIEW.md. A passing test suite does not establish complete tax-return accuracy.

Outbound blocking is implemented in the application, not through an OS firewall. No physical printer or Windows print-dialog interaction was tested. The source release does not distribute an installer; binary redistribution requires review of applicable third-party terms in THIRD_PARTY_NOTICES.md. Test records and raw logs from the original migration remain private.

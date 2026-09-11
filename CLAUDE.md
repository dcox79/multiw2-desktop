# MultiW2 desktop contributor rules

This is an offline Windows Electron application described in README.md. Keep all tax workflows local and never modify external accounts or services as part of tests.

- Read AGENTS.md and relevant installed Next documentation before changes.
- Electron starts the Next standalone server on 127.0.0.1 and supplies an app-session cookie. Never weaken Host/Origin/session checks or renderer isolation.
- SQLite, backups, and runtime caches belong in LOCALAPPDATA/MultiW2, never installation files. No secrets or .env files in packages.
- Keep all 11 data tables and transactional restore validation. Do not replace full backup with partial exports.
- Keep AI disabled unless explicitly requested and configured. All retained workflows must work offline.
- Tax tables are reviewed for 2026 only. Preserve evidence and request independent tax review for tax-engine changes.
- Request independent security review for local session, renderer, restore, or filesystem trust-boundary changes.
- Validate with npm test, npm run type-check, npm run lint, local-only Playwright, and packaged desktop smoke tests. Never run the separate production E2E suite.
- Build installer with npm run package:win. No cloud deploy or push is implied by local refactoring.

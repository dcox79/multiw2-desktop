# MultiW2 Desktop

Offline Windows federal tax planning for multiple W-2 jobs. Electron runs the existing React/Next.js interface and a local SQLite database. No login, subscription, cloud database, or API credentials.

## Current limitations

**2026 planning estimates, not a complete tax return.** Jobs in one calculation must belong to one person. The married-filing-jointly setting does not yet separate spouses' Social Security and retirement limits; do not combine both spouses' jobs in the current app. HSA calculations assume full-year self-only eligibility and retirement assumes age under 50.

The basic 2026 tables are reviewed, but additional deductions and credits are not fully modeled, including the non-itemizer charitable deduction and Schedule 1-A deductions. Annualized salary differs from actual calendar-year earnings after a midyear start or pay change. Direct calculations and YTD projections have different assumptions. See [TAX_REVIEW.md](TAX_REVIEW.md) before relying on results.

## License

Source-available under the project-specific [MultiW2 Noncommercial No-Resale License 1.0](LICENSE). You may use it for personal household tax planning and copy, modify, fork, and share it free of charge for permitted noncommercial purposes. Commercial use, resale, paid redistribution, and paid hosted access require separate written permission. This is not an OSI-approved open-source license.

Third-party code retains its own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Contributions must be yours to contribute and offered under this project's license, with existing third-party notices preserved.

## Run

Build an installer with `npm run package:win`, then install `dist/MultiW2-Setup-1.0.0.exe` and use the **MultiW2** desktop shortcut. The installer includes Electron, Node, Next.js, and SQLite; normal use needs no terminal or separate runtime. This repository publishes source; installers are generated locally.

For development with Node 24 and npm:

```powershell
npm ci
npm run desktop
```

`npm start` reopens the latest built desktop app. `npm run package:win` rebuilds the Windows installer. Packaging requires internet to download build dependencies; the installed app runs offline.

## Your data

SQLite and recovery backups live under `%LOCALAPPDATA%\MultiW2`. Settings provides a complete JSON backup, validated restore/import, and reset. Restore and reset save a recovery backup first. Uninstalling or upgrading the application preserves this directory.

Existing online data is imported only from an explicit full export. See [LOCAL_DATA_TRANSFER.md](LOCAL_DATA_TRANSFER.md). The original website is never contacted. Old incomplete four-table exports are rejected rather than silently dropping data. Never publish real paystubs, W-2s, database files, backup exports, or credentials in issues, tests, or pull requests.

Tax planning uses reviewed **2026** tables. Other-year records and profiles remain stored and editable, but unsupported-year calculations are rejected. Read `TAX_REVIEW.md` for supported calculations and assumptions. AI scanning is disabled; imported scan history and manual prospective-job scenarios remain available. Reminders appear while the app is open; calendar export works with your calendar while it is closed. Saved calculations provide local report preview and Print / Save PDF.

## Verify

```powershell
npm test
npm run type-check
npm run lint
npm run build
npm run test:local
npm run test:desktop
```

The local browser test uses a disposable database and localhost only. It does not run the separate production E2E suite. To check an installed executable, set `MULTIW2_TEST_EXE` to its absolute path before `npm run test:desktop`.

The Electron renderer has no Node access; its session and the backend reject external network requests. The backend listens on a random loopback port and requires a random app-session cookie plus Host/Origin checks. Per-build runtime/cache files are copied under the current user's data directory so updates never write into installation files.

The installer is unsigned. Startup failures are shown in a desktop dialog and logged to `%LOCALAPPDATA%\MultiW2\desktop.log`.

Release checks and known limits are recorded in [findings/VALIDATION.md](findings/VALIDATION.md).

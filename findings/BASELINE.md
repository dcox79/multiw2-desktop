# Refactor baseline

Before the local desktop migration, the original tax suite passed 96 tests across 8 files. Those inherited tables included unverified projections, so legacy parity was not treated as proof of tax accuracy. The migration reviewed official 2026 sources and added regression coverage; the current suite passes 107 tests across 12 files.

The source release keeps current tests and synthetic fixtures. Historical runner logs and private repository history are excluded. No production E2E suite or external account mutation was used for local validation.

The packaged runtime follows [Next standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output), [Electron utility processes](https://www.electronjs.org/docs/latest/api/utility-process), and [renderer isolation guidance](https://www.electronjs.org/docs/latest/tutorial/security).

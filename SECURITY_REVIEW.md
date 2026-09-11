# Local desktop boundary review

September 11, 2026. Independent implementation review by the tax-review agent, which did not author the desktop, session or storage code. Scope: `src/proxy.ts`, `src/lib/local-session.ts`, `desktop/main.cjs`, `desktop/server.cjs`, `scripts/prepare-desktop.cjs`, `electron-builder.yml`, `next.config.ts`, and backup/reset routes plus their storage/validation helpers. This is a scoped static review, not a complete repository security scan or penetration test.

**No confirmed exploitable regression found in this scope.**

- Requests require an unpredictable process-session cookie, exact loopback Host, same-origin mutation Origin and rejection of cross-site Fetch Metadata. Missing runtime configuration fails closed. Token bytes are format-checked before constant-time comparison. The proxy covers all app paths.
- The Electron renderer is sandboxed, with Node integration disabled and context isolation enabled. It has no preload/IPC bridge, denies permissions/new windows, and blocks navigation and requests outside the selected local origin. CSP restricts connections/forms/frames and remote executable content. React renders stored/imported strings as text; no changed raw-HTML injection sink was found.
- The backend receives an explicit environment allowlist. Packaging excludes environment/VCS files and additionally walks the standalone output before packaging. Writable runtime/cache/data are under the current user's local application directory. The backend explicitly binds loopback.
- Restore validates all table counts, columns, scalar types, dates, IDs, JSON shapes, one-profile ownership and database constraints before commit. SQL values use prepared parameters; dynamic table/column identifiers come from fixed schemas. Restore/reset first create an exclusive, flushed safety backup and perform replacement in a transaction. SQL relationship failures roll back.

One candidate was rejected after tracing callers: saved-calculation lineage arrays may refer to deleted snapshot or W-2 records. Those references are historical evidence. Requiring every such ID to exist would reject an otherwise valid export after normal deletion and break backup/restore. SQL foreign-key checks do not validate those historical JSON links; the distinction should remain explicit.

The session regression covers missing/wrong/non-ASCII tokens, foreign Host/Origin, cross-site Fetch Metadata, absent mutation Origin and fail-closed missing configuration. It is included in the current `npm test` suite. Installed-process and interruption checks are summarized in `findings/VALIDATION.md`; raw workstation logs are not included in the public snapshot.

Limits: the socket hook is an application-level guard, not an OS firewall or a containment boundary for arbitrary server code execution. The local Windows account and its files are the trust boundary; this review does not claim resistance to malware already running as that same user. Package signing, OS ACL inheritance and dependencies were not independently audited here.

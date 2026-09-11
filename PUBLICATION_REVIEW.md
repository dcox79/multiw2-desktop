# Public source review

Reviewed September 11, 2026 for publication as `dcox79/multiw2-desktop`.

## Included and excluded

The public repository begins with a new root commit. It includes the desktop application, local SQLite/API implementation, synthetic regression tests, build scripts, reviewed tax references, and required license notices. The original private repository and its history remain private.

The export excludes legacy cloud migrations, unused promotional assets, an unused email helper, the original internal migration plan, and raw historical test-run JSON. Those raw logs contained workstation paths. Personal databases, backup exports, paystubs, W-2s, environment files, credentials, compiled installers, and debug logs are not included.

An independent comparison checked 185 application, test, build, and retained asset files against the validated local implementation. They matched except for insignificant end-of-file/newline normalization. Omitted helper/assets had no references in retained code.

## Secret and privacy checks

- Gitleaks 8.30.1 scanned all 72 commits reachable in the original local repository and found no credential matches. The scanner archive's SHA-256 was checked against the publisher's release checksum before execution.
- Gitleaks scanned the sanitized public file set with zero findings. The final public commit is scanned again before push.
- Independent review examined 199 staged files, including 187 text files and 12 binary assets, and found no credential, private-path, or Social Security number matches. The only email candidate was an existing third-party package maintainer contact in lockfile deprecation text.
- Checks specifically excluded workstation paths and personal payroll figures supplied during development. The public commit uses the GitHub account's noreply author address.
- Git ignores environment/key files, local databases, backup exports, nested diagnostic JSON, runtime caches, and generated build/test output.

These are bounded detection results, not a guarantee that every possible secret can be recognized. Do not add real financial information or secrets to future issues, fixtures, logs, or commits.

## Validation and licensing

The sanitized source installed its locked dependencies and passed 107 tests across 12 files plus the production build. The implementation also passed TypeScript, ESLint, localhost UI workflows, and packaged desktop checks. See `findings/VALIDATION.md` for scope and retained limitations.

The project-specific MultiW2 Noncommercial No-Resale License 1.0 permits personal household use, noncommercial copying, modification, forks, and free sharing; it expressly restricts commercial use, resale, paid distribution, and paid hosted access. It is source-available, not an OSI-approved open-source license. Internal consistency was reviewed; no legal enforceability certification is claimed. Third-party components retain their own licenses. This publication distributes source, not installer binaries.

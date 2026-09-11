# Third-party notices

MultiW2's root LICENSE applies to its original project code only. Third-party software, fonts, and other material retain their own copyright, license terms, and permissions. The project's noncommercial and no-resale restrictions do not change those third-party rights.

## Included components

The application uses Next.js, React, React DOM, Base UI, TanStack Query, Recharts, and other packages under their declared licenses. Most direct runtime packages use MIT; class-variance-authority uses Apache-2.0 and Lucide uses ISC. The generated UI/CSS also uses shadcn and Tailwind CSS sources. `package-lock.json` records exact versions and dependency license declarations.

Geist and Geist Mono are distributed under SIL Open Font License 1.1. Their original copyright and license texts are in `public/fonts/Geist-OFL.txt` and `public/fonts/Geist-Mono-OFL.txt`. The fonts originated from the existing app's Next font output; license copies came from the official Google Fonts `ofl/geist/OFL.txt` and `ofl/geistmono/OFL.txt` files, which identify the Geist Project Authors and upstream `vercel/geist-font` repository.

## Packaged notice files

`npm run build` collects the license, copyright, attribution, and notice files supplied by installed production dependencies, including nested notices in Next's compiled dependencies. It also collects the UI/CSS source packages listed above and both font licenses. It copies the original text unchanged; it does not replace dependency terms with MultiW2's license.

The resulting `resources/server/third-party/index.json` identifies the included packages and their notice paths. The original files are under `resources/server/third-party/`. Root LICENSE, NOTICE, and this document also appear in `resources/server/`. Electron's `LICENSE.electron.txt` and `LICENSES.chromium.html` remain alongside the installed executable.

Some npm packages omit a standalone license file. The collector references Next.js's source license for `@next/env` and `@next/swc-win32-x64-msvc`, and React's source license for the `client-only` marker. Victory's vendored D3 and InternMap notices remain in their original subdirectories. Any package for which no text was found is identified in `missingLicenseText` in the generated index.

## Distribution review limits

This collection repairs notices omitted by Next's standalone file tracing. It is an attribution inventory, not certification that every obligation of every bundled binary has been met.

Sharp is Apache-2.0; its Windows package also declares LGPL-3.0-or-later for libvips and embedded libraries. The supplied Sharp README, preserved by the collector, identifies additional library licenses. Merely copying that table does not establish satisfaction of source-availability, relinking, installation-information, or other applicable binary-distribution obligations. No Sharp dependency or runtime behavior is changed by this notice collection.

The public repository is a source release. Before publishing an installer, review its actual binary contents and applicable third-party terms, including the corresponding source and build materials for any LGPL/MPL components. A dependency manifest alone does not establish which optional binaries are shipped or that their distribution obligations have been fulfilled.

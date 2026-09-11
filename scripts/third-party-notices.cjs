const { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } = require('node:fs');
const { dirname, join, relative } = require('node:path');

const root = join(__dirname, '..');
const noticeName = /^(?:licen[cs]e|notice|copying|copyright|authors|patents)(?:[._-].*)?$/i;
const stylingPackages = new Set(['node_modules/shadcn', 'node_modules/tailwindcss', 'node_modules/@tailwindcss/postcss']);
// These marker/native packages use their source repository's license, but npm omits a copy.
const sharedLicenses = {
  'node_modules/@next/env': 'node_modules/next/license.md',
  'node_modules/@next/swc-win32-x64-msvc': 'node_modules/next/license.md',
  'node_modules/client-only': 'node_modules/react/LICENSE',
};

function noticeFiles(folder) {
  const files = [];
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || entry.name === 'node_modules') continue;
    const file = join(folder, entry.name);
    if (entry.isDirectory()) files.push(...noticeFiles(file));
    else if (noticeName.test(entry.name)) files.push(file);
  }
  return files;
}

function prepareThirdPartyNotices(standalone) {
  const destination = join(standalone, 'third-party');
  mkdirSync(destination, { recursive: true });
  for (const file of ['LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md']) {
    copyFileSync(join(root, file), join(standalone, file));
  }

  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
  const packages = [];
  for (const [location, metadata] of Object.entries(lock.packages)) {
    if (!location || (metadata.dev && !stylingPackages.has(location))) continue;
    const folder = join(root, location);
    if (!existsSync(join(folder, 'package.json'))) continue; // Other operating systems' optional packages.
    const manifest = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8'));
    const files = noticeFiles(folder);
    // The prebuilt Sharp README identifies additional embedded libraries and their licenses.
    if (manifest.name === 'sharp' || manifest.name.startsWith('@img/sharp-')) {
      const readme = join(folder, 'README.md');
      if (existsSync(readme)) files.push(readme);
    }
    const sharedLicense = sharedLicenses[location];
    if (sharedLicense) files.push(join(root, sharedLicense));
    const notices = [...new Set(files)].map((file) => {
      const source = relative(root, file).replaceAll('\\', '/');
      const target = join(destination, source);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(file, target);
      return source;
    });
    packages.push({
      name: manifest.name,
      version: manifest.version,
      license: manifest.license ?? metadata.license ?? 'Not declared',
      location,
      notices,
      ...(sharedLicense ? { sharedLicense } : {}),
    });
  }

  const fonts = ['Geist-OFL.txt', 'Geist-Mono-OFL.txt'].map((name) => {
    const source = join('public', 'fonts', name);
    const target = join(destination, source);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(root, source), target);
    return source.replaceAll('\\', '/');
  });
  const missingLicenseText = packages.filter((entry) => entry.notices.length === 0).map((entry) => entry.name);
  writeFileSync(join(destination, 'index.json'), `${JSON.stringify({
    description: 'Installed production dependencies and UI/CSS source packages; original notice files are copied unchanged. See THIRD_PARTY_NOTICES.md for scope and limits.',
    packages,
    fonts,
    missingLicenseText,
  }, null, 2)}\n`, 'utf8');
  console.log(`Third-party notices prepared for ${packages.length} installed packages and both Geist fonts.`);
  if (missingLicenseText.length) console.warn(`Packages without distributed license text: ${missingLicenseText.join(', ')}`);
  return { packages, fonts, missingLicenseText };
}

module.exports = { prepareThirdPartyNotices };

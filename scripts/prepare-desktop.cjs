const { cpSync, existsSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const root = join(__dirname, '..');
const standalone = join(root, '.next', 'standalone');
if (!existsSync(join(standalone, 'server.js'))) throw new Error('Run npm run build first.');
cpSync(join(root, 'public'), join(standalone, 'public'), { recursive: true });
cpSync(join(root, '.next', 'static'), join(standalone, '.next', 'static'), { recursive: true });
require('./third-party-notices.cjs').prepareThirdPartyNotices(standalone);
function verify(folder) {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (/^\.env($|\.)/.test(entry.name) || ['.git', '.vercel'].includes(entry.name)) throw new Error(`Private build input must not be packaged: ${entry.name}`);
    if (entry.isDirectory()) verify(join(folder, entry.name));
  }
}
verify(standalone);
console.log('Standalone server and local assets prepared; no environment files included.');

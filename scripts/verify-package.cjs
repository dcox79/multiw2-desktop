const assert = require('node:assert/strict');
const { existsSync, readdirSync } = require('node:fs');
const { join } = require('node:path');

module.exports = ({ appOutDir }) => {
  const server = join(appOutDir, 'resources', 'server');
  for (const file of ['server.js', 'node_modules/next/package.json', 'node_modules/react/package.json', '.next/BUILD_ID', 'public/fonts/geist-latin.woff2', 'LICENSE', 'NOTICE', 'third-party/index.json', 'third-party/node_modules/next/license.md', 'third-party/node_modules/react/LICENSE']) {
    assert(existsSync(join(server, file)), `Missing packaged runtime file: ${file}`);
  }
  assert(readdirSync(join(server, '.next', 'static')).length > 0, 'Missing packaged static assets');
};

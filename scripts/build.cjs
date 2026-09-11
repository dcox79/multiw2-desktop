const { spawnSync } = require('node:child_process');
const result = spawnSync(process.execPath, [require.resolve('next/dist/bin/next'), 'build'], { stdio: 'inherit', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
require('./prepare-desktop.cjs');

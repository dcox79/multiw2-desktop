// The backend cannot make outbound connections. Optional AI requires a separate design.
const net = require('node:net');
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const options = Array.isArray(args[0]) ? args[0] : args;
  const first = options[0];
  const host = typeof first === 'object' ? first.host : typeof options[1] === 'string' ? options[1] : '127.0.0.1';
  if ((typeof first === 'object' && first.path) || !['127.0.0.1', '::1', 'localhost', undefined].includes(host)) {
    throw new Error('MultiW2 is offline: outbound connections are disabled.');
  }
  return connect.apply(this, args);
};
require('node:assert/strict').throws(() => new net.Socket().connect(443, 'example.com'), /outbound connections are disabled/);

// Prove SQLite works in the actual packaged Node runtime before starting Next.
const { DatabaseSync } = require('node:sqlite');
const { join } = require('node:path');
const probePath = join(process.env.MULTIW2_DATA_DIR, 'runtime-check.sqlite');
let probe = new DatabaseSync(probePath);
probe.exec('CREATE TABLE IF NOT EXISTS probe (id INTEGER PRIMARY KEY); INSERT OR IGNORE INTO probe VALUES (1)');
probe.close();
probe = new DatabaseSync(probePath);
if (probe.prepare('SELECT id FROM probe').get().id !== 1) throw new Error('SQLite persistence check failed.');
probe.close();
process.parentPort?.postMessage({ type: 'runtime', node: process.versions.node, sqlite: process.versions.sqlite });
process.parentPort?.on('message', ({ data }) => {
  if (data === 'shutdown') process.emit('SIGTERM', 'SIGTERM');
});
require(join(process.env.MULTIW2_SERVER_DIR, 'server.js'));

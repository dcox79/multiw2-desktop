const { app, BrowserWindow, dialog, Menu, session, utilityProcess } = require('electron');
const { randomBytes, randomUUID } = require('node:crypto');
const { cpSync, existsSync, mkdirSync, readFileSync, renameSync, appendFileSync } = require('node:fs');
const { join } = require('node:path');
const net = require('node:net');

const dataDir = process.env.MULTIW2_DATA_DIR || join(process.env.LOCALAPPDATA || app.getPath('appData'), 'MultiW2');
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
app.setPath('userData', join(dataDir, 'desktop'));
app.commandLine.appendSwitch('disable-background-networking');
let window, backend, closing = false, stopped = false;
const logPath = join(dataDir, 'desktop.log');
const log = (message) => appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', (event) => {
    if (!backend || stopped) return;
    event.preventDefault();
    if (closing) return;
    closing = true;
    backend.postMessage('shutdown');
    setTimeout(() => { if (!stopped) backend.kill(); }, 5000).unref();
  });
  app.whenReady().then(start).catch((error) => {
    log(`Startup failed: ${error.message}`);
    dialog.showErrorBox('MultiW2 could not start', `${error.message}\n\nYour data is safe in ${dataDir}.\nDetails: ${logPath}`);
    app.quit();
  });
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function start() {
  const source = app.isPackaged ? join(process.resourcesPath, 'server') : join(__dirname, '..', '.next', 'standalone');
  const buildId = readFileSync(join(source, '.next', 'BUILD_ID'), 'utf8').trim();
  if (!/^[A-Za-z0-9_-]+$/.test(buildId)) throw new Error('Invalid application build ID.');
  // Next's runtime cache belongs to this Windows user, never the installation folder.
  const runtime = join(dataDir, 'runtime', buildId);
  if (!existsSync(join(runtime, 'server.js'))) {
    mkdirSync(join(dataDir, 'runtime'), { recursive: true, mode: 0o700 });
    const staging = `${runtime}-${randomUUID()}.tmp`;
    cpSync(source, staging, { recursive: true });
    renameSync(staging, runtime);
  }
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const token = randomBytes(32).toString('hex');
  const env = {};
  for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'LOCALAPPDATA', 'APPDATA', 'USERPROFILE', 'PATH']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  Object.assign(env, { NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', HOSTNAME: '127.0.0.1', PORT: String(port), MULTIW2_DATA_DIR: dataDir, MULTIW2_SERVER_DIR: runtime, MULTIW2_SESSION_TOKEN: token });
  backend = utilityProcess.fork(join(__dirname, 'server.cjs'), [], { env, cwd: runtime, stdio: 'pipe', serviceName: 'MultiW2 local server' });
  backend.stdout.on('data', (data) => log(data.toString().trim()));
  backend.stderr.on('data', (data) => log(data.toString().trim()));
  backend.on('message', (message) => { if (message.type === 'runtime') log(`Node ${message.node}; SQLite ${message.sqlite}; read/write/reopen passed`); });
  backend.once('exit', (code) => {
    stopped = true;
    log(`Backend stopped (${code})`);
    if (window) {
      if (!closing) dialog.showErrorBox('MultiW2 server stopped', `Restart MultiW2 to continue. Details: ${logPath}`);
      app.quit();
    } else if (closing) app.quit();
  });
  let ready = false;
  for (let attempt = 0; attempt < 120 && !stopped; attempt++) {
    try {
      const response = await fetch(`${origin}/api/health`, { headers: { Cookie: `multiw2-session=${token}` }, signal: AbortSignal.timeout(1000) });
      if (response.ok && (await response.json()).ready) { ready = true; break; }
    } catch { /* Startup connection refused is expected until the server listens. */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error('The local server did not become ready. Close and reopen MultiW2.');
  const localSession = session.fromPartition('multiw2-local');
  localSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  localSession.setPermissionCheckHandler(() => false);
  localSession.webRequest.onBeforeRequest((details, callback) => {
    const allowed = details.url.startsWith(`${origin}/`) || details.url.startsWith('blob:') || details.url.startsWith('data:');
    if (!allowed) log('Blocked an external renderer request.');
    callback({ cancel: !allowed });
  });
  await localSession.cookies.set({ url: origin, name: 'multiw2-session', value: token, httpOnly: true, sameSite: 'strict', path: '/' });
  window = new BrowserWindow({ width: 1360, height: 940, minWidth: 800, minHeight: 600, show: false, title: 'MultiW2', webPreferences: { session: localSession, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, spellcheck: false, devTools: !app.isPackaged } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== origin) event.preventDefault(); });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'File', submenu: [{ label: 'Print / Save PDF', accelerator: 'CmdOrCtrl+P', click: () => window.webContents.print({ printBackground: true }) }, { type: 'separator' }, { role: 'quit' }] },
    { role: 'editMenu' }, { role: 'viewMenu' },
  ]));
  await window.loadURL(`${origin}/dashboard`);
  window.show();
  log(`Ready ${origin}`);
}

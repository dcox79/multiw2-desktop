import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const port = 45821;
const token = 'b'.repeat(64); // Disposable local test session only.
export default defineConfig({
  testDir: './e2e-local',
  workers: 1,
  timeout: 60_000,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    extraHTTPHeaders: { Origin: `http://127.0.0.1:${port}` },
    storageState: { cookies: [{ name: 'multiw2-session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, secure: false, sameSite: 'Strict', expires: -1 }], origins: [] },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node desktop/server.cjs',
    url: `http://127.0.0.1:${port}/api/health`,
    // An unauthenticated401still proves this server is listening; tests require session.
    reuseExistingServer: false,
    timeout: 60_000,
    env: { NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', HOSTNAME: '127.0.0.1', PORT: String(port), MULTIW2_SESSION_TOKEN: token, MULTIW2_DATA_DIR: mkdtempSync(join(tmpdir(), 'multiw2-e2e-')), MULTIW2_SERVER_DIR: join(__dirname, '.next', 'standalone') },
  },
});

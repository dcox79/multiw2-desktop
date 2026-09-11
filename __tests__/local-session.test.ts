// @vitest-environment node
import { afterEach, expect, test, vi } from 'vitest';
import { validateLocalRequest } from '../src/lib/local-session';

afterEach(() => vi.unstubAllEnvs());

test('desktop session rejects missing secrets, foreign hosts/origins, and unauthenticated requests', () => {
  const token = 'a'.repeat(64);
  vi.stubEnv('PORT', '45821');
  vi.stubEnv('MULTIW2_SESSION_TOKEN', token);
  const req = (headers = {}, method = 'GET') => new Request('http://127.0.0.1:45821/api/jobs', { method, headers: { host: '127.0.0.1:45821', ...headers } });
  expect(validateLocalRequest(req(), token)).toBe(200);
  expect(validateLocalRequest(req(), undefined)).toBe(401);
  expect(validateLocalRequest(req(), 'b'.repeat(64))).toBe(401);
  expect(validateLocalRequest(req(), 'é'.repeat(64))).toBe(401);
  expect(validateLocalRequest(req({ host: 'evil.test:45821' }), token)).toBe(403);
  expect(validateLocalRequest(req({ origin: 'http://evil.test' }), token)).toBe(403);
  expect(validateLocalRequest(req({ 'sec-fetch-site': 'cross-site' }), token)).toBe(403);
  expect(validateLocalRequest(req({}, 'POST'), token)).toBe(403);
  expect(validateLocalRequest(req({ origin: 'http://127.0.0.1:45821' }, 'POST'), token)).toBe(200);
  vi.stubEnv('MULTIW2_SESSION_TOKEN', '');
  expect(validateLocalRequest(req(), token)).toBe(503);
});

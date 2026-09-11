import { timingSafeEqual } from 'node:crypto';

export function validateLocalRequest(request: Request, cookie: string | undefined) {
  const token = process.env.MULTIW2_SESSION_TOKEN;
  const port = process.env.PORT;
  if (!token || !/^[a-f0-9]{64}$/.test(token) || !port || !/^\d+$/.test(port)) return 503;
  const host = `127.0.0.1:${port}`;
  if (request.headers.get('host') !== host) return 403;
  const origin = request.headers.get('origin');
  if (origin && origin !== `http://${host}`) return 403;
  if (request.headers.get('sec-fetch-site') === 'cross-site') return 403;
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && origin !== `http://${host}`) return 403;
  if (!cookie || !/^[a-f0-9]{64}$/.test(cookie) || !timingSafeEqual(Buffer.from(cookie), Buffer.from(token))) return 401;
  return 200;
}

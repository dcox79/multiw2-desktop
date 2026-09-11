import { NextResponse } from 'next/server';
import { api, ApiError } from '@/lib/local/api';
import { exportBackup, restoreBackup } from '@/lib/local/db';

export function GET() {
  return new NextResponse(JSON.stringify(exportBackup(), null, 2), { headers: {
    'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="multiw2-backup-${new Date().toISOString().slice(0, 10)}.json"`, 'Cache-Control': 'no-store',
  } });
}
export const POST = (request: Request) => api(async () => {
  const body = await request.json();
  if (body?.confirmation !== 'RESTORE') throw new ApiError('Type RESTORE to confirm replacing local data.');
  try { return restoreBackup(body.backup); }
  catch (error) { throw new ApiError(error instanceof Error ? error.message : 'Invalid backup'); }
});

import { api, ApiError } from '@/lib/local/api';
import { resetLocalData } from '@/lib/local/db';

export const DELETE = (request: Request) => api(async () => {
  const body = await request.json();
  if (body?.confirmation !== 'DELETE') throw new ApiError('Type DELETE to confirm local data reset.');
  return resetLocalData();
});

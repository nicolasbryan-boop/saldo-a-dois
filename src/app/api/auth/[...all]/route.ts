import { toNextJsHandler } from 'better-auth/next-js';
import { getAuth } from '@/domains/auth/server';

/**
 * Better Auth mounts every credential endpoint here. The instance is built
 * per request because the D1 binding only exists inside one.
 */
export const dynamic = 'force-dynamic';

async function proxy(request: Request): Promise<Response> {
  const auth = await getAuth();
  const handler = toNextJsHandler(auth);
  const method = request.method.toUpperCase();
  return method === 'GET' ? handler.GET(request) : handler.POST(request);
}

export const GET = proxy;
export const POST = proxy;

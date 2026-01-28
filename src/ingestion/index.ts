import { Env } from '../shared/types';
import { handleSupportWebhook } from './webhook-handler';

export async function handleIngestion(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);
  
  // Only support webhook for demo
  if (url.pathname === '/webhook/support') {
    return handleSupportWebhook(request, env, ctx);
  }
  
  return new Response('Not Found', { status: 404 });
}
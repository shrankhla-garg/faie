import { Env } from '../shared/types';
import { handleGitHubWebhook, handleSlackWebhook, handleSupportWebhook } from './webhook-handler';

export async function handleIngestion(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);
  
  if (url.pathname === '/webhook/github') {
    return handleGitHubWebhook(request, env, ctx);
  } else if (url.pathname === '/webhook/slack') {
    return handleSlackWebhook(request, env, ctx);
  } else if (url.pathname === '/webhook/support') {
    return handleSupportWebhook(request, env, ctx);
  }
  
  return new Response('Not Found', { status: 404 });
}
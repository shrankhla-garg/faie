/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import { Env } from './shared/types';
import { handleIngestion } from './ingestion';
import { handleAPI } from './api';
import { sendDailySummary, retryFailedProcessing } from './scheduled/notifications';
import { handleDemoReset } from './api/demo';
import { processInBackground } from './processing/ai-processor';

export default {
  /**
   * Handle HTTP requests
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    // Route webhooks
    if (url.pathname.startsWith('/webhook/')) {
      return handleIngestion(request, env, ctx);
    }

    // Demo reset - ADD THIS
if (url.pathname === '/api/demo-reset') {
  return handleDemoReset(request, env);
}
    
    // Route API calls
    if (url.pathname.startsWith('/api/')) {
      return handleAPI(request, env);
    }

  

    if (url.pathname === '/debug') {
  return Response.json({
    hasAI: !!env.AI,
    hasDB: !!env.DB,
    hasVectorize: !!env.VECTORIZE,
    aiType: typeof env.AI
  });
}
    
    // Root endpoint
    return new Response('FAIE API - Running', { 
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    });
  },
  
  /**
   * Handle scheduled triggers (cron)
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
  // Process up to 10 pending items per minute (avoids subrequest limit)
  const pending = await env.DB.prepare(`
    SELECT id, content 
    FROM feedback 
    WHERE processed_at IS NULL 
    LIMIT 10
  `).all();

  for (const item of pending.results) {
    ctx.waitUntil(processInBackground(item.id as number, item.content as string, env));
  }
}
};
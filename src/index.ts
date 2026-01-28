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
    
    // Route API calls
    if (url.pathname.startsWith('/api/')) {
      return handleAPI(request, env);
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
    if (event.cron === '0 9 * * *') {
      // Daily summary at 9 AM
      console.log('Running daily summary...');
      await sendDailySummary(env);
    } else if (event.cron === '*/5 * * * *') {
      // Retry failed items every 5 minutes
      console.log('Running retry job...');
      await retryFailedProcessing(env);
    }
  }
};
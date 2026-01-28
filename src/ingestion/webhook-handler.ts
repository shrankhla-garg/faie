import { FeedbackItem, Env } from '../shared/types';
import { verifyGitHubSignature, verifySlackSignature, generateContentHash } from '../shared/utils';
import { processInBackground } from '../processing/ai-processor';


/**
 * Handle support ticket webhook
 */
export async function handleSupportWebhook(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const apiKey = request.headers.get('x-api-key');
  
  if (apiKey !== env.SUPPORT_API_KEY) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  const payload = await request.json() as any;
  
  if (!payload.ticket_id || !payload.description) {
    return new Response('Missing required fields', { status: 400 });
  }
  
  const feedback: FeedbackItem = {
    source: 'support',
    external_id: `ticket-${payload.ticket_id}`,
    title: payload.subject,
    content: payload.description,
    author: payload.customer_email,
    timestamp: payload.created_at ? new Date(payload.created_at).getTime() : Date.now(),
    metadata: {
      priority: payload.priority,
      customer_tier: payload.customer_tier,
      tags: payload.tags
    }
  };
  
  return await storeFeedbackAndProcess(feedback, JSON.stringify(payload), env, ctx);
}

/**
 * Store feedback and trigger background processing
 */
async function storeFeedbackAndProcess(
  feedback: FeedbackItem,
  rawPayload: string,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  try {
    // Generate content hash for deduplication
    const contentHash = await generateContentHash(feedback.content, feedback.source);
    
    // Check for duplicates
    const existing = await env.DB.prepare(
      'SELECT id FROM feedback WHERE content_hash = ?'
    ).bind(contentHash).first();
    
    if (existing) {
      return Response.json({ 
        id: existing.id, 
        status: 'duplicate' 
      }, { status: 200 });
    }
    
    // Insert into D1
    const result = await env.DB.prepare(`
      INSERT INTO feedback (
        source, external_id, title, content, author, url, 
        timestamp, raw_json, content_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      feedback.source,
      feedback.external_id || null,
      feedback.title || null,
      feedback.content,
      feedback.author || null,
      feedback.url || null,
      feedback.timestamp,
      rawPayload,
      contentHash
    ).run();
    
    const feedbackId = result.meta.last_row_id as number;
    
    // CRITICAL: Process in background using ctx.waitUntil
    ctx.waitUntil(
      processInBackground(feedbackId, feedback.content, env).catch(async (error) => {
        console.error(`Processing failed for feedback ${feedbackId}:`, error);
        // Mark for retry
        await env.DB.prepare(
          'UPDATE feedback SET processing_error = ?, retry_count = retry_count + 1 WHERE id = ?'
        ).bind(error.message, feedbackId).run();
      })
    );
    
    // Return immediately (webhook doesn't wait)
    return Response.json({ 
      id: feedbackId,
      status: 'accepted' 
    }, { status: 202 });
    
  } catch (error) {
    console.error('Error storing feedback:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
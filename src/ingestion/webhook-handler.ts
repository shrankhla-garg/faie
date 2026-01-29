import { FeedbackItem, Env } from '../shared/types';
import { generateContentHash } from '../shared/utils';
import { processInBackground } from '../processing/ai-processor';


/**
 * Handle support ticket webhook
 */
export async function handleSupportWebhook(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  console.log('1. Support webhook received');
  
  const apiKey = request.headers.get('x-api-key');
  console.log('2. API key checked:', apiKey ? 'present' : 'missing');
  
  if (apiKey !== env.SUPPORT_API_KEY) {
    console.log('3. Auth failed');
    return new Response('Unauthorized', { status: 401 });
  }
  
  console.log('3. Auth passed');
  
  try {
    const payload = await request.json() as any;
    console.log('4. Payload parsed:', payload);
    
    if (!payload.ticket_id || !payload.description) {
      console.log('5. Validation failed');
      return new Response('Missing required fields', { status: 400 });
    }
    
    console.log('5. Validation passed');
    
  const feedback: FeedbackItem = {
    source: (payload.source || 'support') as 'github' | 'slack' | 'support',  // Use source from payload
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
    
    console.log('6. Feedback object created');
    
    return await storeFeedbackAndProcess(feedback, JSON.stringify(payload), env, ctx);
    
  } catch (error) {
    console.error('❌ Error in handleSupportWebhook:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
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
import { FeedbackItem, Env } from '../shared/types';
import { verifyGitHubSignature, verifySlackSignature, generateContentHash } from '../shared/utils';
import { processInBackground } from '../processing/ai-processor';

/**
 * Handle GitHub webhook
 */
export async function handleGitHubWebhook(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  // Verify signature
  const signature = request.headers.get('x-hub-signature-256');
  const body = await request.text();
  
  if (!signature || !await verifyGitHubSignature(body, signature, env.GITHUB_SECRET)) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  const payload = JSON.parse(body);
  let feedback: FeedbackItem | null = null;
  
  // Handle issue events
  if (payload.issue) {
    feedback = {
      source: 'github',
      external_id: `issue-${payload.issue.number}`,
      title: payload.issue.title,
      content: payload.issue.body || payload.issue.title,
      author: payload.issue.user?.login,
      url: payload.issue.html_url,
      timestamp: new Date(payload.issue.created_at).getTime(),
      metadata: {
        labels: payload.issue.labels?.map((l: any) => l.name),
        state: payload.issue.state
      }
    };
  }
  // Handle comment events
  else if (payload.comment) {
    feedback = {
      source: 'github',
      external_id: `comment-${payload.comment.id}`,
      title: `Comment on issue #${payload.issue?.number}`,
      content: payload.comment.body,
      author: payload.comment.user?.login,
      url: payload.comment.html_url,
      timestamp: new Date(payload.comment.created_at).getTime()
    };
  }
  
  if (!feedback) {
    return new Response('Event type not supported', { status: 400 });
  }
  
  return await storeFeedbackAndProcess(feedback, body, env, ctx);
}

/**
 * Handle Slack webhook
 */
export async function handleSlackWebhook(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const timestamp = request.headers.get('x-slack-request-timestamp');
  const signature = request.headers.get('x-slack-signature');
  const body = await request.text();
  
  if (!timestamp || !signature || 
      !await verifySlackSignature(body, timestamp, signature, env.SLACK_SIGNING_SECRET)) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  const payload = JSON.parse(body);
  
  // Handle URL verification challenge
  if (payload.type === 'url_verification') {
    return Response.json({ challenge: payload.challenge });
  }
  
  const event = payload.event;
  
  // Ignore bot messages, edits, etc.
  if (event.type !== 'message' || event.subtype) {
    return new Response('OK', { status: 200 });
  }
  
  const feedback: FeedbackItem = {
    source: 'slack',
    external_id: `${event.channel}-${event.ts}`,
    content: event.text,
    author: event.user,
    timestamp: parseFloat(event.ts) * 1000,
    metadata: {
      channel: event.channel,
      thread_ts: event.thread_ts
    }
  };
  
  return await storeFeedbackAndProcess(feedback, body, env, ctx);
}

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
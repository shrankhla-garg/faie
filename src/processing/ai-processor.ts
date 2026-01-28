import { Env } from '../shared/types';
import { analyzeSentiment, analyzeUrgency, extractTags, generateEmbedding } from './ai-analysis';

/**
 * Process feedback in background (called via ctx.waitUntil)
 */
export async function processInBackground(
  feedbackId: number,
  content: string,
  env: Env
): Promise<void> {
  console.log(`Processing feedback ${feedbackId}...`);
  
  // Run all AI analysis in parallel
  const [sentimentResult, urgency, tags, embedding] = await Promise.all([
    analyzeSentiment(content, env.AI),
    analyzeUrgency(content, env.AI),
    extractTags(content, env.AI),
    generateEmbedding(content, env.AI)
  ]);
  
  console.log(`AI analysis complete for ${feedbackId}:`, {
    sentiment: sentimentResult.sentiment,
    urgency,
    tags,
    hasEmbedding: !!embedding
  });
  
  // Update D1 with enrichment
  await env.DB.prepare(`
    UPDATE feedback 
    SET sentiment = ?,
        sentiment_score = ?,
        urgency = ?,
        tags = ?,
        processed_at = ?,
        processing_error = NULL
    WHERE id = ?
  `).bind(
    sentimentResult.sentiment,
    sentimentResult.score,
    urgency,
    JSON.stringify(tags),
    Date.now(),
    feedbackId
  ).run();
  
// Store embedding in Vectorize
if (embedding) {
  try {
    await env.VECTORIZE.upsert([
      {
        id: feedbackId.toString(),
        values: embedding,
        metadata: {
          urgency,
          sentiment: sentimentResult.sentiment,
          tags: tags.join(',')
        }
      }
    ]);
    console.log(`Embedding stored for ${feedbackId}`);
  } catch (error) {
    console.error(`Vectorize upsert failed for ${feedbackId}:`, error);
    // Don't fail entire processing if just Vectorize fails
  }
} else {
  console.log(`No embedding for ${feedbackId} (expected in local dev)`);
}
  
  // Update theme aggregates
  await updateThemeAggregates(tags, sentimentResult.score, urgency, env.DB);
  
  // Send urgent alert if needed
  if (urgency >= 9) {
    await sendUrgentAlert(feedbackId, content, urgency, env);
  }
  
  console.log(`Processing complete for ${feedbackId}`);
}

/**
 * Update theme aggregation table
 */
async function updateThemeAggregates(
  tags: string[],
  sentiment: number,
  urgency: number,
  db: D1Database
): Promise<void> {
  const now = Date.now();
  
  for (const tag of tags) {
    await db.prepare(`
      INSERT INTO themes (theme_name, count, avg_sentiment, avg_urgency, first_seen, last_seen)
      VALUES (?, 1, ?, ?, ?, ?)
      ON CONFLICT(theme_name) DO UPDATE SET
        count = count + 1,
        avg_sentiment = (avg_sentiment * count + ?) / (count + 1),
        avg_urgency = (avg_urgency * count + ?) / (count + 1),
        last_seen = ?
    `).bind(
      tag, sentiment, urgency, now, now,
      sentiment, urgency, now
    ).run();
  }
}

/**
 * Send urgent alert to Slack
 */
async function sendUrgentAlert(
  feedbackId: number,
  content: string,
  urgency: number,
  env: Env
): Promise<void> {
  // Check for recent similar alerts (deduplication)
  const recentSimilar = await env.DB.prepare(`
    SELECT id FROM feedback 
    WHERE urgency >= 9 
    AND processed_at > ? 
    AND content_hash IN (
      SELECT content_hash FROM feedback WHERE id = ?
    )
    AND id != ?
    LIMIT 1
  `).bind(
    Date.now() - (4 * 60 * 60 * 1000), // 4 hours
    feedbackId,
    feedbackId
  ).first();
  
  if (recentSimilar) {
    console.log(`Skipping duplicate urgent alert for ${feedbackId}`);
    return;
  }
  
  const priority = 10 - urgency; // P0 for urgency 10
  
  // Send to Slack (fire-and-forget)
  try {
    await fetch(env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `🚨 CRITICAL FEEDBACK (P${priority})`,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: `🚨 Critical Feedback Alert (P${priority})`
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Content:*\n${content.substring(0, 500)}${content.length > 500 ? '...' : ''}`
            }
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Urgency:* ${urgency}/10`
              },
              {
                type: 'mrkdwn',
                text: `*Feedback ID:* ${feedbackId}`
              }
            ]
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'View in Dashboard'
                },
                url: `${env.DASHBOARD_URL}/feedback/${feedbackId}`,
                style: 'danger'
              }
            ]
          }
        ]
      })
    });
    
    console.log(`Urgent alert sent for ${feedbackId}`);
  } catch (error) {
    console.error(`Failed to send urgent alert for ${feedbackId}:`, error);
  }
}
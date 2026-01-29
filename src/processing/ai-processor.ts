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
    console.log(`Triggering urgent alert for ${feedbackId}`);
    await sendUrgentAlert(feedbackId, content, urgency, env);
  } else {
    console.log(`No alert - urgency ${urgency} below threshold`);
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
  const priority = 10 - urgency;
  
  try {
    const response = await fetch(env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `🚨 **CRITICAL FEEDBACK ALERT (P${priority})**\n\n**Urgency:** ${urgency}/10\n**Content:** ${content.substring(0, 500)}\n**Feedback ID:** ${feedbackId}\n\n[View in Dashboard](${env.DASHBOARD_URL})`
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error(`Discord webhook failed:`, response.status, error);
    } else {
      console.log(`✅ Alert sent successfully for ${feedbackId}`);
    }
  } catch (error) {
    console.error(`Alert send failed:`, error);
  }
}
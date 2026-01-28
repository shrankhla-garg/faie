import { Env } from '../shared/types';

/**
 * Send daily summary to Slack
 */
export async function sendDailySummary(env: Env): Promise<void> {
  const yesterday = Date.now() - (24 * 60 * 60 * 1000);
  
  // Fetch stats for last 24 hours
  const stats = await env.DB.prepare(`
    SELECT 
      COUNT(*) as total,
      AVG(sentiment_score) as avg_sentiment,
      SUM(CASE WHEN urgency >= 8 THEN 1 ELSE 0 END) as urgent_count
    FROM feedback
    WHERE timestamp > ?
  `).bind(yesterday).first();
  
  // Top themes
  const themes = await env.DB.prepare(`
    SELECT 
      json_each.value as theme,
      COUNT(*) as count
    FROM feedback,
    json_each(tags)
    WHERE timestamp > ?
    GROUP BY theme
    ORDER BY count DESC
    LIMIT 5
  `).bind(yesterday).all();
  
  // Notable urgent items
  const urgent = await env.DB.prepare(`
    SELECT title, content, urgency
    FROM feedback
    WHERE urgency >= 8
    AND timestamp > ?
    ORDER BY urgency DESC
    LIMIT 3
  `).bind(yesterday).all();
  
  // Format message - Fix sentiment handling
  const themesList = themes.results
    .map((t: any, i: number) => `${i + 1}. ${t.theme} (${t.count} mentions)`)
    .join('\n');
  
  const urgentList = urgent.results.length > 0
    ? urgent.results
        .map((u: any, i: number) => `${i + 1}. [P${10 - u.urgency}] ${u.title || u.content.substring(0, 100)}`)
        .join('\n')
    : 'None';
  
  // ✅ Fix: Handle null/undefined sentiment properly
  const sentimentScore = typeof stats?.avg_sentiment === 'number' ? stats.avg_sentiment : 0.5;
  const sentimentEmoji = sentimentScore > 0.6 ? '😊' : 
                        sentimentScore > 0.4 ? '😐' : '😞';
  
  // ✅ Fix: Ensure we have valid numbers for all stats
  const totalFeedback = typeof stats?.total === 'number' ? stats.total : 0;
  const urgentCount = typeof stats?.urgent_count === 'number' ? stats.urgent_count : 0;
  
  // Send to Slack
  try {
    await fetch(env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '📊 Daily Feedback Summary'
            }
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Total Feedback:*\n${totalFeedback}`
              },
              {
                type: 'mrkdwn',
                text: `*Sentiment:*\n${sentimentEmoji} ${(sentimentScore * 100).toFixed(0)}%`
              },
              {
                type: 'mrkdwn',
                text: `*Critical Issues:*\n${urgentCount}`
              }
            ]
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*🏷️ Top Themes:*\n${themesList || 'None'}`
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*🚨 Urgent Items:*\n${urgentList}`
            }
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'Open Dashboard'
                },
                url: env.DASHBOARD_URL,
                style: 'primary'
              }
            ]
          }
        ]
      })
    });
    
    console.log('Daily summary sent');
  } catch (error) {
    console.error('Failed to send daily summary:', error);
  }
}

/**
 * Retry failed processing
 */
export async function retryFailedProcessing(env: Env): Promise<void> {
  // Dynamic import to avoid circular dependency
  const { processInBackground } = await import('../processing/ai-processor');
  
  // Find items that failed processing
  const failed = await env.DB.prepare(`
    SELECT id, content 
    FROM feedback 
    WHERE processing_error IS NOT NULL 
    AND retry_count < 3
    AND processed_at IS NULL
    LIMIT 20
  `).all();
  
  console.log(`Retrying ${failed.results.length} failed items`);
  
  for (const item of failed.results) {
    try {
      await processInBackground(item.id as number, item.content as string, env);
      console.log(`✓ Retry succeeded for feedback ${item.id}`);
    } catch (error) {
      console.error(`✗ Retry failed for feedback ${item.id}:`, error);
    }
  }
}
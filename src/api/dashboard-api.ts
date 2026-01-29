import { Env } from '../shared/types';
import { getCachedOrFetch } from './cache';

/**
 * Get aggregated themes
 */
export async function getThemes(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get('days') || '7');
  
  return getCachedOrFetch(
    `themes-${days}`,
    5 * 60, // 5 minute TTL
    async () => {
      const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
      
      const themes = await env.DB.prepare(`
        SELECT 
          theme_name,
          count,
          avg_sentiment,
          avg_urgency,
          last_seen
        FROM themes
        WHERE last_seen > ?
        ORDER BY count DESC
        LIMIT 20
      `).bind(cutoff).all();
      
      return themes.results;
    },
    request
  );
}

/**
 * Get urgent items
 */
export async function getUrgentItems(
  request: Request,
  env: Env
): Promise<Response> {
  return getCachedOrFetch(
    'urgent-items',
    60, // 1 minute TTL
    async () => {
      const cutoff = Date.now() - (24 * 60 * 60 * 1000);
      
      const urgent = await env.DB.prepare(`
        SELECT 
          id,
          source,
          title,
          content,
          author,
          url,
          urgency,
          sentiment,
          sentiment_score,
          tags,
          timestamp,
          processed_at
        FROM feedback
        WHERE urgency >= 8
        AND processed_at > ?
        ORDER BY urgency DESC, timestamp DESC
        LIMIT 50
      `).bind(cutoff).all();
      
      return urgent.results;
    },
    request
  );
}

/**
 * Semantic search using Vectorize
 */
export async function searchFeedback(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const query = url.searchParams.get('q');
  
  if (!query) {
    return Response.json({ error: 'Missing query parameter' }, { status: 400 });
  }
  
  try {
    const embeddingResult = await env.AI.run(
      '@cf/baai/bge-base-en-v1.5',
      { text: query }
    );
    
    const results = await env.VECTORIZE.query(embeddingResult.data[0], { topK: 20 });
    
    if (!results?.matches || results.matches.length === 0) {
      return Response.json([]);
    }
    
    const feedbackIds = results.matches.map(m => parseInt(m.id));
    const placeholders = feedbackIds.map(() => '?').join(',');
    
    const feedback = await env.DB.prepare(`
      SELECT id, source, title, content, author, url, urgency, sentiment, tags, timestamp
      FROM feedback
      WHERE id IN (${placeholders})
    `).bind(...feedbackIds).all();
    
    const enriched = feedback.results.map((item: any) => ({
      ...item,
      similarity: results.matches.find(m => parseInt(m.id) === item.id)?.score || 0
    }));
    
    enriched.sort((a, b) => b.similarity - a.similarity);
    
    return Response.json(enriched);
    
  } catch (error) {
    console.error('Search error:', error);
    return Response.json({ error: error.message || 'Search failed' }, { status: 500 });
  }
}

/**
 * Get dashboard statistics
 */
export async function getStats(
  request: Request,
  env: Env
): Promise<Response> {
  return getCachedOrFetch(
    'stats',
    15 * 60, // 15 minute TTL
    async () => {
      const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      
      // Total count (last 7 days)
      const total = await env.DB.prepare(
        'SELECT COUNT(*) as count FROM feedback WHERE timestamp > ?'
      ).bind(weekAgo).first();
      
      // By source (last 7 days)
      const bySource = await env.DB.prepare(`
        SELECT source, COUNT(*) as count 
        FROM feedback 
        WHERE timestamp > ?
        GROUP BY source
      `).bind(weekAgo).all();
      
      // Sentiment distribution (only processed items, last 7 days)
      const sentimentDist = await env.DB.prepare(`
        SELECT sentiment, COUNT(*) as count
        FROM feedback
        WHERE processed_at IS NOT NULL
        AND timestamp > ?
        GROUP BY sentiment
      `).bind(weekAgo).all();
      
      // Urgency distribution (only processed items, last 7 days)
      const urgencyDist = await env.DB.prepare(`
        SELECT 
          CASE 
            WHEN urgency >= 9 THEN 'critical'
            WHEN urgency >= 7 THEN 'high'
            WHEN urgency >= 5 THEN 'medium'
            ELSE 'low'
          END as level,
          COUNT(*) as count
        FROM feedback
        WHERE processed_at IS NOT NULL
        AND timestamp > ?
        GROUP BY level
      `).bind(weekAgo).all();
      
      // Top themes
      const topThemes = await env.DB.prepare(`
        SELECT theme_name, count
        FROM themes
        ORDER BY count DESC
        LIMIT 5
      `).all();
      
      // ✅ Processing health - ALL feedback items (not just last week)
      const processingHealth = await env.DB.prepare(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN processed_at IS NOT NULL THEN 1 ELSE 0 END) as processed,
          SUM(CASE WHEN processing_error IS NOT NULL THEN 1 ELSE 0 END) as failed
        FROM feedback
      `).first();
      
      return {
        total: total?.count || 0,
        by_source: bySource.results,
        sentiment: sentimentDist.results,
        urgency: urgencyDist.results,
        top_themes: topThemes.results,
        processing_health: {
          total: processingHealth?.total || 0,
          processed: processingHealth?.processed || 0,
          failed: processingHealth?.failed || 0
        }
      };
    },
    request
  );
}
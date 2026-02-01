import { Env } from '../shared/types';

export async function getThemes(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get('days') || '7');
  const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
  
  const themes = await env.DB.prepare(`
    SELECT theme_name, count
    FROM themes
    ORDER BY count DESC
    LIMIT 10
  `).all();
  
  return Response.json(themes.results);
}

export async function getUrgentItems(
  request: Request,
  env: Env
): Promise<Response> {
  const urgent = await env.DB.prepare(`
    SELECT 
      id, source, title, content, author, url,
      urgency, sentiment, sentiment_score, tags, timestamp
    FROM feedback
    WHERE urgency >= 8
    AND processed_at IS NOT NULL
    ORDER BY urgency DESC, timestamp DESC
    LIMIT 20
  `).all();
  
  return Response.json(urgent.results);
}

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
    const embeddingResult = await env.AI.run('@cf/baai/bge-base-en-v1.5', { text: query });
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
    const errorMessage = error instanceof Error ? error.message : 'Search failed';
    return Response.json({ error: errorMessage }, { status: 500 });
  }
}

// export async function getStats(
//   request: Request,
//   env: Env
// ): Promise<Response> {
//   const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  
//   const total = await env.DB.prepare('SELECT COUNT(*) as count FROM feedback WHERE timestamp > ?').bind(weekAgo).first();
//   const bySource = await env.DB.prepare('SELECT source, COUNT(*) as count FROM feedback WHERE timestamp > ? GROUP BY source').bind(weekAgo).all();
//   const sentimentDist = await env.DB.prepare('SELECT sentiment, COUNT(*) as count FROM feedback WHERE processed_at IS NOT NULL AND timestamp > ? GROUP BY sentiment').bind(weekAgo).all();
//   const urgencyDist = await env.DB.prepare(`
//     SELECT 
//       CASE 
//         WHEN urgency >= 9 THEN 'critical'
//         WHEN urgency >= 7 THEN 'high'
//         WHEN urgency >= 5 THEN 'medium'
//         ELSE 'low'
//       END as level,
//       COUNT(*) as count
//     FROM feedback
//     WHERE processed_at IS NOT NULL AND timestamp > ?
//     GROUP BY level
//   `).bind(weekAgo).all();
  
//   const topThemes = await env.DB.prepare('SELECT theme_name, count FROM themes ORDER BY count DESC LIMIT 5').all();
//   const processingHealth = await env.DB.prepare(`
//     SELECT 
//       COUNT(*) as total,
//       SUM(CASE WHEN processed_at IS NOT NULL THEN 1 ELSE 0 END) as processed,
//       SUM(CASE WHEN processing_error IS NOT NULL THEN 1 ELSE 0 END) as failed
//     FROM feedback
//   `).first();
  
//   // return Response.json({
//   //   total: total?.count || 0,
//   //   by_source: bySource.results,
//   //   sentiment: sentimentDist.results,
//   //   urgency: urgencyDist.results,
//   //   top_themes: topThemes.results,
//   //   processing_health: {
//   //     total: processingHealth?.total || 0,
//   //     processed: processingHealth?.processed || 0,
//   //     failed: processingHealth?.failed || 0
//   //   }
//   // });

//   return new Response(JSON.stringify({
//   total: total?.count || 0,
//   by_source: bySource.results,
//   sentiment: sentimentDist.results,
//   urgency: urgencyDist.results,
//   top_themes: topThemes.results,
//   processing_health: {
//     total: processingHealth?.total || 0,
//     processed: processingHealth?.processed || 0,
//     failed: processingHealth?.failed || 0
//   }
// }), {
//   headers: {
//     'Content-Type': 'application/json',
//     'Cache-Control': 'no-cache, no-store, must-revalidate'
//   }
// });
// }


export async function getStats(
  request: Request,
  env: Env
): Promise<Response> {
  const total = await env.DB.prepare('SELECT COUNT(*) as count FROM feedback').first();
  const bySource = await env.DB.prepare('SELECT source, COUNT(*) as count FROM feedback GROUP BY source').all();
  const sentimentDist = await env.DB.prepare('SELECT sentiment, COUNT(*) as count FROM feedback WHERE processed_at IS NOT NULL GROUP BY sentiment').all();
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
    GROUP BY level
  `).all();
  
  const topThemes = await env.DB.prepare('SELECT theme_name, count FROM themes ORDER BY count DESC LIMIT 5').all();
  const processingHealth = await env.DB.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN processed_at IS NOT NULL THEN 1 ELSE 0 END) as processed,
      SUM(CASE WHEN processing_error IS NOT NULL THEN 1 ELSE 0 END) as failed
    FROM feedback
  `).first();
  
  return new Response(JSON.stringify({
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
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });
}

export async function getAllFeedback(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const feedback = await env.DB.prepare(`
      SELECT 
        id, source, title, content, author, url,
        urgency, sentiment, sentiment_score, tags, timestamp
      FROM feedback
      WHERE processed_at IS NOT NULL
      ORDER BY timestamp DESC
      LIMIT 100
    `).all();
    
    return Response.json(feedback.results);
  } catch (error) {
    console.error('Get all feedback failed:', error);
    return Response.json({ error: 'Failed to fetch feedback' }, { status: 500 });
  }
}
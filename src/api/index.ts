import { Env } from '../shared/types';
import { getThemes, getUrgentItems, searchFeedback, getStats, getAllFeedback } from './dashboard-api';

export async function handleAPI(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-cache, no-store, must-revalidate'
  };
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  let response: Response;
  if (url.pathname === '/api/feedback') {
  response = await getAllFeedback(request, env);
  } else if (url.pathname === '/api/themes') {
    response = await getThemes(request, env);
  } else if (url.pathname === '/api/urgent') {
    response = await getUrgentItems(request, env);
  } else if (url.pathname === '/api/search') {
    response = await searchFeedback(request, env);
  } else if (url.pathname === '/api/stats') {
      response = await getStats(request, env);
  } else {
    response = new Response('Not Found', { status: 404 });
  }
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: {
      ...Object.fromEntries(response.headers),
      ...corsHeaders
    }
  });
}
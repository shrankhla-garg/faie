/**
 * Get cached response or fetch fresh data
 */
export async function getCachedOrFetch(
  cacheKey: string,
  ttlSeconds: number,
  fetchFn: () => Promise<any>,
  request: Request
): Promise<Response> {
  const cache = caches.default;
  const cacheUrl = new URL(request.url);
  cacheUrl.searchParams.set('cache_key', cacheKey);
  
  // Try cache first
  let response = await cache.match(cacheUrl.toString());
  
  if (!response) {
    // Cache miss - fetch fresh data
    const data = await fetchFn();
    response = Response.json(data);
    
    // Set cache headers
    response.headers.set('Cache-Control', `public, max-age=${ttlSeconds}`);
    
    // Store in cache
    await cache.put(cacheUrl.toString(), response.clone());
  }
  
  return response;
}
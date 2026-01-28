/**
 * Generate content hash for deduplication (async)
 */
export async function generateContentHash(content: string, source: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${source}:${content}`);
  
  const hash = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hash));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex.substring(0, 16);
}

/**
 * Truncate text to token limit (approximate)
 */
export function truncateToTokens(text: string, maxTokens: number): string {
  // Rough estimate: 1 token ≈ 4 characters
  const maxChars = maxTokens * 4;
  return text.length > maxChars ? text.substring(0, maxChars) : text;
}
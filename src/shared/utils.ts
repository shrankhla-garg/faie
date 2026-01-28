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
 * Verify GitHub webhook signature
 */
export async function verifyGitHubSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signed = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(payload)
  );
  
  const hash = Array.from(new Uint8Array(signed))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  return signature === `sha256=${hash}`;
}

/**
 * Verify Slack signature
 */
export async function verifySlackSignature(
  body: string,
  timestamp: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - (5 * 60);
  const ts = parseInt(timestamp);
  
  if (ts < fiveMinutesAgo) {
    return false; // Replay attack protection
  }
  
  const baseString = `v0:${timestamp}:${body}`;
  const encoder = new TextEncoder();
  
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signed = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(baseString)
  );
  
  const hash = Array.from(new Uint8Array(signed))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  return signature === `v0=${hash}`;
}

/**
 * Truncate text to token limit (approximate)
 */
export function truncateToTokens(text: string, maxTokens: number): string {
  // Rough estimate: 1 token ≈ 4 characters
  const maxChars = maxTokens * 4;
  return text.length > maxChars ? text.substring(0, maxChars) : text;
}
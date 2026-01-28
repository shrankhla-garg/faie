import { truncateToTokens } from '../shared/utils';

/**
 * Analyze sentiment using Workers AI
 */
export async function analyzeSentiment(
  content: string,
  ai: any
): Promise<{ sentiment: string; score: number }> {
  try {
    const result = await ai.run(
      '@cf/huggingface/distilbert-sst-2-int8',
      { text: truncateToTokens(content, 512) }
    );
    
    const topResult = result[0];
    
    return {
      sentiment: topResult.label.toLowerCase(),
      score: topResult.score
    };
  } catch (error) {
    console.error('Sentiment analysis failed:', error);
    return { sentiment: 'neutral', score: 0.5 };
  }
}

/**
 * Analyze urgency using Workers AI
 */
export async function analyzeUrgency(
  content: string,
  ai: any
): Promise<number> {
  try {
    const result = await ai.run(
      '@cf/meta/llama-3-8b-instruct',
      {
        messages: [
          {
            role: 'system',
            content: `You are a product feedback classifier. Rate urgency from 1-10:
              - 9-10: Critical bugs, production outages, data loss, security issues
              - 7-8: Major bugs, significant performance issues, broken features
              - 5-6: Minor bugs, feature requests from customers, usability issues
              - 3-4: Enhancement requests, nice-to-haves, documentation
              - 1-2: Questions, praise, general feedback
              
              Respond with ONLY a single integer from 1-10.`
          },
          {
            role: 'user',
            content: truncateToTokens(content, 1000)
          }
        ]
      }
    );
    
    const urgency = parseInt(result.response.trim());
    
    if (isNaN(urgency) || urgency < 1 || urgency > 10) {
      return 5; // Default to medium
    }
    
    return urgency;
  } catch (error) {
    console.error('Urgency analysis failed:', error);
    return 5;
  }
}

/**
 * Extract tags/themes using Workers AI
 */
export async function extractTags(
  content: string,
  ai: any
): Promise<string[]> {
  try {
    const result = await ai.run(
      '@cf/meta/llama-3-8b-instruct',
      {
        messages: [
          {
            role: 'system',
            content: `Extract 2-4 product themes/tags from the feedback.
              Return ONLY a JSON array of lowercase strings.
              Example: ["authentication", "performance", "ui-ux"]
              
              Common themes: authentication, performance, ui-ux, billing, 
              api, documentation, mobile, deployment, security, integration, 
              database, search, notifications, analytics, export`
          },
          {
            role: 'user',
            content: truncateToTokens(content, 1000)
          }
        ]
      }
    );
    
    const cleaned = result.response.replace(/```json|```/g, '').trim();
    const tags = JSON.parse(cleaned);
    
    if (!Array.isArray(tags)) {
      return ['general'];
    }
    
    return tags
      .filter((tag: any) => typeof tag === 'string')
      .map((tag: string) => tag.toLowerCase().trim())
      .slice(0, 5);
      
  } catch (error) {
    console.error('Tag extraction failed:', error);
    return ['general'];
  }
}

/**
 * Generate embedding vector using Workers AI
 */
export async function generateEmbedding(
  content: string,
  ai: any
): Promise<number[] | null> {
  try {
    const result = await ai.run(
      '@cf/baai/bge-base-en-v1.5',
      { text: truncateToTokens(content, 512) }
    );
    
    return result.data[0];
  } catch (error) {
    console.error('Embedding generation failed:', error);
    return null;
  }
}
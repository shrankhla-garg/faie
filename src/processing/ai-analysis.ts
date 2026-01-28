import { truncateToTokens } from '../shared/utils';

/**
 * Analyze sentiment using Workers AI (with local mock fallback)
 */
export async function analyzeSentiment(
  content: string,
  ai: any
): Promise<{ sentiment: string; score: number }> {
  // Local dev fallback
  if (!ai) {
    console.log('ℹ️  Using mock sentiment analysis (local dev)');
    const lowerContent = content.toLowerCase();
    
    if (lowerContent.includes('love') || lowerContent.includes('great') || 
        lowerContent.includes('amazing') || lowerContent.includes('excellent') ||
        lowerContent.includes('thank') || lowerContent.includes('appreciate')) {
      return { sentiment: 'positive', score: 0.85 };
    }
    
    if (lowerContent.includes('suck') || lowerContent.includes('broken') || 
        lowerContent.includes('terrible') || lowerContent.includes('worst') ||
        lowerContent.includes('hate') || lowerContent.includes('!!!')) {
      return { sentiment: 'negative', score: 0.15 };
    }
    
    return { sentiment: 'neutral', score: 0.5 };
  }
  
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
 * Analyze urgency using Workers AI (with local mock fallback)
 */
export async function analyzeUrgency(
  content: string,
  ai: any
): Promise<number> {
  // Local dev fallback
  if (!ai) {
    console.log('ℹ️  Using mock urgency analysis (local dev)');
    const lowerContent = content.toLowerCase();
    
    // Critical keywords
    if (lowerContent.includes('down!!!') || lowerContent.includes('completely offline') ||
        lowerContent.includes('production') && lowerContent.includes('broken') ||
        lowerContent.includes('data loss') || lowerContent.includes('security') ||
        lowerContent.includes('payment') && lowerContent.includes('fail')) {
      return 10;
    }
    
    // High priority
    if (lowerContent.includes('broken') || lowerContent.includes('not working') ||
        lowerContent.includes('critical') || lowerContent.includes('urgent') ||
        lowerContent.includes('asap') || lowerContent.includes('!!!')) {
      return 8;
    }
    
    // Medium priority
    if (lowerContent.includes('bug') || lowerContent.includes('error') ||
        lowerContent.includes('issue') || lowerContent.includes('problem') ||
        lowerContent.includes('slow')) {
      return 6;
    }
    
    // Feature requests
    if (lowerContent.includes('would be') || lowerContent.includes('could you') ||
        lowerContent.includes('feature') || lowerContent.includes('please add') ||
        lowerContent.includes('suggestion')) {
      return 4;
    }
    
    // Questions
    if (lowerContent.includes('how do') || lowerContent.includes('how to') ||
        lowerContent.includes('?') && lowerContent.length < 200) {
      return 3;
    }
    
    // Positive feedback
    if (lowerContent.includes('love') || lowerContent.includes('great') ||
        lowerContent.includes('amazing') || lowerContent.includes('thank')) {
      return 1;
    }
    
    return 5; // Default
  }
  
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
      return 5;
    }
    
    return urgency;
  } catch (error) {
    console.error('Urgency analysis failed:', error);
    return 5;
  }
}

/**
 * Extract tags/themes using Workers AI (with local mock fallback)
 */
export async function extractTags(
  content: string,
  ai: any
): Promise<string[]> {
  // Local dev fallback
  if (!ai) {
    console.log('ℹ️  Using mock tag extraction (local dev)');
    const lowerContent = content.toLowerCase();
    const tags: string[] = [];
    
    // Authentication & Login
    if (lowerContent.includes('login') || lowerContent.includes('password') || 
        lowerContent.includes('auth') || lowerContent.includes('sign in') ||
        lowerContent.includes('log in')) {
      tags.push('authentication');
    }
    
    // Performance
    if (lowerContent.includes('slow') || lowerContent.includes('performance') || 
        lowerContent.includes('loading') || lowerContent.includes('speed') ||
        lowerContent.includes('lag') || lowerContent.includes('timeout')) {
      tags.push('performance');
    }
    
    // UI/UX
    if (lowerContent.includes('ui') || lowerContent.includes('ux') || 
        lowerContent.includes('design') || lowerContent.includes('button') ||
        lowerContent.includes('interface') || lowerContent.includes('layout')) {
      tags.push('ui-ux');
    }
    
    // API
    if (lowerContent.includes('api') || lowerContent.includes('integration') ||
        lowerContent.includes('endpoint') || lowerContent.includes('cors')) {
      tags.push('api');
    }
    
    // Export
    if (lowerContent.includes('export') || lowerContent.includes('csv') || 
        lowerContent.includes('download') || lowerContent.includes('excel')) {
      tags.push('export');
    }
    
    // Search
    if (lowerContent.includes('search') || lowerContent.includes('find') ||
        lowerContent.includes('filter')) {
      tags.push('search');
    }
    
    // Mobile
    if (lowerContent.includes('mobile') || lowerContent.includes('app') ||
        lowerContent.includes('ios') || lowerContent.includes('android')) {
      tags.push('mobile');
    }
    
    // Security
    if (lowerContent.includes('security') || lowerContent.includes('vulnerability') ||
        lowerContent.includes('hack') || lowerContent.includes('breach')) {
      tags.push('security');
    }
    
    // Email/Notifications
    if (lowerContent.includes('email') || lowerContent.includes('notification') ||
        lowerContent.includes('alert')) {
      tags.push('notifications');
    }
    
    // Dashboard
    if (lowerContent.includes('dashboard') || lowerContent.includes('analytics') ||
        lowerContent.includes('report')) {
      tags.push('dashboard');
    }
    
    // Database
    if (lowerContent.includes('database') || lowerContent.includes('data') ||
        lowerContent.includes('query')) {
      tags.push('database');
    }
    
    // Billing
    if (lowerContent.includes('billing') || lowerContent.includes('payment') ||
        lowerContent.includes('invoice') || lowerContent.includes('charge')) {
      tags.push('billing');
    }
    
    return tags.length > 0 ? tags.slice(0, 4) : ['general'];
  }
  
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
 * Generate embedding vector using Workers AI (with local mock fallback)
 */
export async function generateEmbedding(
  content: string,
  ai: any
): Promise<number[] | null> {
  // Local dev - skip embeddings but don't fail
  if (!ai) {
    console.log('ℹ️  Skipping embedding generation (local dev - not needed)');
    return null;
  }
  
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
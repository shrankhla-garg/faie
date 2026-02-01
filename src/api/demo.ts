import { Env } from '../shared/types';
import { processInBackground } from '../processing/ai-processor';

export async function handleDemoReset(
  request: Request,
  env: Env
): Promise<Response> {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return new Response('Method not allowed', { 
      status: 405,
      headers: corsHeaders 
    });
  }

  try {
    await env.DB.prepare('DELETE FROM feedback').run();
    await env.DB.prepare('DELETE FROM themes').run();
    
    const mockData = MOCK_FEEDBACK_DATA;
    
    // Just insert - NO processing
    for (let i = 0; i < mockData.length; i++) {
      const feedback = mockData[i];
      const timestamp = Date.now() - (Math.floor(Math.random() * 30) * 24 * 60 * 60 * 1000);
      
      await env.DB.prepare(`
        INSERT INTO feedback (
          source, external_id, title, content, author, 
          timestamp, raw_json, content_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        feedback.source_hint || 'support',
        `demo-${i}`,
        feedback.title || null,
        feedback.content,
        `demo${i}@example.com`,
        timestamp,
        JSON.stringify({ demo: true }),
        `demo-hash-${i}`
      ).run();
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Inserted ${mockData.length} items. Processing will start in 1 minute via scheduled worker.`,
      totalItems: mockData.length
    }), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage 
    }), { 
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
}

const MOCK_FEEDBACK_DATA = [
  // URGENT (2 items) - Will trigger alerts
  { content: "EVERYTHING IS DOWN!!!! Production database completely offline, all users affected", source_hint: "slack", title: "CRITICAL OUTAGE" },
  { content: "Payment processing failing for ALL customers. Been down for 2 hours. Losing revenue!", source_hint: "support", title: "Payment System Down" },
  
  // Authentication (2 items)
  { content: "u guys suck the login is broke again... like seriously how many times do we have to report this", source_hint: "slack", title: "Login Issues Again" },
  { content: "Login button doesn't work when I click it. Tried Chrome, Firefox, Safari - same issue everywhere.", source_hint: "github", title: "Login button unresponsive" },
  
  // Performance (2 items)
  { content: "Dashboard takes like 45 seconds to load now, used to be instant. This is super annoying", source_hint: "support", title: "Dashboard extremely slow" },
  { content: "Search function has been broken since yesterday's deploy. Returns 0 results even for exact matches.", source_hint: "github", title: "Search not returning results" },
  
  // Feature Requests (2 items)
  { content: "Would love to be able to select multiple items and delete them at once. Right now I have to click 50 times.", source_hint: "support", title: "Bulk delete feature request" },
  { content: "can we get keyboard shortcuts for common actions? like ctrl+s to save, ctrl+n for new item, etc", source_hint: "github", title: "" },
  
  // Positive Feedback (2 items)
  { content: "Love the new design! So much cleaner and easier to use. Great work team! 🎉", source_hint: "support", title: "Love the new design!" },
  { content: "shoutout to sarah from support - she helped me debug my integration issue in like 10 minutes. super helpful!", source_hint: "slack", title: "" },
  
  // Security (1 item)
  { content: "I can see other users' data in the API response if I change the user_id parameter. This seems like a serious security flaw.", source_hint: "github", title: "Security vulnerability found" },
  
  // UI/UX (1 item)
  { content: "The notification bell shows wrong count. Says I have 12 notifications but only 3 are actually there when I click.", source_hint: "slack", title: "Notification count incorrect" }
];
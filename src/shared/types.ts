// Normalized feedback item from any source
export interface FeedbackItem {
  source: 'github' | 'slack' | 'support';
  external_id?: string;
  title?: string;
  content: string;
  author?: string;
  url?: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

// AI enrichment results
export interface Enrichment {
  sentiment: 'positive' | 'negative' | 'neutral';
  sentiment_score: number;
  urgency: number;  // 1-10
  tags: string[];
}

// Complete stored record
export interface StoredFeedback extends FeedbackItem {
  id: number;
  raw_json: string;
  content_hash: string;
  processed_at?: number;
  processing_error?: string;
  retry_count: number;
  sentiment?: string;
  sentiment_score?: number;
  urgency?: number;
  tags?: string;
}

// Environment bindings
export interface Env {
  DB: D1Database;
  AI: any;
  VECTORIZE: VectorizeIndex;
  SLACK_WEBHOOK_URL: string;
  SUPPORT_API_KEY: string;
  DASHBOARD_URL: string;
}
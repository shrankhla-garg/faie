-- Main feedback table
CREATE TABLE feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Core fields (normalized)
  source TEXT NOT NULL,
  external_id TEXT,
  title TEXT,
  content TEXT NOT NULL,
  author TEXT,
  url TEXT,
  timestamp INTEGER NOT NULL,
  
  -- Audit trail
  raw_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  
  -- Enrichment fields (filled by processing)
  sentiment TEXT,
  sentiment_score REAL,
  urgency INTEGER,
  tags TEXT, -- JSON array
  
  -- Processing metadata
  processed_at INTEGER,
  processing_error TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  
  -- Idempotency constraint
  UNIQUE(source, external_id)
);

-- Theme aggregation table
CREATE TABLE themes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  theme_name TEXT UNIQUE NOT NULL,
  count INTEGER DEFAULT 1,
  avg_sentiment REAL,
  avg_urgency REAL,
  first_seen INTEGER,
  last_seen INTEGER
);

-- Performance indexes
CREATE INDEX idx_feedback_urgency ON feedback(urgency DESC, timestamp DESC);
CREATE INDEX idx_feedback_processed ON feedback(processed_at DESC);
CREATE INDEX idx_feedback_source ON feedback(source, timestamp DESC);
CREATE INDEX idx_feedback_hash ON feedback(content_hash);
CREATE INDEX idx_feedback_retry ON feedback(processing_error, retry_count, processed_at);
CREATE INDEX idx_themes_count ON themes(count DESC);
# FAIE - Feedback Aggregator Insights Engine 🎯

**AI-Powered Feedback Intelligence Platform built on Cloudflare's Edge**

FAIE automatically aggregates, analyzes, and prioritizes customer feedback from multiple sources using AI, helping product teams focus on what matters most.


---

## 🚀 Features

### **AI-Powered Analysis**
- **Sentiment Detection**: Automatically classifies feedback as positive, negative, or neutral
- **Smart Urgency Scoring**: Rates priority from 1-10 (P0-P4) based on content severity
- **Theme Extraction**: Identifies product areas (authentication, performance, UI/UX, etc.)
- **Semantic Embeddings**: Generates 768-dimensional vectors for similarity search

### **Intelligent Insights**
- **Semantic Search**: Find related feedback using natural language (e.g., "login problems" finds "authentication failure", "can't sign in")
- **Theme Clustering**: Automatically groups feedback by product area
- **Duplicate Detection**: Identifies similar issues despite different wording
- **Trend Analysis**: Track sentiment and urgency over time

### **Real-Time Alerts**
- **Instant Notifications**: Critical issues (P0/P1) trigger Discord/Slack alerts within seconds
- **Priority-Based Routing**: Urgent items bypass queues for immediate attention
- **Smart Deduplication**: Prevents alert spam for similar issues

### **Developer Experience**
- **One-Click Demo**: Reset button generates realistic test data instantly
- **Interactive Dashboard**: Click themes to explore related feedback
- **Live Processing**: Watch AI analysis happen in real-time
- **Global Edge Deployment**: <50ms latency worldwide

---

## 🏗️ Architecture

Built entirely on **Cloudflare's serverless edge platform**:
```
┌─────────────────────────────────────────────────────────────────┐
│                      FEEDBACK SOURCES                            │
│              GitHub Issues | Slack Messages | Support Tickets    │
└───────────────────────────┬─────────────────────────────────────┘
                            │ Webhooks
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                   CLOUDFLARE WORKERS                             │
│                    Ingestion + Validation                        │
└───────────────────────────┬─────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      D1 DATABASE                                 │
│              Store raw feedback + metadata                       │
└───────────────────────────┬─────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│              WORKERS AI - Parallel Processing                    │
│                     (2-5 seconds total)                          │
│                                                                  │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │
│   │  Sentiment  │  │   Urgency   │  │    Theme    │           │
│   │  Analysis   │  │   Scoring   │  │ Extraction  │           │
│   │ DistilBERT  │  │  Llama 3    │  │  Llama 3    │           │
│   └─────────────┘  └─────────────┘  └─────────────┘           │
│                                                                  │
│                    ┌─────────────┐                              │
│                    │  Embedding  │                              │
│                    │ Generation  │                              │
│                    │  BGE-base   │                              │
│                    └─────────────┘                              │
└────────────────────────┬────────────────────┬───────────────────┘
                         │                    │
                         ▼                    ▼
        ┌────────────────────────┐  ┌──────────────────────┐
        │     D1 DATABASE        │  │     VECTORIZE        │
        │  Update enrichment     │  │  Store 768-dim       │
        │  - sentiment           │  │  vectors for         │
        │  - urgency             │  │  semantic search     │
        │  - tags                │  │                      │
        └────────────────────────┘  └──────────────────────┘
                         │
                         │ If urgency ≥ 9
                         ▼
                ┌─────────────────┐
                │ Discord/Slack   │
                │ Real-time Alert │
                └─────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                   CLOUDFLARE PAGES                               │
│           Interactive Dashboard with Semantic Search             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Compute** | Cloudflare Workers | API endpoints, webhooks, async processing |
| **Database** | D1 (SQLite) | Structured feedback storage with ACID guarantees |
| **AI/ML** | Workers AI | Sentiment analysis, urgency scoring, embeddings |
| **Vector DB** | Vectorize | Semantic similarity search (cosine distance) |
| **Frontend** | Cloudflare Pages | Static dashboard with live updates |
| **Notifications** | Discord/Slack Webhooks | Real-time critical alerts |

**AI Models Used:**
- `@cf/huggingface/distilbert-sst-2-int8` - Sentiment classification
- `@cf/meta/llama-3-8b-instruct` - Urgency scoring & theme extraction
- `@cf/baai/bge-base-en-v1.5` - 768-dimensional embeddings

---



## 🎮 Usage

### Demo Mode (Quickstart)
1. Visit the dashboard
2. Click **"🎬 DEMO RESET"** button
3. Wait 60 seconds for AI processing
4. Explore features:
   - View urgent items by priority (P0-P4)
   - Click themes to see related feedback
   - Try semantic search: "login problems", "slow performance"
   - Check Discord for critical alerts


## 🎯 Key Features Explained

### Semantic Search
Traditional keyword search fails when users describe the same issue differently:
- ❌ Search "login broken" → misses "authentication failure", "can't sign in"
- ✅ Semantic search understands **meaning**, not just keywords

**How it works:**
1. User query → converted to 768-dim embedding
2. Vectorize finds similar embeddings using cosine similarity
3. Returns ranked results by relevance (even with different wording!)

### Smart Urgency Scoring
AI analyzes content to determine priority:
- **P0 (9-10)**: "Production down", "data loss", "security breach"
- **P1 (7-8)**: "Major bug", "broken feature", "all users affected"
- **P2 (5-6)**: "Minor bug", "feature request from customer"
- **P3 (3-4)**: "Nice-to-have", "documentation unclear"
- **P4 (1-2)**: "Question", "positive feedback"

### Theme Extraction
Automatically categorizes feedback without manual tagging:
- Identifies product areas: `authentication`, `performance`, `ui-ux`
- Groups similar issues for trend analysis
- Updates in real-time as new feedback arrives

---

## 📊 Performance

- **Processing Speed**: 2-5 seconds per feedback item (parallel AI calls)
- **Latency**: <50ms API response (edge caching)
- **Scalability**: 100K+ requests/day on free tier
- **Availability**: 99.9%+ uptime (Cloudflare's global network)


---



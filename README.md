# Stoic — AI Search & Chat Backend

Node.js/Express backend powering **Stoic**, an AI answer engine that combines live web search, file understanding, and long-term memory to deliver grounded, cited responses.

> Frontend: [Rakesh051204-cloud9-frontend](https://github.com/Rakesh051204/Rakesh051204-cloud9-frontend)

## What it does

Stoic answers questions using real-time web search, retrieval-augmented generation, and persistent memory — built entirely from scratch, self-hosted end to end.

- **Conversational AI** with streaming responses (SSE)
- **Real-time web search** via a self-hosted SearXNG instance (Docker)
- **File understanding** — images, PDFs, DOCX, audio, and video, including vision-model analysis of uploaded images
- **Long-term memory** — conversation history embedded and retrieved via pgvector for context-aware follow-ups
- **Multi-query RAG pipeline** — semantic chunking and retrieval for grounded, accurate answers

## Architecture

```
Client (React/Vite)
      │  SSE stream
      ▼
Express API  ──►  Groq (LLM inference)
      │        ──►  SearXNG (self-hosted web search)
      │        ──►  Supabase + pgvector (embeddings & memory)
      └──►  Multer + FFmpeg (file/media processing)
```

## Tech Stack

| Layer | Tech |
|---|---|
| Server | Node.js, Express |
| LLM Inference | Groq (chat + vision models) |
| Web Search | SearXNG (self-hosted, Docker) |
| Vector Memory | Supabase + pgvector (HNSW indexing) |
| Embeddings | Voyage AI |
| File Processing | Multer, FFmpeg, pdf-parse, mammoth (DOCX) |
| Streaming | Server-Sent Events (SSE) |

## Key Features

- **Semantic chunking & RAG** (`chunker.js`) for grounded, cited answers
- **Vision model integration** for analyzing uploaded images
- **GitHub OAuth connector system** for authenticated integrations
- **Conversation memory service** with automatic summarization for long threads
- **Location & language intent detection** for context-aware responses

## Running Locally

```bash
npm install
cp .env.example .env   # add your Groq, Supabase, and Voyage AI keys
npm start
```

Requires a running SearXNG instance (see `services/searxng-docker/`) for web search functionality.

## Environment Variables

```
GROQ_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
TAVILY_API_KEY=       # optional, legacy search provider
GNEWS_API_KEY=        # optional, for Discover/news tab
```

---

Built by [Rakesh Palani](https://github.com/Rakesh051204) — part of a broader portfolio of AI-powered products.

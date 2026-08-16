\# Stoic — AI Search \& Chat Backend



Node.js/Express backend powering \*\*Stoic\*\*, a Perplexity/ChatGPT-style AI answer engine with real-time web search, file understanding, and long-term memory.



> Frontend: \[Rakesh051204-cloud9-frontend](https://github.com/Rakesh051204/Rakesh051204-cloud9-frontend)



\## What it does



Stoic combines LLM inference with live web search and persistent memory to answer questions with cited, up-to-date sources — similar to Perplexity, but self-hosted and fully custom-built.



\- \*\*Conversational AI\*\* with streaming responses (SSE)

\- \*\*Real-time web search\*\* via a self-hosted SearXNG instance (Docker)

\- \*\*File understanding\*\* — images, PDFs, DOCX, audio, and video, including vision-model analysis of uploaded images

\- \*\*Long-term memory\*\* — conversation history embedded and retrieved via pgvector for context-aware follow-ups

\- \*\*Multi-query RAG pipeline\*\* — semantic chunking and retrieval for grounded, accurate answers



\## Architecture



```

Client (React/Vite)

&#x20;     │  SSE stream

&#x20;     ▼

Express API  ──►  Groq (LLM inference)

&#x20;     │        ──►  SearXNG (self-hosted web search)

&#x20;     │        ──►  Supabase + pgvector (embeddings \& memory)

&#x20;     └──►  Multer + FFmpeg (file/media processing)

```



\## Tech Stack



| Layer | Tech |

|---|---|

| Server | Node.js, Express |

| LLM Inference | Groq (chat + vision models) |

| Web Search | SearXNG (self-hosted, Docker) |

| Vector Memory | Supabase + pgvector (HNSW indexing) |

| Embeddings | Voyage AI |

| File Processing | Multer, FFmpeg, pdf-parse, mammoth (DOCX) |

| Streaming | Server-Sent Events (SSE) |



\## Key Features



\- \*\*Semantic chunking \& RAG\*\* (`chunker.js`) for grounded, cited answers

\- \*\*Vision model integration\*\* for analyzing uploaded images

\- \*\*GitHub OAuth connector system\*\* for authenticated integrations

\- \*\*Conversation memory service\*\* with automatic summarization for long threads

\- \*\*Location \& language intent detection\*\* for context-aware responses



\## Running Locally



```bash

npm install

cp .env.example .env   # add your Groq, Supabase, and Voyage AI keys

npm start

```



Requires a running SearXNG instance (see `services/searxng-docker/`) for web search functionality.



\## Environment Variables



```

GROQ\_API\_KEY=

SUPABASE\_URL=

SUPABASE\_SERVICE\_KEY=

TAVILY\_API\_KEY=       # optional, legacy search provider

GNEWS\_API\_KEY=        # optional, for Discover/news tab

```



\---



Built by \[Rakesh Palani](https://github.com/Rakesh051204) — part of a broader portfolio of AI-powered products.


# Maxis Customer Service Chatbot

A voice-enabled customer service chatbot for Maxis. Supports English (en-MY) and Bahasa Melayu speech recognition, crawls all live Maxis FAQ article pages at startup, and answers questions using a local BM25 search engine — **no AI API, no billing, no API key required.**

---

## Local Development

1. **Clone the repo**
   ```bash
   git clone <your-repo-url>
   cd maxischatbot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the server**
   ```bash
   node server.js
   ```
   > No `.env` or API key needed — the app runs entirely for free.

4. **Open in browser**
   ```
   http://localhost:3000
   ```
   > Use **Chrome or Edge** — Web Speech API is not supported in Firefox.

---

## GitHub Deployment (Vercel + Railway)

### Backend — Railway

1. Push your code to GitHub (`.env` and `node_modules` are gitignored).
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**.
3. Select your repository.
4. Railway will auto-deploy and give you a public URL (e.g. `https://maxischatbot-production.up.railway.app`).
   > No environment variables needed.

### Frontend — Vercel

5. Open `vercel.json` and replace `YOUR_RAILWAY_URL` with your actual Railway URL:
   ```json
   { "source": "/api/(.*)", "destination": "https://maxischatbot-production.up.railway.app/api/$1" }
   ```
6. Commit and push the updated `vercel.json`.
7. Go to [vercel.com](https://vercel.com) → **New Project** → **Import GitHub repo** → deploy.
8. Vercel will give you a public URL for your chatbot.

### Auto-redeploy

Every future `git push` to `main` automatically redeploys both Railway (backend) and Vercel (frontend).

---

## Project Structure

```
/project
├── /public
│   └── index.html      ← Single-page frontend (vanilla HTML/CSS/JS + Web Speech API)
├── server.js           ← Express backend + BM25 search engine
├── scraper.js          ← Full-site crawler (Axios + Cheerio) + 22-entry fallback FAQ
├── .env                ← Reserved for future use — never committed
├── .gitignore
├── package.json
├── vercel.json         ← Vercel rewrite config
└── README.md
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/status` | Returns `{ ready: bool, entries: number }` — crawler status |
| `POST` | `/api/chat`   | Body: `{ userMessage: string }` → Returns `{ reply: string }` |

---

## How It Works

### 1. Startup — Full-Site FAQ Crawling

`scraper.js` auto-discovers and crawls **every** Maxis FAQ article page in two steps:

**Step 1 — Discover all FAQ URLs**
Every Maxis FAQ article page embeds the complete site navigation tree in a `data-navigation` HTML attribute as JSON. The scraper fetches one seed page (`/en/faq/products-services/mobile/postpaid`), parses this attribute (HTML entity decoded), and recursively extracts all `/faq/` paths — currently **205 URLs**.

**Step 2 — Parallel crawl**
All 205 URLs are fetched in parallel batches of 10. Individual article pages render Q&A in server-side HTML (no JS execution required), extracted using confirmed CSS selectors:
- Question: `li.cmp-faq-content-space--qna h2`
- Answer: `li.cmp-faq-content-space--qna .cmp-faq-content-space--content`

**Quality pass**
After merging live entries with the fallback:
1. **Fragment filter** — entries with answers shorter than 60 characters are removed (eliminates one-liner fragments scraped from multi-step instruction lists).
2. **Deduplication** — if the same question appears on multiple pages, only the longest (most complete) answer is kept.

**Typical startup output:**
```
[Scraper] Discovered 205 FAQ URLs from navigation tree.
[Scraper] Crawled 205 pages — 176 had Q&A — 1862 total pairs.
[FAQ] 1862 live + 22 fallback-only entries = 1884 total.
[FAQ] Quality pass: 1884 → 1558 entries (removed 326 fragments/dupes).
[BM25] Index built: 4445 unique terms, avgDocLen=48.2, across 1558 entries.
```

A 22-entry hardcoded fallback FAQ acts as a safety net for common queries (billing, plan changes, SIM replacement, etc.) in case the live crawl fails or a topic is missing from the live site.

### 2. BM25 Search Engine

When a user asks a question, `server.js` finds the best matching FAQ entry using **BM25** (Best Match 25), the industry-standard ranking algorithm used by search engines like Elasticsearch and Solr.

**Why BM25 over raw TF-IDF?**
Plain TF-IDF normalises by total document length, which gives very short answers (fragments like "Delete the eSIM profile first!") an artificially high score for matching one keyword. BM25 fixes this with two mechanisms:
- **Term saturation (k₁ = 1.5)** — repeated occurrences of a term have diminishing returns. The first hit matters most.
- **Length normalisation (b = 0.75)** — documents are scored relative to the average document length (≈48 weighted tokens). Short fragments are penalised; long, comprehensive answers are fairly rewarded.

**Pipeline:**

1. **Tokenise** — strip punctuation, lowercase, remove stopwords ("how", "do", "I", "the", etc.).
2. **Synonym expansion** — 30+ synonym groups map related terms. E.g. "internet" also searches for "data", "bandwidth", "quota"; "late" also searches for "overdue", "unpaid", "missed"; "charge" also searches for "fee", "penalty", "fine". Synonym-matched terms contribute at 0.4× weight to boost recall without overriding exact matches.
3. **Field weighting** — a keyword match in the question text counts 3× more than in the answer text, since the question is a dense summary of the entry's topic.
4. **BM25 scoring** — entries are ranked by score; the top entry's answer is returned.
5. **Zero-match fallback** — if no entry scores above zero, the bot directs the user to call **1800-82-1234**.

### 3. Voice & Chat UI

- The browser's **Web Speech API** transcribes speech to text in real time (no external STT service, no cost).
- Transcribed text is POSTed to `/api/chat` and the reply is rendered as a chat bubble.
- Supports **English (en-MY)** and **Bahasa Melayu (ms-MY)** via a language selector.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML + CSS + JS, Web Speech API |
| Backend | Node.js + Express |
| Crawling | Axios + Cheerio — full auto-discovery via `data-navigation` sitemap attribute |
| Search | BM25 with field weighting and synonym expansion (no external API) |
| Deployment | Railway (backend) + Vercel (frontend) |

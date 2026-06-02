# Maxis Customer Service Chatbot

A voice-enabled customer service chatbot for Maxis. Supports English (en-MY) and Bahasa Melayu speech recognition, crawls live Maxis FAQ article pages at startup, and answers questions using a local TF-IDF search engine — **no AI API, no billing, no API key required.**

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
├── server.js           ← Express backend + TF-IDF search engine
├── scraper.js          ← BFS crawler (Axios + Cheerio) + 36-entry fallback FAQ
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

### 1. Startup — FAQ Crawling
`scraper.js` runs a BFS (breadth-first) crawler across Maxis FAQ article pages:

- The main `/en/faq/` page is a JavaScript-rendered SPA — Axios cannot extract its content.
- Individual article pages (e.g. `/en/faq/products-services/roaming-and-idd/international-roaming.html`) render Q&A content in plain server-side HTML.
- The crawler starts from 6 known seed URLs, fetches them in parallel, extracts Q&A pairs using confirmed selectors (`li.cmp-faq-content-space--qna`), then follows any new `/en/faq/` links discovered on each page.
- Typically crawls ~6 pages in ~4 seconds and extracts **114+ real Q&A pairs** from the live Maxis website.
- A 36-entry hardcoded fallback FAQ covers topics not found on the crawled pages (billing, account management, SIM, etc.).
- Final index: **~150 entries**, rebuilt on every server start.

### 2. TF-IDF Search Engine
When a user asks a question, `server.js` finds the best matching FAQ entry using TF-IDF (Term Frequency–Inverse Document Frequency):

- **Tokenise** — strip punctuation, lowercase, remove stopwords ("how", "do", "I", "the", etc.).
- **Synonym expansion** — e.g. "internet" also searches for "data", "bandwidth", "quota"; "download" also searches for "view", "statement", "pdf".
- **TF-IDF scoring** — rare words (e.g. "download", "reload", "roaming") score much higher than common words (e.g. "bill", "Maxis"). This prevents a vague word like "bill" from matching the wrong entry.
- **Field weighting** — a keyword match in the question text scores 3× more than a match in the answer text.
- Returns the highest-scoring entry. If no entry scores above zero, the bot directs the user to call **1800-82-1234**.

### 3. Voice & Chat UI
- The browser's **Web Speech API** transcribes speech to text in real time (no external STT service).
- Transcribed text is POSTed to `/api/chat` and the reply is rendered as a chat bubble.
- Supports **English (en-MY)** and **Bahasa Melayu (ms-MY)** via a language selector.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML + CSS + JS, Web Speech API |
| Backend | Node.js + Express |
| Crawling | Axios + Cheerio — BFS across Maxis FAQ article pages |
| Search | TF-IDF with synonym expansion (no external API) |
| Deployment | Railway (backend) + Vercel (frontend) |

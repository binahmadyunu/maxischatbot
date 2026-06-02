# Maxis Customer Service Chatbot

A voice-enabled customer service chatbot for Maxis. Supports English (en-MY) and Bahasa Melayu speech recognition, scrapes the live Maxis FAQ at startup, and answers questions using a local keyword search engine — no AI API or billing required.

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
   > No `.env` or API key needed — the app runs entirely locally.

4. **Open in browser**
   ```
   http://localhost:3000
   ```
   > Use Chrome or Edge — Web Speech API is not supported in Firefox.

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
├── server.js           ← Express backend + keyword search engine
├── scraper.js          ← Maxis FAQ scraper (Axios + Cheerio) + fallback FAQ
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
| `GET`  | `/api/status` | Returns `{ ready: true/false, entries: number }` — FAQ load status |
| `POST` | `/api/chat`   | Body: `{ userMessage: string }` → Returns `{ reply: string }` |

---

## How It Works

1. **Server starts** → `scraper.js` fetches `maxis.com.my/en/faq/` and parses it into Q&A entries. If scraping fails or returns low-quality content, 24 hardcoded fallback entries are used instead.
2. **User speaks** → the browser's Web Speech API transcribes speech to text in real time.
3. **Question sent** → the frontend POSTs the transcribed text to `/api/chat`.
4. **Keyword search** → `server.js` tokenises the question, strips stopwords, expands synonyms (e.g. "internet" → "data"), scores every FAQ entry, and returns the best match.
5. **Answer displayed** → the reply appears as a chat bubble in the right panel.

If no FAQ entry scores above the match threshold, the bot directs the user to call **1800-82-1234**.

---

## Tech Stack

- **Frontend:** Vanilla HTML + CSS + JS, Web Speech API
- **Backend:** Node.js + Express
- **Scraping:** Axios + Cheerio (`maxis.com.my/en/faq/`)
- **Search:** Local keyword matching with synonym expansion (no external API)
- **Deployment:** Railway (backend) + Vercel (frontend)

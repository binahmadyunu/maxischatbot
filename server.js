require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { scrapeFAQ, parseFAQEntries, FALLBACK_FAQ } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3000;

let faqEntries = [];
let faqReady = false;

async function initFAQ() {
  // Fallback is always the guaranteed base
  const fallbackEntries = parseFAQEntries(FALLBACK_FAQ);

  try {
    console.log('[FAQ] Scraping Maxis FAQ page...');
    const raw = await scrapeFAQ();
    const scraped = parseFAQEntries(raw);

    // Accept scraped entries only if they look like real Q&A content
    // (Maxis FAQ page is JS-rendered, so Axios often gets nav text instead)
    const avgAnswerLen = scraped.length
      ? scraped.reduce((s, e) => s + e.answer.length, 0) / scraped.length
      : 0;

    if (scraped.length >= 5 && avgAnswerLen > 80) {
      faqEntries = [...fallbackEntries, ...scraped];
      console.log(`[FAQ] Using ${scraped.length} scraped + ${fallbackEntries.length} fallback entries.`);
    } else {
      faqEntries = fallbackEntries;
      console.log(`[FAQ] Scraped content not structured (avgLen=${Math.round(avgAnswerLen)}), using ${fallbackEntries.length} fallback entries.`);
    }
  } catch (err) {
    console.warn('[FAQ] Scraping failed:', err.message);
    faqEntries = fallbackEntries;
    console.log(`[FAQ] Using ${fallbackEntries.length} fallback entries.`);
  }

  faqReady = true;
}

// ──────────────────────────────────────────────
//  Keyword search engine
// ──────────────────────────────────────────────

const STOPWORDS = new Set([
  'a','an','the','is','are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','could','should','may','might','can','need',
  'i','you','he','she','it','we','they','what','which','who','how','when','where',
  'why','this','that','these','those','all','some','no','not','just','very','my',
  'your','his','her','its','our','their','me','him','us','them','for','of','with',
  'at','by','and','or','but','if','to','from','in','on','up','as','so','about'
]);

// Maps any synonym → canonical set of related terms to also search for
const SYNONYMS = {
  pay:      ['payment','paying','paid','bill','billing','fee','charge','jompay'],
  data:     ['internet','bandwidth','mb','gb','usage','quota'],
  roam:     ['roaming','international','abroad','overseas','travel'],
  plan:     ['package','subscription','postpaid','prepaid','hotlink'],
  network:  ['signal','coverage','4g','5g','lte','connection','connectivity'],
  contact:  ['call','reach','support','help','service','helpline','1800'],
  balance:  ['usage','remaining','left','quota','credit'],
  sim:      ['card','simcard','chip'],
  replace:  ['replacement','lost','damaged','broken'],
  activate: ['activation','setup','new','register'],
  port:     ['porting','transfer','migrate','number','pindah'],
  check:    ['view','see','look','find','know','monitor'],
  report:   ['lodge','complaint','problem','issue','fault'],
  store:    ['outlet','shop','centre','center','branch','office'],
  terminate:['cancel','stop','close','end','disconnect'],
  install:  ['installment','installment','device','phone','easyphone'],
};

function tokenize(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOPWORDS.has(w));
}

function expandSynonyms(tokens) {
  const expanded = new Set(tokens);
  for (const token of tokens) {
    for (const [canonical, synonyms] of Object.entries(SYNONYMS)) {
      const group = [canonical, ...synonyms];
      if (group.includes(token)) {
        group.forEach(t => expanded.add(t));
      }
    }
  }
  return expanded;
}

function scoreEntry(queryExpanded, entry) {
  const qTokens = new Set(tokenize(entry.question));
  const aTokens = new Set(tokenize(entry.answer));
  let score = 0;
  for (const term of queryExpanded) {
    if (qTokens.has(term)) score += 3; // question match weighted higher
    if (aTokens.has(term)) score += 1;
  }
  return score;
}

function searchFAQ(query) {
  const tokens = tokenize(query);
  if (tokens.length === 0) {
    return 'Could you please rephrase your question? You can also reach Maxis support at 1800-82-1234.';
  }

  const expanded = expandSynonyms(tokens);

  const scored = faqEntries
    .map(entry => ({ entry, score: scoreEntry(expanded, entry) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const MIN_SCORE = 2;

  if (!best || best.score < MIN_SCORE) {
    return (
      "I'm sorry, I don't have specific information about that. For further assistance:\n" +
      "• Call Maxis support: 1800-82-1234 (available 24/7)\n" +
      "• Visit: maxis.com.my\n" +
      "• Chat via the Maxis app"
    );
  }

  let reply = best.entry.answer;

  // Include a second related answer if it scores close to the best
  const second = scored[1];
  if (second && second.score >= MIN_SCORE && second.score >= best.score * 0.75) {
    reply += '\n\nRelated: ' + second.entry.answer;
  }

  return reply;
}

// ──────────────────────────────────────────────
//  Express routes
// ──────────────────────────────────────────────

app.use(cors({ origin: '*', methods: ['GET', 'POST'], allowedHeaders: ['Content-Type'] }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/status', (req, res) => {
  res.json({ ready: faqReady, entries: faqEntries.length });
});

app.post('/api/chat', (req, res) => {
  const { userMessage } = req.body;

  if (!userMessage || typeof userMessage !== 'string') {
    return res.status(400).json({ error: 'userMessage is required.' });
  }

  if (!faqReady) {
    return res.status(503).json({ error: 'FAQ data is still loading. Please try again shortly.' });
  }

  const reply = searchFAQ(userMessage);
  res.json({ reply });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initFAQ().then(() => {
  app.listen(PORT, () => {
    console.log(`[Server] Maxis Chatbot running at http://localhost:${PORT}`);
  });
});

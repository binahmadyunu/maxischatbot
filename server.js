require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { scrapeFAQ, parseFAQEntries, FALLBACK_FAQ } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3000;

let faqEntries = [];
let idfMap = new Map(); // built once after FAQ loads
let faqReady = false;

// ─────────────────────────────────────────────────────────────────────────────
//  FAQ initialisation
// ─────────────────────────────────────────────────────────────────────────────
async function initFAQ() {
  const fallbackEntries = parseFAQEntries(FALLBACK_FAQ);

  try {
    console.log('[FAQ] Crawling Maxis FAQ pages...');
    // scrapeFAQ() now returns structured { question, answer } entries directly
    const scraped = await scrapeFAQ();

    if (scraped.length >= 5) {
      // Merge: fallback covers topics the live site may not have; live site is authoritative
      const seen = new Set(scraped.map(e => e.question.toLowerCase()));
      const uniqueFallback = fallbackEntries.filter(e => !seen.has(e.question.toLowerCase()));
      faqEntries = [...scraped, ...uniqueFallback];
      console.log(`[FAQ] ${scraped.length} live + ${uniqueFallback.length} fallback-only entries = ${faqEntries.length} total.`);
    } else {
      faqEntries = fallbackEntries;
      console.log(`[FAQ] Too few live entries, using ${fallbackEntries.length} fallback entries.`);
    }
  } catch (err) {
    faqEntries = fallbackEntries;
    console.warn(`[FAQ] Crawl failed (${err.message}), using ${fallbackEntries.length} fallback entries.`);
  }

  // Build IDF index once — must happen after faqEntries is finalised
  idfMap = buildIDF(faqEntries);
  console.log(`[IDF] Index built: ${idfMap.size} unique terms across ${faqEntries.length} entries.`);
  faqReady = true;
}

// ─────────────────────────────────────────────────────────────────────────────
//  TF-IDF Search Engine
//
//  Why TF-IDF instead of simple keyword counting?
//  ─ Common words like "bill" appear in many entries → low IDF → low weight.
//  ─ Rare words like "download", "reload", "slow" appear in 1–2 entries →
//    high IDF → they dominate scoring → the right entry wins.
//  ─ Field weighting: question tokens count 3× more than answer tokens,
//    since a question is a dense summary of the entry's intent.
// ─────────────────────────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  'a','an','the','is','are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','could','should','may','might','can','need',
  'i','you','he','she','it','we','they','what','which','who','how','when','where',
  'why','this','that','these','those','all','some','no','not','just','very','my',
  'your','his','her','its','our','their','me','him','us','them','for','of','with',
  'at','by','and','or','but','if','to','from','in','on','up','as','so','about',
  'want','need','please','help','get','make','give','tell','know','like','also'
]);

// Synonym groups — if any term in a group appears in the query, all group
// members are added as extra query tokens (with a reduced weight of 0.4×).
const SYNONYM_GROUPS = [
  ['pay','payment','paying','paid','settle','jompay'],
  ['download','view','save','export','pdf','statement','e-bill','ebill','invoice','receipt'],
  ['check','see','look','find','know','monitor','track','verify'],
  ['data','internet','bandwidth','quota','mb','gb'],
  ['slow','sluggish','lagging','buffering','throttle','speed'],
  ['roam','roaming','international','abroad','overseas','travel','foreign'],
  ['plan','package','subscription','bundle'],
  ['postpaid','monthly','contract'],
  ['prepaid','hotlink','reload','topup','top-up','credit'],
  ['network','signal','coverage','4g','5g','lte','connection'],
  ['contact','call','reach','support','helpline','chat'],
  ['balance','remaining','left','credit'],
  ['sim','simcard','card','chip'],
  ['replace','replacement','lost','damaged','broken','stolen'],
  ['activate','activation','setup','register','new'],
  ['port','porting','transfer','migrate','pindah','mno'],
  ['store','outlet','shop','centre','center','branch','walk-in'],
  ['terminate','cancel','stop','close','disconnect'],
  ['add-on','addon','booster','extra','additional'],
  ['family','supplementary','share','sharing','multi-line'],
  ['password','reset','forgot','login','log-in','account','sign-in'],
  ['contract','commitment','tenure','end-date','expiry'],
  ['volte','hd','voice','calling','quality','drop','dropping'],
  ['installment','easyphone','device','phone','smartphone','purchase'],
  ['coverage','map','area','location','check'],
];

function tokenize(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOPWORDS.has(w));
}

// IDF = log((N+1)/(df+1)) + 1  (smoothed so unknown terms don't blow up)
function buildIDF(entries) {
  const N = entries.length;
  const df = new Map();

  for (const entry of entries) {
    // Count each term once per entry — IDF measures *presence*, not frequency
    const terms = new Set([...tokenize(entry.question), ...tokenize(entry.answer)]);
    for (const t of terms) df.set(t, (df.get(t) || 0) + 1);
  }

  const result = new Map();
  for (const [term, count] of df) {
    result.set(term, Math.log((N + 1) / (count + 1)) + 1);
  }
  return result;
}

// Score one FAQ entry against an expanded query using TF-IDF
function scoreTFIDF(primaryTokens, expandedTokens, entry) {
  // Build weighted term-frequency map for this entry
  const qTerms = tokenize(entry.question);
  const aTerms = tokenize(entry.answer);
  const totalWeight = qTerms.length * 3 + aTerms.length || 1;

  const tf = new Map();
  for (const t of qTerms) tf.set(t, (tf.get(t) || 0) + 3); // question field: 3×
  for (const t of aTerms) tf.set(t, (tf.get(t) || 0) + 1); // answer field:   1×

  // Unknown terms get the highest possible IDF (very discriminating)
  const maxIDF = Math.log((faqEntries.length + 1) / 1) + 1;

  let score = 0;

  // Primary query tokens: full weight
  for (const qt of primaryTokens) {
    const termTF = (tf.get(qt) || 0) / totalWeight;
    const termIDF = idfMap.get(qt) ?? maxIDF;
    score += termTF * termIDF;
  }

  // Synonym-expanded tokens: reduced weight (0.4×) to boost recall without
  // overriding the primary signal
  for (const qt of expandedTokens) {
    if (primaryTokens.includes(qt)) continue; // already counted above
    const termTF = (tf.get(qt) || 0) / totalWeight;
    const termIDF = idfMap.get(qt) ?? maxIDF;
    score += termTF * termIDF * 0.4;
  }

  return score;
}

function expandSynonyms(tokens) {
  const expanded = new Set();
  for (const token of tokens) {
    for (const group of SYNONYM_GROUPS) {
      if (group.includes(token)) {
        group.forEach(t => expanded.add(t));
      }
    }
  }
  // Remove tokens that are already in the primary set
  tokens.forEach(t => expanded.delete(t));
  return [...expanded];
}

function searchFAQ(query) {
  const primary = tokenize(query);

  if (primary.length === 0) {
    return 'Could you please rephrase your question? You can also reach Maxis support at 1800-82-1234.';
  }

  const expanded = expandSynonyms(primary);

  const scored = faqEntries
    .map(entry => ({ entry, score: scoreTFIDF(primary, expanded, entry) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];

  // Entries with zero overlap with the query score exactly 0
  if (!best || best.score === 0) {
    return (
      "I'm sorry, I don't have specific information about that. For further assistance:\n" +
      "• Call Maxis support: 1800-82-1234 (available 24/7)\n" +
      "• Visit: maxis.com.my\n" +
      "• Chat via the Maxis app"
    );
  }

  return best.entry.answer;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Express routes
// ─────────────────────────────────────────────────────────────────────────────
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

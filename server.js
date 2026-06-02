require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { scrapeFAQ, parseFAQEntries, FALLBACK_FAQ } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3000;

let faqEntries = [];
let idfMap    = new Map(); // built once after FAQ loads — holds BM25 IDF values
let avgDocLen = 0;         // average weighted doc length (for BM25)
let faqReady  = false;

// BM25 tuning parameters
const BM25_K1 = 1.5;  // term-saturation — higher = more influence from repeated terms
const BM25_B  = 0.75; // length normalisation — 0 = no norm, 1 = full norm

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

  // ── Quality pass ─────────────────────────────────────────────────────────
  // 1. Remove fragment answers (< 40 chars) — e.g. "Delete the eSIM profile
  //    first!" or "This is depending on your subscribed plan." are snippets
  //    from longer sequences and produce misleading one-line replies.
  const before = faqEntries.length;
  faqEntries = faqEntries.filter(e => e.answer.trim().length >= 60);

  // 2. Deduplicate: same question text → keep the longest (most complete) answer.
  //    Happens when multiple FAQ pages repeat the same Q&A.
  const qMap = new Map();
  for (const e of faqEntries) {
    const k = e.question.toLowerCase().trim();
    if (!qMap.has(k) || e.answer.length > qMap.get(k).answer.length) qMap.set(k, e);
  }
  faqEntries = [...qMap.values()];

  console.log(`[FAQ] Quality pass: ${before} → ${faqEntries.length} entries (removed ${before - faqEntries.length} fragments/dupes).`);

  // ── Build BM25 index ──────────────────────────────────────────────────────
  idfMap = buildIndex(faqEntries);
  console.log(`[BM25] Index built: ${idfMap.size} unique terms, avgDocLen=${avgDocLen.toFixed(1)}, across ${faqEntries.length} entries.`);
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
  ['terminate','cancel','stop','close','disconnect','termination','deactivate'],
  ['add-on','addon','booster','extra','additional'],
  ['family','supplementary','share','sharing','multi-line'],
  ['password','reset','forgot','login','log-in','account','sign-in'],
  ['contract','commitment','tenure','end-date','expiry'],
  ['volte','hd','voice','calling','quality','drop','dropping'],
  ['installment','easyphone','device','phone','smartphone','purchase'],
  ['coverage','map','area','location','check'],
  // new groups for improved coverage
  ['charge','charges','fee','fees','penalty','fine','interest'],
  ['late','overdue','past','due','missed','unpaid'],
  ['esim','e-sim','embedded','digital'],
  ['rebate','discount','waiver','promo','promotion','offer'],
  ['upgrade','change','switch','move','migrate'],
  ['number','mobile','phone','msisdn','no'],
  ['hotspot','tethering','wifi','wireless','sharing'],
];

function tokenize(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOPWORDS.has(w));
}

// Build BM25 IDF index and compute average document length.
// BM25 IDF = log((N - df + 0.5) / (df + 0.5) + 1)
// This is always positive and gives rare terms a strong boost.
function buildIndex(entries) {
  const N = entries.length;
  const df = new Map();
  let totalLen = 0;

  for (const entry of entries) {
    const qTerms = tokenize(entry.question);
    const aTerms = tokenize(entry.answer);
    // Weighted doc length mirrors the field-weighting used in scoring (q=3×, a=1×)
    totalLen += qTerms.length * 3 + aTerms.length;
    // Each term counted once per entry — IDF reflects *presence*, not frequency
    const terms = new Set([...qTerms, ...aTerms]);
    for (const t of terms) df.set(t, (df.get(t) || 0) + 1);
  }

  avgDocLen = totalLen / (N || 1);

  const result = new Map();
  for (const [term, count] of df) {
    result.set(term, Math.log((N - count + 0.5) / (count + 0.5) + 1));
  }
  return result;
}

// Score one FAQ entry against an expanded query using BM25.
//
// Why BM25 instead of raw TF-IDF?
// ─ Raw TF-IDF divides by total doc weight, so a 4-token fragment ("Delete the
//   eSIM profile first!") gets an artificially high TF for matching tokens.
// ─ BM25 applies non-linear saturation (k1) and length normalisation (b):
//     bm25TF = rawFreq * (k1+1) / (rawFreq + k1*(1 - b + b*docLen/avgDocLen))
//   A short doc's rawFreq hits the saturation ceiling fast, and the length
//   normalisation penalises documents much shorter or longer than average.
// ─ Result: comprehensive answers beat fragments even when both contain the
//   query term, because the fragment's "advantage" is dampened by BM25.
function scoreBM25(primaryTokens, expandedTokens, entry) {
  const qTerms = tokenize(entry.question);
  const aTerms = tokenize(entry.answer);
  const docLen  = qTerms.length * 3 + aTerms.length;

  // Raw (non-normalised) weighted term frequencies
  const rawTF = new Map();
  for (const t of qTerms) rawTF.set(t, (rawTF.get(t) || 0) + 3); // question: 3×
  for (const t of aTerms) rawTF.set(t, (rawTF.get(t) || 0) + 1); // answer:   1×

  // Unknown terms use the highest possible IDF
  const maxIDF = Math.log((faqEntries.length + 0.5) / 0.5 + 1);

  // BM25 TF component — term saturation + length normalisation
  const bm25TF = (f) =>
    (f * (BM25_K1 + 1)) /
    (f + BM25_K1 * (1 - BM25_B + BM25_B * docLen / avgDocLen));

  let score = 0;

  // Primary query tokens: full weight
  for (const qt of primaryTokens) {
    const f = rawTF.get(qt) || 0;
    if (!f) continue;
    score += (idfMap.get(qt) ?? maxIDF) * bm25TF(f);
  }

  // Synonym-expanded tokens: reduced weight (0.4×) — improves recall without
  // overriding the primary signal
  for (const qt of expandedTokens) {
    if (primaryTokens.includes(qt)) continue;
    const f = rawTF.get(qt) || 0;
    if (!f) continue;
    score += (idfMap.get(qt) ?? maxIDF) * bm25TF(f) * 0.4;
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
    .map(entry => ({ entry, score: scoreBM25(primary, expanded, entry) }))
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

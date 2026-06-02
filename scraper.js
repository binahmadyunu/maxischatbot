const axios = require('axios');
const cheerio = require('cheerio');

// ─────────────────────────────────────────────────────────────────────────────
//  Fallback FAQ — used only when the live crawl fails completely.
//  The live crawler now covers billing, account, SIM, 5G, roaming, devices, etc.
//  so the fallback is a thin safety net rather than a primary source.
// ─────────────────────────────────────────────────────────────────────────────
const FALLBACK_FAQ = `
BILLING & PAYMENTS

Q: How do I pay my Maxis bill?
A: Pay via the Maxis app, MyMaxis portal at myaccount.maxis.com.my, online banking, credit or debit card, at Maxis stores, or through JomPay (biller code 22126). You can also set up auto-debit so your bill is paid automatically each month.

Q: How do I download or view my bill statement?
A: Log in to MyMaxis at myaccount.maxis.com.my or open the Maxis app, tap 'Bills & Payments', then select the billing month to view or download your e-bill as a PDF.

Q: How do I check my bill or balance?
A: Check your monthly bill via the Maxis app or MyMaxis portal. For prepaid balance, dial *128# or check the Maxis app.

Q: What are the late payment charges or penalty for not paying on time?
A: A late payment charge of 1.5% per month is applied on overdue amounts. Services may be suspended after 30 days past the due date. The charge is calculated on your original unpaid amount only — it is never compounded on previous charges.

Q: What is JomPay and how do I use it to pay Maxis?
A: JomPay is an online bill payment service available in most Malaysian banking apps. Use Maxis biller code 22126 and enter your Maxis account number as the reference.

DATA & PLANS

Q: What postpaid plans does Maxis offer?
A: Maxis Postpaid plans start from RM55 per month with different data tiers. Higher plans include unlimited data. Visit maxis.com.my for the latest plan options and pricing.

Q: How do I change, upgrade or switch my postpaid plan to a different plan?
A: To change or upgrade your Maxis postpaid plan, open the Maxis app and go to 'Plans & Add-ons' to select a new plan, or call 1800-82-1234, or visit any Maxis store. The plan change takes effect from your next billing cycle. You can also downgrade your plan subject to your contract terms.

Q: How do I check my data usage?
A: Dial *128# or open the Maxis app to see your real-time data balance and remaining quota.

Q: My internet is slow or not working. What should I do?
A: Restart your device and toggle Airplane Mode off and on. Check for outages in your area via the Maxis app. If the issue persists, call 1800-82-1234 or report through the Maxis app.

Q: What is Hotlink prepaid?
A: Hotlink is Maxis's prepaid brand. It offers flexible daily and weekly passes starting from RM1 per day for data and calls.

Q: How do I reload my Hotlink prepaid credit?
A: Reload via the Maxis or Hotlink app, MyMaxis portal, online banking, at 7-Eleven, pharmacies, petrol stations, or any Maxis or Hotlink dealer.

ROAMING

Q: How do I activate international roaming?
A: SMS "ROAM ON" to 28882, or activate roaming in the Maxis app under 'Roaming' before your trip.

Q: How do I deactivate or turn off roaming when I return home?
A: SMS "ROAM OFF" to 28882 or go to the Maxis app under 'Roaming' and deactivate it.

NETWORK & COVERAGE

Q: How do I report a network issue or outage?
A: Report via the Maxis app under 'Help & Support', call 1800-82-1234, or submit a report at maxis.com.my/support.

ACCOUNT MANAGEMENT

Q: How do I reset my MyMaxis password?
A: Go to myaccount.maxis.com.my and click 'Forgot Password'. Enter your registered mobile number or email to receive a password reset link.

Q: How do I port my number to Maxis?
A: SMS "PINDAH <your IC number>" to 11190. The process takes up to 3 working days. Ensure your existing line has no outstanding balance before porting.

Q: How do I update my personal details such as name, address, or email?
A: Update your personal details via MyMaxis portal under 'Profile Settings', or visit any Maxis store with your IC.

DEVICES & SIM

Q: How do I replace a lost or damaged SIM card?
A: Visit any Maxis store with your IC for a SIM card replacement. A replacement fee of RM15 applies.

Q: How do I activate a new SIM card?
A: Insert the SIM into your device. You will receive an activation SMS with instructions. Alternatively, activate online at maxis.com.my/activate.

CUSTOMER SUPPORT

Q: How do I contact Maxis customer service?
A: Call 1800-82-1234 (available 24 hours, 7 days a week), chat via the Maxis app or maxis.com.my, or visit any Maxis store.

Q: Where are Maxis stores located?
A: Find your nearest Maxis store using the store locator at maxis.com.my/store-locator or search within the Maxis app.

Q: What are Maxis store operating hours?
A: Most Maxis stores are open daily from 10am to 9pm. Hours may vary by location and during public holidays.
`.trim();

// ─────────────────────────────────────────────────────────────────────────────
//  Constants
// ─────────────────────────────────────────────────────────────────────────────
const BASE = 'https://www.maxis.com.my';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,*/*',
  'Accept-Language': 'en-US,en;q=0.5',
};

// Any FAQ article page works as a starting point — we just need the data-navigation JSON
const NAV_SEED = '/en/faq/products-services/mobile/postpaid';

// ─────────────────────────────────────────────────────────────────────────────
//  Step 1 — Extract the full FAQ URL list from the data-navigation attribute.
//  Every FAQ article page embeds the complete sitemap tree in this attribute.
// ─────────────────────────────────────────────────────────────────────────────
async function discoverAllFAQUrls() {
  const res = await axios.get(BASE + NAV_SEED, { headers: HEADERS, timeout: 15000 });
  const $ = cheerio.load(res.data);

  let navJson = null;
  $('[data-navigation]').each((_, el) => {
    const raw = $(el).attr('data-navigation');
    if (raw && raw.includes('/faq/')) {
      const decoded = raw.replace(/&#34;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
      try { navJson = JSON.parse(decoded); } catch (_) {}
    }
  });

  if (!navJson) throw new Error('data-navigation not found on seed page');

  const urls = [];
  function extract(node) {
    if (node.url && node.url.includes('/faq/')) {
      const path = node.url.replace(/^https?:\/\/[^/]+/, '');
      if (path.split('/').length >= 4) urls.push(path); // skip root/category-only paths
    }
    if (node['sub-pages']) node['sub-pages'].forEach(extract);
  }
  extract(navJson);

  return [...new Set(urls)];
}

// ─────────────────────────────────────────────────────────────────────────────
//  Step 2 — Fetch one FAQ article page and extract all Q&A pairs.
//  Confirmed CSS selectors (from live HTML inspection):
//    Question : li.cmp-faq-content-space--qna h2
//    Answer   : li.cmp-faq-content-space--qna .cmp-faq-content-space--content
// ─────────────────────────────────────────────────────────────────────────────
async function fetchArticle(path) {
  const url = path.startsWith('http') ? path : BASE + path;
  const res = await axios.get(url, { headers: HEADERS, timeout: 12000 });
  const $ = cheerio.load(res.data);

  const entries = [];
  $('li.cmp-faq-content-space--qna').each((_, el) => {
    const question = $(el).find('h2').text().trim();
    const answer = $(el).find('.cmp-faq-content-space--content')
      .text().replace(/\s+/g, ' ').trim();
    if (question && answer && answer.length > 20) {
      entries.push({ question, answer });
    }
  });

  return entries;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Main export — discover all FAQ URLs, crawl them in parallel, return entries.
// ─────────────────────────────────────────────────────────────────────────────
async function scrapeFAQ(concurrency = 10) {
  // Step 1: get the full URL list from the nav tree
  const allUrls = await discoverAllFAQUrls();
  console.log(`[Scraper] Discovered ${allUrls.length} FAQ URLs from navigation tree.`);

  // Step 2: crawl all pages in parallel batches
  const allEntries = [];
  let pagesWithContent = 0;

  for (let i = 0; i < allUrls.length; i += concurrency) {
    const batch = allUrls.slice(i, i + concurrency);
    const results = await Promise.allSettled(batch.map(path => fetchArticle(path)));

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.length > 0) {
        allEntries.push(...result.value);
        pagesWithContent++;
      }
    }
  }

  console.log(`[Scraper] Crawled ${allUrls.length} pages — ${pagesWithContent} had Q&A — ${allEntries.length} total pairs.`);

  if (allEntries.length === 0) throw new Error('No Q&A pairs found across all pages.');
  return allEntries;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Parser for FALLBACK_FAQ (Q:/A: text format → structured entries)
// ─────────────────────────────────────────────────────────────────────────────
function parseFAQEntries(text) {
  const entries = [];
  const pattern = /Q:\s*(.+?)\nA:\s*([\s\S]+?)(?=\nQ:|\n[A-Z &]+\n|$)/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const question = match[1].trim();
    const answer = match[2].trim();
    if (question && answer) entries.push({ question, answer });
  }
  return entries;
}

module.exports = { scrapeFAQ, parseFAQEntries, FALLBACK_FAQ };

const axios = require('axios');
const cheerio = require('cheerio');

// ─────────────────────────────────────────────────────────────────────────────
//  Fallback FAQ — used if live scraping fails or returns no Q&A pairs.
//  Keep this as the guaranteed safety net.
// ─────────────────────────────────────────────────────────────────────────────
const FALLBACK_FAQ = `
BILLING & PAYMENTS

Q: How do I pay my Maxis bill?
A: Pay via the Maxis app, MyMaxis portal at myaccount.maxis.com.my, online banking, credit or debit card, at Maxis stores, or through JomPay using biller code 22126.

Q: How do I download or view my bill statement?
A: Log in to MyMaxis at myaccount.maxis.com.my or open the Maxis app, tap 'Bills & Payments', then select the billing month to view or download your e-bill as a PDF.

Q: How do I check my bill or balance?
A: Check your monthly bill via the Maxis app or MyMaxis portal. For prepaid balance, dial *128# or check the Maxis app.

Q: What happens if I don't pay my bill on time?
A: A late payment charge of 1.5% per month applies on overdue amounts. Services may be suspended after 30 days past the due date.

Q: What is JomPay and how do I use it to pay Maxis?
A: JomPay is an online bill payment service available in most Malaysian banking apps. Use Maxis biller code 22126 and enter your Maxis account number as the reference.

Q: How do I get a receipt for my Maxis payment?
A: Payment receipts are available in the Maxis app under 'Bills & Payments' > 'Payment History'. You can download them as a PDF.

DATA & PLANS

Q: What postpaid plans does Maxis offer?
A: Maxis Postpaid plans start from RM55 per month with different data tiers. Higher plans include unlimited data. Visit maxis.com.my for the latest plan options and pricing.

Q: How do I check my data usage?
A: Dial *128# or open the Maxis app to see your real-time data balance and remaining quota.

Q: My internet is slow or not working. What should I do?
A: Restart your device and toggle Airplane Mode off and on. Check for outages in your area via the Maxis app. If the issue persists, call 1800-82-1234 or report through the Maxis app.

Q: My mobile data is not connecting. How do I fix it?
A: Go to Settings > Mobile Network and ensure mobile data is enabled and APN is set to 'net'. Restart your phone. If still not working, call 1800-82-1234 for assistance.

Q: Can I share data with family members?
A: Yes. Maxis Family Plan lets you share data across up to 5 lines under one account. Manage data sharing via the Maxis app or MyMaxis portal.

Q: What is Hotlink prepaid?
A: Hotlink is Maxis's prepaid brand. It offers flexible daily and weekly passes starting from RM1 per day for data and calls. Available to all Maxis prepaid customers.

Q: How do I reload my Hotlink prepaid credit?
A: Reload via the Maxis or Hotlink app, MyMaxis portal, online banking, at 7-Eleven, pharmacies, petrol stations, or any Maxis or Hotlink dealer.

Q: How do I add a data add-on or data booster?
A: Purchase data add-ons via the Maxis app under 'Add-Ons', dial *100#, or log in to MyMaxis portal and select 'Add-Ons'.

ROAMING

Q: How do I activate international roaming?
A: SMS "ROAM ON" to 28882, or activate roaming in the Maxis app under 'Roaming' before your trip.

Q: What are Maxis roaming rates?
A: Roaming rates vary by country. Maxis offers daily Roaming Passes for flat-rate data and calls abroad. Check maxis.com.my/roaming or the Maxis app for your destination's rates.

Q: Which countries does Maxis roaming cover?
A: Maxis roaming is available in over 200 countries. See the full country list at maxis.com.my/roaming.

Q: How do I deactivate or turn off roaming when I return home?
A: SMS "ROAM OFF" to 28882 or go to the Maxis app under 'Roaming' and deactivate it.

NETWORK & COVERAGE

Q: How do I report a network issue or outage?
A: Report via the Maxis app under 'Help & Support', call 1800-82-1234, or submit a report at maxis.com.my/support.

Q: Does Maxis offer 5G coverage?
A: Yes. Maxis offers 5G in selected areas across Malaysia. Check your area's 5G coverage at maxis.com.my or in the Maxis app under 'Coverage'.

Q: How do I check network or 4G coverage in my area?
A: Use the Coverage Checker at maxis.com.my or in the Maxis app to check 4G and 5G availability for any location in Malaysia.

Q: My calls keep dropping or I have poor call quality. What should I do?
A: Check your signal bars, restart your device, and confirm you are in a coverage area. Report persistent call quality issues via the Maxis app or call 1800-82-1234.

ACCOUNT MANAGEMENT

Q: How do I change or upgrade my Maxis plan?
A: Change or upgrade your plan via the Maxis app under 'My Plan', through MyMaxis portal, or by calling 1800-82-1234.

Q: How do I reset my MyMaxis password?
A: Go to myaccount.maxis.com.my and click 'Forgot Password'. Enter your registered mobile number or email to receive a password reset link.

Q: How do I port my number to Maxis?
A: SMS "PINDAH <your IC number>" to 11190. The process takes up to 3 working days. Ensure your existing line has no outstanding balance before porting.

Q: How do I check my contract end date?
A: Log in to the Maxis app or MyMaxis portal and go to 'My Account' > 'Plan Details' to view your contract end date.

Q: How do I update my personal details such as name, address, or email?
A: Update your personal details via MyMaxis portal under 'Profile Settings', or visit any Maxis store with your IC.

Q: How do I terminate or cancel my Maxis line?
A: Visit any Maxis store with your IC, or call 1800-82-1234. Early termination fees may apply if you are still under contract.

Q: How do I add a supplementary line for a family member?
A: Add a supplementary line via the Maxis app, MyMaxis portal, or at any Maxis store. Supplementary lines share the main account's data allowance and are billed together.

DEVICES & SIM

Q: How do I replace a lost or damaged SIM card?
A: Visit any Maxis store with your IC for a SIM card replacement. A replacement fee of RM15 applies.

Q: How do I activate a new SIM card?
A: Insert the SIM into your device. You will receive an activation SMS with instructions. Alternatively, activate online at maxis.com.my/activate.

Q: Does Maxis offer device installment plans or phone financing?
A: Yes. Maxis EasyPhone lets you get the latest smartphones with monthly installments bundled into your postpaid plan. Available at Maxis stores and at maxis.com.my.

Q: How do I enable VoLTE or HD voice calls on Maxis?
A: Go to your phone Settings > Mobile Network and enable VoLTE or HD Calling. Your device and SIM must both support VoLTE. Contact 1800-82-1234 if you need help enabling it.

CUSTOMER SUPPORT

Q: How do I contact Maxis customer service?
A: Call 1800-82-1234 (available 24 hours, 7 days a week), chat via the Maxis app or maxis.com.my, or visit any Maxis store.

Q: Where are Maxis stores located?
A: Find your nearest Maxis store using the store locator at maxis.com.my/store-locator or search within the Maxis app.

Q: What are Maxis store operating hours?
A: Most Maxis stores are open daily from 10am to 9pm. Hours may vary by location and during public holidays. Check maxis.com.my/store-locator for specific store hours.
`.trim();

// ─────────────────────────────────────────────────────────────────────────────
//  Live scraper — crawls individual Maxis FAQ article pages.
//
//  Why article-level crawling?
//  The main /en/faq/ page is a JS-rendered SPA — Axios only gets the nav shell.
//  But individual FAQ article pages (e.g. /en/faq/products-services/roaming…)
//  render their Q&A in server-side HTML, accessible without JS execution.
//  Selectors confirmed from live HTML inspection:
//    Question: li.cmp-faq-content-space--qna h2
//    Answer:   li.cmp-faq-content-space--qna .cmp-faq-content-space--content
// ─────────────────────────────────────────────────────────────────────────────

const BASE = 'https://www.maxis.com.my';
const REQUEST_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,*/*',
  'Accept-Language': 'en-US,en;q=0.5',
};

// Seed pages — confirmed to contain Q&A in static HTML.
// The crawler will discover more pages by following /en/faq/ links from these.
const SEED_URLS = [
  '/en/faq/products-services/roaming-and-idd/international-roaming.html',
  '/en/faq/products-services/roaming-and-idd/data-roaming.html',
  '/en/faq/network/mobile/blocking-of-url-in-sms.html',
  '/en/faq/network/mobile/web-blocking-by-regulator.html',
  '/en/faq/products-services/home-internet/fibre/maxis-home-fibre-free-speed-upgrade.html',
  '/en/faq/devices/maxis-device-care.html',
];

/**
 * Fetch one FAQ article page and return:
 *  - entries: array of { question, answer }
 *  - links:   array of /en/faq/… hrefs found on this page (for crawling)
 */
async function fetchArticle(path) {
  const url = path.startsWith('http') ? path : BASE + path;
  const r = await axios.get(url, { headers: REQUEST_HEADERS, timeout: 12000 });
  const $ = cheerio.load(r.data);

  const entries = [];
  $('li.cmp-faq-content-space--qna').each((_, el) => {
    const question = $(el).find('h2').text().trim();
    const answer = $(el).find('.cmp-faq-content-space--content')
      .text()
      .replace(/\s+/g, ' ')
      .trim();
    if (question && answer && answer.length > 20) {
      entries.push({ question, answer });
    }
  });

  // Collect links to other FAQ article pages for crawling
  const links = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (href && href.includes('/en/faq/') && href.endsWith('.html')) {
      links.push(href.startsWith('http') ? href.replace(BASE, '') : href);
    }
  });

  return { entries, links };
}

/**
 * BFS crawler — starts from SEED_URLS, follows /en/faq/ links,
 * collects all Q&A pairs found across all pages.
 * Caps at maxPages to keep startup time reasonable.
 */
async function scrapeFAQ(maxPages = 60, concurrency = 5) {
  const visited = new Set();
  const queue = [...SEED_URLS];
  const allEntries = [];

  while (queue.length > 0 && visited.size < maxPages) {
    // Take a batch of URLs to fetch in parallel
    const batch = [];
    while (queue.length > 0 && batch.length < concurrency && visited.size + batch.length < maxPages) {
      const next = queue.shift();
      const key = next.replace(/^https?:\/\/[^/]+/, '').split('?')[0]; // normalise
      if (!visited.has(key)) {
        visited.add(key);
        batch.push(next);
      }
    }

    if (batch.length === 0) break;

    // Fetch batch in parallel
    const results = await Promise.allSettled(
      batch.map(path => fetchArticle(path))
    );

    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      const { entries, links } = result.value;
      allEntries.push(...entries);

      // Enqueue newly discovered FAQ links
      for (const link of links) {
        const key = link.split('?')[0];
        if (!visited.has(key) && !queue.includes(key)) {
          queue.push(link);
        }
      }
    }
  }

  console.log(`[Scraper] Visited ${visited.size} pages, found ${allEntries.length} Q&A pairs.`);

  if (allEntries.length === 0) {
    throw new Error('Crawler found no Q&A pairs on any page.');
  }

  return allEntries; // return structured entries directly, no raw text needed
}

// ─────────────────────────────────────────────────────────────────────────────
//  Parser — converts Q:/A: formatted text (FALLBACK_FAQ) into entry objects.
//  The live scraper returns structured entries directly so this is only
//  needed for the fallback.
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

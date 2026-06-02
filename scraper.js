const axios = require('axios');
const cheerio = require('cheerio');

const FALLBACK_FAQ = `
Maxis FAQ - Common Questions & Answers

BILLING & PAYMENTS
Q: How do I pay my Maxis bill?
A: You can pay via the Maxis app, MyMaxis portal, online banking, credit/debit card, at Maxis stores, or through JomPay using biller code 22126.

Q: How do I check my bill or balance?
A: Check via the Maxis app, SMS *128# (prepaid), or log in at myaccount.maxis.com.my.

Q: What happens if I don't pay my bill on time?
A: A late payment charge of 1.5% per month applies on overdue amounts. Services may be suspended after 30 days past due date.

DATA & PLANS
Q: What postpaid plans does Maxis offer?
A: Maxis Postpaid plans start from RM55/month (Maxis Postpaid 55) with various data tiers up to unlimited data on higher-tier plans.

Q: How do I check my data usage?
A: Dial *128# or check the Maxis app for real-time data balance.

Q: Can I share data with family members?
A: Yes, Maxis Family Plan lets you share data across up to 5 lines under one account.

Q: What is Hotlink prepaid?
A: Hotlink is Maxis's prepaid brand offering flexible passes starting from RM1/day for data and calls.

Q: How do I add a data add-on?
A: Purchase data add-ons via the Maxis app, dial *100#, or via MyMaxis portal.

ROAMING
Q: How do I activate international roaming?
A: SMS "ROAM ON" to 28882, or activate through the Maxis app before your trip.

Q: What are Maxis roaming rates?
A: Roaming rates vary by country. Check the Maxis website or app for the Roaming Pass options that suit your destination.

Q: Which countries does Maxis roaming cover?
A: Maxis roaming is available in over 200 countries. Check maxis.com.my for the full list.

NETWORK & COVERAGE
Q: How do I report a network issue?
A: Report via the Maxis app under "Help & Support", call 1800-82-1234, or submit at maxis.com.my/support.

Q: Does Maxis offer 5G?
A: Yes, Maxis offers 5G coverage in selected areas in Malaysia. Check coverage via the Maxis app or website.

Q: How do I improve my signal strength?
A: Try restarting your device, check for network outages via the Maxis app, or contact support if the issue persists.

ACCOUNT MANAGEMENT
Q: How do I change my Maxis plan?
A: Change your plan via the Maxis app, MyMaxis portal, or by calling 1800-82-1234.

Q: How do I port my number to Maxis?
A: SMS "PINDAH <your IC number>" to 11190. The process takes up to 3 working days.

Q: How do I update my personal details?
A: Update your details via MyMaxis portal or visit a Maxis store with your IC.

Q: How do I terminate my Maxis line?
A: Visit any Maxis store with your IC, or call 1800-82-1234. Early termination fees may apply for contracts.

DEVICES & SIM
Q: How do I replace a lost or damaged SIM?
A: Visit any Maxis store with your IC for a SIM replacement. A replacement fee of RM15 applies.

Q: How do I activate a new SIM?
A: Insert the SIM into your device and follow the activation SMS instructions, or activate via maxis.com.my.

Q: Does Maxis offer device installment plans?
A: Yes, Maxis EasyPhone allows you to get the latest devices with monthly installments bundled with your plan.

CUSTOMER SUPPORT
Q: How do I contact Maxis customer service?
A: Call 1800-82-1234 (24/7), chat via the Maxis app or website, email support@maxis.com.my, or visit a Maxis store.

Q: Where are Maxis stores located?
A: Find your nearest store at maxis.com.my/store-locator or search in the Maxis app.

Q: What are Maxis store operating hours?
A: Most Maxis stores are open daily 10am–9pm. Hours may vary by location and public holidays.
`.trim();

async function scrapeFAQ() {
  const url = 'https://www.maxis.com.my/en/faq/';

  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5'
    },
    timeout: 20000
  });

  const $ = cheerio.load(response.data);

  // Remove navigation, scripts, styles, footer noise
  $('script, style, nav, footer, header, .cookie-banner, .nav, .footer').remove();

  let faqText = 'Maxis FAQ Content (from maxis.com.my):\n\n';
  const seen = new Set();

  // Try FAQ-specific selectors first
  const faqSelectors = [
    '.faq-item', '.faq__item', '.faq-question', '.faq-answer',
    '[class*="faq"]', '.accordion-item', '.accordion__item',
    '[class*="accordion"]', '.qa-item', '.q-and-a'
  ];

  let scraped = false;
  for (const selector of faqSelectors) {
    const elements = $(selector);
    if (elements.length >= 3) {
      elements.each((i, el) => {
        const text = $(el).text().replace(/\s+/g, ' ').trim();
        if (text.length > 30 && !seen.has(text)) {
          seen.add(text);
          faqText += text + '\n\n';
        }
      });
      scraped = true;
      break;
    }
  }

  if (!scraped) {
    // Generic fallback: headings and paragraphs
    $('h2, h3, h4, p, li').each((i, el) => {
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      if (text.length > 40 && !seen.has(text)) {
        seen.add(text);
        faqText += text + '\n';
      }
    });
  }

  if (faqText.length < 200) {
    throw new Error('Insufficient content scraped from Maxis FAQ page');
  }

  // Cap at ~8000 chars to stay within reasonable token limits
  return faqText.substring(0, 8000);
}

// Parse raw FAQ text (Q: ... A: ... format) into structured entries
function parseFAQEntries(text) {
  const entries = [];

  // Match "Q: question\nA: answer" blocks
  const pattern = /Q:\s*(.+?)\nA:\s*([\s\S]+?)(?=\nQ:|\n[A-Z &]+\n|$)/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const question = match[1].trim();
    const answer = match[2].trim();
    if (question && answer) {
      entries.push({ question, answer });
    }
  }

  // If no Q/A pattern found (e.g. scraped free-form content), split into
  // sentence-level chunks so the search engine still has something to score
  if (entries.length === 0) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 30);
    for (let i = 0; i < lines.length - 1; i++) {
      entries.push({ question: lines[i], answer: lines[i + 1] });
    }
    // Also add each line as a self-contained entry
    lines.forEach(line => entries.push({ question: line, answer: line }));
  }

  return entries;
}

module.exports = { scrapeFAQ, parseFAQEntries, FALLBACK_FAQ };

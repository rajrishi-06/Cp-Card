// utils/codechef.js
// CodeChef data access by crawling the public profile page.
//
// Why this exists (issue #8): the previous module depended on a third-party
// endpoint (codechef-api.vercel.app) that deprecated its API and returned
// inconsistent data. CodeChef's own profile page keeps stable class names and
// embeds the rating history and daily-submission stats as inline JS variables,
// so we fetch the page once and parse everything we need from it:
//   - profile details          -> cheerio selectors (stable class names)
//   - rating graph data        -> `var all_rating = [...]`
//   - activity heatmap data    -> `var userDailySubmissionsStats = {...}`

const axios = require('axios');
const cheerio = require('cheerio');
const { createCache } = require('./cache');

const PROFILE_URL = handle => `https://www.codechef.com/users/${encodeURIComponent(handle)}`;
const REQUEST_TIMEOUT = 12000;
// CodeChef serves the data-bearing markup only to browser-like clients.
const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9'
};

const cache = createCache();

// --- Inline JS variable extraction -------------------------------------------
// CodeChef emits the rating/heatmap data as valid JSON assigned to a JS var.
// We locate the assignment (tolerating whitespace variations like
// `var  userDailySubmissionsStats=`), then walk the first {...} or [...] literal
// while respecting strings and escapes, so trailing page markup never trips us up.
function extractJsonVar(html, varName) {
    const marker = new RegExp(`var\\s+${varName}\\s*=`).exec(html);
    if (!marker) return null;

    let i = marker.index + marker[0].length;
    while (i < html.length && html[i] !== '{' && html[i] !== '[') i++;
    if (i >= html.length) return null;

    const open = html[i];
    const close = open === '{' ? '}' : ']';
    const startIndex = i;
    let depth = 0;
    let inString = false;
    let quote = '';
    let escaped = false;

    for (; i < html.length; i++) {
        const ch = html[i];
        if (inString) {
            if (escaped) escaped = false;
            else if (ch === '\\') escaped = true;
            else if (ch === quote) inString = false;
            continue;
        }
        if (ch === '"' || ch === "'") {
            inString = true;
            quote = ch;
        } else if (ch === open) {
            depth++;
        } else if (ch === close) {
            depth--;
            if (depth === 0) {
                const literal = html.slice(startIndex, i + 1);
                try {
                    return JSON.parse(literal);
                } catch (error) {
                    return null;
                }
            }
        }
    }
    return null;
}

// --- Normalisers --------------------------------------------------------------
function parseRatingData(html) {
    const raw = extractJsonVar(html, 'all_rating');
    if (!Array.isArray(raw)) return [];

    return raw
        .map(entry => {
            if (!entry || typeof entry !== 'object') return null;
            const rating = Number(entry.rating);
            if (!Number.isFinite(rating)) return null;
            // `end_date` ("YYYY-MM-DD hh:mm:ss") is the most reliable timestamp;
            // fall back to the split y/m/d fields (CodeChef months are 0-based).
            const date = entry.end_date ||
                `${entry.getyear}-${String(Number(entry.getmonth) + 1).padStart(2, '0')}-${String(entry.getday).padStart(2, '0')}`;
            if (Number.isNaN(new Date(date).getTime())) return null; // drop unparseable dates
            return {
                rating,
                date,
                name: entry.name || 'Contest',
                rank: entry.rank
            };
        })
        .filter(Boolean);
}

function parseHeatMap(html) {
    const raw = extractJsonVar(html, 'userDailySubmissionsStats');
    if (!raw) return [];

    const toEntry = (date, value) => {
        const count = typeof value === 'object' && value !== null
            ? Number(value.value)
            : Number(value);
        if (!date || !Number.isFinite(count)) return null;
        return { date, value: count };
    };

    let entries;
    if (Array.isArray(raw)) {
        entries = raw.map(d => (d && typeof d === 'object')
            ? toEntry(d.date, d.value !== undefined ? d.value : d)
            : null);
    } else {
        // Object keyed by date string.
        entries = Object.entries(raw).map(([date, value]) => toEntry(value && value.date ? value.date : date, value));
    }

    return entries.filter(Boolean);
}

function parseProfile($, html) {
    const text = sel => $(sel).first().text().trim();
    const digits = str => (String(str || '').match(/\d[\d,]*/) || [''])[0].replace(/,/g, '');

    const container = $('.user-details-container').first();
    const header = container.children().first();

    const name = header.children().eq(1).text().trim() ||
        container.find('h1, h2').first().text().trim() ||
        'Unknown';

    const profileImage = header.find('img').first().attr('src') ||
        container.find('img').first().attr('src') ||
        null;

    const currentRating = digits(text('.rating-number')) || '0';

    // Highest rating sits a few siblings after `.rating-number`, formatted as
    // "(Highest Rating 2000)". Read that sibling, then fall back to a text scan.
    const highestSibling = $('.rating-number').first().parent().children().eq(4).text();
    let highestRating = digits(highestSibling.split('Rating').pop());
    if (!highestRating) {
        const m = $('.rating-header').first().text().match(/Highest Rating\s*([\d,]+)/i);
        highestRating = m ? m[1].replace(/,/g, '') : currentRating;
    }

    let stars = text('.rating');
    if (!/★/.test(stars)) stars = text('.rating-star') || stars;
    const starMatch = stars.match(/\d+/);
    stars = starMatch ? `${starMatch[0]}★` : (stars || 'unrated');

    const ranks = $('.rating-ranks li');
    const globalRank = digits(ranks.eq(0).find('strong, a').first().text()) || 'NA';
    const countryRank = digits(ranks.eq(1).find('strong, a').first().text()) || 'NA';

    const countryName = text('.user-country-name') || '';
    const countryFlag = $('.user-country-flag').first().attr('src') || null;

    // Institution lives in the side details list under a "Institution" label.
    let institution = '';
    $('.user-details li, .side-nav li').each((_, el) => {
        const label = $(el).find('label').text().trim().toLowerCase();
        if (label.includes('institution')) {
            institution = $(el).clone().children('label').remove().end().text().trim();
        }
    });

    // Prefer the page's own "Total Problems Solved" figure when present.
    const solvedMatch = html.match(/Total Problems Solved:\s*([\d,]+)/i);
    const totalSolvedFromPage = solvedMatch ? Number(solvedMatch[1].replace(/,/g, '')) : null;

    return {
        name,
        profile: profileImage,
        currentRating,
        highestRating,
        stars,
        globalRank,
        countryRank,
        countryName,
        countryFlag,
        institution,
        totalSolvedFromPage
    };
}

// --- Public API ---------------------------------------------------------------
async function getCodechefData(handle) {
    const cacheKey = `codechef_${handle}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    let response;
    try {
        response = await axios.get(PROFILE_URL(handle), {
            timeout: REQUEST_TIMEOUT,
            headers: BROWSER_HEADERS,
            validateStatus: status => status >= 200 && status < 500
        });
    } catch (error) {
        throw new Error(`Failed to reach CodeChef: ${error.message}`);
    }

    if (response.status === 404) {
        throw new Error(`CodeChef user "${handle}" not found`);
    }

    const html = typeof response.data === 'string' ? response.data : String(response.data);
    const $ = cheerio.load(html);

    // A valid profile always renders the rating widget; its absence means the
    // handle doesn't exist (CodeChef serves a 200 "not found" shell otherwise).
    if ($('.user-details-container').length === 0 && $('.rating-number').length === 0) {
        throw new Error(`CodeChef user "${handle}" not found`);
    }

    const profile = parseProfile($, html);
    const ratingData = parseRatingData(html);
    const heatMap = parseHeatMap(html);

    const totalSolved = profile.totalSolvedFromPage !== null
        ? profile.totalSolvedFromPage
        : heatMap.reduce((sum, day) => sum + day.value, 0);

    const data = {
        handle,
        ...profile,
        ratingData,
        heatMap,
        totalSolved
    };
    delete data.totalSolvedFromPage;

    cache.set(cacheKey, data);
    return data;
}

module.exports = { getCodechefData };

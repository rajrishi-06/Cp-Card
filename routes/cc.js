// routes/cc.js
// CodeChef profile / graph / heatmap SVG cards.
// Data is crawled from the public CodeChef profile page (see utils/codechef.js);
// this file only renders the SVGs. All three card types are generated locally
// now, so there is no longer any dependency on the deprecated third-party API.
const express = require('express');
const router = express.Router();
const { getCodechefData } = require('../utils/codechef');
const {
    escapeXml,
    getImageAsBase64,
    errorSVG,
    isValidHandle,
    longestStreak,
    PLACEHOLDER_AVATAR,
    PLACEHOLDER_FLAG
} = require('../utils/helpers');
const { MONTH_NAMES, ccStarColor } = require('../utils/constants');
const { buildHeatmapSVG } = require('../utils/heatmap');

const CACHE_CONTROL = 'public, max-age=300, s-maxage=1800, stale-while-revalidate=86400';

async function getCodechefProfileImages(data) {
    const images = { profile: PLACEHOLDER_AVATAR, countryFlag: PLACEHOLDER_FLAG };
    try {
        if (data.profile) images.profile = await getImageAsBase64(data.profile);
        if (data.countryFlag) images.countryFlag = await getImageAsBase64(data.countryFlag);
    } catch (error) {
        // getImageAsBase64 already falls back to a placeholder; nothing to do.
    }
    return images;
}

async function generateCodechefProfileSVG(data) {
    try {
        const {
            name,
            currentRating,
            highestRating,
            countryFlag,
            countryName,
            globalRank,
            countryRank,
            stars,
            institution,
            totalSolved = 0,
            ratingData
        } = data;

        const images = await getCodechefProfileImages(data);
        const starColor = ccStarColor(stars);
        const lastContest = Array.isArray(ratingData) && ratingData.length > 0
            ? ratingData[ratingData.length - 1]
            : null;

        return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
        <svg width="500" height="300" style="border-radius:15px; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);"
             xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&amp;display=swap');
                .title { font: 700 24px 'Open Sans', sans-serif; }
                .rank { font: 700 20px 'Open Sans', sans-serif; }
                .info { font: 400 14px 'Open Sans', sans-serif; fill: #444; }
                .stat { font: 600 16px 'Open Sans', sans-serif; }
                .small-stat { font: 400 12px 'Open Sans', sans-serif; fill: #666; }
                .label { font: 400 11px 'Open Sans', sans-serif; fill: #666; }
            </style>

            <!-- Background with subtle gradient -->
            <defs>
                <linearGradient id="backgroundGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:#ffffff;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#f8f9fa;stop-opacity:1" />
                </linearGradient>
                <linearGradient id="headerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stop-color="${starColor}" stop-opacity="0.22" />
                    <stop offset="100%" stop-color="${starColor}" stop-opacity="0.06" />
                </linearGradient>
                <filter id="cardShadow" x="-10%" y="-10%" width="120%" height="120%">
                    <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.08"/>
                </filter>
            </defs>
            <rect width="500" height="300" fill="url(#backgroundGrad)"/>

            <!-- Decorative Elements -->
            <rect x="0" y="0" width="500" height="70" fill="url(#headerGrad)"/>
            <rect x="0" y="68" width="500" height="2" fill="${starColor}" opacity="0.5"/>

            <!-- User Info Section -->
            <g transform="translate(20, 20)">
                <!-- Stars and Name -->
                <text class="rank" fill="${starColor}" x="0" y="32">${escapeXml(stars)}</text>
                <text class="title" fill="${starColor}" x="55" y="32">${escapeXml(name)}</text>

                <!-- Location and Institution -->
                <g transform="translate(0, 55)">
                    ${countryFlag ? `
                        <image x="0" y="0" width="20" height="20" href="${images.countryFlag}"/>
                        <text class="info" x="28" y="14">${escapeXml(countryName || '')}</text>
                    ` : ''}
                    ${institution ? `
                        <text class="info" x="200" y="14">@ ${escapeXml(institution)}</text>
                    ` : ''}
                </g>

                <!-- Stats Grid -->
                <g transform="translate(0, 95)">
                    <!-- First Row -->
                    <g>
                        <rect x="0" y="0" width="150" height="60" fill="#ffffff" rx="10" stroke="${starColor}" stroke-opacity="0.25" filter="url(#cardShadow)"/>
                        <text class="stat" fill="${starColor}" x="75" y="26" text-anchor="middle">#${escapeXml(globalRank)}</text>
                        <text class="label" x="75" y="46" text-anchor="middle">Global Rank</text>
                    </g>
                    <g transform="translate(160, 0)">
                        <rect x="0" y="0" width="150" height="60" fill="#ffffff" rx="10" stroke="${starColor}" stroke-opacity="0.25" filter="url(#cardShadow)"/>
                        <text class="stat" fill="${starColor}" x="75" y="26" text-anchor="middle">#${escapeXml(countryRank)}</text>
                        <text class="label" x="75" y="46" text-anchor="middle">Country Rank</text>
                    </g>
                </g>

                <!-- Second Row -->
                <g transform="translate(0, 165)">
                    <g>
                        <rect x="0" y="0" width="150" height="60" fill="#ffffff" rx="10" stroke="${starColor}" stroke-opacity="0.25" filter="url(#cardShadow)"/>
                        <text class="stat" fill="${starColor}" x="75" y="26" text-anchor="middle">${escapeXml(currentRating)}</text>
                        <text class="label" x="75" y="46" text-anchor="middle">Current Rating</text>
                    </g>
                    <g transform="translate(160, 0)">
                        <rect x="0" y="0" width="150" height="60" fill="#ffffff" rx="10" stroke="${starColor}" stroke-opacity="0.25" filter="url(#cardShadow)"/>
                        <text class="stat" fill="${starColor}" x="75" y="26" text-anchor="middle">${totalSolved}</text>
                        <text class="label" x="75" y="46" text-anchor="middle">Problems Solved</text>
                    </g>
                </g>

                <!-- Last Contest Info -->
                ${lastContest ? `
                    <g transform="translate(0, 240)">
                        <text class="info" x="0" y="0">Last Contest: ${escapeXml(lastContest.name)}</text>
                        <text class="stat" x="0" y="20">Rank: #${escapeXml(String(lastContest.rank))}</text>
                    </g>
                ` : ''}
            </g>

            <!-- Profile Picture with Border and Shadow -->
            <defs>
                <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000" flood-opacity="0.1"/>
                </filter>
            </defs>
            <clipPath id="circleClip">
                <circle cx="430" cy="70" r="50"/>
            </clipPath>
            <circle cx="430" cy="70" r="50" fill="#fff" filter="url(#shadow)"/>
            <image x="380" y="20" width="100" height="100" href="${images.profile}"
                   clip-path="url(#circleClip)" preserveAspectRatio="xMidYMid slice"/>
            <circle cx="430" cy="70" r="50" fill="none" stroke="${starColor}" stroke-width="2"/>

            <!-- Max Rating Badge -->
            <g transform="translate(380, 130)">
                <rect x="0" y="0" width="100" height="30" fill="#ffffff" rx="15" stroke="${starColor}" stroke-opacity="0.3" filter="url(#cardShadow)"/>
                <text class="small-stat" fill="${starColor}" x="50" y="19" text-anchor="middle">max. ${escapeXml(highestRating)}</text>
            </g>
        </svg>`;
    } catch (error) {
        return errorSVG('Unable to generate Codechef profile');
    }
}

// CodeChef rating divisions -> band colour (mirrors the coloured background
// bands CodeChef draws behind its Highcharts rating graph).
const CC_RATING_BANDS = [
    { from: 0,    to: 1400,  color: '#999999' },
    { from: 1400, to: 1600,  color: '#1E7D22' },
    { from: 1600, to: 1800,  color: '#3366CC' },
    { from: 1800, to: 2000,  color: '#684273' },
    { from: 2000, to: 2200,  color: '#FFBF00' },
    { from: 2200, to: 2500,  color: '#FF7F00' },
    { from: 2500, to: 10000, color: '#D0011B' }
];

function generateCodechefGraphSVG(data) {
    try {
        const ratingData = Array.isArray(data.ratingData) ? data.ratingData : [];
        if (ratingData.length === 0) {
            return errorSVG('No rating data available');
        }

        // Sort by date without mutating the cached array.
        const sortedRatings = [...ratingData].sort((a, b) => new Date(a.date) - new Date(b.date));

        const width = 900;
        const height = 420;
        const padding = { top: 55, right: 40, bottom: 55, left: 60 };
        const plotLeft = padding.left;
        const plotRight = width - padding.right;
        const plotTop = padding.top;
        const plotBottom = height - padding.bottom;
        const graphWidth = plotRight - plotLeft;
        const graphHeight = plotBottom - plotTop;

        const ratings = sortedRatings.map(r => r.rating);
        const dataMin = Math.min(...ratings);
        const dataMax = Math.max(...ratings);
        // Pad to the nearest 100 so the curve doesn't touch the edges, and keep a
        // sensible minimum span for flat histories.
        let yMin = Math.floor((dataMin - 100) / 100) * 100;
        let yMax = Math.ceil((dataMax + 100) / 100) * 100;
        if (yMax - yMin < 200) yMax = yMin + 200;
        const ySpan = yMax - yMin;
        const denom = (sortedRatings.length - 1) || 1;

        const xFor = i => plotLeft + (i / denom) * graphWidth;
        const yFor = rating => plotTop + ((yMax - rating) / ySpan) * graphHeight;

        const lineColor = ccStarColor(data.stars);

        // Background rating bands clipped to the visible y-range.
        const bands = CC_RATING_BANDS.map(b => {
            const top = Math.min(b.to, yMax);
            const bottom = Math.max(b.from, yMin);
            if (bottom >= top) return '';
            const y = yFor(top);
            const h = yFor(bottom) - y;
            return `<rect x="${plotLeft}" y="${y}" width="${graphWidth}" height="${h}" fill="${b.color}" opacity="0.12"/>`;
        }).join('');

        // Horizontal gridlines + y labels at a readable step.
        const yStep = ySpan <= 600 ? 100 : ySpan <= 1400 ? 200 : 500;
        let yAxis = '';
        for (let v = Math.ceil(yMin / yStep) * yStep; v <= yMax; v += yStep) {
            const y = yFor(v);
            yAxis += `<line x1="${plotLeft}" y1="${y}" x2="${plotRight}" y2="${y}" stroke="#e2e8f0" stroke-width="1"/>
                <text x="${plotLeft - 10}" y="${y}" class="label" text-anchor="end" dominant-baseline="middle">${v}</text>`;
        }

        // X labels (dates), ~7 evenly spaced.
        const xTick = Math.max(1, Math.round((sortedRatings.length - 1) / 6));
        let xAxis = '';
        for (let i = 0; i < sortedRatings.length; i += xTick) {
            const d = new Date(sortedRatings[i].date);
            const label = Number.isNaN(d.getTime())
                ? ''
                : `${MONTH_NAMES[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
            xAxis += `<text x="${xFor(i)}" y="${plotBottom + 20}" class="label" text-anchor="middle">${label}</text>`;
        }

        const linePoints = sortedRatings.map((r, i) => `${xFor(i)},${yFor(r.rating)}`);
        const linePath = `M ${linePoints.join(' L ')}`;
        const areaPath = `${linePath} L ${xFor(sortedRatings.length - 1)},${plotBottom} L ${xFor(0)},${plotBottom} Z`;

        const dots = sortedRatings.map((r, i) => `
            <circle cx="${xFor(i)}" cy="${yFor(r.rating)}" r="3.5" fill="${lineColor}" stroke="#ffffff" stroke-width="1.5">
                <title>${escapeXml(r.name)}: ${r.rating}</title>
            </circle>
        `).join('');

        const current = data.currentRating || (ratings.length ? ratings[ratings.length - 1] : '');
        const highest = data.highestRating || dataMax;

        return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
        <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"
             style="border-radius:15px; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);"
             xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&amp;display=swap');
                .title { font: 700 18px 'Open Sans', sans-serif; fill: #2d3748; }
                .subtitle { font: 600 13px 'Open Sans', sans-serif; }
                .label { font: 400 11px 'Open Sans', sans-serif; fill: #718096; }
            </style>
            <defs>
                <linearGradient id="ccAreaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stop-color="${lineColor}" stop-opacity="0.35" />
                    <stop offset="100%" stop-color="${lineColor}" stop-opacity="0.02" />
                </linearGradient>
            </defs>

            <!-- Background -->
            <rect width="${width}" height="${height}" fill="#ffffff"/>

            <!-- Rating bands + grid -->
            ${bands}
            ${yAxis}

            <!-- Plot border -->
            <rect x="${plotLeft}" y="${plotTop}" width="${graphWidth}" height="${graphHeight}" fill="none" stroke="#cbd5e0" stroke-width="1"/>

            <!-- Area + line -->
            <path d="${areaPath}" fill="url(#ccAreaGrad)" stroke="none"/>
            <path d="${linePath}" fill="none" stroke="${lineColor}" stroke-width="2.5" stroke-linejoin="round"/>
            ${dots}

            <!-- X labels -->
            ${xAxis}

            <!-- Header -->
            <text x="${plotLeft}" y="32" class="title">Rating History</text>
            <text x="${plotRight}" y="32" class="subtitle" text-anchor="end" fill="${lineColor}">${escapeXml(String(current))} (max. ${escapeXml(String(highest))})</text>
        </svg>`;
    } catch (error) {
        return errorSVG('Unable to generate rating graph');
    }
}

function generateCodechefHeatmapSVG(data) {
    try {
        // An empty heatMap still renders a valid (all-empty) grid rather than an
        // error card, so low-activity users get a heatmap, not a failure.
        const heatMap = Array.isArray(data.heatMap) ? data.heatMap : [];

        // Map each date to its submission count.
        const valueByDate = new Map();
        heatMap.forEach(d => {
            if (d && d.date) valueByDate.set(d.date.slice(0, 10), Number(d.value) || 0);
        });

        const now = new Date();
        const oneYearAgo = new Date(now);
        oneYearAgo.setFullYear(now.getFullYear() - 1);
        const oneMonthAgo = new Date(now);
        oneMonthAgo.setMonth(now.getMonth() - 1);

        // Submission totals over the data we have. Crawler dates are bare
        // YYYY-MM-DD, treated as UTC calendar days.
        const sum = (since) => heatMap.reduce((acc, d) => {
            if (!d || !d.date) return acc;
            const t = Date.parse(`${d.date.slice(0, 10)}T00:00:00Z`);
            if (since !== undefined && !(t >= since.getTime())) return acc;
            return acc + (Number(d.value) || 0);
        }, 0);

        const totalSubmissions = sum();
        const lastYearSubmissions = sum(oneYearAgo);
        const lastMonthSubmissions = sum(oneMonthAgo);

        const activeDays = heatMap
            .filter(d => d && d.date && (Number(d.value) || 0) > 0)
            .map(d => d.date.slice(0, 10));
        const maxStreak = longestStreak(activeDays);
        const lastYearStreak = longestStreak(activeDays, oneYearAgo.getTime());
        const lastMonthStreak = longestStreak(activeDays, oneMonthAgo.getTime());

        return buildHeatmapSVG({
            valueByDate,
            unit: 'submissions',
            colorFor: v => v <= 0 ? '#ebedf0' : v <= 2 ? '#9be9a8' : v <= 4 ? '#40c463' : v <= 6 ? '#30a14e' : '#216e39',
            topStats: [
                { big: `${totalSubmissions}`, small: 'submissions for all time' },
                { big: `${lastYearSubmissions}`, small: 'submissions for the last year' },
                { big: `${lastMonthSubmissions}`, small: 'submissions for the last month' }
            ],
            bottomStats: [
                { big: `${maxStreak} days`, small: 'in a row max.' },
                { big: `${lastYearStreak} days`, small: 'in a row for the last year' },
                { big: `${lastMonthStreak} days`, small: 'in a row for the last month' }
            ]
        });
    } catch (error) {
        return errorSVG('Unable to generate heatmap');
    }
}

// --- Routes -------------------------------------------------------------------
function sendSvg(res, svg, status = 200) {
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', CACHE_CONTROL);
    res.status(status).send(svg);
}

router.get('/:handle/profile', async (req, res) => {
    const { handle } = req.params;
    if (!isValidHandle(handle)) {
        return sendSvg(res, errorSVG('Invalid CodeChef handle'), 400);
    }
    try {
        const data = await getCodechefData(handle);
        sendSvg(res, await generateCodechefProfileSVG(data));
    } catch (error) {
        sendSvg(res, errorSVG(`Unable to load CodeChef profile for "${escapeXml(handle)}"`), 500);
    }
});

router.get('/:handle/graph', async (req, res) => {
    const { handle } = req.params;
    if (!isValidHandle(handle)) {
        return sendSvg(res, errorSVG('Invalid CodeChef handle'), 400);
    }
    try {
        const data = await getCodechefData(handle);
        sendSvg(res, generateCodechefGraphSVG(data));
    } catch (error) {
        sendSvg(res, errorSVG(`Unable to load CodeChef rating graph for "${escapeXml(handle)}"`), 500);
    }
});

router.get('/:handle/heatmap', async (req, res) => {
    const { handle } = req.params;
    if (!isValidHandle(handle)) {
        return sendSvg(res, errorSVG('Invalid CodeChef handle'), 400);
    }
    try {
        const data = await getCodechefData(handle);
        sendSvg(res, generateCodechefHeatmapSVG(data));
    } catch (error) {
        sendSvg(res, errorSVG(`Unable to load CodeChef heatmap for "${escapeXml(handle)}"`), 500);
    }
});

router.get('/:handle', (req, res) => {
    res.redirect(`/card/cc/${req.params.handle}/profile`);
});

module.exports = router;

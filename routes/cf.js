// routes/cf.js
// Codeforces profile / graph / heatmap SVG cards.
// Data fetching (throttling + multi-credential rotation) lives in
// utils/codeforces.js so this file only deals with rendering.
const express = require('express');
const router = express.Router();
const { getCodeforcesData } = require('../utils/codeforces');
const { escapeXml, formatTimeAgo, getImageAsBase64, errorSVG, isValidHandle, longestStreak } = require('../utils/helpers');
const { MONTH_NAMES, cfRankColor } = require('../utils/constants');
const { buildHeatmapSVG } = require('../utils/heatmap');

const CACHE_CONTROL = 'public, max-age=300, s-maxage=1800, stale-while-revalidate=86400';

// Unique solved-problem key for a submission.
const problemKey = sub => `${sub.problem.contestId}-${sub.problem.index}`;

async function generateProfileSVG(data) {
    try {
        if (!data || !data.user) {
            throw new Error('Invalid data format');
        }

        const width = 500;
        const height = 300;

        const { user } = data;
        const maxRating = user.maxRating || 0;
        const currentRating = user.rating || 0;
        const rank = user.rank || 'unrated';
        const contribution = user.contribution || 0;
        const lastOnline = formatTimeAgo(user.lastOnlineTimeSeconds);
        const registered = formatTimeAgo(user.registrationTimeSeconds);

        // Ensure avatar URL is absolute and convert to base64
        let avatar = user.titlePhoto || 'https://userpic.codeforces.org/no-title.jpg';
        if (!avatar.startsWith('http')) {
            avatar = `https:${avatar}`;
        }
        // getImageAsBase64 already returns a placeholder on failure.
        const avatarBase64 = await getImageAsBase64(avatar);

        const rankColor = cfRankColor(rank);

        return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
        <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"
             style="border-radius:15px; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);"
             xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&amp;display=swap');
                .title { font: 700 24px 'Open Sans', sans-serif; }
                .rank { font: 700 20px 'Open Sans', sans-serif; }
                .info { font: 400 14px 'Open Sans', sans-serif; fill: #444; }
                .stat { font: 600 16px 'Open Sans', sans-serif; }
                .small-stat { font: 400 12px 'Open Sans', sans-serif; fill: #666; }
                .label { font: 400 11px 'Open Sans', sans-serif; fill: #666; }
                .time-info { font: 400 12px 'Open Sans', sans-serif; fill: #666; }
            </style>

            <!-- Background with enhanced gradient -->
            <defs>
                <linearGradient id="backgroundGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:#ffffff;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#f0f2f5;stop-opacity:1" />
                </linearGradient>
            </defs>
            <rect width="${width}" height="${height}" fill="url(#backgroundGrad)"/>

            <!-- Decorative Elements -->
            <rect x="0" y="0" width="500" height="80" fill="${rankColor}" opacity="0.15"/>
            <path d="M0,80 L500,80" stroke="#eee" stroke-width="1"/>

            <!-- User Info Section -->
            <g transform="translate(20, 25)">
                <!-- Rank and Handle -->
                <text class="rank" fill="${rankColor}" x="0" y="20">${escapeXml(rank.charAt(0).toUpperCase() + rank.slice(1))}</text>
                <text class="title" fill="${rankColor}" x="0" y="45">${escapeXml(user.handle)}</text>

                <!-- Location and Organization -->
                <g transform="translate(0, 60)">
                    <!-- Location with icon -->
                    <g>
                        <path d="M7,0C3.13,0,0,3.13,0,7c0,5.25,7,13,7,13s7-7.75,7-13C14,3.13,10.87,0,7,0z M7,9.5C5.62,9.5,4.5,8.38,4.5,7 S5.62,4.5,7,4.5S9.5,5.62,9.5,7S8.38,9.5,7,9.5z"
                              fill="#666666" transform="translate(0, -3) scale(0.9)"/>
                        <text class="info" x="20" y="10">
                            ${user.city || user.country ?
                                `${[user.city, user.country].filter(Boolean).map(escapeXml).join(', ')}` :
                                'No location'}
                        </text>
                    </g>

                    <!-- Organization with icon -->
                    <g transform="translate(0, 18)">
                        <path d="M12,0H4C2.9,0,2,0.9,2,2v14c0,1.1,0.9,2,2,2h8c1.1,0,2-0.9,2-2V2C14,0.9,13.1,0,12,0z M12,16H4V2h8V16z M6,4h4v2H6V4z M6,8h4v2H6V8z M6,12h4v2H6V12z"
                              fill="#666666" transform="translate(0, -2) scale(0.8)"/>
                        <text class="info" x="20" y="10">
                            ${user.organization ?
                                `@ ${escapeXml(user.organization)}` :
                                'No organization'}
                        </text>
                    </g>
                </g>

                <!-- Stats Grid -->
                <g transform="translate(0, 100)">
                    <!-- First Row -->
                    <g>
                        <rect x="0" y="0" width="150" height="60" fill="#ffffff" rx="8" filter="url(#cardShadow)"/>
                        <text class="stat" x="75" y="25" text-anchor="middle">${currentRating}</text>
                        <text class="label" x="75" y="45" text-anchor="middle">Current Rating</text>
                    </g>
                    <g transform="translate(160, 0)">
                        <rect x="0" y="0" width="150" height="60" fill="#ffffff" rx="8" filter="url(#cardShadow)"/>
                        <text class="stat" x="75" y="25" text-anchor="middle">${data.ratings ? data.ratings.length : 0}</text>
                        <text class="label" x="75" y="45" text-anchor="middle">Contests</text>
                    </g>
                </g>

                <!-- Second Row -->
                <g transform="translate(0, 170)">
                    <g>
                        <rect x="0" y="0" width="150" height="60" fill="#ffffff" rx="8" filter="url(#cardShadow)"/>
                        <text class="stat" x="75" y="25" text-anchor="middle" fill="${contribution > 0 ? 'green' : 'red'}">${contribution > 0 ? '+' : ''}${contribution}</text>
                        <text class="label" x="75" y="45" text-anchor="middle">Contribution</text>
                    </g>
                    <g transform="translate(160, 0)">
                        <rect x="0" y="0" width="150" height="60" fill="#ffffff" rx="8" filter="url(#cardShadow)"/>
                        <text class="stat" x="75" y="25" text-anchor="middle">${
                            new Set((data.submissions || [])
                                .filter(sub => sub.verdict === 'OK')
                                .map(problemKey)
                            ).size || 0
                        }</text>
                        <text class="label" x="75" y="45" text-anchor="middle">Problems Solved</text>
                    </g>
                    <g transform="translate(320, 0)">
                        <rect x="0" y="0" width="150" height="60" fill="#ffffff" rx="8" filter="url(#cardShadow)"/>
                        <text class="stat" x="75" y="25" text-anchor="middle">${user.friendOfCount || 0}</text>
                        <text class="label" x="75" y="45" text-anchor="middle">Friend of</text>
                    </g>
                </g>

                <!-- Time Info at Bottom -->
                <g transform="translate(0, 250)">
                    <text class="time-info" x="0" y="5">Last online: ${escapeXml(lastOnline)}</text>
                    <text class="time-info" x="165" y="5">Registered: ${escapeXml(registered)}</text>
                </g>
            </g>

            <!-- Profile Picture with Enhanced Shadow -->
            <defs>
                <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000" flood-opacity="0.15"/>
                </filter>
                <filter id="cardShadow" x="-10%" y="-10%" width="120%" height="120%">
                    <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.1"/>
                </filter>
            </defs>
            <clipPath id="circleClip">
                <circle cx="430" cy="70" r="50"/>
            </clipPath>
            <circle cx="430" cy="70" r="50" fill="#fff" filter="url(#shadow)"/>
            <image x="380" y="20" width="100" height="100" href="${avatarBase64}"
                   clip-path="url(#circleClip)" preserveAspectRatio="xMidYMid slice"/>
            <circle cx="430" cy="70" r="50" fill="none" stroke="${rankColor}" stroke-width="2"/>

            <!-- Max Rating Badge Below Profile -->
            <g transform="translate(380, 130)">
                <text class="small-stat" x="50" y="13" text-anchor="middle" font-size="10">max. ${maxRating}</text>
            </g>
        </svg>`;
    } catch (error) {
        throw new Error(`Failed to generate profile SVG: ${error.message}`);
    }
}

function generateGraphSVG(data) {
    try {
        const { user, ratings } = data;
        const rank = user.rank || 'unrated';
        const currentRating = user.rating || 0;
        const maxRating = user.maxRating || 0;

        const rankColor = cfRankColor(rank);

        // Generate rating graph
        const graphWidth = 900;
        const graphHeight = 420;
        const padding = {
            top: 20,
            right: 30,
            bottom: 80,
            left: 50
        };

        // Ensure ratings is an array and sort it
        const ratings_sorted = Array.isArray(ratings)
            ? [...ratings].sort((a, b) => a.ratingUpdateTimeSeconds - b.ratingUpdateTimeSeconds)
            : [];

        if (ratings_sorted.length === 0) {
            return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
            <svg width="900" height="420" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
                <rect width="900" height="420" rx="50" ry="50" fill="#f8f9fa"/>
                <text x="450" y="210" text-anchor="middle" font-family="Open Sans" font-size="16">
                    No rating history available for ${escapeXml(user.handle)}
                </text>
            </svg>`;
        }

        // Calculate user's minimum rating
        const userMinRating = Math.min(...ratings_sorted.map(r => r.newRating));

        // Calculate dynamic max rating (round up to nearest 100)
        const dynamicMaxRating = Math.ceil((Math.max(maxRating, 3000) + 200) / 100) * 100;

        // Rating ranges for background colors (in reverse order for proper layering)
        const ratingRanges = [
            { min: 3000, max: dynamicMaxRating, color: '#FF0000', opacity: 0.1 },
            { min: 2400, max: 3000, color: '#FF8C00', opacity: 0.1 },
            { min: 2100, max: 2400, color: '#AA00AA', opacity: 0.1 },
            { min: 1900, max: 2100, color: '#0000FF', opacity: 0.1 },
            { min: 1600, max: 1900, color: '#03A89E', opacity: 0.1 },
            { min: 1400, max: 1600, color: '#008000', opacity: 0.1 },
            { min: 1200, max: 1400, color: '#808080', opacity: 0.1 },
            { min: userMinRating, max: 1200, color: '#CCCCCC', opacity: 0.1 }
        ];

        // Calculate graph scales (guard against a single contest / zero spans)
        const timeRange = {
            min: ratings_sorted[0].ratingUpdateTimeSeconds,
            max: ratings_sorted[ratings_sorted.length - 1].ratingUpdateTimeSeconds
        };
        const timeSpan = (timeRange.max - timeRange.min) || 1;

        const ratingRange = {
            min: userMinRating,
            max: dynamicMaxRating
        };
        const ratingSpan = (ratingRange.max - ratingRange.min) || 1;

        const xFor = r => ((r.ratingUpdateTimeSeconds - timeRange.min) / timeSpan) * (graphWidth - padding.left - padding.right) + padding.left;
        const yFor = r => 385 - ((r.newRating - ratingRange.min) / ratingSpan) * 365;

        // Generate graph points
        const graphPoints = ratings_sorted
            .map((r, i) => `${i === 0 ? 'M' : 'L'} ${xFor(r)},${yFor(r)}`)
            .join(' ');

        // Generate dots and tooltips together
        const dots = ratings_sorted.map(r => {
            const x = xFor(r);
            const y = yFor(r);
            const date = new Date(r.ratingUpdateTimeSeconds * 1000);
            const tooltipText = `${r.newRating} - ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;

            return `
                <g class="rating-point">
                    <circle cx="${x}" cy="${y}" r="3" fill="${rankColor}"/>
                    <g class="tooltip" opacity="0">
                        <rect x="${x - 50}" y="${y - 30}" width="100" height="20" rx="5" fill="black" opacity="0.8"/>
                        <text x="${x}" y="${y - 16}" text-anchor="middle" fill="white" class="tooltip-text">${tooltipText}</text>
                    </g>
                </g>
            `;
        }).join('');

        // Generate background stripes with dynamic max rating
        const backgroundStripes = ratingRanges.map(range => {
            const y1 = Math.min(385, 385 - ((range.min - ratingRange.min) / ratingSpan) * 365);
            const y2 = Math.min(385, 385 - ((range.max - ratingRange.min) / ratingSpan) * 365);

            // Only create stripe if it's above the x-axis
            if (y2 < 385) {
                return `<rect x="${padding.left}" y="${y2}" width="${graphWidth - padding.left - padding.right}" height="${y1 - y2}" fill="${range.color}" opacity="${range.opacity}"/>`;
            }
            return '';
        }).join('');

        // Calculate x-axis label positions with better spacing
        const xAxisLabels = (() => {
            const minSpacing = 100; // Minimum pixels between labels
            let lastX = -Infinity;
            let lastShownIndex = -1;
            let labels = '';

            const addLabel = (r, i) => {
                const date = new Date(r.ratingUpdateTimeSeconds * 1000);
                const x = xFor(r);

                if (i === 0 || i === ratings_sorted.length - 1 || (x - lastX >= minSpacing)) {
                    lastX = x;
                    lastShownIndex = i;
                    return `<text x="${x}" y="400" text-anchor="middle" class="axis-label">${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}</text>`;
                }
                return '';
            };

            labels += addLabel(ratings_sorted[0], 0);

            for (let i = 1; i < ratings_sorted.length - 1; i++) {
                labels += addLabel(ratings_sorted[i], i);
            }

            if (ratings_sorted.length > 1) {
                const lastPoint = ratings_sorted[ratings_sorted.length - 1];
                const lastPointX = xFor(lastPoint);
                const prevX = xFor(ratings_sorted[lastShownIndex]);

                if (lastPointX - prevX >= minSpacing) {
                    labels += addLabel(lastPoint, ratings_sorted.length - 1);
                }
            }

            return labels;
        })();

        // Generate y-axis labels with dynamic max rating
        const yAxisLabels = ratingRanges.map((range, index) => {
            const isLast = index === ratingRanges.length - 1;
            const y = isLast
                ? 385
                : 385 - ((range.min - ratingRange.min) / ratingSpan) * 365;

            // Only show labels and grid lines above x-axis
            if (y <= 385) {
                return `
                    <text x="${padding.left - 10}" y="${y}" text-anchor="end" class="axis-label" dominant-baseline="middle">${range.min}</text>
                    <line x1="${padding.left}" y1="${y}" x2="${graphWidth - padding.right}" y2="${y}" class="grid-line"/>
                `;
            }
            return '';
        }).join('');

        const ratingsText = `
            <text x="${padding.left}" y="${padding.top - 5}" class="ratings-label">
                Contest rating: <tspan font-weight="bold">${currentRating}</tspan>
                (max. <tspan font-weight="bold">${maxRating}</tspan>)
            </text>
        `;

        const handleLabel = `<text x="${graphWidth - padding.right}" y="${padding.top - 5}" text-anchor="end" class="handle-label">${escapeXml(user.handle)}</text>`;

        return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
        <svg width="${graphWidth}" height="${graphHeight}" viewBox="0 0 ${graphWidth} ${graphHeight}"
             style="border-radius:15px; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&amp;display=swap');
                .axis-label { font: 400 11px 'Open Sans', sans-serif; fill: #666; }
                .handle-label { font: 600 14px 'Open Sans', sans-serif; fill: #666; }
                .ratings-label { font: 600 14px 'Open Sans', sans-serif; fill: #000; }
                .graph-path { stroke: ${rankColor}; stroke-width: 1.5; fill: none; }
                .grid-line { stroke: #ddd; stroke-width: 1; opacity: 0.5; }
                .border { stroke: #000; stroke-width: 1; fill: none; }
                .tooltip-text { font: 400 11px 'Open Sans', sans-serif; }
                .rating-point .tooltip {
                    opacity: 0;
                    visibility: hidden;
                    transition: opacity 0.2s, visibility 0.2s;
                }
                .rating-point:hover .tooltip {
                    z-index: 100;
                    opacity: 1;
                    visibility: visible;
                }
            </style>

            <!-- Graph Area -->
            <g transform="translate(0, 0)">
                <!-- Background stripes -->
                ${backgroundStripes}

                <!-- Grid lines and axis labels -->
                ${yAxisLabels}

                <!-- X-axis line -->
                <line x1="50" y1="385" x2="870" y2="385" class="border"/>

                <!-- Y-axis line -->
                <line x1="50" y1="${padding.top}" x2="50" y2="385" class="border"/>

                <!-- Rating curve and points with tooltips -->
                <path d="${graphPoints}" class="graph-path"/>
                ${dots}

                <!-- X-axis labels -->
                ${xAxisLabels}

                <!-- Ratings text -->
                ${ratingsText}

                <!-- Handle label -->
                ${handleLabel}
            </g>
        </svg>`;
    } catch (error) {
        throw new Error(`Failed to generate graph SVG: ${error.message}`);
    }
}

function generateHeatmapSVG(data) {
    try {
        const { submissions } = data;
        const now = new Date();
        const oneYearAgo = new Date(now);
        oneYearAgo.setFullYear(now.getFullYear() - 1);
        const oneMonthAgo = new Date(now);
        oneMonthAgo.setMonth(now.getMonth() - 1);

        const acceptedSubmissions = (submissions || []).filter(sub => sub.verdict === 'OK');

        // Unique problems solved per UTC day -> { dateKey: count }.
        const solvedByDate = new Map();
        acceptedSubmissions.forEach(sub => {
            const dateKey = new Date(sub.creationTimeSeconds * 1000).toISOString().slice(0, 10);
            if (!solvedByDate.has(dateKey)) solvedByDate.set(dateKey, new Set());
            solvedByDate.get(dateKey).add(problemKey(sub));
        });
        const valueByDate = new Map();
        for (const [dateKey, set] of solvedByDate) valueByDate.set(dateKey, set.size);

        // Statistics
        const totalSolved = new Set(acceptedSubmissions.map(problemKey)).size;
        const lastYearSolved = new Set(acceptedSubmissions
            .filter(sub => new Date(sub.creationTimeSeconds * 1000) >= oneYearAgo)
            .map(problemKey)).size;
        const lastMonthSolved = new Set(acceptedSubmissions
            .filter(sub => new Date(sub.creationTimeSeconds * 1000) >= oneMonthAgo)
            .map(problemKey)).size;

        const activeDays = acceptedSubmissions.map(sub =>
            new Date(sub.creationTimeSeconds * 1000).toISOString().slice(0, 10));
        const maxStreak = longestStreak(activeDays);
        const lastYearStreak = longestStreak(activeDays, oneYearAgo.getTime());
        const lastMonthStreak = longestStreak(activeDays, oneMonthAgo.getTime());

        return buildHeatmapSVG({
            valueByDate,
            unit: 'problems',
            colorFor: v => v <= 0 ? '#ebedf0' : v >= 5 ? '#196127' : v >= 3 ? '#239a3b' : v >= 2 ? '#40c463' : '#9be9a8',
            topStats: [
                { big: `${totalSolved} problems`, small: 'solved for all time' },
                { big: `${lastYearSolved} problems`, small: 'solved for the last year' },
                { big: `${lastMonthSolved} problems`, small: 'solved for the last month' }
            ],
            bottomStats: [
                { big: `${maxStreak} days`, small: 'in a row max.' },
                { big: `${lastYearStreak} days`, small: 'in a row for the last year' },
                { big: `${lastMonthStreak} days`, small: 'in a row for the last month' }
            ]
        });
    } catch (error) {
        throw new Error(`Failed to generate heatmap SVG: ${error.message}`);
    }
}

function sendSvg(res, svg, status = 200) {
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', CACHE_CONTROL);
    res.status(status).send(svg);
}

router.get('/:handle/profile', async (req, res) => {
    const { handle } = req.params;
    if (!isValidHandle(handle)) {
        return sendSvg(res, errorSVG('Invalid Codeforces handle'), 400);
    }
    try {
        const data = await getCodeforcesData(handle);
        sendSvg(res, await generateProfileSVG(data));
    } catch (error) {
        sendSvg(res, errorSVG(`Unable to load profile for "${escapeXml(handle)}". ${error.message}`), 500);
    }
});

router.get('/:handle/graph', async (req, res) => {
    const { handle } = req.params;
    if (!isValidHandle(handle)) {
        return sendSvg(res, errorSVG('Invalid Codeforces handle'), 400);
    }
    try {
        const data = await getCodeforcesData(handle);
        sendSvg(res, generateGraphSVG(data));
    } catch (error) {
        sendSvg(res, errorSVG(`Unable to load rating graph for "${escapeXml(handle)}". Please check if the handle exists.`), 500);
    }
});

router.get('/:handle/heatmap', async (req, res) => {
    const { handle } = req.params;
    if (!isValidHandle(handle)) {
        return sendSvg(res, errorSVG('Invalid Codeforces handle'), 400);
    }
    try {
        const data = await getCodeforcesData(handle);
        sendSvg(res, generateHeatmapSVG(data));
    } catch (error) {
        sendSvg(res, errorSVG(`Unable to generate heatmap for "${escapeXml(handle)}". Please try again later.`), 500);
    }
});

router.get('/:handle', (req, res) => {
    res.redirect(`/card/cf/${req.params.handle}/profile`);
});

module.exports = router;

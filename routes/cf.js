// routes/cf.js
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const router = express.Router();
const { escapeXml, formatTimeAgo, getImageAsBase64, errorSVG } = require('../utils/helpers');

const API_KEY = process.env.API_KEY;
const API_SECRET = process.env.API_SECRET;
const cache = new Map();
const CACHE_DURATION = 5 * 60 * 1000;


function generateApiSig(methodName, params) {
    const rand = Math.random().toString(36).substring(2, 8);
    const sortedParams = Object.entries(params)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join('&');
    
    const stringToHash = `${rand}/${methodName}?${sortedParams}#${API_SECRET}`;
    const hash = crypto.createHash('sha512').update(stringToHash).digest('hex');
    return `${rand}${hash}`;
}

async function getCodeforcesData(handle) {
    const cacheKey = `user_${handle}`;
    if (cache.has(cacheKey)) {
        const { data, timestamp } = cache.get(cacheKey);
        if (Date.now() - timestamp < CACHE_DURATION) {
            return data;
        }
    }

    const maxRetries = 3;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const currentTime = Math.floor(Date.now() / 1000);
            const params = {
                apiKey: API_KEY,
                time: currentTime,
                handles: handle
            };
            
            const apiSig = generateApiSig('user.info', params);
            
            if (attempt > 1) {
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            }

            const [userInfo, userRating, userStatus] = await Promise.all([
                axios.get(`https://codeforces.com/api/user.info?handles=${handle}&apiKey=${API_KEY}&time=${currentTime}&apiSig=${apiSig}`, {
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'Codeforces-Profile-Card/1.0'
                    }
                }),
                axios.get(`https://codeforces.com/api/user.rating?handle=${handle}`, {
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'Codeforces-Profile-Card/1.0'
                    }
                }),
                axios.get(`https://codeforces.com/api/user.status?handle=${handle}`, {
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'Codeforces-Profile-Card/1.0'
                    }
                })
            ]);

            if (userInfo.data.status !== 'OK' || userRating.data.status !== 'OK' || userStatus.data.status !== 'OK') {
                throw new Error('Invalid response from Codeforces API');
            }

            const data = {
                user: userInfo.data.result[0],
                ratings: userRating.data.result,
                submissions: userStatus.data.result
            };

            cache.set(cacheKey, {
                data,
                timestamp: Date.now()
            });

            return data;
        } catch (error) {
            lastError = error;
            if (error.response && error.response.status >= 400 && error.response.status < 500) {
                throw new Error(`Codeforces API error: ${error.response.status} - ${error.response.data?.comment || 'User not found'}`);
            }
            if (attempt === maxRetries) {
                throw new Error(`Failed to fetch Codeforces data after ${maxRetries} attempts: ${error.message}`);
            }
        }
    }
}

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
        const maxRank = user.maxRank || 'unrated';
        const contribution = user.contribution || 0;
        const lastOnline = formatTimeAgo(user.lastOnlineTimeSeconds);
        const registered = formatTimeAgo(user.registrationTimeSeconds);
        
        // Ensure avatar URL is absolute and convert to base64
        let avatar = user.titlePhoto || 'https://userpic.codeforces.org/no-title.jpg';
        if (!avatar.startsWith('http')) {
            avatar = `https:${avatar}`;
        }
        
        // Convert avatar to base64 with error handling
        let avatarBase64;
        try {
            avatarBase64 = await getImageAsBase64(avatar);
        } catch (error) {
            avatarBase64 = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiB2aWV3Qm94PSIwIDAgMTAwIDEwMCI+PHJlY3Qgd2lkdGg9IjEwMCIgaGVpZ2h0PSIxMDAiIGZpbGw9IiNlZWUiLz48dGV4dCB4PSI1MCIgeT0iNTAiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzY2NiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5vIEltYWdlPC90ZXh0Pjwvc3ZnPg==';
        }

        // Color mapping for ranks
        const rankColors = {
            'newbie': '#808080',
            'pupil': '#008000',
            'specialist': '#03A89E',
            'expert': '#0000FF',
            'candidate master': '#AA00AA',
            'master': '#FF8C00',
            'international master': '#FF8C00',
            'grandmaster': '#FF0000',
            'international grandmaster': '#FF0000',
            'legendary grandmaster': '#FF0000',
            'unrated': '#000000'
        };

        const rankColor = rankColors[rank.toLowerCase()] || '#000000';

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
                                `${[user.city, user.country].filter(Boolean).join(', ')}` : 
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

                <!-- Stats Grid - Only 4 blocks -->
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
                            new Set(data.submissions
                                .filter(sub => sub.verdict === 'OK')
                                .map(sub => sub.problem.contestId + '-' + sub.problem.index)
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
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const { user, ratings } = data;
        const rank = user.rank || 'unrated';
        const currentRating = user.rating || 0;
        const maxRating = user.maxRating || 0;
        
        // Color mapping for ranks
        const rankColors = {
            'newbie': '#808080',
            'pupil': '#008000',
            'specialist': '#03A89E',
            'expert': '#0000FF',
            'candidate master': '#AA00AA',
            'master': '#FF8C00',
            'international master': '#FF8C00',
            'grandmaster': '#FF0000',
            'international grandmaster': '#FF0000',
            'legendary grandmaster': '#FF0000',
            'unrated': '#000000'
        };

        const rankColor = rankColors[rank.toLowerCase()] || '#000000';

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
        const ratings_sorted = Array.isArray(ratings) ? [...ratings].sort((a, b) => a.ratingUpdateTimeSeconds - b.ratingUpdateTimeSeconds) : [];
        
        console.log('Sorted ratings count:', ratings_sorted.length);

        if (ratings_sorted.length === 0) {
            console.log('No ratings found for user:', user.handle);
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

        // Calculate graph scales
        const timeRange = ratings_sorted.length > 0 ? {
            min: ratings_sorted[0].ratingUpdateTimeSeconds,
            max: ratings_sorted[ratings_sorted.length - 1].ratingUpdateTimeSeconds
        } : { min: 0, max: 1 };

        const ratingRange = {
            min: userMinRating,
            max: dynamicMaxRating
        };

        // Generate graph points
        let graphPoints = '';
        let dots = '';
        
        if (ratings_sorted.length > 0) {
            graphPoints = ratings_sorted.map((r, i) => {
                const x = ((r.ratingUpdateTimeSeconds - timeRange.min) / (timeRange.max - timeRange.min)) * (graphWidth - padding.left - padding.right) + padding.left;
                const y = 385 - ((r.newRating - ratingRange.min) / (ratingRange.max - ratingRange.min)) * 365;
                return `${i === 0 ? 'M' : 'L'} ${x},${y}`;
            }).join(' ');

            // Generate dots and tooltips together
            dots = ratings_sorted.map((r, i) => {
                const x = ((r.ratingUpdateTimeSeconds - timeRange.min) / (timeRange.max - timeRange.min)) * (graphWidth - padding.left - padding.right) + padding.left;
                const y = 385 - ((r.newRating - ratingRange.min) / (ratingRange.max - ratingRange.min)) * 365;
                const date = new Date(r.ratingUpdateTimeSeconds * 1000);
                const tooltipText = `${r.newRating} - ${monthNames[date.getMonth()]} ${date.getFullYear()}`;
                
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
        }

        // Generate background stripes with dynamic max rating
        const backgroundStripes = ratingRanges.map((range, index) => {
            const y1 = Math.min(385, 385 - ((range.min - ratingRange.min) / (ratingRange.max - ratingRange.min)) * 365);
            const y2 = Math.min(385, 385 - ((range.max - ratingRange.min) / (ratingRange.max - ratingRange.min)) * 365);
            
            // Only create stripe if it's above the x-axis
            if (y2 < 385) {
                return `<rect x="${padding.left}" y="${y2}" width="${graphWidth - padding.left - padding.right}" height="${y1 - y2}" fill="${range.color}" opacity="${range.opacity}"/>`;
            }
            return ''; // Skip stripes that would appear below x-axis
        }).join('');

        // Calculate x-axis label positions with better spacing
        const xAxisLabels = (() => {
            const minSpacing = 100; // Minimum pixels between labels
            let lastX = -Infinity;
            let lastShownIndex = -1;
            let labels = '';

            // Always show first and last points
            const addLabel = (r, i) => {
                const date = new Date(r.ratingUpdateTimeSeconds * 1000);
                const x = ((r.ratingUpdateTimeSeconds - timeRange.min) / (timeRange.max - timeRange.min)) * (graphWidth - padding.left - padding.right) + padding.left;
                
                if (i === 0 || i === ratings_sorted.length - 1 || (x - lastX >= minSpacing)) {
                    lastX = x;
                    lastShownIndex = i;
                    return `<text x="${x}" y="400" text-anchor="middle" class="axis-label">${monthNames[date.getMonth()]} ${date.getFullYear()}</text>`;
                }
                return '';
            };

            // Add first label
            if (ratings_sorted.length > 0) {
                labels += addLabel(ratings_sorted[0], 0);
            }

            // Add middle labels with spacing check
            for (let i = 1; i < ratings_sorted.length - 1; i++) {
                labels += addLabel(ratings_sorted[i], i);
            }

            // Add last label only if it's not too close to the previous one
            if (ratings_sorted.length > 1) {
                const lastPoint = ratings_sorted[ratings_sorted.length - 1];
                const lastX = ((lastPoint.ratingUpdateTimeSeconds - timeRange.min) / (timeRange.max - timeRange.min)) * (graphWidth - padding.left - padding.right) + padding.left;
                const prevX = ((ratings_sorted[lastShownIndex].ratingUpdateTimeSeconds - timeRange.min) / (timeRange.max - timeRange.min)) * (graphWidth - padding.left - padding.right) + padding.left;
                
                if (lastX - prevX >= minSpacing) {
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
                : 385 - ((range.min - ratingRange.min) / (ratingRange.max - ratingRange.min)) * 365;
            
            // Only show labels and grid lines above x-axis
            if (y <= 385) {
                return `
                    <text x="${padding.left - 10}" y="${y}" text-anchor="end" class="axis-label" dominant-baseline="middle">${range.min}</text>
                    <line x1="${padding.left}" y1="${y}" x2="${graphWidth - padding.right}" y2="${y}" class="grid-line"/>
                `;
            }
            return ''; // Skip labels that would appear below x-axis
        }).join('');

        // Generate ratings text at top
        const ratingsText = `
            <text x="${padding.left}" y="${padding.top - 5}" class="ratings-label">
                Contest rating: <tspan font-weight="bold">${currentRating}</tspan>
                (max. <tspan font-weight="bold">${maxRating}</tspan>)
            </text>
        `;

        // Generate handle label
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
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const dayNames = ['Mon', 'Wed', 'Fri'];
        
        const { submissions } = data;
        const now = new Date();
        const oneYearAgo = new Date(now);
        oneYearAgo.setFullYear(now.getFullYear() - 1);

        // Create a map of dates to solved problems
        const solvedByDate = new Map();
        const acceptedSubmissions = submissions.filter(sub => sub.verdict === 'OK');
        
        // Count unique problems solved per day
        acceptedSubmissions.forEach(sub => {
            const date = new Date(sub.creationTimeSeconds * 1000);
            if (date >= oneYearAgo) {
                const dateKey = date.toISOString().split('T')[0];
                if (!solvedByDate.has(dateKey)) {
                    solvedByDate.set(dateKey, new Set());
                }
                solvedByDate.get(dateKey).add(sub.problem.contestId + '-' + sub.problem.index);
            }
        });

        // Calculate statistics
        const totalSolved = new Set(acceptedSubmissions.map(sub => sub.problem.contestId + '-' + sub.problem.index)).size;
        const lastYearSolved = new Set(acceptedSubmissions
            .filter(sub => new Date(sub.creationTimeSeconds * 1000) >= oneYearAgo)
            .map(sub => sub.problem.contestId + '-' + sub.problem.index)).size;
        const lastMonthSolved = new Set(acceptedSubmissions
            .filter(sub => {
                const date = new Date(sub.creationTimeSeconds * 1000);
                const oneMonthAgo = new Date(now);
                oneMonthAgo.setMonth(now.getMonth() - 1);
                return date >= oneMonthAgo;
            })
            .map(sub => sub.problem.contestId + '-' + sub.problem.index)).size;

        // Calculate streaks
        let maxStreak = 0;
        let currentStreak = 0;
        let lastYearStreak = 0;
        let lastMonthStreak = 0;

        // Adjust dimensions and spacing
        const cellSize = 10;
        const cellPadding = 2;
        const weekCount = 52; // Fixed to exactly 52 weeks
        const dayCount = 7;

        const width = 700;
        const height = 250;
        const xOffset = 35;
        const yOffset = 35;

        let svg = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
        <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" 
             style="border-radius:15px; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);" 
             xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600&amp;display=swap');
                text { font-family: 'Open Sans', sans-serif; font-size: 10px; fill: #666; }
                .title { font-size: 16px; font-weight: 600; fill: #333; }
                .subtitle { font-size: 12px; fill: #666; }
                .month-label { font-size: 10px; fill: #666; }
                .day-label { font-size: 10px; fill: #666; }
            </style>
            <rect width="${width}" height="${height}" fill="white"/>`;

        // Add month labels
        let currentMonth = new Date(oneYearAgo);
        let lastLabelMonth = -1;
        for (let week = 0; week < weekCount; week++) {
            if (currentMonth.getDate() <= 7 && currentMonth.getMonth() !== lastLabelMonth) {
                const x = xOffset + week * (cellSize + cellPadding);
                svg += `<text x="${x}" y="${yOffset - 8}" text-anchor="middle" class="month-label">${monthNames[currentMonth.getMonth()]}</text>`;
                lastLabelMonth = currentMonth.getMonth();
            }
            currentMonth.setDate(currentMonth.getDate() + 7);
        }

        // Add day labels with fixed positions
        dayNames.forEach((day, index) => {
            let y;
            if (index === 0) {
                y = 54;
            } else if (index === 1) {
                y = 78;
            } else if (index === 2) {
                y = 102;
            }
            svg += `<text x="${xOffset - 8}" y="${y}" text-anchor="end" dominant-baseline="middle" class="day-label">${day}</text>`;
        });

        // Calculate the start and end dates for exactly 52 weeks
        const endDate = new Date(now);
        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - (52 * 7 - 1)); // 52 weeks minus 1 day

        // Add heatmap cells for exactly 52 weeks
        let currentDate = new Date(startDate);
        let currentWeek = 0;
        
        while (currentWeek < weekCount) {
            for (let day = 0; day < dayCount; day++) {
                const dateKey = currentDate.toISOString().split('T')[0];
                const solved = solvedByDate.get(dateKey)?.size || 0;
                
                const x = xOffset + currentWeek * (cellSize + cellPadding);
                const y = yOffset + day * (cellSize + cellPadding);
                
                let color = '#ebedf0';
                if (solved > 0) {
                    if (solved >= 5) color = '#196127';
                    else if (solved >= 3) color = '#239a3b';
                    else if (solved >= 2) color = '#40c463';
                    else color = '#9be9a8';
                }
                
                svg += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${color}" rx="2">
                    <title>${solved} problems on ${dateKey}</title>
                </rect>`;
                
                currentDate.setDate(currentDate.getDate() + 1);
            }
            currentWeek++;
        }

        // Add statistics with better layout and vertical spacing
        const statsY = height - 80;
        const streakY = height - 30;
        const spacing = 220;

        svg += `
            <g transform="translate(${xOffset}, ${statsY})">
                <text x="0" y="0" class="title">${totalSolved} problems</text>
                <text x="0" y="20" class="subtitle">solved for all time</text>
            </g>
            <g transform="translate(${xOffset + spacing}, ${statsY})">
                <text x="0" y="0" class="title">${lastYearSolved} problems</text>
                <text x="0" y="20" class="subtitle">solved for the last year</text>
            </g>
            <g transform="translate(${xOffset + spacing * 2}, ${statsY})">
                <text x="0" y="0" class="title">${lastMonthSolved} problems</text>
                <text x="0" y="20" class="subtitle">solved for the last month</text>
            </g>

            <g transform="translate(${xOffset}, ${streakY})">
                <text x="0" y="0" class="title">${maxStreak} days</text>
                <text x="0" y="20" class="subtitle">in a row max.</text>
            </g>
            <g transform="translate(${xOffset + spacing}, ${streakY})">
                <text x="0" y="0" class="title">${lastYearStreak} days</text>
                <text x="0" y="20" class="subtitle">in a row for the last year</text>
            </g>
            <g transform="translate(${xOffset + spacing * 2}, ${streakY})">
                <text x="0" y="0" class="title">${lastMonthStreak} days</text>
                <text x="0" y="20" class="subtitle">in a row for the last month</text>
            </g>`;

        svg += '</svg>';
        return svg;
    } catch (error) {
        throw new Error(`Failed to generate heatmap SVG: ${error.message}`);
    }
}

router.get('/:handle/profile', async (req, res) => {
    try {
        const { handle } = req.params;
        const data = await getCodeforcesData(handle);
        
        if (!data || !data.user) {
            throw new Error('No user data found');
        }

        const svg = await generateProfileSVG(data);
        
        if (!svg || !svg.trim().startsWith('<?xml')) {
            throw new Error('Invalid SVG generated');
        }

        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('Cache-Control', 'public, max-age=300');
        res.send(svg);
    } catch (error) {
        const errorSvg = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
        <svg width="500" height="300" xmlns="http://www.w3.org/2000/svg">
            <rect width="500" height="300" rx="15" fill="#f8f9fa"/>
            <text x="250" y="150" text-anchor="middle" font-family="Open Sans" font-size="16">
                Unable to load profile for "${escapeXml(req.params.handle)}". ${error.message}
            </text>
        </svg>`;
        res.setHeader('Content-Type', 'image/svg+xml');
        res.status(500).send(errorSvg);
    }
});

router.get('/:handle/graph', async (req, res) => {
    try {
        const { handle } = req.params;
        const data = await getCodeforcesData(handle);
        const svg = generateGraphSVG(data);

        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('Cache-Control', 'public, max-age=300');
        res.send(svg);
    } catch (error) {
        const errorSvg = errorSVG(`Unable to load rating graph for "${escapeXml(req.params.handle)}". Please check if the handle exists.`);
        res.setHeader('Content-Type', 'image/svg+xml');
        res.status(500).send(errorSvg);
    }
});

router.get('/:handle/heatmap', async (req, res) => {
    try {
        const { handle } = req.params;
        const data = await getCodeforcesData(handle);
        const svg = generateHeatmapSVG(data);

        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('Cache-Control', 'public, max-age=300');
        res.send(svg);
    } catch (error) {
        const errorSvg = errorSVG(`Unable to generate heatmap for "${escapeXml(req.params.handle)}". Please try again later.`);
        res.setHeader('Content-Type', 'image/svg+xml');
        res.status(500).send(errorSvg);
    }
});

router.get('/:handle', (req, res) => {
    res.redirect(`/card/cf/${req.params.handle}/profile`);
});

module.exports = router;
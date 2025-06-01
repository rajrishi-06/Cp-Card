const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;
require('dotenv').config();

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Codeforces API credentials
const API_KEY = process.env.API_KEY;
const API_SECRET = process.env.API_SECRET;

// Cache for API responses
const cache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Cache for Codechef API responses
const codechefCache = new Map();

function escapeXml(unsafe) {
    return unsafe.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

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

function formatTimeAgo(timestamp) {
    const now = Date.now() / 1000;
    const diff = now - timestamp;
    
    if (diff < 3600) {
        const minutes = Math.floor(diff / 60);
        return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    } else if (diff < 86400) {
        const hours = Math.floor(diff / 3600);
        return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    } else {
        const days = Math.floor(diff / 86400);
        return `${days} day${days !== 1 ? 's' : ''} ago`;
    }
}

async function getImageAsBase64(url) {
    try {
        const response = await axios.get(url, { 
            responseType: 'arraybuffer',
            timeout: 5000, // 5 second timeout
            headers: {
                'User-Agent': 'Codeforces-Profile-Card/1.0'
            }
        });
        const base64 = Buffer.from(response.data).toString('base64');
        const contentType = response.headers['content-type'];
        return `data:${contentType};base64,${base64}`;
    } catch (error) {
        // Return a default avatar if fetching fails
        return 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiB2aWV3Qm94PSIwIDAgMTAwIDEwMCI+PHJlY3Qgd2lkdGg9IjEwMCIgaGVpZ2h0PSIxMDAiIGZpbGw9IiNlZWUiLz48dGV4dCB4PSI1MCIgeT0iNTAiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzY2NiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5vIEltYWdlPC90ZXh0Pjwvc3ZnPg==';
    }
}

async function getCodechefProfileImages(data) {
    const images = {
        profile: null,
        countryFlag: null
    };
    
    try {
        if (data.profile) {
            images.profile = await getImageAsBase64(data.profile);
        }
        if (data.countryFlag) {
            images.countryFlag = await getImageAsBase64(data.countryFlag);
        }
    } catch (error) {
        console.error('Error fetching Codechef images:', error);
    }
    
    // Default images if fetching fails
    if (!images.profile) {
        images.profile = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiB2aWV3Qm94PSIwIDAgMTAwIDEwMCI+PHJlY3Qgd2lkdGg9IjEwMCIgaGVpZ2h0PSIxMDAiIGZpbGw9IiNlZWUiLz48dGV4dCB4PSI1MCIgeT0iNTAiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzY2NiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5vIEltYWdlPC90ZXh0Pjwvc3ZnPg==';
    }
    if (!images.countryFlag) {
        images.countryFlag = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgdmlld0JveD0iMCAwIDIwIDIwIj48cmVjdCB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIGZpbGw9IiNlZWUiLz48L3N2Zz4=';
    }
    
    return images;
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

async function getCodechefData(handle) {
    const cacheKey = `codechef_${handle}`;
    if (codechefCache.has(cacheKey)) {
        const { data, timestamp } = codechefCache.get(cacheKey);
        if (Date.now() - timestamp < CACHE_DURATION) {
            return data;
        }
    }

    try {
        const response = await axios.get(`https://codechef-api.vercel.app/handle/${handle}`);
        
        if (response.data) {
            const totalSolved = response.data.heatMap ? 
                response.data.heatMap.reduce((sum, day) => sum + day.value, 0) : 0;

            const data = {
                ...response.data,
                totalSolved
            };

            codechefCache.set(cacheKey, {
                data,
                timestamp: Date.now()
            });
            return data;
        }
        throw new Error('No data received from Codechef API');
    } catch (error) {
        throw new Error('Failed to fetch Codechef data');
    }
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
            profile,
            institution,
            totalSolved = 0
        } = data;

        // Get base64 encoded images
        const images = await getCodechefProfileImages(data);

        // Color mapping for stars
        const starColors = {
            '1★': '#666666',
            '2★': '#1E7D22',
            '3★': '#3366CC',
            '4★': '#684273',
            '5★': '#FFBF00',
            '6★': '#FF7F00',
            '7★': '#D0011B'
        };

        const starColor = starColors[stars] || '#666666';
        
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
            </defs>
            <rect width="500" height="300" fill="url(#backgroundGrad)"/>

            <!-- Decorative Elements -->
            <rect x="0" y="0" width="500" height="70" fill="${starColor}" opacity="0.1"/>
            <path d="M0,70 L500,70" stroke="#eee" stroke-width="1"/>

            <!-- User Info Section -->
            <g transform="translate(20, 20)">
                <!-- Stars and Name -->
                <text class="rank" fill="${starColor}" x="0" y="32">${escapeXml(stars)}</text>
                <text class="title" fill="${starColor}" x="35" y="32">${escapeXml(name)}</text>

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
                        <rect x="0" y="0" width="150" height="60" fill="#CCCCCC" rx="8"/>
                        <text class="stat" x="75" y="25" text-anchor="middle">#${globalRank}</text>
                        <text class="label" x="75" y="45" text-anchor="middle">Global Rank</text>
                    </g>
                    <g transform="translate(160, 0)">
                        <rect x="0" y="0" width="150" height="60" fill="#CCCCCC" rx="8"/>
                        <text class="stat" x="75" y="25" text-anchor="middle">#${countryRank}</text>
                        <text class="label" x="75" y="45" text-anchor="middle">Country Rank</text>
                    </g>
                </g>

                <!-- Second Row -->
                <g transform="translate(0, 165)">
                    <g>
                        <rect x="0" y="0" width="150" height="60" fill="#CCCCCC" rx="8"/>
                        <text class="stat" x="75" y="25" text-anchor="middle">${currentRating}</text>
                        <text class="label" x="75" y="45" text-anchor="middle">Current Rating</text>
                    </g>
                    <g transform="translate(160, 0)">
                        <rect x="0" y="0" width="150" height="60" fill="#CCCCCC" rx="8"/>
                        <text class="stat" x="75" y="25" text-anchor="middle">${totalSolved}</text>
                        <text class="label" x="75" y="45" text-anchor="middle">Problems Solved</text>
                    </g>
                </g>

                <!-- Last Contest Info -->
                ${data.ratingData && data.ratingData.length > 0 ? `
                    <g transform="translate(0, 240)">
                        <text class="info" x="0" y="0">Last Contest: ${escapeXml(data.ratingData[data.ratingData.length - 1].name)}</text>
                        <text class="stat" x="0" y="20">Rank: #${data.ratingData[data.ratingData.length - 1].rank}</text>
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
                <rect x="0" y="0" width="100" height="30" fill="#f8f9fa" rx="15"/>
                <text class="small-stat" x="50" y="19" text-anchor="middle">max. ${highestRating}</text>
            </g>
        </svg>`;
    } catch (error) {
        return errorSVG('Unable to generate Codechef profile');
    }
}

function generateCodechefGraphSVG(data) {
    try {
        const { ratingData } = data;
        if (!ratingData || ratingData.length === 0) {
            return errorSVG('No rating data available');
        }

        // Sort rating data by date
        const sortedRatings = ratingData.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        // Calculate dimensions and scales
        const width = 900;
        const height = 420;
        const padding = { top: 40, right: 30, bottom: 60, left: 50 };
        
        // Calculate min and max values
        const minRating = Math.min(...sortedRatings.map(r => r.rating));
        const maxRating = Math.max(...sortedRatings.map(r => r.rating));
        const startDate = new Date(sortedRatings[0].date);
        const endDate = new Date(sortedRatings[sortedRatings.length - 1].date);
        
        // Generate path for rating curve
        const graphWidth = width - padding.left - padding.right;
        const graphHeight = height - padding.top - padding.bottom;
        
        const points = sortedRatings.map((r, i) => {
            const x = padding.left + (i / (sortedRatings.length - 1)) * graphWidth;
            const y = height - padding.bottom - ((r.rating - minRating) / (maxRating - minRating)) * graphHeight;
            return `${i === 0 ? 'M' : 'L'} ${x},${y}`;
        }).join(' ');

        return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
        <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" 
             style="border-radius:15px; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);" 
             xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600&amp;display=swap');
                .title { font: 600 16px 'Open Sans', sans-serif; }
                .label { font: 400 12px 'Open Sans', sans-serif; }
            </style>
            
            <!-- Background -->
            <rect width="${width}" height="${height}" fill="#ffffff"/>
            
            <!-- Rating curve -->
            <path d="${points}" stroke="#1a0dab" stroke-width="2" fill="none"/>
            
            <!-- Dots for each contest -->
            ${sortedRatings.map((r, i) => {
                const x = padding.left + (i / (sortedRatings.length - 1)) * graphWidth;
                const y = height - padding.bottom - ((r.rating - minRating) / (maxRating - minRating)) * graphHeight;
                return `
                    <circle cx="${x}" cy="${y}" r="4" fill="#1a0dab"/>
                    <title>${r.name}: ${r.rating}</title>
                `;
            }).join('')}
            
            <!-- Axes -->
            <line x1="${padding.left}" y1="${height - padding.bottom}" 
                  x2="${width - padding.right}" y2="${height - padding.bottom}" 
                  stroke="#666" stroke-width="1"/>
            <line x1="${padding.left}" y1="${padding.top}" 
                  x2="${padding.left}" y2="${height - padding.bottom}" 
                  stroke="#666" stroke-width="1"/>
                  
            <!-- Labels -->
            <text x="${width/2}" y="25" class="title" text-anchor="middle">Rating History</text>
            
            <!-- Rating labels -->
            ${generateYAxisLabels(minRating, maxRating, height, padding)}
            
            <!-- Date labels -->
            ${generateXAxisLabels(sortedRatings, width, height, padding)}
        </svg>`;
    } catch (error) {
        return errorSVG('Unable to generate rating graph');
    }
}

function generateCodechefHeatmapSVG(data) {
    try {
        const { heatMap } = data;
        if (!heatMap) {
            return errorSVG('No heatmap data available');
        }

        const width = 700;
        const height = 250;
        const cellSize = 10;
        const cellPadding = 2;
        
        // Group data by week
        const weekData = groupHeatmapByWeek(heatMap);
        
        return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
        <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" 
             style="border-radius:15px; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);" 
             xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600&amp;display=swap');
                text { font-family: 'Open Sans', sans-serif; }
            </style>
            
            <!-- Background -->
            <rect width="${width}" height="${height}" fill="#ffffff"/>
            
            <!-- Heatmap cells -->
            ${generateHeatmapCells(weekData, cellSize, cellPadding)}
            
            <!-- Month labels -->
            ${generateMonthLabels(weekData)}
            
            <!-- Day labels -->
            ${generateDayLabels()}
            
            <!-- Legend -->
            ${generateHeatmapLegend()}
        </svg>`;
    } catch (error) {
        return errorSVG('Unable to generate heatmap');
    }
}

// Helper functions for graph and heatmap
function generateYAxisLabels(min, max, height, padding) {
    const step = Math.ceil((max - min) / 5);
    let labels = '';
    for (let i = 0; i <= 5; i++) {
        const rating = min + (step * i);
        const y = height - padding.bottom - (i / 5) * (height - padding.top - padding.bottom);
        labels += `
            <text x="${padding.left - 10}" y="${y}" class="label" text-anchor="end" dominant-baseline="middle">
                ${rating}
            </text>
        `;
    }
    return labels;
}

function generateXAxisLabels(ratings, width, height, padding) {
    const step = Math.ceil(ratings.length / 6);
    let labels = '';
    for (let i = 0; i < ratings.length; i += step) {
        const x = padding.left + (i / (ratings.length - 1)) * (width - padding.left - padding.right);
        const date = new Date(ratings[i].date);
        labels += `
            <text x="${x}" y="${height - padding.bottom + 20}" class="label" text-anchor="middle">
                ${date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
            </text>
        `;
    }
    return labels;
}

function groupHeatmapByWeek(heatMap) {
    // Implementation of grouping heatmap data by week
    return heatMap.reduce((acc, day) => {
        const week = Math.floor(day.day / 7);
        if (!acc[week]) acc[week] = [];
        acc[week].push(day);
        return acc;
    }, {});
}

function generateHeatmapCells(weekData, cellSize, cellPadding) {
    let cells = '';
    Object.entries(weekData).forEach(([week, days], weekIndex) => {
        days.forEach((day, dayIndex) => {
            const x = 50 + weekIndex * (cellSize + cellPadding);
            const y = 50 + dayIndex * (cellSize + cellPadding);
            const intensity = calculateIntensity(day.value);
            cells += `
                <rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}"
                      fill="${intensity}" rx="2">
                    <title>${day.value} submissions on ${new Date(day.date).toLocaleDateString()}</title>
                </rect>
            `;
        });
    });
    return cells;
}

function calculateIntensity(value) {
    // Implementation of color intensity calculation based on value
    if (value === 0) return '#ebedf0';
    if (value <= 2) return '#9be9a8';
    if (value <= 4) return '#40c463';
    if (value <= 6) return '#30a14e';
    return '#216e39';
}

function generateMonthLabels(weekData) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months.map((month, i) => {
        const week = Math.floor(i / 7);
        const currentMonth = new Date(weekData[week][0].date);
        const isCurrentMonth = currentMonth.getMonth() === i % 7;
        return `
            <text x="${50 + i * 55}" y="30" class="label" text-anchor="middle" fill="${isCurrentMonth ? '#000' : '#666'}">
                ${month}
            </text>
        `;
    }).join('');
}

function generateDayLabels() {
    const days = ['Mon', 'Wed', 'Fri'];
    return days.map((day, i) => `
        <text x="30" y="${65 + i * 24}" class="label" text-anchor="end">${day}</text>
    `).join('');
}

function generateHeatmapLegend() {
    const colors = ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'];
    const labels = ['No submissions', '1-2', '3-4', '5-6', '7+'];
    let legend = '<g transform="translate(450, 20)">';
    colors.forEach((color, i) => {
        legend += `
            <rect x="${i * 45}" y="0" width="10" height="10" fill="${color}"/>
            <text x="${i * 45 + 15}" y="9" class="label">${labels[i]}</text>
        `;
    });
    legend += '</g>';
    return legend;
}

function errorSVG(message) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
    <svg width="700" height="250" xmlns="http://www.w3.org/2000/svg">
        <rect width="700" height="250" fill="#f8f9fa"/>
        <text x="350" y="125" text-anchor="middle" font-family="Open Sans" font-size="16">
            ${escapeXml(message)}
        </text>
    </svg>`;
}

// Documentation page at root endpoint
app.get('/', (req, res) => {
    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Competitive Programming Profile Cards API</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            body {
                font-family: 'Inter', sans-serif;
                line-height: 1.6;
                color: #333;
                background: #f8f9fa;
                padding: 2rem;
            }
            
            .container {
                max-width: 1200px;
                margin: 0 auto;
                background: white;
                padding: 2rem;
                border-radius: 12px;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
            }
            
            h1 {
                font-size: 2.5rem;
                margin-bottom: 1rem;
                color: #2d3748;
            }
            
            h2 {
                font-size: 1.8rem;
                margin: 2rem 0 1rem;
                color: #2d3748;
                border-bottom: 2px solid #edf2f7;
                padding-bottom: 0.5rem;
            }
            
            p {
                margin-bottom: 1rem;
                color: #4a5568;
            }
            
            .platform {
                margin: 2rem 0;
                padding: 1.5rem;
                background: #f7fafc;
                border-radius: 8px;
                border: 1px solid #e2e8f0;
            }
            
            .endpoint {
                background: #2d3748;
                color: #e2e8f0;
                padding: 1rem;
                border-radius: 6px;
                font-family: monospace;
                margin: 1rem 0;
                overflow-x: auto;
            }
            
            .demo {
                margin: 1.5rem 0;
                text-align: center;
            }
            
            .demo img {
                max-width: 100%;
                height: auto;
                border-radius: 8px;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                margin: 0.5rem 0;
            }
            
            .features {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                gap: 1.5rem;
                margin: 2rem 0;
            }
            
            .feature {
                padding: 1.5rem;
                background: #f7fafc;
                border-radius: 8px;
                border: 1px solid #e2e8f0;
            }
            
            .feature h3 {
                color: #2d3748;
                margin-bottom: 0.5rem;
            }
            
            code {
                background: #edf2f7;
                padding: 0.2rem 0.4rem;
                border-radius: 4px;
                font-family: monospace;
            }
            
            .note {
                background: #ebf8ff;
                border-left: 4px solid #4299e1;
                padding: 1rem;
                margin: 1rem 0;
                border-radius: 0 8px 8px 0;
            }
            
            @media (max-width: 768px) {
                body {
                    padding: 1rem;
                }
                
                .container {
                    padding: 1rem;
                }
                
                h1 {
                    font-size: 2rem;
                }
                
                h2 {
                    font-size: 1.5rem;
                }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Competitive Programming Profile Cards API</h1>
            <p>Generate beautiful SVG profile cards, rating graphs, and activity heatmaps for competitive programming platforms.</p>
            
            <div class="features">
                <div class="feature">
                    <h3>🎯 Dynamic SVG Generation</h3>
                    <p>Real-time SVG cards generated from the latest user data</p>
                </div>
                <div class="feature">
                    <h3>🔄 Auto-updating</h3>
                    <p>Cards automatically update with fresh data every 5 minutes</p>
                </div>
                <div class="feature">
                    <h3>🎨 Beautiful Design</h3>
                    <p>Modern, clean design matching platform color schemes</p>
                </div>
            </div>

            <h2>Codeforces Cards</h2>
            <div class="platform">
                <h3>Profile Card</h3>
                <div class="endpoint">GET /card/cf/{handle}/profile</div>
                <div class="demo">
                    <p>Example for tourist:</p>
                    <img src="/card/cf/tourist/profile" alt="Codeforces Profile Card Demo" />
                </div>

                <h3>Rating Graph</h3>
                <div class="endpoint">GET /card/cf/{handle}/graph</div>
                <div class="demo">
                    <p>Example for tourist:</p>
                    <img src="/card/cf/tourist/graph" alt="Codeforces Rating Graph Demo" />
                </div>

                <h3>Activity Heatmap</h3>
                <div class="endpoint">GET /card/cf/{handle}/heatmap</div>
                <div class="demo">
                    <p>Example for tourist:</p>
                    <img src="/card/cf/tourist/heatmap" alt="Codeforces Heatmap Demo" />
                </div>
            </div>

            <h2>CodeChef Cards</h2>
            <div class="platform">
                <h3>Profile Card</h3>
                <div class="endpoint">GET /card/cc/{handle}/profile</div>
                <div class="demo">
                    <p>Example for gennady.korotkevich:</p>
                    <img src="/card/cc/gennady.korotkevich/profile" alt="CodeChef Profile Card Demo" />
                </div>

                <h3>Rating Graph</h3>
                <div class="endpoint">GET /card/cc/{handle}/graph</div>
                <div class="demo">
                    <p>Example for gennady.korotkevich:</p>
                    <img src="/card/cc/gennady.korotkevich/graph" alt="CodeChef Rating Graph Demo" />
                </div>

                <h3>Activity Heatmap</h3>
                <div class="endpoint">GET /card/cc/{handle}/heatmap</div>
                <div class="demo">
                    <p>Example for gennady.korotkevich:</p>
                    <img src="/card/cc/gennady.korotkevich/heatmap" alt="CodeChef Heatmap Demo" />
                </div>
            </div>

            <h2>Usage</h2>
            <p>To use these cards in your GitHub README or website, simply use the URL as the source of an image:</p>
            <div class="endpoint">
                &lt;img src="https://your-domain.com/card/cf/your-handle/profile" alt="Codeforces Profile" /&gt;
            </div>

            <div class="note">
                <strong>Note:</strong> Replace <code>your-handle</code> with your actual Codeforces or CodeChef handle.
            </div>

            <h2>Features</h2>
            <ul style="margin-left: 2rem;">
                <li>Real-time data from Codeforces and CodeChef APIs</li>
                <li>Responsive SVG cards that look great at any size</li>
                <li>Automatic color theming based on user rank</li>
                <li>Detailed statistics including ratings, ranks, and problem counts</li>
                <li>Interactive rating graphs with tooltips</li>
                <li>Activity heatmaps showing submission patterns</li>
            </ul>

            <h2>Rate Limits</h2>
            <p>To ensure service stability, please respect the following rate limits:</p>
            <ul style="margin-left: 2rem;">
                <li>Maximum 100 requests per minute per IP</li>
                <li>Cards are cached for 5 minutes to reduce API load</li>
            </ul>

            <div style="margin-top: 3rem; text-align: center; color: #718096;">
                <p>Made with ❤️ for the competitive programming community</p>
            </div>
        </div>
    </body>
    </html>
    `;
    
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
});

// Profile endpoint
app.get('/card/cf/:handle/profile', async (req, res) => {
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

// Graph endpoint
app.get('/card/cf/:handle/graph', async (req, res) => {
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

// Heatmap endpoint
app.get('/card/cf/:handle/heatmap', async (req, res) => {
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

// Legacy endpoint that redirects to profile
app.get('/card/cf/:handle', (req, res) => {
    res.redirect(`/card/cf/${req.params.handle}/profile`);
});

// Codechef Profile endpoint
app.get('/card/cc/:handle/profile', async (req, res) => {
    try {
        const { handle } = req.params;
        const data = await getCodechefData(handle);
        const svg = await generateCodechefProfileSVG(data);
        
        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('Cache-Control', 'public, max-age=300');
        res.send(svg);
    } catch (error) {
        console.error('Codechef profile endpoint error:', error);
        res.setHeader('Content-Type', 'image/svg+xml');
        res.status(500).send(errorSVG('Unable to load Codechef profile'));
    }
});

// Codechef Graph endpoint
app.get('/card/cc/:handle/graph', async (req, res) => {
    try {
        const { handle } = req.params;
        const referer = req.get('Referer');
        const userAgent = req.get('User-Agent');
        
        // If it's a direct browser request, redirect to Codechef API
        if (referer || userAgent?.includes('Mozilla')) {
            res.redirect(`https://codechef-api.vercel.app/rating/${handle}`);
            return;
        }

        // For img tags, return an SVG that embeds the Codechef graph
        const svg = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
        <svg width="900" height="420" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600&amp;display=swap');
                .loading { font: 600 16px 'Open Sans', sans-serif; }
            </style>
            <defs>
                <clipPath id="clip">
                    <rect width="900" height="420" rx="15"/>
                </clipPath>
            </defs>
            <g clip-path="url(#clip)">
                <rect width="900" height="420" fill="#ffffff"/>
                <image width="900" height="420" 
                       href="https://codechef-api.vercel.app/rating/${handle}"
                       preserveAspectRatio="xMidYMid meet"/>
                <text x="450" y="210" text-anchor="middle" class="loading" fill="#666">
                    Loading rating graph...
                </text>
            </g>
        </svg>`;

        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('Cache-Control', 'public, max-age=300');
        res.send(svg);
    } catch (error) {
        console.error('Codechef graph endpoint error:', error);
        res.setHeader('Content-Type', 'image/svg+xml');
        res.status(500).send(errorSVG('Unable to load Codechef rating graph'));
    }
});

// Codechef Heatmap endpoint
app.get('/card/cc/:handle/heatmap', async (req, res) => {
    try {
        const { handle } = req.params;
        const referer = req.get('Referer');
        const userAgent = req.get('User-Agent');
        
        // If it's a direct browser request, redirect to Codechef API
        if (referer || userAgent?.includes('Mozilla')) {
            res.redirect(`https://codechef-api.vercel.app/heatmap/${handle}`);
            return;
        }

        // For img tags, return an SVG that embeds the Codechef heatmap
        const svg = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
        <svg width="700" height="250" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600&amp;display=swap');
                .loading { font: 600 16px 'Open Sans', sans-serif; }
            </style>
            <defs>
                <clipPath id="clip">
                    <rect width="700" height="250" rx="15"/>
                </clipPath>
            </defs>
            <g clip-path="url(#clip)">
                <rect width="700" height="250" fill="#ffffff"/>
                <image width="700" height="250" 
                       href="https://codechef-api.vercel.app/heatmap/${handle}"
                       preserveAspectRatio="xMidYMid meet"/>
                <text x="350" y="125" text-anchor="middle" class="loading" fill="#666">
                    Loading heatmap...
                </text>
            </g>
        </svg>`;

        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('Cache-Control', 'public, max-age=300');
        res.send(svg);
    } catch (error) {
        console.error('Codechef heatmap endpoint error:', error);
        res.setHeader('Content-Type', 'image/svg+xml');
        res.status(500).send(errorSVG('Unable to load Codechef heatmap'));
    }
});

// Legacy Codechef endpoint that redirects to profile
app.get('/card/cc/:handle', (req, res) => {
    res.redirect(`/card/cc/${req.params.handle}/profile`);
});

app.listen(port, () => {
    // Keep this log for server startup confirmation
    console.log(`Server running at http://localhost:${port}`);
}); 
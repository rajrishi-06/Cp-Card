const express = require('express');
const axios = require('axios');
const router = express.Router();
const { escapeXml, getImageAsBase64, errorSVG } = require('../utils/helpers');

const codechefCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000;

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

// -- DEFINE CODECHEF ROUTES --
router.get('/:handle/profile', async (req, res) => {
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

router.get('/:handle/graph', async (req, res) => {
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

router.get('/:handle/heatmap', async (req, res) => {
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

router.get('/:handle', (req, res) => {
    res.redirect(`/card/cc/${req.params.handle}/profile`);
});

module.exports = router;
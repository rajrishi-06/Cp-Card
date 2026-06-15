const axios = require('axios')

// Inline SVG placeholders used when a remote image can't be fetched.
const PLACEHOLDER_AVATAR = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiB2aWV3Qm94PSIwIDAgMTAwIDEwMCI+PHJlY3Qgd2lkdGg9IjEwMCIgaGVpZ2h0PSIxMDAiIGZpbGw9IiNlZWUiLz48dGV4dCB4PSI1MCIgeT0iNTAiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzY2NiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5vIEltYWdlPC90ZXh0Pjwvc3ZnPg==';
const PLACEHOLDER_FLAG = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgdmlld0JveD0iMCAwIDIwIDIwIj48cmVjdCB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIGZpbGw9IiNlZWUiLz48L3N2Zz4=';

// Accepts the handle formats used by Codeforces and CodeChef. Also guards the
// outbound requests against path/URL injection from the :handle route param.
const HANDLE_PATTERN = /^[A-Za-z0-9_.-]{1,50}$/;

function isValidHandle(handle) {
    return typeof handle === 'string' && HANDLE_PATTERN.test(handle);
}

function escapeXml(unsafe) {
    return (unsafe === null || unsafe === undefined ? '' : unsafe).toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
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
                'User-Agent': 'Cp-Card/1.0 (+https://cp-card.vercel.app)'
            }
        });
        const base64 = Buffer.from(response.data).toString('base64');
        const contentType = response.headers['content-type'];
        return `data:${contentType};base64,${base64}`;
    } catch (error) {
        // Return a default avatar if fetching fails
        return PLACEHOLDER_AVATAR;
    }
}

// Longest run of consecutive calendar days present in `dateKeys` ("YYYY-MM-DD"),
// optionally restricted to days on/after `since` (epoch ms). Used for the
// "N days in a row" streak stats on the activity heatmaps.
function longestStreak(dateKeys, since) {
    const DAY = 86400000;
    const days = [...new Set(dateKeys)]
        .map(key => Date.parse(`${key}T00:00:00Z`))
        .filter(t => Number.isFinite(t) && (since === undefined || t >= since))
        .sort((a, b) => a - b);

    let best = 0;
    let run = 0;
    let prev = null;
    for (const t of days) {
        run = (prev !== null && t - prev === DAY) ? run + 1 : 1;
        if (run > best) best = run;
        prev = t;
    }
    return best;
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

module.exports = {
    escapeXml,
    formatTimeAgo,
    getImageAsBase64,
    errorSVG,
    isValidHandle,
    longestStreak,
    PLACEHOLDER_AVATAR,
    PLACEHOLDER_FLAG
}
// utils/codeforces.js
// Codeforces data access: request throttling + multi-credential rotation.
//
// Two complementary defenses against the rate limit that prompted issue #9:
//   1. Throttle  - CF allows ~1 request / 2s. Every outbound call is serialized
//                  through a single promise chain and spaced, so concurrent
//                  card requests can never burst past the limit.
//   2. Rotation  - any number of API key/secret pairs can be configured; each
//                  call rotates round-robin across them and fails over to the
//                  next pair when one is rate-limited. Calls are signed so they
//                  count against the rotating key, not the shared anonymous pool.

const axios = require('axios');
const crypto = require('crypto');
const { createCache } = require('./cache');

const API_BASE = 'https://codeforces.com/api';
const REQUEST_TIMEOUT = 10000;
const USER_AGENT = 'Cp-Card/1.0 (+https://cp-card.vercel.app)';
const CACHE_DURATION = 30 * 60 * 1000; // 30 min (best-effort, per warm instance)
const CF_MIN_INTERVAL = 2100;          // ms between calls (just over the 2s rule)

const cache = createCache(CACHE_DURATION);

// --- Typed errors so the caller can decide whether to fail fast or fail over --
class NotFoundError extends Error {}   // bad handle: don't bother rotating
class RateLimitError extends Error {}  // key exhausted / transient: try next key

// --- Credential loading -------------------------------------------------------
// Supported env layouts (all optional, combined and de-duplicated):
//   API_KEY / API_SECRET                                  (legacy single pair)
//   API_KEY_2 / API_SECRET_2 ... up to _10                (additional pairs)
//   CF_CREDENTIALS = '[{"key":"..","secret":".."}, ...]'  (JSON list)
function loadCredentials() {
    const credentials = [];
    const seen = new Set();

    const add = (key, secret) => {
        if (!key || !secret) return;
        const id = `${key}:${secret}`;
        if (seen.has(id)) return;
        seen.add(id);
        credentials.push({ key, secret });
    };

    add(process.env.API_KEY, process.env.API_SECRET);
    for (let i = 2; i <= 10; i++) {
        add(process.env[`API_KEY_${i}`], process.env[`API_SECRET_${i}`]);
    }

    if (process.env.CF_CREDENTIALS) {
        try {
            const parsed = JSON.parse(process.env.CF_CREDENTIALS);
            if (Array.isArray(parsed)) {
                parsed.forEach(c => add(c.key || c.apiKey, c.secret || c.apiSecret));
            }
        } catch (error) {
            console.warn('CF_CREDENTIALS is not valid JSON; ignoring it.');
        }
    }

    return credentials;
}

const credentials = loadCredentials();
let rotationIndex = 0; // round-robin start point so load spreads over time

// --- Global throttle ----------------------------------------------------------
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let cfChain = Promise.resolve();
let lastCallAt = 0;

function throttle(fn) {
    const run = cfChain.then(async () => {
        const wait = lastCallAt + CF_MIN_INTERVAL - Date.now();
        if (wait > 0) await sleep(wait);
        lastCallAt = Date.now();
        return fn();
    });
    cfChain = run.catch(() => {}); // keep the chain alive even if a call rejects
    return run;
}

// --- Request signing ----------------------------------------------------------
function generateApiSig(method, params, secret) {
    const rand = crypto.randomBytes(3).toString('hex'); // 6 chars, as CF requires
    const sortedParams = Object.entries(params)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join('&');

    const stringToHash = `${rand}/${method}?${sortedParams}#${secret}`;
    const hash = crypto.createHash('sha512').update(stringToHash).digest('hex');
    return `${rand}${hash}`;
}

function buildUrl(method, methodParams, credential) {
    if (!credential) {
        // No keys configured: fall back to anonymous (lower limits, still works).
        const qs = new URLSearchParams(methodParams).toString();
        return `${API_BASE}/${method}?${qs}`;
    }

    const params = { ...methodParams, apiKey: credential.key, time: Math.floor(Date.now() / 1000) };
    const apiSig = generateApiSig(method, params, credential.secret);
    const qs = new URLSearchParams({ ...params, apiSig }).toString();
    return `${API_BASE}/${method}?${qs}`;
}

// One throttled call with a specific credential. Classifies the outcome so the
// caller knows whether to fail over (RateLimitError) or give up (NotFoundError).
async function callOnce(method, methodParams, credential) {
    let response;
    try {
        response = await throttle(() => axios.get(buildUrl(method, methodParams, credential), {
            timeout: REQUEST_TIMEOUT,
            headers: { 'User-Agent': USER_AGENT },
            validateStatus: () => true // inspect the CF body ourselves
        }));
    } catch (error) {
        throw new RateLimitError(`Network error calling ${method}: ${error.message}`);
    }

    const body = response.data;
    if (body && body.status === 'OK') {
        return body.result;
    }

    const comment = (body && body.comment) || `HTTP ${response.status}`;
    if (/limit exceeded/i.test(comment) || response.status === 429 || response.status === 503) {
        throw new RateLimitError(comment);
    }
    if (/not found/i.test(comment) || response.status === 400) {
        throw new NotFoundError(comment);
    }
    throw new RateLimitError(`Codeforces API error: ${comment}`);
}

// Call a method, rotating across credentials until one succeeds. A not-found
// result fails fast; rate-limit/network errors fall over to the next key.
async function callWithRotation(method, methodParams) {
    const attempts = Math.max(credentials.length, 1);
    let lastError;

    for (let i = 0; i < attempts; i++) {
        const credential = credentials.length > 0
            ? credentials[(rotationIndex + i) % credentials.length]
            : null;
        try {
            const result = await callOnce(method, methodParams, credential);
            rotationIndex = (rotationIndex + 1) % attempts; // advance for next call
            return result;
        } catch (error) {
            lastError = error;
            if (error instanceof NotFoundError) throw error;
            // otherwise: rate-limited/transient -> try the next credential
        }
    }

    throw lastError || new Error(`Codeforces call failed: ${method}`);
}

async function getCodeforcesData(handle) {
    const cacheKey = `user_${handle}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    let info, ratings, submissions;
    try {
        // Sequential (the throttle serializes them anyway); each call fails over
        // independently so a successful call is never repeated on rotation.
        info = await callWithRotation('user.info', { handles: handle });
        ratings = await callWithRotation('user.rating', { handle });
        submissions = await callWithRotation('user.status', { handle });
    } catch (error) {
        if (error instanceof NotFoundError) {
            throw new Error(`Codeforces handle "${handle}" not found`);
        }
        throw new Error(`Failed to fetch Codeforces data for "${handle}": ${error.message}`);
    }

    if (!info || !info[0]) {
        throw new Error(`Codeforces handle "${handle}" not found`);
    }

    const data = { user: info[0], ratings, submissions };
    cache.set(cacheKey, data);
    return data;
}

module.exports = {
    getCodeforcesData,
    credentialCount: credentials.length
};

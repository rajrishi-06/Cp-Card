// utils/cache.js
// Tiny in-memory TTL cache used by the platform clients.
// Kept intentionally simple: a Map plus an expiry check on read.

const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

function createCache(ttl = DEFAULT_TTL) {
    const store = new Map();

    return {
        get(key) {
            const entry = store.get(key);
            if (!entry) return undefined;
            if (Date.now() - entry.timestamp >= ttl) {
                store.delete(key);
                return undefined;
            }
            return entry.value;
        },
        set(key, value) {
            store.set(key, { value, timestamp: Date.now() });
            return value;
        }
    };
}

module.exports = { createCache, DEFAULT_TTL };

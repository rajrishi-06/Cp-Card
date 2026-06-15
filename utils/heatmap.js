// utils/heatmap.js
// Shared GitHub/CodeChef-style activity heatmap renderer.
//
// Renders 53 week-columns x 7 weekday-rows (Sunday on top), correctly aligned so
// each ROW is a fixed weekday and each COLUMN is a real calendar week. The grid
// ends on the current week and walks entirely in UTC so cell keys match the
// caller's UTC date keys.
const { MONTH_NAMES } = require('./constants');

// opts:
//   valueByDate : Map<'YYYY-MM-DD'(UTC), number>  daily counts
//   colorFor    : (count:number) => string        cell fill colour
//   unit        : string                          tooltip noun ("problems"/"submissions")
//   topStats    : [{ big, small }]  up to 3       headline stats row
//   bottomStats : [{ big, small }]  up to 3       streak stats row
function buildHeatmapSVG({ valueByDate, colorFor, unit = 'items', topStats = [], bottomStats = [] }) {
    const width = 700;
    const height = 250;
    const cellSize = 10;
    const cellPadding = 2;
    const step = cellSize + cellPadding;
    const xOffset = 35;
    const yOffset = 35;
    const weeks = 53;

    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const todayTime = today.getTime();
    // Sunday that begins the week 52 weeks before the current (partial) week.
    const start = new Date(today);
    start.setUTCDate(today.getUTCDate() - today.getUTCDay() - 52 * 7);

    const cellDateFor = (week, day) => {
        const d = new Date(start);
        d.setUTCDate(start.getUTCDate() + week * 7 + day);
        return d;
    };

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

    // Month labels: label a column when its top (Sunday) cell starts a new month.
    let lastMonth = -1;
    for (let w = 0; w < weeks; w++) {
        const colDate = cellDateFor(w, 0);
        const month = colDate.getUTCMonth();
        if (month !== lastMonth && colDate.getUTCDate() <= 7) {
            svg += `<text x="${xOffset + w * step}" y="${yOffset - 8}" text-anchor="start" class="month-label">${MONTH_NAMES[month]}</text>`;
            lastMonth = month;
        }
    }

    // Day labels (rows: 0=Sun .. 6=Sat) — show Mon/Wed/Fri.
    [[1, 'Mon'], [3, 'Wed'], [5, 'Fri']].forEach(([row, label]) => {
        const y = yOffset + row * step + cellSize / 2;
        svg += `<text x="${xOffset - 8}" y="${y}" text-anchor="end" dominant-baseline="middle" class="day-label">${label}</text>`;
    });

    // Cells.
    for (let w = 0; w < weeks; w++) {
        for (let d = 0; d < 7; d++) {
            const cellDate = cellDateFor(w, d);
            if (cellDate.getTime() > todayTime) continue; // skip future days
            const dateKey = cellDate.toISOString().slice(0, 10);
            const value = valueByDate.get(dateKey) || 0;
            const x = xOffset + w * step;
            const y = yOffset + d * step;
            svg += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${colorFor(value)}" rx="2">
                    <title>${value} ${unit} on ${dateKey}</title>
                </rect>`;
        }
    }

    // Stats rows.
    const statsY = height - 80;
    const streakY = height - 30;
    const spacing = 220;
    const renderStats = (stats, yPos) => stats.slice(0, 3).forEach((s, i) => {
        svg += `<g transform="translate(${xOffset + spacing * i}, ${yPos})">
            <text x="0" y="0" class="title">${s.big}</text>
            <text x="0" y="20" class="subtitle">${s.small}</text>
        </g>`;
    });
    renderStats(topStats, statsY);
    renderStats(bottomStats, streakY);

    svg += '</svg>';
    return svg;
}

module.exports = { buildHeatmapSVG };

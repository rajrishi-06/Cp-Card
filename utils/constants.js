// utils/constants.js
// Shared lookup tables so the route renderers don't each keep their own copy.

const MONTH_NAMES = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

// Codeforces rank -> colour (lower-cased keys; look up with rank.toLowerCase()).
const CF_RANK_COLORS = {
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

const CF_DEFAULT_RANK_COLOR = '#000000';

// CodeChef star band -> colour. Keys are matched against the leading digit of
// the star string (e.g. "5★") so spacing/encoding differences don't matter.
const CC_STAR_COLORS = {
    '1': '#666666',
    '2': '#1E7D22',
    '3': '#3366CC',
    '4': '#684273',
    '5': '#FFBF00',
    '6': '#FF7F00',
    '7': '#D0011B'
};

const CC_DEFAULT_STAR_COLOR = '#666666';

function cfRankColor(rank) {
    return CF_RANK_COLORS[String(rank || '').toLowerCase()] || CF_DEFAULT_RANK_COLOR;
}

function ccStarColor(stars) {
    const digit = String(stars || '').match(/\d/);
    return (digit && CC_STAR_COLORS[digit[0]]) || CC_DEFAULT_STAR_COLOR;
}

module.exports = {
    MONTH_NAMES,
    CF_RANK_COLORS,
    CF_DEFAULT_RANK_COLOR,
    CC_STAR_COLORS,
    CC_DEFAULT_STAR_COLOR,
    cfRankColor,
    ccStarColor
};

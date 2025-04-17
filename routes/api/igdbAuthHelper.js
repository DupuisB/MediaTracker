// routes/api/igdbAuthHelper.js
const axios = require('axios');
require('dotenv').config();

// --- Environment Variable Checks ---
const IGDB_CLIENT_ID = process.env.IGDB_CLIENT_ID;
const IGDB_CLIENT_SECRET = process.env.IGDB_CLIENT_SECRET;
const TWITCH_AUTH_URL = 'https://id.twitch.tv/oauth2/token';

let igdbTokenCache = { accessToken: null, expiresAt: 0 };

async function getIgdbAccessToken() {
    const now = Date.now();
    const bufferTime = 60 * 1000; // 60 seconds buffer before expiry
    if (igdbTokenCache.accessToken && igdbTokenCache.expiresAt > now + bufferTime) {
        return igdbTokenCache.accessToken;
    }
    console.log("Fetching new IGDB access token...");
    if (!IGDB_CLIENT_ID || !IGDB_CLIENT_SECRET) {
        throw new Error('IGDB Client ID or Client Secret missing in .env configuration.');
    }
    try {
        const params = new URLSearchParams();
        params.append('client_id', IGDB_CLIENT_ID);
        params.append('client_secret', IGDB_CLIENT_SECRET);
        params.append('grant_type', 'client_credentials');
        const response = await axios.post(TWITCH_AUTH_URL, params, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        const { access_token, expires_in } = response.data;
        if (!access_token || !expires_in) {
             throw new Error('Invalid response received from Twitch OAuth token endpoint.');
        }
        igdbTokenCache.accessToken = access_token;
        igdbTokenCache.expiresAt = now + (expires_in * 1000);
        console.log("Successfully fetched and cached new IGDB token.");
        return access_token;
    } catch (error) {
        console.error("Error fetching IGDB token from Twitch:", error.response ? error.response.data : error.message);
        igdbTokenCache = { accessToken: null, expiresAt: 0 };
        const details = error.response?.data?.message || error.message;
        throw new Error(`Failed to authenticate with IGDB service: ${details}`);
    }
}

async function getIgdbHeaders() {
    const accessToken = await getIgdbAccessToken();
    return {
        'Client-ID': IGDB_CLIENT_ID,
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
    };
}


/**
 * Converts API rating to a consistent 1-10 scale.
 * @param {number|null|undefined} apiRating The rating from the API.
 * @param {'tmdb'|'google'|'igdb'} source The API source.
 * @returns {number|null} Rating on a 1-10 scale, or null if input is invalid/missing.
 */
function convertRatingTo10(apiRating, source) {
    const rating = parseFloat(apiRating);
    if (isNaN(rating) || rating === null || rating === undefined) return null;

    switch (source) {
        case 'tmdb': // Scale 0-10
            return Math.round(rating * 10) / 10;
        case 'google': // Scale 0-5 (averageRating)
            return Math.round(rating * 2 * 10) / 10;
        case 'igdb': // Scale 0-100 (total_rating)
            return Math.round(rating / 10 * 10) / 10;
        default:
            return null;
    }
}


module.exports = {
    getIgdbAccessToken,
    getIgdbHeaders,
    convertRatingTo10
};
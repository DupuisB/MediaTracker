// routes/api/searchRoutes.js
const axios = require('axios');
require('dotenv').config();

// --- Environment Variable Checks ---
const IGDB_CLIENT_ID = process.env.IGDB_CLIENT_ID;
const IGDB_CLIENT_SECRET = process.env.IGDB_CLIENT_SECRET;

const TWITCH_AUTH_URL = 'https://id.twitch.tv/oauth2/token';

// --- IGDB Token Caching ---
// Simple in-memory cache for the IGDB access token to avoid fetching it on every request.
let igdbTokenCache = {
    accessToken: null,
    expiresAt: 0 // Timestamp (ms) when the token expires
};

/**
 * Gets a valid IGDB Access Token, fetching a new one if necessary or expired.
 * Uses the igdbTokenCache for efficiency.
 * @returns {Promise<string>} A valid IGDB access token.
 * @throws {Error} If authentication fails or required credentials are missing.
 */
async function getIgdbAccessToken() {
    const now = Date.now();
    const bufferTime = 60 * 1000; // 60 seconds buffer before expiry

    // Check cache first
    if (igdbTokenCache.accessToken && igdbTokenCache.expiresAt > now + bufferTime) {
        // console.log("Using cached IGDB token."); // Uncomment for debugging
        return igdbTokenCache.accessToken;
    }

    // Token is missing, invalid, or expiring soon - fetch a new one
    console.log("Fetching new IGDB access token...");
    if (!IGDB_CLIENT_ID || !IGDB_CLIENT_SECRET) {
        throw new Error('IGDB Client ID or Client Secret missing in .env configuration.');
    }

    try {
        // Prepare request to Twitch OAuth endpoint
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

        // Update cache
        igdbTokenCache.accessToken = access_token;
        // expires_in is in seconds, convert expiry time to milliseconds timestamp
        igdbTokenCache.expiresAt = now + (expires_in * 1000);

        console.log("Successfully fetched and cached new IGDB token.");
        return access_token;

    } catch (error) {
        console.error("Error fetching IGDB token from Twitch:", error.response ? error.response.data : error.message);
        // Clear cache on failure to force retry next time
        igdbTokenCache = { accessToken: null, expiresAt: 0 };
        // Rethrow a user-friendly error
        const details = error.response?.data?.message || error.message;
        throw new Error(`Failed to authenticate with IGDB service: ${details}`);
    }
}

/**
 * Constructs the required headers for making requests to the IGDB API.
 * @returns {Promise<object>} Object containing 'Client-ID' and 'Authorization' headers.
 * @throws {Error} If token retrieval fails.
 */
async function getIgdbHeaders() {
    // This function relies on getIgdbAccessToken to handle token fetching and errors
    const accessToken = await getIgdbAccessToken(); // Will throw if it fails
    return {
        'Client-ID': IGDB_CLIENT_ID,
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        // 'Content-Type' might be needed depending on the endpoint (e.g., text/plain for search body)
    };
}

// --- Unified Rating Conversion Helper ---
/**
 * Converts API rating to a consistent 1-20 scale.
 * Handles different source scales (e.g., TMDB 0-10, Google 0-5, IGDB 0-100).
 * @param {number|null|undefined} apiRating The rating from the API.
 * @param {'tmdb'|'google'|'igdb'} source The API source.
 * @returns {number|null} Rating on a 1-20 scale, or null if input is invalid/missing.
 */
function convertRatingTo20(apiRating, source) {
    const rating = parseFloat(apiRating);
    if (isNaN(rating)) return null;

    switch (source) {
        case 'tmdb': // Scale 0-10
            return Math.round(rating * 2); // Simple multiply by 2
        case 'google': // Scale 0-5 (averageRating)
            return Math.round(rating * 4); // Multiply by 4
        case 'igdb': // Scale 0-100 (total_rating)
            return Math.round(rating / 5); // Divide by 5
        default:
            return null;
    }
}

module.exports = {
    getIgdbAccessToken,
    getIgdbHeaders,
    convertRatingTo20
};
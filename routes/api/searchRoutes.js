const express = require('express');
const axios = require('axios');
require('dotenv').config();

const router = express.Router();

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const GOOGLE_BOOKS_API_KEY = process.env.GOOGLE_BOOKS_API_KEY;
const IGDB_CLIENT_ID = process.env.IGDB_CLIENT_ID;
const IGDB_CLIENT_SECRET = process.env.IGDB_CLIENT_SECRET; // Use Secret now

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const GOOGLE_BOOKS_BASE_URL = 'https://www.googleapis.com/books/v1/volumes';
const IGDB_BASE_URL = 'https://api.igdb.com/v4';
const TWITCH_AUTH_URL = 'https://id.twitch.tv/oauth2/token';

// --- IGDB Token Caching ---
let igdbTokenCache = {
    accessToken: null,
    expiresAt: 0 // Timestamp when the token expires
};

// --- Function to get a valid IGDB Access Token (fetches if needed) ---
async function getIgdbAccessToken() {
    const now = Date.now();
    // Check if token exists and is not expired (add a small buffer, e.g., 60 seconds)
    if (igdbTokenCache.accessToken && igdbTokenCache.expiresAt > now + 60000) {
        console.log("Using cached IGDB token.");
        return igdbTokenCache.accessToken;
    }

    // Token is invalid or expired, fetch a new one
    console.log("Fetching new IGDB token...");
    if (!IGDB_CLIENT_ID || !IGDB_CLIENT_SECRET) {
        throw new Error('IGDB Client ID or Client Secret missing in .env');
    }

    try {
        const params = new URLSearchParams();
        params.append('client_id', IGDB_CLIENT_ID);
        params.append('client_secret', IGDB_CLIENT_SECRET);
        params.append('grant_type', 'client_credentials');

        const response = await axios.post(TWITCH_AUTH_URL, params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        const { access_token, expires_in } = response.data;

        if (!access_token) {
             throw new Error('Failed to retrieve access token from Twitch.');
        }

        // Store the new token and calculate expiry time
        igdbTokenCache.accessToken = access_token;
        // expires_in is in seconds, convert to milliseconds
        igdbTokenCache.expiresAt = now + (expires_in * 1000);

        console.log("Successfully fetched and cached new IGDB token.");
        return access_token;

    } catch (error) {
        console.error("Error fetching IGDB token from Twitch:", error.response ? error.response.data : error.message);
        // Clear cache on failure
        igdbTokenCache.accessToken = null;
        igdbTokenCache.expiresAt = 0;
        // Rethrow a more specific error
        throw new Error(`Twitch OAuth failed: ${error.response?.data?.message || error.message}`);
    }
}

// --- Helper to get required IGDB Headers ---
async function getIgdbHeaders() {
    try {
        const accessToken = await getIgdbAccessToken(); // Get valid token (cached or new)
        return {
            'Client-ID': IGDB_CLIENT_ID,
            'Authorization': `Bearer ${accessToken}`, // Correct format
            'Accept': 'application/json',
            // 'Content-Type': 'text/plain' // Often needed for IGDB APOCALYPSEO body
        };
    } catch (error) {
         console.error("Failed to get IGDB headers:", error.message);
         // Propagate the error so the main route handler knows authentication failed
         throw new Error(`IGDB Authentication setup failed: ${error.message}`);
    }
}


// --- Search Media ---
router.get('/', async (req, res) => {
    const { query, type } = req.query;

    if (!query) {
        return res.status(400).json({ message: 'Search query is required.' });
    }

    try {
        let results = [];
        const encodedQuery = encodeURIComponent(query);

        switch (type) {
            // --- Movie Case ---
            case 'movie':
                if (!TMDB_API_KEY) return res.status(500).json({ message: 'TMDB API Key not configured.' });
                const movieUrl = `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodedQuery}`;
                const movieResponse = await axios.get(movieUrl);
                results = movieResponse.data.results.map(item => ({
                    id: item.id.toString(),
                    type: 'movie',
                    title: item.title,
                    description: item.overview,
                    imageUrl: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
                    releaseDate: item.release_date,
                    rating: item.vote_average ? (item.vote_average / 10 * 20).toFixed(1) : null,
                    apiSource: 'tmdb'
                }));
                break;

            // --- Series Case ---
            case 'series':
                 if (!TMDB_API_KEY) return res.status(500).json({ message: 'TMDB API Key not configured.' });
                const seriesUrl = `${TMDB_BASE_URL}/search/tv?api_key=${TMDB_API_KEY}&query=${encodedQuery}`;
                const seriesResponse = await axios.get(seriesUrl);
                 results = seriesResponse.data.results.map(item => ({
                    id: item.id.toString(),
                    type: 'series',
                    title: item.name,
                    description: item.overview,
                    imageUrl: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
                    releaseDate: item.first_air_date,
                    rating: item.vote_average ? (item.vote_average / 10 * 20).toFixed(1) : null,
                    apiSource: 'tmdb'
                }));
                break;

            // --- Book Case ---
            case 'book':
                const booksUrl = `${GOOGLE_BOOKS_BASE_URL}?q=${encodedQuery}${GOOGLE_BOOKS_API_KEY ? '&key=' + GOOGLE_BOOKS_API_KEY : ''}`;
                const booksResponse = await axios.get(booksUrl);
                results = (booksResponse.data.items || []).map(item => ({
                    id: item.id,
                    type: 'book',
                    title: item.volumeInfo?.title,
                    authors: item.volumeInfo?.authors,
                    description: item.volumeInfo?.description,
                    imageUrl: item.volumeInfo?.imageLinks?.thumbnail,
                    publishedDate: item.volumeInfo?.publishedDate,
                    rating: item.volumeInfo?.averageRating ? (item.volumeInfo.averageRating / 5 * 20).toFixed(1) : null,
                    apiSource: 'google_books'
                }));
                break;

            // --- Video Game Case ---
            case 'video game':
            case 'videogame':
                let igdbHeaders;
                try {
                    // Get headers, which internally handles token fetching/caching
                    igdbHeaders = await getIgdbHeaders();
                } catch(authError) {
                     // Catch errors specifically from getIgdbHeaders/getIgdbAccessToken
                     console.error("IGDB Auth Error during header retrieval:", authError.message);
                     return res.status(503).json({ message: `Could not authenticate with IGDB service: ${authError.message}` }); // 503 Service Unavailable might be appropriate
                }

                // Ensure headers were obtained (shouldn't fail if error handling above is correct, but good check)
                if (!igdbHeaders) {
                     return res.status(500).json({ message: 'Failed to obtain necessary IGDB authentication headers.' });
                }


                const igdbBody = `
                    search "${query.replace(/"/g, '\\"')}";
                    fields name, summary, cover.url, first_release_date, total_rating, genres.name, platforms.abbreviation;
                    limit 20;
                `;

                // Make the actual IGDB API request
                const gameResponse = await axios.post(`${IGDB_BASE_URL}/games`, igdbBody, {
                    headers: { ...igdbHeaders, 'Content-Type': 'text/plain' } // Send body as plain text
                 });

                // Format IGDB results
                results = gameResponse.data.map(item => ({
                    id: item.id.toString(),
                    type: 'video game',
                    title: item.name,
                    description: item.summary,
                    // Use https for image URLs and get bigger cover
                    imageUrl: item.cover?.url ? item.cover.url.replace(/^\/\//, 'https://').replace('/t_thumb/', '/t_cover_big/') : null,
                    releaseDate: item.first_release_date ? new Date(item.first_release_date * 1000).toISOString().split('T')[0] : null,
                    rating: item.total_rating ? (item.total_rating / 100 * 20).toFixed(1) : null,
                    genres: item.genres?.map(g => g.name),
                    platforms: item.platforms?.map(p => p.abbreviation),
                    apiSource: 'igdb'
                }));
                break;

            // --- Default Case ---
            default:
                return res.status(400).json({ message: 'Invalid or missing media type specified. Use movie, series, book, or video game.' });
        }

        res.status(200).json(results);

    } catch (error) {
        // Catch errors from API calls (TMDB, Google Books, IGDB game search itself)
        console.error(`Error searching ${type || 'media'} for query "${query}":`, error.response ? JSON.stringify(error.response.data, null, 2) : error.message);

        // Check if it's an Axios error with a response
         if (axios.isAxiosError(error) && error.response) {
            // Provide a more specific error based on external API status if possible
            const status = error.response.status;
            let message = `Failed to fetch search results from external API (${status}).`;
             // You could add specific handling for common statuses like 401, 404, 429 from the external APIs
            if (status === 401) message = 'External API authentication failed (check API key validity or token permissions).';
            if (status === 429) message = 'External API rate limit exceeded. Please try again later.';

            return res.status(status >= 500 ? 502 : status) // Use 502 Bad Gateway for upstream server errors
                      .json({ message: message, details: error.response.data?.message || 'No details provided.' });
        } else if (error.message.includes('IGDB Authentication setup failed') || error.message.includes('Twitch OAuth failed')) {
            // Handle errors specifically thrown from our auth functions if not caught earlier
             return res.status(503).json({ message: error.message });
        } else {
            // General server error for other unexpected issues
            return res.status(500).json({ message: `Server error during search: ${error.message}` });
        }
    }
});

module.exports = router;
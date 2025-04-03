// routes/api/searchRoutes.js
const express = require('express');
const axios = require('axios');
require('dotenv').config();
const { getIgdbHeaders } = require('./igdbAuthHelper');

const router = express.Router();

// --- Environment Variable Checks ---
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const GOOGLE_BOOKS_API_KEY = process.env.GOOGLE_BOOKS_API_KEY;
const IGDB_CLIENT_ID = process.env.IGDB_CLIENT_ID;
const IGDB_CLIENT_SECRET = process.env.IGDB_CLIENT_SECRET;

// Log missing keys during startup for easier debugging
if (!TMDB_API_KEY) console.warn("TMDB_API_KEY is missing from .env. Movie/Series search will fail.");
if (!IGDB_CLIENT_ID || !IGDB_CLIENT_SECRET) console.warn("IGDB_CLIENT_ID or IGDB_CLIENT_SECRET is missing from .env. Video Game search will fail.");
// GOOGLE_BOOKS_API_KEY is often optional, so no warning needed.

// --- API Base URLs ---
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const GOOGLE_BOOKS_BASE_URL = 'https://www.googleapis.com/books/v1/volumes';
const IGDB_BASE_URL = 'https://api.igdb.com/v4';

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


// --- Main Search Route ---
// GET /api/search?query=...&type=...
router.get('/', async (req, res) => {
    const { query, type } = req.query;
    const mediaType = type?.toLowerCase(); // Normalize type

    // --- Basic Input Validation ---
    if (!query || typeof query !== 'string' || query.trim() === '') {
        return res.status(400).json({ message: 'Search query parameter is required.' });
    }
    const validTypes = ['movie', 'series', 'book', 'video game', 'videogame']; // Allow 'videogame' alias
    if (!mediaType || !validTypes.includes(mediaType)) {
        return res.status(400).json({ message: 'Invalid or missing media type parameter. Use movie, series, book, or video game.' });
    }

    console.log(`Searching for ${mediaType} with query: "${query}"`);
    const encodedQuery = encodeURIComponent(query.trim());
    let results = [];

    try {
        // --- API Call Dispatch ---
        switch (mediaType) {
            // --- Movie ---
            case 'movie':
                if (!TMDB_API_KEY) throw new Error('TMDB API Key not configured.');
                const movieUrl = `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodedQuery}&include_adult=false`;
                const movieResponse = await axios.get(movieUrl);
                results = movieResponse.data.results.map(item => ({
                    mediaId: item.id.toString(), // Use consistent 'mediaId'
                    mediaType: 'movie',
                    title: item.title,
                    description: item.overview,
                    imageUrl: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
                    releaseDate: item.release_date || null, // Ensure null if empty
                    rating: convertRatingTo20(item.vote_average, 'tmdb'),
                    apiSource: 'tmdb'
                }));
                break;

            // --- Series ---
            case 'series':
                 if (!TMDB_API_KEY) throw new Error('TMDB API Key not configured.');
                const seriesUrl = `${TMDB_BASE_URL}/search/tv?api_key=${TMDB_API_KEY}&query=${encodedQuery}&include_adult=false`;
                const seriesResponse = await axios.get(seriesUrl);
                 results = seriesResponse.data.results.map(item => ({
                    mediaId: item.id.toString(),
                    mediaType: 'series',
                    title: item.name, // TV uses 'name'
                    description: item.overview,
                    imageUrl: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
                    releaseDate: item.first_air_date || null,
                    rating: convertRatingTo20(item.vote_average, 'tmdb'),
                    apiSource: 'tmdb'
                }));
                break;

            // --- Book ---
            case 'book':
                // Google Books API Key is optional but recommended
                const booksUrl = `${GOOGLE_BOOKS_BASE_URL}?q=${encodedQuery}&maxResults=20${GOOGLE_BOOKS_API_KEY ? '&key=' + GOOGLE_BOOKS_API_KEY : ''}&langRestrict=en`;
                const booksResponse = await axios.get(booksUrl);
                // Ensure items array exists before mapping
                results = (booksResponse.data.items || []).map(item => ({
                    mediaId: item.id, // Google Books ID is usually a string
                    mediaType: 'book',
                    title: item.volumeInfo?.title || 'Unknown Title',
                    authors: item.volumeInfo?.authors || [], // Ensure array
                    description: item.volumeInfo?.description,
                    // Prefer HTTPS for images if available
                    imageUrl: item.volumeInfo?.imageLinks?.thumbnail?.replace(/^http:/, 'https://') || item.volumeInfo?.imageLinks?.smallThumbnail?.replace(/^http:/, 'https://') || null,
                    publishedDate: item.volumeInfo?.publishedDate || null,
                    rating: convertRatingTo20(item.volumeInfo?.averageRating, 'google'),
                    apiSource: 'google_books'
                }));
                break;

            // --- Video Game ---
            case 'video game':
            case 'videogame': // Handle alias
                // Get headers (handles token fetching/caching internally, will throw on auth error)
                const igdbHeaders = await getIgdbHeaders();

                // Construct the IGDB API Query Language (APOCALYPSEO) body
                // Escape double quotes in the search query itself
                const escapedQuery = query.trim().replace(/"/g, '\\"');
                const igdbBody = `search "${escapedQuery}"; fields name, summary, cover.url, first_release_date, total_rating, genres.name, platforms.abbreviation; limit 20; where category = 0 | category = 8 | category = 9;`;


                // Make the POST request to IGDB
                const gameResponse = await axios.post(`${IGDB_BASE_URL}/games`, igdbBody, {
                    headers: { ...igdbHeaders, 'Content-Type': 'text/plain' }
                 });

                results = gameResponse.data.map(item => ({
                    mediaId: item.id.toString(),
                    mediaType: 'video game',
                    title: item.name || 'Unknown Title',
                    description: item.summary,
                    imageUrl: item.cover?.url ? item.cover.url.replace(/^\/\//, 'https://').replace('/t_thumb/', '/t_cover_big/') : null,
                    releaseDate: item.first_release_date ? new Date(item.first_release_date * 1000).toISOString().split('T')[0] : null,
                    rating: convertRatingTo20(item.total_rating, 'igdb'), // Use helper
                    genres: item.genres?.map(g => g.name) || [],
                    platforms: item.platforms?.map(p => p.abbreviation).filter(p => p) || [],
                    apiSource: 'igdb'
                }));
                break;

            // Default case handled by initial validation
        }

        // --- Send Results ---
        res.status(200).json(results);

    } catch (error) {
        // --- Comprehensive Error Handling ---
        console.error(`Error searching ${mediaType || 'media'} for query "${query}":`, error);

        // Check if it's an error thrown by our own setup (e.g., missing API key, IGDB auth)
        if (error.message.includes('API Key not configured') || error.message.includes('IGDB service')) {
            // These are configuration/setup issues, likely 500 or 503
            return res.status(503).json({ message: error.message }); // 503 Service Unavailable
        }

        // Check if it's an Axios error from the external API call
        if (axios.isAxiosError(error)) {
            const status = error.response?.status || 500; // Default to 500 if no response status
            let message = `Failed to fetch search results from external API (${error.config?.url}).`;
            const details = error.response?.data?.message || error.response?.data?.status_message || error.message;

            // Customize messages for common external API errors
            if (status === 401) message = 'External API authentication failed. Check API key validity or permissions.';
            else if (status === 404) message = 'External API endpoint not found or resource does not exist.';
            else if (status === 429) message = 'External API rate limit exceeded. Please try again later.';
            else if (status >= 500) message = 'External API service is unavailable or encountered an error.';

            // Return appropriate status code (502 for upstream errors)
            return res.status(status === 401 || status === 404 || status === 429 ? status : 502)
                      .json({ message: message, details: details });
        }

        // General server error for anything else unexpected
        return res.status(500).json({ message: `An unexpected server error occurred during search: ${error.message}` });
    }
});

module.exports = router;
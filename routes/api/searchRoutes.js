// routes/api/searchRoutes.js
const express = require('express');
const axios = require('axios');
require('dotenv').config();
const { getIgdbHeaders, convertRatingTo10 } = require('./igdbAuthHelper'); // Use updated helper

const router = express.Router();

// --- Environment Variable Checks & API URLs ---
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const GOOGLE_BOOKS_API_KEY = process.env.GOOGLE_BOOKS_API_KEY;
const IGDB_CLIENT_ID = process.env.IGDB_CLIENT_ID;
const IGDB_CLIENT_SECRET = process.env.IGDB_CLIENT_SECRET;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const GOOGLE_BOOKS_BASE_URL = 'https://www.googleapis.com/books/v1/volumes';
const IGDB_BASE_URL = 'https://api.igdb.com/v4';

if (!TMDB_API_KEY) console.warn("TMDB_API_KEY is missing. Movie/Series search will fail.");
if (!IGDB_CLIENT_ID || !IGDB_CLIENT_SECRET) console.warn("IGDB credentials missing. Video Game search will fail.");

// Helper to safely extract year
const getYear = (dateString) => {
    if (!dateString) return null;
    try {
        return new Date(dateString).getFullYear();
    } catch (e) {
        const yearMatch = dateString.match(/\d{4}/); // Try matching YYYY
        return yearMatch ? parseInt(yearMatch[0], 10) : null;
    }
};

// --- Main Search Route ---
router.get('/', async (req, res) => {
    const { query, type } = req.query;
    const mediaType = type?.toLowerCase();

    if (!query || typeof query !== 'string' || query.trim() === '') {
        return res.status(400).json({ message: 'Search query parameter is required.' });
    }
    const validTypes = ['movie', 'series', 'book', 'video game', 'videogame'];
    if (!mediaType || !validTypes.includes(mediaType)) {
        return res.status(400).json({ message: 'Invalid or missing media type parameter.' });
    }

    const encodedQuery = encodeURIComponent(query.trim());
    let results = [];

    try {
        switch (mediaType) {
            case 'movie':
                if (!TMDB_API_KEY) throw new Error('TMDB API Key not configured.');
                const movieUrl = `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodedQuery}&include_adult=false&language=en-US`;
                const movieResponse = await axios.get(movieUrl);
                results = movieResponse.data.results.map(item => ({
                    mediaId: item.id.toString(),
                    mediaType: 'movie',
                    title: item.title,
                    // description: item.overview, // Keep details for detail view
                    imageUrl: item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : null, // Smaller image for card
                    releaseYear: getYear(item.release_date),
                    // rating: convertRatingTo10(item.vote_average, 'tmdb'), // Rating shown on detail view
                    apiSource: 'tmdb'
                }));
                break;

            case 'series':
                 if (!TMDB_API_KEY) throw new Error('TMDB API Key not configured.');
                const seriesUrl = `${TMDB_BASE_URL}/search/tv?api_key=${TMDB_API_KEY}&query=${encodedQuery}&include_adult=false&language=en-US`;
                const seriesResponse = await axios.get(seriesUrl);
                 results = seriesResponse.data.results.map(item => ({
                    mediaId: item.id.toString(),
                    mediaType: 'series',
                    title: item.name,
                    // description: item.overview,
                    imageUrl: item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : null,
                    releaseYear: getYear(item.first_air_date),
                    // rating: convertRatingTo10(item.vote_average, 'tmdb'),
                    apiSource: 'tmdb'
                }));
                break;

            case 'book':
                const booksUrl = `${GOOGLE_BOOKS_BASE_URL}?q=${encodedQuery}&maxResults=20${GOOGLE_BOOKS_API_KEY ? '&key=' + GOOGLE_BOOKS_API_KEY : ''}&langRestrict=en&printType=books`;
                const booksResponse = await axios.get(booksUrl);
                results = (booksResponse.data.items || []).map(item => ({
                    mediaId: item.id,
                    mediaType: 'book',
                    title: item.volumeInfo?.title || 'Unknown Title',
                    authors: item.volumeInfo?.authors || [], // Keep authors for card display maybe
                    // description: item.volumeInfo?.description,
                    imageUrl: item.volumeInfo?.imageLinks?.thumbnail?.replace(/^http:/, 'https') || item.volumeInfo?.imageLinks?.smallThumbnail?.replace(/^http:/, 'https') || null,
                    releaseYear: getYear(item.volumeInfo?.publishedDate), // Use helper
                    // rating: convertRatingTo10(item.volumeInfo?.averageRating, 'google'),
                    apiSource: 'google_books'
                }));
                break;

            case 'video game':
            case 'videogame':
                const igdbHeaders = await getIgdbHeaders();
                const escapedQuery = query.trim().replace(/"/g, '\\"');
                // Request fields needed for card display primarily
                const igdbBody = `
                    search "${escapedQuery}";
                    fields name, cover.url, first_release_date;
                    limit 20;
                    where category = (0, 8, 9);`; // 0: Main Game, 8: DLC, 9: Expansion

                const gameResponse = await axios.post(`${IGDB_BASE_URL}/games`, igdbBody, {
                    headers: { ...igdbHeaders, 'Content-Type': 'text/plain' }
                 });

                results = gameResponse.data.map(item => ({
                    mediaId: item.id.toString(),
                    mediaType: 'video game',
                    title: item.name || 'Unknown Title',
                    // description: item.summary,
                    imageUrl: item.cover?.url ? item.cover.url.replace(/^\/\//, 'https://').replace('/t_thumb/', '/t_cover_big/') : null,
                    releaseYear: item.first_release_date ? new Date(item.first_release_date * 1000).getFullYear() : null, // Get year directly
                    // rating: convertRatingTo10(item.total_rating, 'igdb'),
                    // genres: item.genres?.map(g => g.name) || [],
                    // platforms: item.platforms?.map(p => p.abbreviation).filter(p => p) || [],
                    apiSource: 'igdb'
                }));
                break;
        }

        res.status(200).json(results);

    } catch (error) {
        // Keep existing error handling logic
         console.error(`Error searching ${mediaType || 'media'} for query "${query}":`, error.message);
         if (error.message.includes('API Key not configured') || error.message.includes('IGDB service')) {
            return res.status(503).json({ message: error.message });
         }
         if (axios.isAxiosError(error)) {
            const status = error.response?.status || 500;
            let message = `Failed to fetch search results from external API.`;
             const details = error.response?.data?.message || error.response?.data?.status_message || error.message;
             if (status === 401) message = 'External API authentication failed.';
             else if (status === 404) message = 'External API endpoint not found.';
             else if (status === 429) message = 'External API rate limit exceeded.';
             else if (status >= 500) message = 'External API service is unavailable.';
            return res.status(status === 401 || status === 404 || status === 429 ? status : 502)
                      .json({ message: message, details: details });
         }
         return res.status(500).json({ message: `An unexpected server error occurred during search: ${error.message}` });
    }
});

module.exports = router;
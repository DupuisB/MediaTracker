// routes/api/homepageDataRoutes.js (NEW FILE)
const express = require('express');
const axios = require('axios');
require('dotenv').config();
const { getIgdbHeaders } = require('./igdbAuthHelper'); // IGDB helper

const router = express.Router();

// --- Environment Variable Checks & API URLs ---
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const GOOGLE_BOOKS_API_KEY = process.env.GOOGLE_BOOKS_API_KEY;
const IGDB_CLIENT_ID = process.env.IGDB_CLIENT_ID; // Needed for headers
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const GOOGLE_BOOKS_BASE_URL = 'https://www.googleapis.com/books/v1/volumes';
const IGDB_BASE_URL = 'https://api.igdb.com/v4';

// Helper to safely extract year
const getYear = (dateString) => {
    if (!dateString) return null;
    try { return new Date(dateString).getFullYear(); }
    catch (e) { const y = dateString.match(/\d{4}/); return y ? parseInt(y[0], 10) : null; }
};

// Map data to consistent mediaCard format
const mapToCard = (item, type) => {
    switch (type) {
        case 'movie':
            return {
                mediaId: item.id.toString(), mediaType: 'movie', title: item.title,
                imageUrl: item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : null,
                releaseYear: getYear(item.release_date), apiSource: 'tmdb'
            };
        case 'series':
            return {
                mediaId: item.id.toString(), mediaType: 'series', title: item.name,
                imageUrl: item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : null,
                releaseYear: getYear(item.first_air_date), apiSource: 'tmdb'
            };
        case 'book': // Google Books - using 'newest' as proxy for popular/hot
             return {
                mediaId: item.id, mediaType: 'book', title: item.volumeInfo?.title || 'N/A',
                authors: item.volumeInfo?.authors || [],
                imageUrl: item.volumeInfo?.imageLinks?.thumbnail?.replace(/^http:/, 'https:') || item.volumeInfo?.imageLinks?.smallThumbnail?.replace(/^http:/, 'https:') || null,
                releaseYear: getYear(item.volumeInfo?.publishedDate), apiSource: 'google_books'
            };
        case 'video game': // IGDB - using popularity sort
            return {
                mediaId: item.id.toString(), mediaType: 'video game', title: item.name || 'N/A',
                imageUrl: item.cover?.url ? item.cover.url.replace(/^\/\//, 'https://').replace('/t_thumb/', '/t_cover_big/') : null,
                releaseYear: item.first_release_date ? new Date(item.first_release_date * 1000).getFullYear() : null,
                apiSource: 'igdb'
            };
        default: return {};
    }
};

// GET /api/homepage-data?type=<mediaType>
router.get('/', async (req, res) => {
    const { type } = req.query;
    const mediaType = type?.toLowerCase();
    const limit = 12; // Number of items per carousel

    if (!mediaType) {
        return res.status(400).json({ message: 'Media type parameter is required.' });
    }

    let results = [];
    let apiUrl = '';
    let config = {};
    let responseDataPath = 'results'; // Default path in TMDB response
    let mapType = mediaType; // Type to use for mapping

    try {
        switch (mediaType) {
            case 'movie':
                if (!TMDB_API_KEY) throw new Error('TMDB API Key missing.');
                apiUrl = `${TMDB_BASE_URL}/movie/popular?api_key=${TMDB_API_KEY}&language=en-US&page=1`;
                break;
            case 'series':
                if (!TMDB_API_KEY) throw new Error('TMDB API Key missing.');
                apiUrl = `${TMDB_BASE_URL}/tv/popular?api_key=${TMDB_API_KEY}&language=en-US&page=1`;
                 break;
            case 'book':
                // Using 'newest' as a proxy for 'hot'/'recommendations' for books
                // Alternatively use a generic query like 'subject:fiction' or 'subject:popular'
                apiUrl = `${GOOGLE_BOOKS_BASE_URL}?q=subject:fiction&orderBy=newest&maxResults=${limit}${GOOGLE_BOOKS_API_KEY ? '&key=' + GOOGLE_BOOKS_API_KEY : ''}&langRestrict=en&printType=books`;
                responseDataPath = 'items'; // Google Books path
                 break;
            case 'video game':
            case 'videogame': // Allow alias
                 mapType = 'video game'; // Use consistent type for mapping
                 const igdbHeaders = await getIgdbHeaders();
                 config = { headers: { ...igdbHeaders, 'Content-Type': 'text/plain' } };
                 apiUrl = `${IGDB_BASE_URL}/games`;
                 // Query popular games with some rating count to avoid obscure ones
                 const igdbBody = `
                     fields name, cover.url, first_release_date;
                     sort popularity desc;
                     where total_rating_count > 20 & category = 0;
                     limit ${limit};`; // Category 0 = Main Game
                config.data = igdbBody; // Data for POST request
                config.method = 'POST';
                 responseDataPath = null; // IGDB response is directly the array
                break;
            default:
                return res.status(400).json({ message: 'Invalid media type specified.' });
        }

        // Make the API request
        let response;
        if (config.method === 'POST') {
            response = await axios(apiUrl, config);
        } else {
            response = await axios.get(apiUrl, config);
        }

        // Extract and map results
        const rawResults = responseDataPath ? response.data[responseDataPath] : response.data;
        if (Array.isArray(rawResults)) {
            results = rawResults.slice(0, limit).map(item => mapToCard(item, mapType));
        }

        // Return same data for both 'hottest' and 'recommendations' for now
        res.status(200).json({
             hottest: results,
             recommendations: results
         });

    } catch (error) {
         console.error(`Error fetching homepage data for ${mediaType}:`, error.response?.data || error.message);
         if (error.message.includes('API Key missing') || error.message.includes('IGDB service') || error.message.includes('authenticate with IGDB')) {
            return res.status(503).json({ message: `Service unavailable for ${mediaType}: ${error.message}` });
         }
         const status = error.response?.status || 500;
         res.status(status).json({ message: `Failed to fetch data for ${mediaType}.`, details: error.message });
    }
});

module.exports = router;
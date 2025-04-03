// routes/api/detailsRoutes.js
const express = require('express');
const axios = require('axios');
require('dotenv').config();
const { getIgdbHeaders } = require('./igdbAuthHelper');

const router = express.Router();

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const GOOGLE_BOOKS_API_KEY = process.env.GOOGLE_BOOKS_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const GOOGLE_BOOKS_BASE_URL = 'https://www.googleapis.com/books/v1/volumes';
const IGDB_BASE_URL = 'https://api.igdb.com/v4';

// Helper to fetch data safely
const fetchData = async (url, config = {}) => {
    try {
        const response = await axios.get(url, config);
        return response.data;
    } catch (error) {
        console.error(`API fetch error for ${url}: ${error.response?.status || error.message}`);
        // Return specific error info if possible
        const errorData = { failed: true, status: error.response?.status, message: error.message };
        return errorData;
    }
};

// Helper to make IGDB POST requests safely
const fetchIgdbData = async (endpoint, body) => {
    let headers;
    try {
        headers = await getIgdbHeaders(); // Get auth headers
    } catch(authError) {
        console.error("IGDB Auth Error during header retrieval:", authError.message);
         // Return structure indicating auth failure
         return { failed: true, authFailed: true, message: `IGDB Auth Error: ${authError.message}` };
    }

    try {
        const response = await axios.post(`${IGDB_BASE_URL}${endpoint}`, body, {
            headers: { ...headers, 'Content-Type': 'text/plain' }
         });
         // Check if IGDB returned an empty array or valid data
        return response.data && response.data.length > 0 ? response.data[0] : { notFound: true }; // Expecting one result by ID
    } catch (error) {
        console.error(`IGDB fetch error for ${endpoint}: ${error.response?.status || error.message}`);
         return { failed: true, status: error.response?.status, message: error.message };
    }
};


// Convert various ratings to a 0-20 scale (approx)
function normalizeRating(rating, scale) {
    if (rating === null || rating === undefined || isNaN(parseFloat(rating))) {
        return null;
    }
    const numRating = parseFloat(rating);
    switch (scale) {
        case 10: // TMDB (0-10)
            return (numRating * 2).toFixed(1);
        case 5: // Google Books (0-5)
            return (numRating * 4).toFixed(1);
        case 100: // IGDB (0-100)
            return (numRating / 5).toFixed(1);
        default:
            return rating; // Assume already correct scale or unknown
    }
}

router.get('/:mediaType/:mediaId', async (req, res) => {
    const { mediaType, mediaId } = req.params;
    let combinedDetails = { // Initialize with base info
        mediaType: mediaType,
        mediaId: mediaId, // The external ID
        title: null,
        description: null,
        imageUrl: null,
        releaseDate: null,
        rating: null, // Normalized rating
        genres: [],
        // Type specific fields
        authors: [], // books
        publisher: null, // books
        pageCount: null, // books
        googleBooksLink: null, // books
        cast: [], // movies/series
        producers: [], // movies/series
        imdbId: null, // movies/series
        platforms: [], // games
        developers: [], // games
        publishers: [], // games
        screenshots: [], // games
        videos: [], // games
        igdbLink: null, // games
    };
    let apiResponseData;

    try {
        // --- Fetch Data based on Type ---
        switch (mediaType) {
            case 'movie':
            case 'series':
                if (!TMDB_API_KEY) throw new Error('TMDB API Key missing.');
                const basePath = mediaType === 'movie' ? 'movie' : 'tv';
                const detailsUrl = `${TMDB_BASE_URL}/${basePath}/${mediaId}?api_key=${TMDB_API_KEY}&language=en-US`;
                const creditsUrl = `${TMDB_BASE_URL}/${basePath}/${mediaId}/credits?api_key=${TMDB_API_KEY}&language=en-US`;
                const externalIdsUrl = `${TMDB_BASE_URL}/${basePath}/${mediaId}/external_ids?api_key=${TMDB_API_KEY}`;

                const [detailsData, creditsData, externalIdsData] = await Promise.all([
                    fetchData(detailsUrl),
                    fetchData(creditsUrl),
                    fetchData(externalIdsUrl)
                ]);

                 // Check for critical failures
                 if (detailsData?.failed || !detailsData) {
                     const status = detailsData?.status || 404;
                     return res.status(status).json({ message: `Details not found on TMDB (${status}).` });
                 }

                // Populate combinedDetails
                combinedDetails.title = mediaType === 'movie' ? detailsData.title : detailsData.name;
                combinedDetails.description = detailsData.overview;
                combinedDetails.imageUrl = detailsData.poster_path ? `https://image.tmdb.org/t/p/w500${detailsData.poster_path}` : null;
                combinedDetails.releaseDate = mediaType === 'movie' ? detailsData.release_date : detailsData.first_air_date;
                combinedDetails.rating = normalizeRating(detailsData.vote_average, 10);
                combinedDetails.genres = detailsData.genres?.map(g => g.name) || [];
                combinedDetails.cast = creditsData?.cast?.slice(0, 10).map(c => ({ name: c.name, character: c.character })) || [];
                combinedDetails.producers = creditsData?.crew?.filter(c => c.job === 'Producer').map(p => p.name) || [];
                combinedDetails.imdbId = externalIdsData?.imdb_id || null;
                break;

            case 'book':
                const bookUrl = `${GOOGLE_BOOKS_BASE_URL}/${mediaId}?${GOOGLE_BOOKS_API_KEY ? 'key=' + GOOGLE_BOOKS_API_KEY : ''}`;
                apiResponseData = await fetchData(bookUrl);

                if (apiResponseData?.failed || !apiResponseData?.volumeInfo) {
                    const status = apiResponseData?.status || 404;
                    return res.status(status).json({ message: `Book details not found on Google Books (${status}).` });
                }

                const volInfo = apiResponseData.volumeInfo;
                combinedDetails.title = volInfo.title;
                combinedDetails.description = volInfo.description;
                combinedDetails.imageUrl = volInfo.imageLinks?.thumbnail?.replace(/^http:/, 'https') || volInfo.imageLinks?.smallThumbnail?.replace(/^http:/, 'https') || null;
                combinedDetails.releaseDate = volInfo.publishedDate; // Often just year or YYYY-MM
                combinedDetails.rating = normalizeRating(volInfo.averageRating, 5);
                combinedDetails.genres = volInfo.categories || [];
                combinedDetails.authors = volInfo.authors || [];
                combinedDetails.publisher = volInfo.publisher || null;
                combinedDetails.pageCount = volInfo.pageCount || null;
                combinedDetails.googleBooksLink = volInfo.infoLink || null;
                break;

            case 'video game':
                const gameQuery = `
                    fields name, summary, genres.name, platforms.abbreviation,
                           first_release_date, involved_companies.company.name,
                           involved_companies.developer, involved_companies.publisher,
                           total_rating, cover.url, screenshots.url, videos.video_id, url;
                    where id = ${mediaId};
                    limit 1;`;
                apiResponseData = await fetchIgdbData('/games', gameQuery);

                if (apiResponseData?.failed || apiResponseData?.notFound) {
                    if(apiResponseData?.authFailed) {
                         return res.status(503).json({ message: apiResponseData.message }); // Auth problem
                    }
                    const status = apiResponseData?.status || 404;
                     return res.status(status).json({ message: `Game details not found on IGDB (${status}).` });
                }

                combinedDetails.title = apiResponseData.name;
                combinedDetails.description = apiResponseData.summary;
                combinedDetails.imageUrl = apiResponseData.cover?.url
                    ? apiResponseData.cover.url.replace('t_thumb', 't_cover_big').replace(/^\/\//, 'https://')
                    : null;
                combinedDetails.releaseDate = apiResponseData.first_release_date
                    ? new Date(apiResponseData.first_release_date * 1000).toISOString().split('T')[0] // Convert timestamp
                    : null;
                combinedDetails.rating = normalizeRating(apiResponseData.total_rating, 100);
                combinedDetails.genres = apiResponseData.genres?.map(g => g.name) || [];
                combinedDetails.platforms = apiResponseData.platforms?.map(p => p.abbreviation || p.name) || []; // Use abbreviation if available
                combinedDetails.igdbLink = apiResponseData.url || null;
                 // Extract developers and publishers
                if (apiResponseData.involved_companies) {
                    apiResponseData.involved_companies.forEach(ic => {
                        if (ic.company?.name) {
                            if (ic.developer) combinedDetails.developers.push(ic.company.name);
                            if (ic.publisher) combinedDetails.publishers.push(ic.company.name);
                        }
                    });
                    // Remove duplicates
                    combinedDetails.developers = [...new Set(combinedDetails.developers)];
                    combinedDetails.publishers = [...new Set(combinedDetails.publishers)];
                }
                combinedDetails.screenshots = apiResponseData.screenshots?.map(s => s.url?.replace('t_thumb', 't_screenshot_med').replace(/^\/\//, 'https://')) || [];
                combinedDetails.videos = apiResponseData.videos?.map(v => ({ youtubeId: v.video_id, youtubeLink: `https://www.youtube.com/watch?v=${v.video_id}` })) || [];
                break;

            default:
                return res.status(400).json({ message: 'Invalid media type specified.' });
        }

        // Return the aggregated details
        res.status(200).json(combinedDetails);

    } catch (error) {
        // Catch errors from processing logic or initial API key checks etc.
        console.error(`Error processing details for ${mediaType} ${mediaId}:`, error);
        res.status(500).json({ message: error.message || 'Server error while fetching detailed media information.' });
    }
});

module.exports = router;

// NOTE: You'll need to create/import `igdbAuthHelper.js` containing the
// getIgdbAccessToken and getIgdbHeaders functions previously defined in
// searchRoutes.js or refactor them into a shared location. For simplicity,
// I've assumed it exists here. You can copy the relevant functions from
// `searchRoutes.js` into a new `igdbAuthHelper.js` file and export them.
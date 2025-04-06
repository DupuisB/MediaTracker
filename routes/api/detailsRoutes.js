// routes/api/detailsRoutes.js
const express = require('express');
const axios = require('axios');
require('dotenv').config();
const { getIgdbHeaders, convertRatingTo10 } = require('./igdbAuthHelper');

const router = express.Router();

// --- Constants and Helpers (Keep existing TMDB/Google/IGDB URLs, getYear, fetchData, fetchIgdbData) ---
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const GOOGLE_BOOKS_API_KEY = process.env.GOOGLE_BOOKS_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const GOOGLE_BOOKS_BASE_URL = 'https://www.googleapis.com/books/v1/volumes';
const IGDB_BASE_URL = 'https://api.igdb.com/v4';

// Helper to fetch data safely
const fetchData = async (url, config = {}) => {
    try {
        // console.log("Fetching:", url);
        const response = await axios.get(url, config);
        return response.data;
    } catch (error) {
        console.error(`API fetch error for ${url}: ${error.response?.status || error.message}`, error.response?.data);
        return { failed: true, status: error.response?.status, message: error.message, data: error.response?.data };
    }
};

// Helper to make IGDB POST requests safely
const fetchIgdbData = async (endpoint, body) => {
    let headers;
    try {
        headers = await getIgdbHeaders();
    } catch(authError) {
        console.error("IGDB Auth Error:", authError.message);
         return { failed: true, authFailed: true, message: `IGDB Auth Error: ${authError.message}` };
    }
    try {
        // console.log("Fetching IGDB:", endpoint, "Body:", body);
        const response = await axios.post(`${IGDB_BASE_URL}${endpoint}`, body, {
            headers: { ...headers, 'Content-Type': 'text/plain' }
         });
        return response.data && response.data.length > 0 ? response.data[0] : { notFound: true };
    } catch (error) {
        console.error(`IGDB fetch error for ${endpoint}: ${error.response?.status || error.message}`, error.response?.data);
         return { failed: true, status: error.response?.status, message: error.message, data: error.response?.data };
    }
};

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

// GET /api/details/:mediaType/:mediaId
router.get('/:mediaType/:mediaId', async (req, res) => {
    const { mediaType, mediaId } = req.params;
    let apiResponseData;

    // Initialize structured details object (ADD bannerImageUrl and trailerVideoId)
    let combinedDetails = {
        mediaId: mediaId,
        mediaType: mediaType,
        title: null,
        subtitle: null,
        description: null,
        imageUrl: null, // Main poster/cover
        bannerImageUrl: null, // <-- NEW: For backdrop/screenshot
        trailerVideoId: null, // <-- NEW: For YouTube trailer key
        releaseDate: null,
        releaseYear: null,
        apiRating: null,
        genres: [],
        // Specific fields
        authors: [], directors: [], screenwriters: [], publisher: null, pageCount: null,
        cast: [], platforms: [], developers: [],
        // Links
        imdbId: null, googleBooksLink: null, igdbLink: null, tmdbLink: null,
        // Placeholders
        relatedMedia: [], reviews: []
    };

    try {
        switch (mediaType) {
            case 'movie':
            case 'series':
                if (!TMDB_API_KEY) throw new Error('TMDB API Key missing.');
                const isMovie = mediaType === 'movie';
                const basePath = isMovie ? 'movie' : 'tv';
                // MODIFIED: Append 'videos' to get trailer info
                const detailsUrl = `${TMDB_BASE_URL}/${basePath}/${mediaId}?api_key=${TMDB_API_KEY}&language=en-US&append_to_response=credits,external_ids,videos`;

                apiResponseData = await fetchData(detailsUrl);

                 if (apiResponseData?.failed || !apiResponseData) {
                     const status = apiResponseData?.status || 404;
                     const message = apiResponseData?.data?.status_message || `Details not found on TMDB (${status}).`;
                     return res.status(status).json({ message });
                 }

                // --- Basic Details (keep as before) ---
                combinedDetails.title = isMovie ? apiResponseData.title : apiResponseData.name;
                combinedDetails.subtitle = apiResponseData.tagline || null;
                combinedDetails.description = apiResponseData.overview;
                combinedDetails.imageUrl = apiResponseData.poster_path ? `https://image.tmdb.org/t/p/w780${apiResponseData.poster_path}` : null;
                combinedDetails.releaseDate = isMovie ? apiResponseData.release_date : apiResponseData.first_air_date;
                combinedDetails.releaseYear = getYear(combinedDetails.releaseDate);
                combinedDetails.apiRating = convertRatingTo10(apiResponseData.vote_average, 'tmdb');
                combinedDetails.genres = apiResponseData.genres?.map(g => g.name) || [];
                combinedDetails.imdbId = apiResponseData.external_ids?.imdb_id || null;
                combinedDetails.tmdbLink = `https://www.themoviedb.org/${basePath}/${mediaId}`;
                // --- Credits (keep as before) ---
                if (apiResponseData.credits) {
                    combinedDetails.cast = apiResponseData.credits.cast?.slice(0, 10).map(c => ({ name: c.name, character: c.character, profilePath: c.profile_path })) || []; // Get profile picture path too
                    apiResponseData.credits.crew?.forEach(c => {
                         if (c.job === 'Director') combinedDetails.directors.push(c.name);
                         if (c.job === 'Screenplay' || c.job === 'Writer' || c.job === 'Story') combinedDetails.screenwriters.push(c.name);
                    });
                     // Unique names
                    combinedDetails.directors = [...new Set(combinedDetails.directors)];
                    combinedDetails.screenwriters = [...new Set(combinedDetails.screenwriters)];
                 }

                // --- NEW: Extract Banner Image ---
                if (apiResponseData.backdrop_path) {
                    combinedDetails.bannerImageUrl = `https://image.tmdb.org/t/p/w1280${apiResponseData.backdrop_path}`; // Use a wide size
                }

                // --- NEW: Extract Trailer Video ---
                if (apiResponseData.videos?.results?.length > 0) {
                    // Find the first official trailer on YouTube
                    const trailer = apiResponseData.videos.results.find(
                        video => video.site === 'YouTube' && video.type === 'Trailer' && video.official
                    ) || apiResponseData.videos.results.find( // Fallback to any YouTube trailer
                        video => video.site === 'YouTube' && video.type === 'Trailer'
                    ) || apiResponseData.videos.results.find( // Fallback to any YouTube video
                        video => video.site === 'YouTube'
                    );
                    if (trailer) {
                        combinedDetails.trailerVideoId = trailer.key; // YouTube video ID
                    }
                }
                break;

            case 'book':
                // Fetch book details (no changes needed here for banner/trailer)
                const bookUrl = `${GOOGLE_BOOKS_BASE_URL}/${mediaId}?${GOOGLE_BOOKS_API_KEY ? 'key=' + GOOGLE_BOOKS_API_KEY : ''}`;
                apiResponseData = await fetchData(bookUrl);

                if (apiResponseData?.failed || !apiResponseData?.volumeInfo) {
                   const status = apiResponseData?.status || 404;
                   const message = apiResponseData?.error?.message || `Book details not found on Google Books (${status}).`;
                   return res.status(status).json({ message });
                }
                const volInfo = apiResponseData.volumeInfo;
                // --- Populate details (keep as before) ---
                combinedDetails.title = volInfo.title;
                combinedDetails.subtitle = volInfo.subtitle || (volInfo.authors ? volInfo.authors.join(', ') : null);
                combinedDetails.description = volInfo.description;
                combinedDetails.imageUrl = volInfo.imageLinks?.thumbnail?.replace(/^http:/, 'https').replace(/zoom=\d/, 'zoom=1') || volInfo.imageLinks?.smallThumbnail?.replace(/^http:/, 'https') || null;
                combinedDetails.releaseDate = volInfo.publishedDate;
                combinedDetails.releaseYear = getYear(volInfo.publishedDate);
                combinedDetails.apiRating = convertRatingTo10(volInfo.averageRating, 'google');
                combinedDetails.genres = volInfo.categories || [];
                combinedDetails.authors = volInfo.authors || [];
                combinedDetails.publisher = volInfo.publisher || null;
                combinedDetails.pageCount = volInfo.pageCount || null;
                combinedDetails.googleBooksLink = volInfo.infoLink || null;
                // Banner and Trailer remain null for books
                break;

            case 'video game':
                 // MODIFIED: Add screenshots.url and videos.video_id to the query
                const gameQuery = `
                    fields
                        name, summary, storyline, url,
                        first_release_date, total_rating,
                        genres.name, platforms.name, involved_companies.*, involved_companies.company.*,
                        cover.url, screenshots.url, videos.video_id;
                    where id = ${mediaId};
                    limit 1;`;
                apiResponseData = await fetchIgdbData('/games', gameQuery);

                if (apiResponseData?.failed || apiResponseData?.notFound) {
                    if(apiResponseData?.authFailed) return res.status(503).json({ message: apiResponseData.message });
                    const status = apiResponseData?.status || 404;
                    return res.status(status).json({ message: `Game details not found on IGDB (${status}).` });
                }

                // --- Basic Details (keep as before) ---
                combinedDetails.title = apiResponseData.name;
                combinedDetails.description = apiResponseData.summary || apiResponseData.storyline;
                combinedDetails.imageUrl = apiResponseData.cover?.url ? apiResponseData.cover.url.replace('t_thumb', 't_cover_big').replace(/^\/\//, 'https://') : null;
                combinedDetails.releaseDate = apiResponseData.first_release_date ? new Date(apiResponseData.first_release_date * 1000).toISOString().split('T')[0] : null;
                combinedDetails.releaseYear = getYear(combinedDetails.releaseDate);
                combinedDetails.apiRating = convertRatingTo10(apiResponseData.total_rating, 'igdb');
                combinedDetails.genres = apiResponseData.genres?.map(g => g.name) || [];
                combinedDetails.platforms = apiResponseData.platforms?.map(p => p.name) || [];
                combinedDetails.igdbLink = apiResponseData.url || null;
                // --- Involved Companies (keep as before) ---
                if (apiResponseData.involved_companies) {
                   apiResponseData.involved_companies.forEach(ic => {
                       if (ic.company?.name) {
                           if (ic.developer) combinedDetails.developers.push(ic.company.name);
                           if (ic.publisher) combinedDetails.publisher = combinedDetails.publisher || ic.company.name;
                       }
                   });
                   combinedDetails.developers = [...new Set(combinedDetails.developers)];
                }

                // --- NEW: Extract Banner Image (from screenshots) ---
                if (apiResponseData.screenshots?.length > 0) {
                    // Use the first screenshot as a banner
                    let bannerUrl = apiResponseData.screenshots[0].url;
                    if (bannerUrl) {
                        // Replace size with a larger one (e.g., 1080p or screenshot_huge)
                        bannerUrl = bannerUrl.replace('t_thumb', 't_1080p').replace(/^\/\//, 'https://');
                        combinedDetails.bannerImageUrl = bannerUrl;
                    }
                }

                // --- NEW: Extract Trailer Video ---
                if (apiResponseData.videos?.length > 0) {
                    // Use the first video ID found
                    combinedDetails.trailerVideoId = apiResponseData.videos[0].video_id;
                }
                break;

            default:
                return res.status(400).json({ message: 'Invalid media type specified.' });
        }

        res.status(200).json(combinedDetails);

    } catch (error) {
        console.error(`Error processing details for ${mediaType} ${mediaId}:`, error);
        res.status(500).json({ message: error.message || 'Server error while fetching detailed media information.' });
    }
});

module.exports = router;
// routes/viewRoutes.js
const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const { requireLogin, checkAuthStatus } = require('../auth');
const db = require('../database'); // Use the promisified db
const axios = require('axios'); // Needed to fetch data for server-side rendering

const router = express.Router();

// Middleware for user status on all view routes
router.use(checkAuthStatus);

// Helper to build API URL
const getApiUrl = (req) => `${req.protocol}://${req.get('host')}/api`;

// --- TMDB Setup ---
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

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

// Helper function to map TMDB movie data to our card structure
const mapTmdbToCardData = (item) => ({
    mediaId: item.id.toString(),
    mediaType: 'movie', // Explicitly set type
    title: item.title,
    imageUrl: item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : '/images/placeholder.png', // Card image size
    releaseYear: getYear(item.release_date),
});

// --- Public Routes ---

// Homepage
router.get('/', async (req, res, next) => {
    let watchlistItems = [];
    let initialHottest = []; // For the default tab (Movies)
    let initialRecommendations = []; // For the default tab (Movies)
    let homeError = null;
    const defaultTabType = 'movie'; // Set default tab

    // 1. Fetch User's Watchlist (Planned Items) if logged in
    if (res.locals.user) {
        try {
            const apiUrl = getApiUrl(req);
            // Fetch planned items, sorted by update time, limited
            const response = await axios.get(`${apiUrl}/library?userStatus=planned&sortBy=updatedAt&limit=12`, {
                headers: { Cookie: req.headers.cookie }
            });
            watchlistItems = response.data;
        } catch (error) {
            console.error("Homepage Watchlist Fetch Error:", error.response?.data || error.message);
            homeError = "Could not load your watchlist.";
        }
    }

    // 2. Fetch Initial Tab Data (Movies - Popular) from our API endpoint
    try {
        const apiUrl = getApiUrl(req);
        const response = await axios.get(`${apiUrl}/homepage-data?type=${defaultTabType}`, {
             headers: { Cookie: req.headers.cookie }
        });
        initialHottest = response.data.hottest || [];
        initialRecommendations = response.data.recommendations || [];
    } catch (error) {
        console.error(`Homepage Initial Tab (${defaultTabType}) Fetch Error:`, error.response?.data || error.message);
        const errorMsg = `Could not load initial ${defaultTabType} data.`;
        homeError = homeError ? `${homeError} ${errorMsg}` : errorMsg;
        // Keep empty arrays on error
        initialHottest = [];
        initialRecommendations = [];
    }


    // 3. Render the page
    try {
        res.render('home', {
            pageTitle: 'Home',
            // Pass only the initially loaded data
            initialTab: defaultTabType, // Inform template which tab is active
            hottest: initialHottest,
            recommendations: initialRecommendations,
            watchlist: watchlistItems, // User's actual watchlist ('planned' status)
            homeError: homeError, // Pass any accumulated errors
            // user is already in res.locals
        });
    } catch (renderError) {
         console.error("Homepage Render Error:", renderError);
         next(renderError);
    }
});


// About Page (Simple, unchanged)
router.get('/about', (req, res) => {
    res.render('about', { pageTitle: 'About Us' });
});

// Login/Register Page
router.get('/login', (req, res) => {
    if (res.locals.user) {
        return res.redirect('/'); // Redirect logged-in users to homepage
    }
    res.render('login', {
        layout: 'auth', // Use a simpler layout for auth pages potentially
        pageTitle: 'Login / Register'
     });
});


// --- Protected Routes ---

// Media Detail Page (New) - Keep as is
router.get('/media/:mediaType/:mediaId', requireLogin, async (req, res, next) => {
    const { mediaType, mediaId } = req.params;
    const userId = res.locals.user ? res.locals.user.id : null;
    const apiUrl = getApiUrl(req);

    try {
        // 1. Fetch External Details from our API
        const detailsResponse = await axios.get(`${apiUrl}/details/${mediaType}/${mediaId}`, {
             headers: { Cookie: req.headers.cookie } // Needed if details endpoint requires auth (it doesn't currently)
        });
        const mediaDetails = detailsResponse.data;

        // 2. Fetch User's Library/Interaction data for this item from our API
        let userInteraction = null;
        if (userId) { // Only try fetching if logged in
            try {
                 const interactionResponse = await axios.get(`${apiUrl}/library/item/${mediaType}/${mediaId}`, {
                     headers: { Cookie: req.headers.cookie } // Auth required here
                 });
                 userInteraction = interactionResponse.data;
            } catch (error) {
                if (error.response && error.response.status === 404) {
                    userInteraction = null; // Item not in library
                } else if (error.response && error.response.status === 401) {
                    // Should not happen, but handle defensively
                    console.warn('Auth error fetching interaction data despite checkAuthStatus.');
                    userInteraction = null;
                } else {
                    throw error;
                }
            }
        } // End if(userId)

        // 3. Combine data for the template
        const combinedData = {
            // --- Details needed for Adding ---
            mediaId: mediaDetails.mediaId, // Already here from API
            mediaType: mediaDetails.mediaType, // Already here from API
            title: mediaDetails.title, // Needed for add payload & display
            imageUrl: mediaDetails.imageUrl, // Needed for add payload
            releaseYear: mediaDetails.releaseYear, // Needed for add payload
            // --- Rest of details for display ---
            ...mediaDetails,
            // --- User interaction data ---
            userStatus: userInteraction?.userStatus,
            userRating: userInteraction?.userRating,
            userNotes: userInteraction?.userNotes,
            isFavorite: userInteraction?.isFavorite,
            libraryItemId: userInteraction?.id,
            isInLibrary: !!userInteraction
        };


        // 4. Placeholders for Related/Cast/Reviews
        const placeholderItems = Array(3).fill({
             title: "Placeholder",
             imageUrl: "/images/placeholder.png",
             mediaType: mediaType,
             mediaId: "0",
             releaseYear: new Date().getFullYear()
        });
        const placeholderPeople = Array(5).fill({
            name: "Person Name",
            imageUrl: "/images/placeholder_person.png" // Assuming a placeholder person image
        });

        res.render('mediaDetail', {
            pageTitle: mediaDetails.title || 'Media Details',
            item: combinedData,
            relatedMedia: placeholderItems, // Placeholder
            cast: placeholderPeople, // Placeholder
            reviews: [], // Placeholder
             // user is already in res.locals
        });

    } catch (error) {
        console.error(`Error fetching media details page (${mediaType}/${mediaId}):`, error.response?.data || error.message);
        if (error.response && error.response.status === 404) {
             return res.status(404).render('error', { pageTitle: 'Not Found', errorCode: 404, errorMessage: 'Media item not found.' });
        }
        next(error); // Pass to generic error handler
    }
});

// Search Results Page
router.get('/search', async (req, res, next) => {
    const query = req.query.q || '';
    const apiUrl = getApiUrl(req);

    if (!query) {
        return res.render('searchResults', {
             pageTitle: 'Search',
             query: '',
             results: {},
             user: res.locals.user
         });
    }

    try {
        // Fetch results
        const types = ['movie', 'series', 'book', 'video game'];
        const searchPromises = types.map(type =>
            axios.get(`${apiUrl}/search?type=${type}&query=${encodeURIComponent(query)}`, {
            }).then(response => ({ type, data: response.data }))
            .catch(err => {
                  console.error(`Search API error for type ${type}:`, err.response?.data || err.message);
                  return { type, data: [], error: true }; // Return empty on error for this type
              })
        );

        const searchResultsArray = await Promise.all(searchPromises);

        // Organize results by type
        const categorizedResults = {};
        searchResultsArray.forEach(result => {
            const key = result.type === 'video game' ? 'video game' : result.type;
            categorizedResults[key] = result.data;
        });

        res.render('searchResults', {
            pageTitle: `Search Results for "${query}"`,
            query: query,
            results: categorizedResults,
             // user is already in res.locals
        });

    } catch (error) {
        console.error(`Search page error for query "${query}":`, error);
        next(error);
    }
});


// User Profile Page
router.get('/profile', requireLogin, async (req, res, next) => { // Route for logged-in user's own profile
     await renderProfilePage(req, res, next, res.locals.user.id); // Call helper with logged-in user's ID
});
router.get('/profile/:username', requireLogin, async (req, res, next) => {
    try {
        // Find user ID by username (case-insensitive)
        const profileUser = await db.getAsync("SELECT id FROM users WHERE lower(username) = lower(?)", [req.params.username]);
        if (!profileUser) {
            return res.status(404).render('error', { pageTitle: 'Not Found', errorCode: 404, errorMessage: 'User profile not found.' });
        }
        await renderProfilePage(req, res, next, profileUser.id); // Call helper with found ID
    } catch (error) {
        next(error);
    }
});

async function renderProfilePage(req, res, next, profileUserId) {
    const loggedInUserId = res.locals.user.id;
    const isOwnProfile = profileUserId === loggedInUserId;
    const apiUrl = getApiUrl(req);
    const itemsPerList = 12; // How many items to show per default list

    try {
       // Fetch profile data (basic info + stats) - KEEP AS IS
       const profileResponse = await axios.get(`${apiUrl}/profile/${profileUserId}`, {
           headers: { Cookie: req.headers.cookie } // Auth needed
       });
       const profileData = profileResponse.data;

       const listFetchPromises = [
           axios.get(`${apiUrl}/library?userId=${profileUserId}&userStatus=completed&sortBy=completedAt&limit=${itemsPerList}`, { headers: { Cookie: req.headers.cookie } }).then(r => r.data).catch(e => { console.error("Profile Fetch Error (Completed):", e.message); return []; }),
           axios.get(`${apiUrl}/library?userId=${profileUserId}&userStatus=planned&sortBy=updatedAt&limit=${itemsPerList}`, { headers: { Cookie: req.headers.cookie } }).then(r => r.data).catch(e => { console.error("Profile Fetch Error (Planned):", e.message); return []; }),
           axios.get(`${apiUrl}/library?userId=${profileUserId}&userStatus=watching&sortBy=updatedAt&limit=${itemsPerList}`, { headers: { Cookie: req.headers.cookie } }).then(r => r.data).catch(e => { console.error("Profile Fetch Error (Watching):", e.message); return []; })
       ];

       const [recentlyCompletedItems, plannedItems, watchingItems] = await Promise.all(listFetchPromises);


        // Fetch 'Public Lists'
        let publicLists = [];
        if (profileData.profilePrivacy === 'public' || isOwnProfile) {
            const listsResponse = await axios.get(`${apiUrl}/lists?userId=${profileUserId}&publicOnly=${profileData.profilePrivacy !== 'public' && !isOwnProfile ? 'true' : 'false'}&limit=10`, { // API needs to support filtering
                headers: { Cookie: req.headers.cookie }
            });
            publicLists = listsResponse.data; // Assuming API returns list summaries
        }


       res.render('userProfile', {
           pageTitle: `${profileData.username}'s Profile`,
           profile: profileData,
           isOwnProfile: isOwnProfile,
           recentlyCompletedItems: recentlyCompletedItems,
           plannedItems: plannedItems,
           watchingItems: watchingItems,
           publicLists: publicLists,
            // user (logged in user) is already in res.locals
       });

    } catch(error) {
       console.error(`Error rendering profile page for user ${profileUserId}:`, error.response?.data || error.message);
       if (error.response?.status === 404) { // Handle profile data 404 specifically
           return res.status(404).render('error', { pageTitle: 'Not Found', errorCode: 404, errorMessage: 'User profile data not found.' });
       }
       // Don't pass generic 404/403 from list fetches here, handle above with default empty arrays
       next(error);
    }
}

// User Lists Overview Page
router.get('/lists', requireLogin, async (req, res, next) => {
    const userId = req.locals.user.id;
    const apiUrl = getApiUrl(req);
    // Optional filtering via query params (e.g., ?filter=personal) could be added later
    // const filter = req.query.filter || 'all';

    try {
        // Fetch all lists belonging to the user
        const response = await axios.get(`${apiUrl}/lists?userId=${userId}`, { // Assuming API defaults to user's lists
            headers: { Cookie: req.headers.cookie } // Auth required
        });
        const userLists = response.data; // Expecting an array of list summaries

        res.render('userListsOverview', {
            pageTitle: 'My Lists',
            lists: userLists,
             // user is already in res.locals
        });

    } catch (error) {
        console.error(`Error fetching lists overview for user ${userId}:`, error.response?.data || error.message);
        next(error);
    }
});

// List Detail Page
router.get('/lists/:listId', requireLogin, async (req, res, next) => {
    const listId = req.params.listId;
    const userId = res.locals.user.id;
    const apiUrl = getApiUrl(req);

    try {
        // Fetch list details (including items)
        const response = await axios.get(`${apiUrl}/lists/${listId}`, {
            headers: { Cookie: req.headers.cookie } // Auth required
        });
        const listData = response.data; // Expecting list details and items array

        // Check if the logged-in user owns the list (for edit controls etc.)
        const isOwner = listData.userId === userId;

        // Permission check (simple): Allow access only if owner or list is public
        if (!isOwner && !listData.isPublic) {
             return res.status(403).render('error', { pageTitle: 'Forbidden', errorCode: 403, errorMessage: 'You do not have permission to view this list.' });
        }

        res.render('listDetail', {
            pageTitle: listData.title || 'List Details',
            list: listData,
            isOwner: isOwner,
             // user is already in res.locals
        });

    } catch (error) {
        console.error(`Error fetching list detail page (ID: ${listId}):`, error.response?.data || error.message);
         if (error.response?.status === 404) {
             return res.status(404).render('error', { pageTitle: 'Not Found', errorCode: 404, errorMessage: 'List not found.' });
        }
         if (error.response?.status === 403) {
             return res.status(403).render('error', { pageTitle: 'Forbidden', errorCode: 403, errorMessage: 'You do not have permission to view this list.' });
        }
        next(error);
    }
});


// --- Route for Client-Side Handlebars Partials ---
const ALLOWED_PARTIALS = new Set([
    'mediaCard',
    'itemFormModal',
    'userInteractionControls',
    'listSummaryRow',
    'listItemRow',
    'loginForm',
    'registerForm',
]);
const partialsDir = path.join(__dirname, '../views/partials');

router.get('/templates/:templateName', async (req, res) => {
    const templateName = req.params.templateName;

    if (!ALLOWED_PARTIALS.has(templateName)) {
        console.warn(`Template request blocked: ${templateName}`);
        return res.status(404).send('Template not found or not allowed.');
    }
    const filePath = path.join(partialsDir, `${templateName}.hbs`);
    try {
        await fs.access(filePath);
        res.type('text/html');
        res.sendFile(filePath);
    } catch (error) {
        if (error.code === 'ENOENT') {
             console.error(`Template file not found: ${filePath}`);
             res.status(404).send('Template not found.');
        } else {
            console.error(`Error serving template ${templateName}:`, error);
            res.status(500).send('Error serving template.');
        }
    }
});

module.exports = router;
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

// --- Public Routes ---

// Homepage (Refactored)
router.get('/', async (req, res, next) => {
    try {
        let watchlistItems = [];
        if (res.locals.user) {
            const apiUrl = getApiUrl(req);
            // Fetch items with status 'planned' for the watchlist
            const response = await axios.get(`${apiUrl}/library?userStatus=planned`, {
                headers: { Cookie: req.headers.cookie } // Forward cookie for auth
            });
            watchlistItems = response.data;
        }
        // Placeholder data for Hottest/Recommendations
        const placeholderItems = Array(5).fill({
             title: "Placeholder",
             imageUrl: "/images/placeholder.png",
             mediaType: "movie",
             mediaId: "0",
             releaseYear: new Date().getFullYear()
        });

        res.render('home', {
            pageTitle: 'Home',
            hottest: placeholderItems, // Placeholder
            watchlist: watchlistItems, // User's actual watchlist ('planned' status)
            recommendations: placeholderItems, // Placeholder
            // user is already in res.locals
        });
    } catch (error) {
        console.error("Homepage Error:", error.response?.data || error.message);
        // Don't fail the whole page if watchlist fetch fails, show empty
         res.render('home', {
            pageTitle: 'Home',
            hottest: Array(5).fill({ title: "Placeholder", imageUrl: "/images/placeholder.png", mediaType: "movie", mediaId: "0", releaseYear: new Date().getFullYear()}),
            watchlist: [], // Empty watchlist on error
            recommendations: Array(5).fill({ title: "Placeholder", imageUrl: "/images/placeholder.png", mediaType: "movie", mediaId: "0", releaseYear: new Date().getFullYear()}),
            homeError: "Could not load your watchlist."
        });
        // Or pass to generic error handler: next(error);
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

// Media Detail Page (New)
router.get('/media/:mediaType/:mediaId', requireLogin, async (req, res, next) => {
    const { mediaType, mediaId } = req.params;
    const userId = res.locals.user.id;
    const apiUrl = getApiUrl(req);

    try {
        // 1. Fetch External Details from our API
        const detailsResponse = await axios.get(`${apiUrl}/details/${mediaType}/${mediaId}`, {
             headers: { Cookie: req.headers.cookie } // Needed if details endpoint requires auth (it doesn't currently)
        });
        const mediaDetails = detailsResponse.data;

        // 2. Fetch User's Library/Interaction data for this item from our API
        let userInteraction = null;
        try {
             const interactionResponse = await axios.get(`${apiUrl}/library/item/${mediaType}/${mediaId}`, {
                 headers: { Cookie: req.headers.cookie } // Auth required here
             });
             userInteraction = interactionResponse.data;
        } catch (error) {
            if (error.response && error.response.status === 404) {
                // Item not in library, this is fine.
                userInteraction = null;
            } else {
                // Rethrow other errors
                throw error;
            }
        }

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

// Search Results Page (New)
router.get('/search', requireLogin, async (req, res, next) => {
    const query = req.query.q || '';
    const apiUrl = getApiUrl(req);

    if (!query) {
        // Render search page without results if no query
        return res.render('searchResults', {
             pageTitle: 'Search',
             query: '',
             results: {}, // Empty results object
             // user is already in res.locals
         });
    }

    try {
        // Fetch results for all categories concurrently
        const types = ['movie', 'series', 'book', 'video game'];
        const searchPromises = types.map(type =>
            axios.get(`${apiUrl}/search?type=${type}&query=${encodeURIComponent(query)}`, {
                 headers: { Cookie: req.headers.cookie } // Forward cookie
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
            categorizedResults[result.type] = result.data;
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

// User Profile Page (New - Basic Implementation)
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

// Helper function to render profile page (to avoid code duplication)
async function renderProfilePage(req, res, next, profileUserId) {
     const loggedInUserId = res.locals.user.id;
     const isOwnProfile = profileUserId === loggedInUserId;
     const apiUrl = getApiUrl(req);

     try {
        // Fetch profile data (basic info + stats)
        const profileResponse = await axios.get(`${apiUrl}/profile/${profileUserId}`, {
            headers: { Cookie: req.headers.cookie } // Auth needed
        });
        const profileData = profileResponse.data;

        // Fetch 'Last Seen' (e.g., recently completed items) - Limit to 5-10
        const lastSeenResponse = await axios.get(`${apiUrl}/library?userId=${profileUserId}&userStatus=completed&sortBy=completedAt&limit=10`, { // Assuming API supports userId and sorting/limit
            headers: { Cookie: req.headers.cookie }
        });
        const lastSeenItems = lastSeenResponse.data;

         // Fetch 'Favorites' - Limit to 5-10
        const favoritesResponse = await axios.get(`${apiUrl}/library?userId=${profileUserId}&isFavorite=true&limit=10`, { // Assuming API supports userId and filtering
            headers: { Cookie: req.headers.cookie }
        });
        const favoriteItems = favoritesResponse.data;

         // Fetch 'Public Lists' - Limit to 5-10
         // Only fetch if profile is public OR it's the user's own profile
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
            lastSeen: lastSeenItems,
            favorites: favoriteItems,
            publicLists: publicLists,
             // user (logged in user) is already in res.locals
        });

     } catch(error) {
        console.error(`Error rendering profile page for user ${profileUserId}:`, error.response?.data || error.message);
        if (error.response?.status === 404) {
            return res.status(404).render('error', { pageTitle: 'Not Found', errorCode: 404, errorMessage: 'User profile data not found.' });
        }
        next(error);
     }
}


// User Lists Overview Page (New)
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

// List Detail Page (New)
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
// Keep this, but update allowed partials
const ALLOWED_PARTIALS = new Set([
    'mediaCard', // Keep
    'itemFormModal', // Keep for add/edit actions
    'mediaDetailUserInteraction', // New partial for interaction controls on detail page?
    'listSummaryRow', // New
    'listItemRow', // New
    // Add others as needed
]);
const partialsDir = path.join(__dirname, '../views/partials');

router.get('/templates/:templateName', requireLogin, async (req, res) => {
    const templateName = req.params.templateName;

    if (!ALLOWED_PARTIALS.has(templateName)) {
        return res.status(404).send('Template not found or not allowed.');
    }
    const filePath = path.join(partialsDir, `${templateName}.hbs`);
    try {
        await fs.access(filePath);
        res.type('text/html'); // Or 'text/x-handlebars-template'
        res.sendFile(filePath);
    } catch (error) {
        console.error(`Error serving template ${templateName}:`, error);
        res.status(404).send('Template not found.');
    }
});

module.exports = router;
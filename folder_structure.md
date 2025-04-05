# Folder Architecture for `C:\Users\benjamin\Documents\igr\MediaTracker`

## Folder Structure

- MediaTracker/
    - .env
    - .gitignore
    - auth.js
    - database.js
    - folder_structure.md
    - package-lock.json
    - package.json
    - server.js
    - server.md
    - test.md
    - useless.py
    - watchlist_v2.db
    - public/
        - css/
            - style.css
            - base/
                - _base.css
                - _reset.css
                - _variables.css
            - components/
                - _buttons.css
                - _card.css
                - _forms.css
                - _listRow.css
                - _modal.css
                - _navigation.css
                - _spinner.css
                - _swiper.css
                - _tags.css
                - _userInteraction.css
            - layout/
                - _container.css
                - _footer.css
                - _grid.css
                - _header.css
            - pages/
                - _auth.css
                - _home.css
                - _library.css
                - _lists.css
                - _mediaDetail.css
                - _searchResults.css
                - _userProfile.css
            - utils/
                - _helpers.css
        - images/
            - placeholder.png
            - placeholder_avatar.png
        - js/
            - main.js
    - routes/
        - viewRoutes.js
        - api/
            - authRoutes.js
            - detailsRoutes.js
            - igdbAuthHelper.js
            - libraryRoutes.js
            - listRoutes.js
            - profileRoutes.js
            - searchRoutes.js
    - views/
        - about.hbs
        - error.hbs
        - home.hbs
        - listDetail.hbs
        - login.hbs
        - mediaDetail.hbs
        - searchResults.hbs
        - userListsOverview.hbs
        - userProfile.hbs
        - layouts/
            - auth.hbs
            - main.hbs
        - partials/
            - footer.hbs
            - header.hbs
            - itemFormModal.hbs
            - libraryControls.hbs
            - listItemRow.hbs
            - listSummaryRow.hbs
            - loginForm.hbs
            - mediaCard.hbs
            - registerForm.hbs
            - userInteractionControls.hbs

## Code Files

### auth.js

```js
// auth.js
// No changes required based on the new design for non-social features.
// Keep the existing file content.
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;
const SALT_ROUNDS = 10;
const COOKIE_NAME = 'authToken';

if (!JWT_SECRET) {
    console.error("FATAL ERROR: JWT_SECRET is not defined in .env file.");
    process.exit(1);
}

async function hashPassword(password) {
    return await bcrypt.hash(password, SALT_ROUNDS);
}

async function comparePassword(password, hash) {
    // Add check for null/undefined hash to prevent bcrypt errors
    if (!hash) return false;
    return await bcrypt.compare(password, hash);
}

function generateToken(user) {
    // Ensure user and user.id exist
    if (!user || !user.id) {
        throw new Error('Cannot generate token without valid user object (id, username)');
    }
    const payload = { id: user.id, username: user.username };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '1d' });
}

function setAuthCookie(res, user) {
    try {
        const token = generateToken(user);
        res.cookie(COOKIE_NAME, token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 24 * 60 * 60 * 1000, // 1 day
            sameSite: 'lax'
        });
    } catch (error) {
        console.error('Error setting auth cookie:', error);
        // Handle the error appropriately, maybe send an error response earlier
    }
}

function clearAuthCookie(res) {
    res.clearCookie(COOKIE_NAME, {
         httpOnly: true,
         secure: process.env.NODE_ENV === 'production',
         sameSite: 'lax'
     });
}

// --- Middleware ---

// Verify Token for API routes (Checks cookie)
function verifyToken(req, res, next) {
    const token = req.cookies[COOKIE_NAME];

    if (!token) {
        return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.id; // Add user ID for API route handlers
        req.user = decoded; // Optional: Add full decoded payload (username, id)
        next();
    } catch (error) {
        clearAuthCookie(res); // Clear invalid/expired cookie
        let status = 401;
        let message = 'Invalid token.';
        if (error.name === 'TokenExpiredError') {
            message = 'Token expired. Please login again.';
        } else if (error.name === 'JsonWebTokenError') {
            message = 'Token signature is invalid.';
        }
         console.log('Token verification failed:', error.name);
        return res.status(status).json({ message });
    }
}

// Check Auth Status for View routes (Adds user to res.locals)
function checkAuthStatus(req, res, next) {
    const token = req.cookies[COOKIE_NAME];
    res.locals.user = null; // Default: not logged in

    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            // Make user info available to Handlebars templates
            res.locals.user = { id: decoded.id, username: decoded.username };
        } catch (error) {
            // Invalid or expired token - clear cookie but don't block view rendering
            console.log('Auth status check failed (clearing cookie):', error.name);
            clearAuthCookie(res);
        }
    }
    next();
}

// Protect View Route Middleware (Redirects if not logged in)
function requireLogin(req, res, next) {
    if (!res.locals.user) {
        // Optional: Store intended URL using session middleware if needed
        // req.session.returnTo = req.originalUrl;
        return res.redirect('/login'); // Redirect to new login page route
    }
    next(); // User is logged in
}

module.exports = {
    hashPassword,
    comparePassword,
    setAuthCookie,
    clearAuthCookie,
    verifyToken,
    checkAuthStatus,
    requireLogin
};
```

### database.js

```js
// database.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const util = require('util'); // Import the util module

// Define the path to the database file
const dbPath = path.resolve(__dirname, 'watchlist_v2.db'); // New DB file name

// Create or open the database
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('FATAL: Error opening database:', err.message);
        process.exit(1); // Exit if DB can't be opened
    } else {
        console.log('Connected to the SQLite database (v2).');
        initializeDatabaseV2(); // Call the updated init function
    }
});

// --- Promise Wrappers (Keep existing wrappers: getAsync, allAsync, runAsync) ---
db.getAsync = util.promisify(db.get).bind(db);
db.allAsync = util.promisify(db.all).bind(db);
db.runAsync = function(sql, params = []) {
    return new Promise((resolve, reject) => {
        this.run(sql, params, function(err) {
            if (err) {
                console.error('DB Run Error:', err.message, 'SQL:', sql);
                // Handle specific errors like UNIQUE constraint
                if (err.message.includes('UNIQUE constraint failed')) {
                    return reject(new Error('UNIQUE constraint failed. Item might already exist.'));
                }
                 if (err.message.includes('FOREIGN KEY constraint failed')) {
                    return reject(new Error('FOREIGN KEY constraint failed. Related record not found.'));
                }
                reject(err);
            } else {
                resolve({ lastID: this.lastID, changes: this.changes });
            }
        });
    });
}.bind(db);


// Function to initialize the NEW database schema
function initializeDatabaseV2() {
    db.serialize(() => {
        try {
            console.log("Initializing Database Schema V2...");

            // 1. Users Table (Remains the same)
            db.run(`
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    passwordHash TEXT NOT NULL,
                    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    -- Profile fields (can be expanded later)
                    profileImageUrl TEXT,
                    profilePrivacy TEXT DEFAULT 'private' CHECK(profilePrivacy IN ('public', 'private'))
                )
            `);
            console.log('- Users table checked/created.');

            // 2. Library Items Table (Updated based on UserMediaInteraction)
            db.run(`DROP TABLE IF EXISTS library_items;`); // Drop old table for clean setup
            db.run(`
                CREATE TABLE IF NOT EXISTS library_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    userId INTEGER NOT NULL,
                    mediaType TEXT NOT NULL CHECK(mediaType IN ('movie', 'series', 'book', 'video game')),
                    mediaId TEXT NOT NULL, -- ID from external API (TMDB, Google Books, IGDB)

                    -- Core details stored at time of adding (can be updated if needed)
                    title TEXT NOT NULL,
                    imageUrl TEXT,
                    releaseYear INTEGER, -- Store just the year for consistency

                    -- User-specific interaction data
                    userStatus TEXT NOT NULL DEFAULT 'planned' CHECK(userStatus IN ('planned', 'watching', 'completed', 'paused', 'dropped')), -- Changed statuses
                    userRating INTEGER CHECK(userRating IS NULL OR (userRating >= 1 AND userRating <= 10)), -- Changed rating scale (e.g., 1-10 stars)
                    userNotes TEXT, -- Renamed from userDescription
                    isFavorite BOOLEAN DEFAULT 0, -- Favorite flag

                    -- Timestamps
                    addedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    completedAt DATETIME, -- Timestamp when marked as completed

                    FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE,
                    UNIQUE(userId, mediaType, mediaId) -- Prevent adding the same item multiple times per user
                )
            `);
            console.log('- Library Items table created.');

            // Index for faster library lookups
            db.run(`CREATE INDEX IF NOT EXISTS idx_library_user_status ON library_items (userId, userStatus);`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_library_user_favorite ON library_items (userId, isFavorite);`);
            console.log('- Library Items indexes created.');


            // 3. User Lists Table
            db.run(`
                CREATE TABLE IF NOT EXISTS user_lists (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    userId INTEGER NOT NULL,
                    title TEXT NOT NULL,
                    description TEXT,
                    coverImageUrl TEXT,
                    isPublic BOOLEAN DEFAULT 0,
                    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,

                    FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE
                )
            `);
            console.log('- User Lists table created.');

            // 4. User List Items Table
            db.run(`
                CREATE TABLE IF NOT EXISTS user_list_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    listId INTEGER NOT NULL,
                    libraryItemId INTEGER NOT NULL, -- Link to the entry in the user's library
                    userComment TEXT, -- Comment specific to this item *in this list*
                    -- progressStatus TEXT, -- Removed, progress tracked on library_item
                    -- userRatingInList INTEGER, -- Removed, rating tracked on library_item
                    dateAdded DATETIME DEFAULT CURRENT_TIMESTAMP,

                    FOREIGN KEY (listId) REFERENCES user_lists (id) ON DELETE CASCADE,
                    FOREIGN KEY (libraryItemId) REFERENCES library_items (id) ON DELETE CASCADE,
                    UNIQUE(listId, libraryItemId) -- Prevent adding same library item multiple times to the same list
                )
            `);
            console.log('- User List Items table created.');


            // --- Triggers for updatedAt ---
            // Drop old trigger if exists
            db.run(`DROP TRIGGER IF EXISTS update_library_item_timestamp;`);
            // Library Items Trigger
            db.run(`
                CREATE TRIGGER update_library_item_timestamp
                AFTER UPDATE ON library_items
                FOR EACH ROW
                BEGIN
                    UPDATE library_items SET updatedAt = CURRENT_TIMESTAMP WHERE id = OLD.id;
                END;
            `);
             // User Lists Trigger
             db.run(`DROP TRIGGER IF EXISTS update_user_list_timestamp;`);
             db.run(`
                CREATE TRIGGER update_user_list_timestamp
                AFTER UPDATE ON user_lists
                FOR EACH ROW
                BEGIN
                    UPDATE user_lists SET updatedAt = CURRENT_TIMESTAMP WHERE id = OLD.id;
                END;
            `);
            console.log('- Timestamp triggers created/checked.');

            console.log("Database Schema V2 Initialization Complete.");

        } catch (err) {
             console.error('FATAL: Error during database V2 initialization:', err.message);
             process.exit(1); // Exit if schema setup fails
        }
    });
}

// Export the db object with the added Async methods
module.exports = db; // dbUtils is no longer needed as promises are added directly
```

### package.json

```json
{
  "name": "watchlist-backend",
  "version": "1.0.0",
  "description": "Backend for the Watchlist & Media Library App",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "keywords": [
    "watchlist",
    "media",
    "library",
    "node",
    "express",
    "sqlite"
  ],
  "author": "",
  "license": "ISC",
  "dependencies": {
    "axios": "^1.6.8",
    "bcrypt": "^5.1.1",
    "cookie-parser": "^1.4.6",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "express-handlebars": "^7.1.2",
    "jsonwebtoken": "^9.0.2",
    "sqlite3": "^5.1.7"
  },
  "devDependencies": {
    "nodemon": "^3.1.0"
  }
}
```

### server.js

```js
// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const { engine } = require('express-handlebars');

const db = require('./database'); // Ensures DB init runs (now using V2 schema)
const { checkAuthStatus } = require('./auth'); // Middleware for view user status

// Route Imports
const viewRoutes = require('./routes/viewRoutes');
const authApiRoutes = require('./routes/api/authRoutes');
const searchApiRoutes = require('./routes/api/searchRoutes');
const detailsApiRoutes = require('./routes/api/detailsRoutes');
const libraryApiRoutes = require('./routes/api/libraryRoutes');
const profileApiRoutes = require('./routes/api/profileRoutes'); // New
const listApiRoutes = require('./routes/api/listRoutes'); // New

const app = express();
const PORT = process.env.PORT || 3001;

// --- Handlebars Engine Setup ---
app.engine('hbs', engine({
    extname: '.hbs',
    defaultLayout: 'main',
    layoutsDir: path.join(__dirname, 'views/layouts'),
    partialsDir: path.join(__dirname, 'views/partials'),
    helpers: {
        eq: (v1, v2) => v1 === v2,
        json: (context) => JSON.stringify(context),
        currentYear: () => new Date().getFullYear(),
        capitalize: (str) => (typeof str === 'string' && str.length > 0) ? str.charAt(0).toUpperCase() + str.slice(1) : str,
        formatYear: (dateValue) => { // Handle number or string date
            if (!dateValue) return '';
            if (typeof dateValue === 'number') return dateValue.toString(); // Assume it's already a year
            try {
                return new Date(dateValue).getFullYear();
            } catch {
                return dateValue; // Return original if not parsable
            }
        },
        formatDate: (dateString) => dateString ? new Date(dateString).toLocaleDateString() : '',
        classify: (str) => typeof str === 'string' ? str.replace(/\s+/g, '-').toLowerCase() : '',
        defaultIfEmpty: (value, defaultValue) => value || defaultValue || '',
        join: (arr, separator) => Array.isArray(arr) ? arr.join(separator) : '',
        truncate: (str, len) => (str && str.length > len) ? str.substring(0, len) + '...' : str,
        // New helper for card outline based on status
        statusOutlineClass: (status) => {
            switch (status?.toLowerCase()) {
                case 'completed': return 'outline-green';
                case 'watching': case 'reading': case 'playing': return 'outline-blue'; // Map 'watching' etc. to blue
                case 'planned': return 'outline-red';
                case 'paused': return 'outline-yellow'; // Optional: Add color for paused/dropped
                case 'dropped': return 'outline-grey';
                default: return '';
            }
        },
        // Helper for star rating display (can be enhanced)
        renderStars: (rating, maxRating = 10) => {
            let starsHtml = '';
            const filledStars = Math.round(rating); // Simple rounding for now
            for (let i = 1; i <= maxRating; i++) {
                starsHtml += `<span class="star ${i <= filledStars ? 'filled' : ''}">★</span>`;
            }
            return starsHtml;
        },
        // Helper to check if user owns the profile/list (for showing edit buttons etc)
        isOwner: (resourceOwnerId, loggedInUserId) => resourceOwnerId === loggedInUserId,

        list: function() {
            // Handlebars passes all arguments, including its own options object at the end.
            // We slice off the options object to get only the actual arguments passed in the template.
            return Array.prototype.slice.call(arguments, 0, -1);
        },

        concat: function() {
            // Convert arguments (excluding the Handlebars options object) to strings and join them
            return Array.prototype.slice.call(arguments, 0, -1).join('');
        },
        or: function() {
            // Get all arguments except the Handlebars options object
            const args = Array.prototype.slice.call(arguments, 0, -1);
            // Return true if any argument is truthy
            for (let i = 0; i < args.length; i++) {
                if (args[i]) { // Check if the argument is truthy (e.g., non-zero length)
                    return true;
                }
            }
            // If loop finishes, none were truthy
            return false;
        }
    }
}));
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

// --- Core Middleware ---
app.use(cors({
    origin: `http://localhost:${PORT}`,
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// --- Routes ---
app.use(checkAuthStatus); // Make user available to all templates

app.use('/', viewRoutes); // View routes handle HTML pages
app.use('/api/auth', authApiRoutes);
app.use('/api/search', searchApiRoutes);
app.use('/api/details', detailsApiRoutes);
app.use('/api/library', libraryApiRoutes);
app.use('/api/profile', profileApiRoutes); // New
app.use('/api/lists', listApiRoutes); // New

// --- Error Handling (Keep existing handlers) ---

// API 404 Handler
app.use('/api/*', (req, res) => {
    res.status(404).json({ message: 'API endpoint not found.' });
});

// General 404 Handler
app.use((req, res) => {
     res.status(404).render('error', {
        layout: 'main',
        pageTitle: 'Not Found',
        errorCode: 404,
        errorMessage: 'Sorry, the page you are looking for does not exist.',
     });
});

// Final Error Handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error("Unhandled Error:", err);
    const status = err.status || 500;
    const message = err.message || 'An unexpected server error occurred.';

    if (req.originalUrl.startsWith('/api/')) {
         res.status(status).json({ message: message });
    } else {
        const displayMessage = (process.env.NODE_ENV === 'production' && status === 500)
            ? 'An internal server error occurred.'
            : message;
        res.status(status).render('error', {
            layout: 'main',
            pageTitle: 'Error',
            errorCode: status,
            errorMessage: displayMessage,
        });
    }
});

// --- Start Server ---
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

// Graceful shutdown (Keep existing handler)
process.on('SIGINT', () => {
  console.log('\nSIGINT received: Closing server and database connection...');
  // Use the promisified db methods for closing if available, otherwise use callback
  if (db.closeAsync) {
      db.closeAsync()
        .then(() => {
            console.log('Database connection closed.');
            process.exit(0);
        })
        .catch(err => {
            console.error('Error closing database:', err.message);
            process.exit(1);
        });
  } else {
      db.close((err) => {
        if (err) {
          console.error('Error closing database:', err.message);
          process.exit(1);
        } else {
          console.log('Database connection closed.');
          process.exit(0);
        }
      });
  }
});
```

### style.css

```css
/* --- Main Stylesheet --- */

/* 1. Base Styles */
@import url('base/_variables.css');
@import url('base/_reset.css');
@import url('base/_base.css');

/* 2. Layout Styles */
@import url('layout/_container.css');
@import url('layout/_header.css');
@import url('layout/_footer.css');
/* @import url('layout/_grid.css'); /* If general grid styles are needed */

/* 3. Component Styles */
@import url('components/_buttons.css');
@import url('components/_card.css');      /* Media card, List card */
@import url('components/_forms.css');
@import url('components/_modal.css');
@import url('components/_navigation.css'); /* Horizontal Nav */
@import url('components/_spinner.css');
@import url('components/_tags.css');
@import url('components/_swiper.css');    /* Swiper carousel styles */
@import url('components/_userInteraction.css'); /* Detail page controls */
@import url('components/_listRow.css');   /* List summary and item rows */

/* 4. Page-Specific Styles */
@import url('pages/_home.css');
@import url('pages/_auth.css');
@import url('pages/_mediaDetail.css');
@import url('pages/_searchResults.css');
@import url('pages/_userProfile.css');
@import url('pages/_lists.css');          /* Covers overview and detail */

/* 5. Utility Styles */
@import url('utils/_helpers.css');

/* Add any final overrides or theme adjustments here */

```

### _base.css

```css
/* public/css/base/_base.css */
body {
    font-family: var(--font-family-base);
    font-size: var(--font-size-base);
    color: var(--color-text-base);
    background-color: var(--color-bg-body);
    line-height: 1.6;
}

/* Prevent background scroll when modal is open */
body.modal-open {
    overflow: hidden;
}

a {
    color: var(--color-text-link);
    transition: var(--transition-fast);
}

a:hover {
    color: var(--color-primary-dark);
    text-decoration: underline;
}

h1, h2, h3, h4, h5, h6 {
    margin-bottom: var(--space-md);
    font-weight: var(--font-weight-bold);
    color: var(--color-text-heading);
    line-height: 1.3;
}

h1 { font-size: var(--font-size-h1); }
h2 { font-size: var(--font-size-h2); margin-bottom: var(--space-lg); } /* More space below h2 */
h3 { font-size: var(--font-size-h3); }
h4 { font-size: var(--font-size-xl); }

p {
    margin-bottom: var(--space-md);
    color: var(--color-text-light);
}

/* Main content area */
main.container {
    padding-top: var(--space-lg); /* Space below header */
    padding-bottom: var(--space-xl);
    min-height: calc(100vh - 150px); /* Adjust based on header/footer height */
}

/* General card style */
.card {
    background-color: var(--color-bg-card);
    border-radius: var(--border-radius-md);
    box-shadow: var(--shadow-sm);
    padding: var(--space-lg);
    margin-bottom: var(--space-lg);
    border: var(--border-width) solid var(--color-border);
}

/* Status/feedback messages */
.status-message,
.error-message, /* Keep for general errors */
.success-message { /* Keep for general success */
    padding: var(--space-sm) var(--space-md);
    margin-bottom: var(--space-md);
    border-radius: var(--border-radius-sm);
    font-size: var(--font-size-sm);
    border: var(--border-width) solid transparent;
}
.status-message.hidden { display: none; }

.status-message.error, .error-message {
    color: var(--color-danger-dark);
    background-color: #feefee; /* Light red */
    border-color: var(--color-danger);
}
.status-message.success, .success-message {
    color: var(--color-success-dark);
    background-color: #effcf6; /* Light green */
    border-color: var(--color-success);
}
.status-message.info {
    color: var(--color-primary-dark);
    background-color: #eff6ff; /* Light blue */
    border-color: var(--color-primary);
}
.status-message.warning {
    color: var(--color-warning-dark);
    background-color: #fffbeb; /* Light yellow */
    border-color: var(--color-warning);
}

/* Global status message (fixed potentially) */
#globalStatus {
    position: fixed;
    bottom: var(--space-md);
    left: 50%;
    transform: translateX(-50%);
    z-index: 2000;
    min-width: 250px;
    text-align: center;
    box-shadow: var(--shadow-lg);
}

/* Placeholder text style */
.placeholder-text {
    text-align: center;
    color: var(--color-text-lighter);
    font-style: italic;
    padding: var(--space-xl) var(--space-md);
}
.placeholder-text.no-results {
    font-style: normal;
    font-weight: var(--font-weight-medium);
}
```

### _reset.css

```css
/* public/css/base/_reset.css */
/* Keep the existing simple reset */
*,
*::before,
*::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
}

html {
    line-height: 1.5;
    -webkit-text-size-adjust: 100%;
    tab-size: 4;
    font-family: var(--font-family-base);
}

body {
    min-height: 100vh;
    line-height: 1.6; /* Slightly more line height */
}

img, picture, video, canvas, svg {
    display: block;
    max-width: 100%;
    height: auto; /* Maintain aspect ratio by default */
}

input, button, textarea, select {
    font: inherit;
}

button {
    cursor: pointer;
    background: none;
    border: none;
    color: inherit;
    padding: 0; /* Remove default padding */
}

ol, ul {
    list-style: none;
}

a {
    text-decoration: none;
    color: inherit;
}

h1, h2, h3, h4, h5, h6 {
    text-wrap: balance;
}

p {
   text-wrap: pretty;
}

/* Accessibility improvements */
@media (prefers-reduced-motion: reduce) {
  html:focus-within { scroll-behavior: auto; }
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

### _variables.css

```css
/* public/css/base/_variables.css */
:root {
    /* --- Colors --- */
    /* Primary & Accents */
    --color-primary: #4a90e2; /* Updated Blue */
    --color-primary-dark: #357ABD;
    --color-accent: #f5a623; /* Orange/Gold Accent */
    --color-accent-dark: #d48e1f;

    /* Status & Feedback */
    --color-danger: #e53e3e; /* Red */
    --color-danger-dark: #c53030;
    --color-warning: #ecc94b; /* Yellow */
    --color-warning-dark: #d69e2e;
    --color-success: #48bb78; /* Green */
    --color-success-dark: #38a169;
    --color-info: #4a90e2; /* Blue for informational messages */

    /* Text */
    --color-text-base: #333333; /* Darker Grey for better contrast */
    --color-text-light: #555555;
    --color-text-lighter: #777777;
    --color-text-inverse: #ffffff;
    --color-text-link: var(--color-primary);
    --color-text-heading: #1a202c; /* Slightly darker for headings */

    /* Backgrounds */
    --color-bg-body: #f8f9fa; /* Very Light Grey/Off-white */
    --color-bg-card: #ffffff; /* White for cards */
    --color-bg-header: #ffffff;
    --color-bg-header-border: #e2e8f0;
    --color-bg-modal-overlay: rgba(0, 0, 0, 0.65);
    --color-bg-input: #ffffff;
    --color-bg-input-focus: #ffffff;
    --color-bg-button-secondary: #e2e8f0;
    --color-bg-button-secondary-hover: #cbd5e0;

    /* Borders */
    --color-border: #e2e8f0; /* Light Gray */
    --color-border-input: #cbd5e0;
    --color-border-input-focus: var(--color-primary);
    --color-divider: var(--color-border);

    /* Status Outlines / Indicators */
    --color-status-completed: #48bb78; /* Green */
    --color-status-watching: #4a90e2;  /* Blue */
    --color-status-planned: #f56565;   /* Red */
    --color-status-paused: #ecc94b;    /* Yellow */
    --color-status-dropped: #a0aec0;   /* Grey */

    /* Star Rating */
    --color-star-filled: #f5a623; /* Gold */
    --color-star-empty: #d1d5db; /* Light Grey */

    /* --- Fonts --- */
    --font-family-base: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
    --font-family-heading: var(--font-family-base); /* Same as base for simplicity */
    --font-size-base: 1rem; /* Approx 16px */
    --font-size-sm: 0.875rem; /* 14px */
    --font-size-xs: 0.75rem;  /* 12px */
    --font-size-lg: 1.125rem; /* 18px */
    --font-size-xl: 1.25rem; /* 20px */
    --font-size-h1: 2rem;    /* 32px */
    --font-size-h2: 1.5rem;  /* 24px */
    --font-size-h3: 1.25rem; /* 20px */

    --font-weight-normal: 400;
    --font-weight-medium: 500;
    --font-weight-semibold: 600;
    --font-weight-bold: 700;

    /* --- Spacing --- */
    --space-xs: 0.25rem; /* 4px */
    --space-sm: 0.5rem;  /* 8px */
    --space-md: 1rem;    /* 16px */
    --space-lg: 1.5rem;  /* 24px */
    --space-xl: 2rem;    /* 32px */
    --space-xxl: 3rem;   /* 48px */

    /* --- Borders --- */
    --border-radius-sm: 4px;
    --border-radius-md: 8px;
    --border-radius-lg: 12px;
    --border-width: 1px;
    --border-width-thick: 2px;

    /* --- Shadows --- */
    --shadow-sm: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
    --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
    --shadow-input-focus: 0 0 0 3px rgba(74, 144, 226, 0.3); /* Light blue focus ring */

    /* --- Transitions --- */
    --transition-fast: all 0.15s ease-in-out;
    --transition-base: all 0.2s ease-in-out;
    --transition-slow: all 0.3s ease-in-out;

    /* --- Z-Index --- */
    --z-index-header: 100;
    --z-index-modal-backdrop: 1000;
    --z-index-modal-content: 1010;
    --z-index-dropdown: 50;
}
```

### _buttons.css

```css
/* public/css/components/_buttons.css */
.btn {
    display: inline-flex; /* Use flex for icon alignment */
    align-items: center;
    justify-content: center;
    padding: var(--space-sm) var(--space-lg);
    border: var(--border-width) solid transparent;
    border-radius: var(--border-radius-md); /* Slightly more rounded */
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    text-align: center;
    transition: var(--transition-base);
    line-height: 1.4; /* Adjust line height */
    white-space: nowrap; /* Prevent wrapping */
}

.btn:focus-visible {
    outline: var(--border-width-thick) solid var(--color-primary);
    outline-offset: 2px;
    box-shadow: var(--shadow-input-focus);
}
.btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}
.btn:active:not(:disabled) {
    transform: scale(0.98);
}

/* Primary Button */
.btn-primary {
    background-color: var(--color-primary);
    color: var(--color-text-inverse);
    border-color: var(--color-primary);
}
.btn-primary:hover:not(:disabled) {
    background-color: var(--color-primary-dark);
    border-color: var(--color-primary-dark);
    color: var(--color-text-inverse);
    text-decoration: none;
}

/* Secondary Button */
.btn-secondary {
    background-color: var(--color-bg-button-secondary);
    color: var(--color-text-base);
    border-color: var(--color-border);
}
.btn-secondary:hover:not(:disabled) {
    background-color: var(--color-bg-button-secondary-hover);
    border-color: #adb5bd; /* Slightly darker border */
    color: var(--color-text-heading);
    text-decoration: none;
}

/* Danger Button */
.btn-danger {
    background-color: var(--color-danger);
    color: var(--color-text-inverse);
    border-color: var(--color-danger);
}
.btn-danger:hover:not(:disabled) {
    background-color: var(--color-danger-dark);
    border-color: var(--color-danger-dark);
    color: var(--color-text-inverse);
    text-decoration: none;
}

/* Small Button Modifier */
.btn-small {
    padding: var(--space-xs) var(--space-md);
    font-size: var(--font-size-sm);
    border-radius: var(--border-radius-sm);
}

/* Button with Icon */
.btn .icon {
    margin-right: var(--space-sm);
    font-size: 1.1em; /* Slightly larger icon */
    line-height: 1; /* Prevent icon affecting line height */
}
.btn .icon.only { /* Icon only button */
     margin-right: 0;
}

/* Specific button styles if needed */
#logoutBtn {
    /* Specific styles */
}
```

### _card.css

```css
/* public/css/components/_card.css */

/* --- Media Card --- */
.media-card {
    background-color: var(--color-bg-card);
    border-radius: var(--border-radius-md);
    box-shadow: var(--shadow-sm);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    transition: transform var(--transition-fast), box-shadow var(--transition-fast);
    height: 100%; /* Ensure cards in grid/flex take full height */
    position: relative; /* For status indicator and outline */
    border: var(--border-width-thick) solid transparent; /* Base for outline */
}
.media-card:hover {
    transform: translateY(-3px);
    box-shadow: var(--shadow-md);
}

/* Status Outlines */
.media-card.outline-green { border-color: var(--color-status-completed); }
.media-card.outline-blue { border-color: var(--color-status-watching); }
.media-card.outline-red { border-color: var(--color-status-planned); }
.media-card.outline-yellow { border-color: var(--color-status-paused); }
.media-card.outline-grey { border-color: var(--color-status-dropped); }

.card-link {
    display: flex;
    flex-direction: column;
    height: 100%;
    color: inherit; /* Remove default link color */
}
.card-link:hover {
    text-decoration: none;
}

.card-image-container {
    position: relative;
    background-color: var(--color-border); /* Placeholder bg */
}

.card-image {
    width: 100%;
    aspect-ratio: 2 / 3; /* Common poster aspect ratio */
    object-fit: cover;
    display: block;
}

.status-indicator {
    position: absolute;
    top: var(--space-sm);
    right: var(--space-sm);
    background-color: rgba(0, 0, 0, 0.7);
    color: var(--color-text-inverse);
    font-size: var(--font-size-xs);
    padding: var(--space-xs) var(--space-sm);
    border-radius: var(--border-radius-sm);
    font-weight: var(--font-weight-semibold);
    z-index: 1;
    text-transform: capitalize;
}
/* Optional specific colors for status indicator */
.status-indicator.status-completed { background-color: var(--color-status-completed); }
/* ... add others if desired ... */

.card-info {
    padding: var(--space-sm) var(--space-md) var(--space-md);
    flex-grow: 1; /* Push info down if card height varies slightly */
}

.card-title {
    font-size: var(--font-size-base); /* Smaller title for cards */
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-heading);
    margin-bottom: var(--space-xs);
    line-height: 1.3;
}

.card-subtitle {
    font-size: var(--font-size-sm);
    color: var(--color-text-light);
    margin-bottom: 0;
    line-height: 1.4;
}

.card-year {
    color: var(--color-text-lighter);
}


/* --- List Card (Used on Profile Page Carousel) --- */
.list-card {
    background-color: var(--color-bg-card);
    border-radius: var(--border-radius-md);
    box-shadow: var(--shadow-sm);
    overflow: hidden;
    transition: var(--transition-base);
    border: 1px solid var(--color-border);
    height: 100%;
}
.list-card:hover {
     box-shadow: var(--shadow-md);
     border-color: var(--color-primary);
}
.list-card a {
    display: block;
    color: inherit;
}
.list-card a:hover {
    text-decoration: none;
}

.list-card-image {
    width: 100%;
    aspect-ratio: 16 / 9; /* Different aspect ratio for lists */
    object-fit: cover;
    background-color: var(--color-border);
    border-bottom: 1px solid var(--color-border);
}

.list-card-info {
    padding: var(--space-sm) var(--space-md) var(--space-md);
}

.list-card-title {
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-semibold);
    margin-bottom: var(--space-xs);
}

.list-card-info p {
    font-size: var(--font-size-sm);
    color: var(--color-text-light);
    margin-bottom: 0;
}
```

### _forms.css

```css
/* public/css/components/_forms.css */
.form-group {
    margin-bottom: var(--space-lg); /* More space between groups */
}

.form-group label {
    display: block;
    margin-bottom: var(--space-sm); /* More space below label */
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-light);
}

/* Input, Select, Textarea common styles */
.form-group input[type="text"],
.form-group input[type="password"],
.form-group input[type="number"],
.form-group input[type="email"],
.form-group input[type="url"],
.form-group input[type="search"],
.form-group select,
.form-group textarea {
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    border: var(--border-width) solid var(--color-border-input);
    border-radius: var(--border-radius-sm);
    font-size: var(--font-size-base);
    background-color: var(--color-bg-input);
    color: var(--color-text-base);
    transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
    line-height: 1.5;
}
.form-group input::placeholder,
.form-group textarea::placeholder {
    color: var(--color-text-lighter);
    opacity: 1;
}

.form-group select {
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%23a0aec0'%3E%3Cpath fill-rule='evenodd' d='M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z' clip-rule='evenodd'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right var(--space-md) center;
    background-size: 1em 1em;
    padding-right: calc(var(--space-md) * 2 + 1em);
}

.form-group textarea {
    resize: vertical;
    min-height: 100px;
}

/* Checkbox */
.form-group input[type="checkbox"] {
    width: auto; /* Checkboxes shouldn't be full width */
    margin-right: var(--space-sm);
    vertical-align: middle;
}
.form-group label[for*="checkbox"], /* Target labels associated with checkboxes */
.form-group label[for*="Toggle"] {
    display: inline-block; /* Align label with checkbox */
    margin-bottom: 0;
    vertical-align: middle;
}


/* Focus styles */
.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
    outline: none;
    border-color: var(--color-border-input-focus);
    box-shadow: var(--shadow-input-focus);
    background-color: var(--color-bg-input-focus);
}
/* Add to public/css/components/_forms.css OR pages/_auth.css */

.form-actions {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    margin-top: var(--space-sm); /* Ensure space above actions */
}

.form-actions .btn {
    flex-grow: 1; /* Make button take space */
}

.form-actions .spinner {
    flex-shrink: 0; /* Prevent spinner shrinking */
    /* margin-left is already handled by gap */
}

/* Ensure space below actions for messages */
form .form-error,
form .form-message {
    margin-top: var(--space-md); /* Add space above feedback messages */
}

/* Form specific error/message (often used within modals) */
.form-error, .form-message, .modal-error-message { /* Combine selectors */
    font-size: var(--font-size-sm);
    margin-top: var(--space-sm);
    padding: var(--space-xs) var(--space-sm);
    border-radius: var(--border-radius-sm);
    display: block;
}
.form-error, .modal-error-message {
    color: var(--color-danger-dark);
    background-color: #feefee;
}
.form-message {
    color: var(--color-success-dark);
    background-color: #effcf6;
}
.modal-error-message.hidden { display: none; } /* Ensure hidden works */
```

### _listRow.css

```css
/* public/css/components/_listRow.css */

/* --- List Summary Row (Overview Page) --- */
.list-summary-row {
    display: flex;
    align-items: flex-start; /* Align items to top */
    gap: var(--space-md);
    padding: var(--space-md);
    margin-bottom: var(--space-md); /* Spacing between rows */
    transition: box-shadow var(--transition-fast), border-color var(--transition-fast);
}
.list-summary-row:hover {
    box-shadow: var(--shadow-md);
    border-color: var(--color-border-input-focus);
}

.list-summary-details {
    flex-grow: 1;
}
.list-summary-details h3 {
    margin-bottom: var(--space-xs);
    font-size: var(--font-size-lg);
}
.list-summary-details h3 a:hover {
    color: var(--color-primary-dark);
}

.list-summary-meta {
    font-size: var(--font-size-sm);
    color: var(--color-text-lighter);
    margin-bottom: var(--space-sm);
}
.list-summary-meta a {
    color: var(--color-text-light);
    font-weight: var(--font-weight-medium);
}
.list-summary-meta a:hover {
    color: var(--color-primary);
}


.list-summary-desc {
    font-size: var(--font-size-sm);
    color: var(--color-text-light);
    margin-bottom: 0;
    line-height: 1.5;
}

.list-summary-actions {
    display: flex;
    gap: var(--space-sm);
    flex-shrink: 0;
}
.list-summary-actions .btn .icon {
    margin-right: 0; /* Icon only buttons */
    font-size: 1rem;
}


/* --- List Item Row (Detail Page Table) --- */
.list-items-table {
    margin-top: var(--space-lg);
}
.table-header,
.list-item-row {
    display: grid;
    grid-template-columns: 3fr 1fr 2fr 1fr 100px; /* Adjust columns as needed */
    gap: var(--space-md);
    padding: var(--space-sm) 0;
    border-bottom: 1px solid var(--color-divider);
    align-items: center; /* Vertically align items in row */
}

.table-header {
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-light);
    font-size: var(--font-size-sm);
    padding-bottom: var(--space-md);
    border-bottom-width: var(--border-width-thick);
}

.list-item-row {
    font-size: var(--font-size-sm);
}
.list-item-row:last-child {
    border-bottom: none;
}

.col-title {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-weight: var(--font-weight-medium);
}
.item-row-thumb {
    width: 30px;
    height: 45px; /* Maintain aspect ratio */
    object-fit: cover;
    border-radius: var(--border-radius-sm);
    flex-shrink: 0;
}
.item-row-year {
    color: var(--color-text-lighter);
    margin-left: var(--space-xs);
}

.col-status .tag {
     padding: 2px 6px; /* Smaller tag */
     font-size: 0.7rem;
}

.col-comment {
    color: var(--color-text-light);
    font-style: italic;
}

.col-added {
    color: var(--color-text-lighter);
}

.col-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-xs);
}
.col-actions .btn .icon {
    margin-right: 0;
    font-size: 0.9rem;
}

/* Edit comment form styles */
.edit-comment-form {
    grid-column: 3 / 4; /* Place form in comment column */
    display: flex;
    gap: var(--space-xs);
    align-items: center;
}
.edit-comment-form input[type="text"] {
    flex-grow: 1;
    padding: var(--space-xs);
    font-size: var(--font-size-sm);
}
.list-item-row .edit-comment-form.hidden {
    display: none;
}
.list-item-row .col-comment.hidden {
    display: none;
}

/* Responsive Table */
@media (max-width: 768px) {
    .table-header { display: none; } /* Hide header */
    .list-item-row {
        grid-template-columns: 1fr auto; /* Title | Actions */
        padding: var(--space-md) 0;
        gap: var(--space-sm);
        position: relative; /* For absolute positioning meta */
    }
     .col-title { grid-column: 1 / 2; }
     .col-actions { grid-column: 2 / 3; align-self: flex-start;} /* Align actions top right */

    .col-status, .col-comment, .col-added {
        grid-column: 1 / 2; /* Span title column */
        margin-left: calc(30px + var(--space-sm)); /* Indent past thumbnail */
        margin-top: var(--space-xs);
        font-size: var(--font-size-xs);
    }
     .col-comment { font-style: normal; }
     .col-added::before { content: "Added: "; font-weight: var(--font-weight-medium); color: var(--color-text-light); }
     .col-status::before { content: ""; } /* Remove pseudo content */

     .edit-comment-form {
         grid-column: 1 / 2;
         margin-left: calc(30px + var(--space-sm));
     }
}
```

### _modal.css

```css
/* public/css/components/_modal.css */
.modal-overlay {
    position: fixed;
    inset: 0;
    background-color: var(--color-bg-modal-overlay);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: var(--z-index-modal-backdrop);
    opacity: 0;
    visibility: hidden;
    transition: opacity var(--transition-slow), visibility 0s linear var(--transition-slow);
    padding: var(--space-lg); /* Padding for smaller screens */
    overflow-y: auto; /* Allow scrolling if modal is too tall */
}

.modal-overlay:not(.hidden) {
    opacity: 1;
    visibility: visible;
    transition: opacity var(--transition-slow);
}

.modal-content {
    background-color: var(--color-bg-card);
    padding: var(--space-xl); /* More padding */
    border-radius: var(--border-radius-lg); /* Larger radius */
    box-shadow: var(--shadow-lg);
    width: 100%;
    max-width: 550px; /* Default max-width */
    position: relative;
    transform: scale(0.95) translateY(10px);
    transition: transform var(--transition-slow), opacity var(--transition-slow);
    opacity: 0;
    margin: var(--space-lg) 0; /* Allow space top/bottom */
}
.modal-overlay:not(.hidden) .modal-content {
     transform: scale(1) translateY(0);
     opacity: 1;
}

.modal-close-btn {
    position: absolute;
    top: var(--space-md);
    right: var(--space-md);
    background: none;
    border: none;
    font-size: 1.8rem;
    color: var(--color-text-lighter);
    cursor: pointer;
    line-height: 1;
    padding: var(--space-xs);
    transition: color var(--transition-fast);
}
.modal-close-btn:hover {
    color: var(--color-text-base);
}

.modal-content h2 {
    margin-top: 0;
    margin-bottom: var(--space-lg);
    text-align: center;
    font-size: var(--font-size-h3);
    color: var(--color-text-heading);
}

.modal-image-preview {
    max-width: 150px;
    height: auto;
    margin: 0 auto var(--space-md);
    display: block;
    border-radius: var(--border-radius-sm);
    border: 1px solid var(--color-border);
}

.modal-actions {
    margin-top: var(--space-xl);
    display: flex;
    justify-content: flex-end;
    gap: var(--space-md);
    border-top: var(--border-width) solid var(--color-divider);
    padding-top: var(--space-lg);
    align-items: center; /* Align spinner */
}
.modal-actions .spinner {
    margin-left: var(--space-sm);
}


/* Confirmation Modal */
.modal-confirm .modal-content {
    max-width: 450px;
    text-align: center;
    padding-top: var(--space-xl);
}
.modal-confirm h3 {
    margin-bottom: var(--space-md);
    color: var(--color-danger); /* Or based on context */
    font-size: var(--font-size-xl);
}
.modal-confirm p {
    margin-bottom: var(--space-lg);
    color: var(--color-text-light);
}
.modal-confirm .modal-actions {
    justify-content: center;
    border-top: none;
    padding-top: 0;
}
```

### _navigation.css

```css
/* public/css/components/_navigation.css */

/* --- Header User Nav (Styles in _header.css) --- */

/* --- Horizontal Navigation (Homepage) --- */
.horizontal-nav {
    display: flex;
    overflow-x: auto; /* Allow scrolling on small screens */
    padding-bottom: var(--space-sm); /* Space for scrollbar */
    margin-bottom: var(--space-lg);
    border-bottom: var(--border-width) solid var(--color-divider);
    /* Hide scrollbar visually if desired */
    -ms-overflow-style: none;  /* IE and Edge */
    scrollbar-width: none;  /* Firefox */
}
.horizontal-nav::-webkit-scrollbar {
    display: none; /* Chrome, Safari, Opera */
}


.horizontal-nav .nav-item {
    padding: var(--space-sm) var(--space-lg);
    border: none;
    background: none;
    color: var(--color-text-light);
    font-weight: var(--font-weight-medium);
    white-space: nowrap;
    border-bottom: var(--border-width-thick) solid transparent; /* Indicator */
    margin-bottom: -1px; /* Align border with container border */
    transition: color var(--transition-fast), border-color var(--transition-fast);
}

.horizontal-nav .nav-item:hover {
    color: var(--color-text-base);
}

.horizontal-nav .nav-item.active {
    color: var(--color-primary);
    border-bottom-color: var(--color-primary);
}
```

### _spinner.css

```css
/* public/css/components/_spinner.css */
.spinner {
    border: 4px solid var(--color-border); /* Light grey */
    border-top: 4px solid var(--color-primary); /* Blue */
    border-radius: 50%;
    width: 24px;
    height: 24px;
    animation: spin 1s linear infinite;
    display: inline-block; /* Default */
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

/* Hide spinner by default */
.spinner.hidden {
    display: none;
}

/* Small spinner variant */
.spinner-small {
    width: 16px;
    height: 16px;
    border-width: 2px;
}
```

### _swiper.css

```css
/* public/css/components/_swiper.css */
/* Basic Swiper container adjustments */
.swiper {
    width: 100%;
    padding: var(--space-sm) 0; /* Add padding for shadows/overflow */
    position: relative;
}

.swiper-wrapper {
    /* display: flex; /* Swiper handles this */
    /* align-items: stretch; /* Make slides equal height if needed */
}

.swiper-slide {
    width: auto; /* Allow slides to size based on content or CSS */
    flex-shrink: 0;
    height: auto; /* Allow slides to determine their height */
    /* Ensure slides are block or flex containers if needed */
    display: flex; /* Make slide a flex container */
    justify-content: center; /* Center content if slide is wider */
}

/* Adjust slide width for specific carousels if needed */
.media-swiper .swiper-slide {
     width: 180px; /* Example width for media cards */
}
.cast-swiper .swiper-slide {
    width: 100px; /* Example width for cast members */
}
.list-swiper .swiper-slide {
     width: 250px; /* Example width for list cards */
}

/* Navigation Buttons */
.swiper-button-prev,
.swiper-button-next {
    position: absolute;
    top: 50%;
    width: 40px; /* Adjust size */
    height: 40px;
    margin-top: -20px; /* Half of height */
    z-index: 10;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-primary); /* Use theme color */
    background-color: rgba(255, 255, 255, 0.8);
    border-radius: 50%;
    box-shadow: var(--shadow-md);
    transition: opacity var(--transition-fast), background-color var(--transition-fast);
    opacity: 0; /* Hidden by default */
}
.swiper:hover .swiper-button-prev,
.swiper:hover .swiper-button-next {
     opacity: 1; /* Show on hover */
}


.swiper-button-prev:hover,
.swiper-button-next:hover {
     background-color: rgba(255, 255, 255, 1);
     color: var(--color-primary-dark);
}

.swiper-button-prev {
    left: 5px;
}
.swiper-button-next {
    right: 5px;
}

/* Use Swiper's built-in SVG icons or replace with custom ones */
.swiper-button-prev::after,
.swiper-button-next::after {
    font-size: 1.2rem; /* Adjust icon size */
    font-weight: bold;
}

/* Disabled state */
.swiper-button-disabled {
    opacity: 0 !important; /* Hide completely when disabled */
    cursor: auto;
    pointer-events: none;
}

/* Pagination */
.swiper-pagination {
    position: absolute;
    bottom: -5px !important; /* Adjust position */
    left: 50%;
    transform: translateX(-50%);
    width: auto !important;
}
.swiper-pagination-bullet {
    width: 8px;
    height: 8px;
    background-color: var(--color-border);
    opacity: 0.7;
    transition: opacity var(--transition-fast), background-color var(--transition-fast);
}
.swiper-pagination-bullet-active {
    background-color: var(--color-primary);
    opacity: 1;
}

/* Responsive adjustments for buttons */
@media (max-width: 600px) {
    .swiper-button-prev,
    .swiper-button-next {
        display: none; /* Hide buttons on small screens maybe */
    }
    /* Adjust slide widths if needed */
    .media-swiper .swiper-slide { width: 150px; }
    .cast-swiper .swiper-slide { width: 80px; }
    .list-swiper .swiper-slide { width: 200px; }

}
```

### _tags.css

```css
/* public/css/components/_tags.css */
.tag {
    display: inline-block;
    padding: var(--space-xs) var(--space-sm);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    border-radius: var(--border-radius-sm);
    line-height: 1.2;
    text-transform: capitalize;
    border: 1px solid transparent; /* Base border */
}

/* Default Tag Style */
.tag {
    background-color: #f1f5f9; /* Lighter gray */
    color: var(--color-text-light);
    border-color: var(--color-border);
}

/* Type specific tags */
.tag-movie { background-color: #e0f2fe; color: #0c4a6e; border-color: #7dd3fc;} /* Sky Blue */
.tag-series { background-color: #fef9c3; color: #713f12; border-color: #fde047;} /* Amber */
.tag-book { background-color: #dcfce7; color: #15803d; border-color: #86efac;} /* Green */
.tag-video-game { background-color: #fce7f3; color: #831843; border-color: #f9a8d4;} /* Pink */

/* Status specific tags (using text color more) */
.tag-status-planned { color: var(--color-status-planned); border-color: currentColor; background-color: #fef2f2;}
.tag-status-watching,
.tag-status-reading,
.tag-status-playing { color: var(--color-status-watching); border-color: currentColor; background-color: #eff6ff; }
.tag-status-completed { color: var(--color-status-completed); border-color: currentColor; background-color: #f0fdf4; }
.tag-status-paused { color: var(--color-status-paused); border-color: currentColor; background-color: #fefce8; }
.tag-status-dropped { color: var(--color-status-dropped); border-color: currentColor; background-color: #f1f5f9; }

/* Rating Tag */
.tag-rating {
    background-color: var(--color-accent);
    color: var(--color-text-inverse);
    border: none;
}
.tag-rating .icon { margin-right: var(--space-xs); }
```

### _userInteraction.css

```css
/* public/css/components/_userInteraction.css */
.user-interaction-controls {
    background-color: #f8f9fa; /* Slightly different background */
    padding: var(--space-md);
    border-radius: var(--border-radius-md);
    border: 1px solid var(--color-border);
    margin-top: var(--space-md);
}

.user-interaction-controls form {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); /* Responsive columns */
    gap: var(--space-md);
    align-items: end; /* Align items to bottom */
}

.interaction-group {
    /* display: flex; */
    /* flex-direction: column; */
}

.interaction-group label {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-light);
    margin-bottom: var(--space-xs);
    display: block;
}

.interaction-group select,
.interaction-group input[type="number"],
.interaction-group textarea {
    width: 100%;
    padding: var(--space-xs) var(--space-sm); /* Smaller padding */
    font-size: var(--font-size-sm);
    border-radius: var(--border-radius-sm);
}

.interaction-group textarea {
    min-height: 40px; /* Smaller textarea */
    resize: none; /* Disable resize */
}

.rating-group {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
}
.rating-group input[type="number"] {
    width: 60px; /* Fixed width for rating input */
    text-align: center;
}
.rating-group span {
     font-size: var(--font-size-sm);
     color: var(--color-text-lighter);
}


.favorite-group {
    display: flex;
    align-items: center;
    padding-top: var(--space-md); /* Align with bottom */
}
.favorite-group input[type="checkbox"] {
     width: 18px;
     height: 18px;
     margin-right: var(--space-sm);
}


.interaction-actions {
    grid-column: 1 / -1; /* Span full width */
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
    align-items: center;
    margin-top: var(--space-sm);
    border-top: 1px solid var(--color-divider);
    padding-top: var(--space-md);
}
.interaction-actions .status-message {
    margin: 0;
    padding: var(--space-xs) var(--space-sm);
    flex-grow: 1; /* Take remaining space */
    text-align: left;
}
```

### _container.css

```css
/* public/css/layout/_container.css */
.container {
    width: 100%;
    max-width: 1280px; /* Wider max-width */
    margin-left: auto;
    margin-right: auto;
    padding-left: var(--space-lg); /* Slightly more padding */
    padding-right: var(--space-lg);
}

/* Responsive padding */
@media (max-width: 768px) {
    .container {
        padding-left: var(--space-md);
        padding-right: var(--space-md);
    }
}
```

### _footer.css

```css
/* public/css/layout/_footer.css */
footer {
    margin-top: var(--space-xxl);
    padding: var(--space-lg) 0;
    text-align: center;
    font-size: var(--font-size-sm);
    color: var(--color-text-lighter);
    border-top: var(--border-width) solid var(--color-divider);
    background-color: var(--color-bg-card); /* Match header/card background */
}
```

### _grid.css

```css
.results-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); /* Responsive grid */
    gap: var(--space-lg);
    margin-top: var(--space-lg);
}

.results-grid.loading .placeholder-text {
    color: var(--color-text-light);
    font-style: normal; /* Not italic while loading */
}

.placeholder-text {
    grid-column: 1 / -1; /* Span full grid width */
    text-align: center;
    color: var(--color-text-lighter);
    font-style: italic;
    padding: var(--space-xl) var(--space-md);
    background-color: var(--color-bg-alt);
    border-radius: var(--border-radius-md);
    box-shadow: var(--shadow-sm);
}

.placeholder-text.error {
    color: var(--color-danger);
    font-weight: var(--font-weight-medium);
    font-style: normal;
}


/* Responsive grid adjustments */
@media (max-width: 600px) {
    .results-grid {
        /* Single column on very small screens */
        grid-template-columns: 1fr;
    }
}
```

### _header.css

```css
/* public/css/layout/_header.css */
.site-header {
    background-color: var(--color-bg-header);
    border-bottom: var(--border-width) solid var(--color-bg-header-border);
    padding: var(--space-sm) 0;
    position: sticky; /* Make header sticky */
    top: 0;
    z-index: var(--z-index-header);
    box-shadow: var(--shadow-sm);
}

.header-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-lg);
}

/* Logo */
.logo {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-weight: var(--font-weight-bold);
    font-size: var(--font-size-xl);
    color: var(--color-text-heading);
    flex-shrink: 0; /* Prevent shrinking */
}
.logo:hover {
    text-decoration: none;
    opacity: 0.9;
}
.logo-icon {
    font-size: 1.8rem; /* Adjust icon size */
}
.logo-text {
    display: block; /* Default display */
}

/* Search Container */
.search-container {
    flex-grow: 1; /* Take available space */
    max-width: 500px; /* Limit search width */
    margin: 0 var(--space-md); /* Add some margin */
}

.header-search-form {
    display: flex;
    align-items: center;
    background-color: var(--color-bg-body); /* Slight contrast */
    border-radius: var(--border-radius-md);
    border: var(--border-width) solid var(--color-border);
    overflow: hidden; /* Contain button */
}
.header-search-form:focus-within {
    border-color: var(--color-border-input-focus);
    box-shadow: var(--shadow-input-focus);
}

#headerSearchQuery {
    flex-grow: 1;
    border: none;
    outline: none;
    padding: var(--space-sm) var(--space-md);
    background: transparent;
    font-size: var(--font-size-base);
}
#headerSearchQuery::placeholder {
    color: var(--color-text-lighter);
    opacity: 1;
}

.search-button {
    padding: var(--space-sm) var(--space-md);
    background-color: transparent;
    border-left: var(--border-width) solid var(--color-border);
    color: var(--color-text-light);
    transition: background-color var(--transition-fast);
}
.search-button:hover {
    background-color: var(--color-bg-button-secondary);
    color: var(--color-text-base);
}
.search-button .icon {
    font-size: 1.1rem;
    display: block; /* Ensure icon aligns */
}

/* User Navigation */
.user-nav {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    flex-shrink: 0;
}

.profile-link {
    display: block;
}
.profile-link:hover {
    text-decoration: none;
    opacity: 0.85;
}

.profile-icon {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    object-fit: cover;
    border: var(--border-width-thick) solid var(--color-border);
}

/* Responsive Header */
@media (max-width: 768px) {
    .header-content {
        flex-wrap: wrap;
        gap: var(--space-sm);
    }
    .search-container {
        order: 3; /* Move search below logo/nav */
        width: 100%;
        max-width: none;
        margin: var(--space-sm) 0 0 0; /* Add top margin */
    }
    .logo-text {
        display: none; /* Hide text on small screens */
    }
    .user-nav {
        /* Adjust spacing if needed */
    }
}

@media (max-width: 480px) {
     .logo {
        font-size: 1rem; /* Smaller logo text */
     }
     .profile-icon {
         width: 32px;
         height: 32px;
     }
     .user-nav {
        gap: var(--space-sm);
     }
     #headerSearchQuery {
        padding: var(--space-xs) var(--space-sm);
        font-size: var(--font-size-sm);
     }
      .search-button {
        padding: var(--space-xs) var(--space-sm);
     }
}
```

### _auth.css

```css
/* public/css/pages/_auth.css */
/* Styles for the auth.hbs layout */

.auth-layout body { /* Target body when auth layout is used */
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    background-color: var(--color-bg-body);
}

.auth-container {
   width: 100%;
   max-width: 800px; /* Max width for side-by-side forms */
   padding: var(--space-xl);
   margin: var(--space-lg) 0;
}

.auth-logo {
   display: flex;
   align-items: center;
   justify-content: center;
   gap: var(--space-sm);
   font-weight: var(--font-weight-bold);
   font-size: var(--font-size-h3);
   color: var(--color-text-heading);
   margin-bottom: var(--space-xl);
}
.auth-logo .logo-icon { font-size: 2rem; }

.auth-forms {
   display: flex;
   gap: var(--space-xl);
   align-items: flex-start; /* Align tops */
}

.auth-form-card {
   flex: 1; /* Take equal space */
   background-color: var(--color-bg-card);
   padding: var(--space-xl);
   border-radius: var(--border-radius-lg);
   box-shadow: var(--shadow-md);
   border: 1px solid var(--color-border);
}
.auth-form-card h3 {
   text-align: center;
   margin-top: 0;
   margin-bottom: var(--space-lg);
   font-size: var(--font-size-xl);
}
.auth-form-card .btn {
   width: 100%; /* Make buttons full width */
   margin-top: var(--space-sm);
}

.auth-separator {
   display: flex;
   align-items: center;
   text-align: center;
   color: var(--color-text-lighter);
   font-size: var(--font-size-sm);
   font-weight: var(--font-weight-medium);
   padding: var(--space-lg) 0;
   writing-mode: vertical-lr; /* Vertical text */
   margin: var(--space-lg) 0;
}
.auth-separator span {
   padding: var(--space-sm) 0;
}
.auth-separator::before,
.auth-separator::after {
   content: '';
   flex-grow: 1;
   border-left: 1px solid var(--color-divider); /* Vertical line */
   height: 40px; /* Adjust line height */
   margin: 0 var(--space-xs);
}


.auth-footer-link {
   text-align: center;
   margin-top: var(--space-lg);
   font-size: var(--font-size-sm);
}


/* Responsive Auth Page */
@media (max-width: 768px) {
   .auth-container { max-width: 450px; } /* Stack forms */
   .auth-forms { flex-direction: column; }
   .auth-separator {
       writing-mode: horizontal-tb; /* Horizontal separator */
       width: 100%;
       margin: 0;
       padding: var(--space-md) 0;
   }
    .auth-separator::before,
    .auth-separator::after {
        border-top: 1px solid var(--color-divider);
        border-left: none;
        width: 40%; height: auto;
   }
}
```

### _home.css

```css
/* public/css/pages/_home.css */

/* Horizontal Navigation (styles in _navigation.css) */

/* Section styling */
.media-carousel-section {
    margin-bottom: var(--space-xl);
}

.section-title {
    font-size: var(--font-size-h3);
    margin-bottom: var(--space-sm);
    padding-bottom: var(--space-sm);
    border-bottom: 1px solid var(--color-divider);
}
```

### _library.css

```css
.search-section {
    padding: var(--space-md); /* Less padding than standard card */
    margin-bottom: var(--space-lg);
}
.search-form {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end; /* Align items to bottom */
    gap: var(--space-md);
}
.search-form .form-group {
    margin-bottom: 0; /* Remove bottom margin in flex layout */
    flex-grow: 1; /* Allow query input to grow */
}
.search-form .form-group:nth-child(2) { /* Target select group */
    flex-grow: 0; /* Don't let select grow */
    min-width: 150px; /* Give select a reasonable width */
}
.search-form button {
    flex-shrink: 0; /* Prevent button from shrinking */
}

.library-section {
     padding: var(--space-lg);
}
.library-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-md);
    margin-bottom: var(--space-lg);
    padding-bottom: var(--space-md);
    border-bottom: var(--border-width) solid var(--color-border);
}
.library-header h2 {
    margin-bottom: 0; /* Reset margin */
    display: flex;
    align-items: center;
    gap: var(--space-sm);
}

.library-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-sm); /* Smaller gap for controls */
    flex-grow: 1; /* Take available space */
}
.filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-sm);
    flex-grow: 1;
}
.filters select,
.filters input[type="number"] {
    padding: var(--space-xs) var(--space-sm);
    font-size: var(--font-size-sm);
    max-width: 130px;
    background-color: var(--color-bg); /* Slightly different bg for filters */
}
#getLibraryBtn {
    padding: var(--space-xs); /* Make refresh button small */
    font-size: 1.2rem; /* Make icon larger */
    line-height: 1;
}

/* Responsive library controls */
@media (max-width: 768px) {
    .library-header {
         flex-direction: column;
         align-items: flex-start;
    }
    .library-controls {
        width: 100%;
        justify-content: space-between;
    }
    .filters {
        width: 100%;
        margin-top: var(--space-sm);
    }
     .filters select, .filters input {
        flex-grow: 1; /* Allow filters to take more space */
        max-width: none;
     }
}

.status-section { /* For debugging output */
    margin-top: var(--space-xl);
    font-size: var(--font-size-sm);
}
.status-section pre {
    background-color: var(--color-code-bg);
    color: var(--color-code-text);
    padding: var(--space-md);
    border-radius: var(--border-radius-sm);
    font-family: var(--font-family-code);
    white-space: pre-wrap;
    word-wrap: break-word;
    max-height: 300px;
    overflow-y: auto;
    margin-top: var(--space-sm);
}
.status-section summary {
    cursor: pointer;
    font-weight: var(--font-weight-medium);
    color: var(--color-text-light);
}
#statusMessage.error { color: var(--color-danger); }
#statusMessage.success { color: var(--color-success); }
```

### _lists.css

```css
/* public/css/pages/_lists.css */

/* --- Lists Overview Page --- */
.lists-overview-page h1 {
    margin-bottom: var(--space-md);
    text-align: center;
}
.list-actions {
    text-align: center;
    margin-bottom: var(--space-xl);
}

.lists-container {
    /* Container for list summary rows */
}
#listFormArea { margin-top: var(--space-lg); }
#listFormArea.hidden { display: none; }


/* --- List Detail Page --- */
.list-detail-header {
    display: flex;
    gap: var(--space-xl);
    margin-bottom: var(--space-xl);
}
.list-cover {
    flex-basis: 250px; /* Adjust size */
    flex-shrink: 0;
}
.list-cover img {
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    border-radius: var(--border-radius-md);
    background-color: var(--color-border);
}
.list-info {
    flex-grow: 1;
}
.list-info h1 {
    margin-bottom: var(--space-xs);
}
.list-owner {
    font-size: var(--font-size-sm);
    color: var(--color-text-light);
    margin-bottom: var(--space-md);
}
.list-owner a { font-weight: var(--font-weight-medium); }
.list-description {
    color: var(--color-text-base);
    margin-bottom: var(--space-md);
    line-height: 1.6;
}
.list-meta {
    font-size: var(--font-size-sm);
    color: var(--color-text-lighter);
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-md);
    margin-bottom: var(--space-md);
}
.list-owner-actions {
    margin-top: var(--space-md);
    display: flex;
    gap: var(--space-sm);
}

/* Items Section */
.list-items-section {
    margin-top: var(--space-xl);
}
.list-items-section h2 {
    margin-bottom: var(--space-md);
}

/* Add Item Form */
.add-item-to-list form {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: var(--space-md);
    padding: var(--space-md);
    background-color: #f8f9fa;
    border-radius: var(--border-radius-sm);
    border: 1px solid var(--color-border);
}
.add-item-to-list .form-group {
    margin-bottom: 0;
    flex-grow: 1;
}
.add-item-to-list label { font-size: var(--font-size-xs); }
.add-item-to-list input { font-size: var(--font-size-sm); padding: var(--space-xs) var(--space-sm); }
.add-item-to-list small {
     display: block;
     font-size: var(--font-size-xs);
     color: var(--color-text-lighter);
     margin-top: var(--space-xs);
}
.add-item-to-list button { flex-shrink: 0; }
.add-item-to-list .status-message { margin-left: var(--space-md); padding: 0; background: none; border: none; }

/* List Items Table styles in _listRow.css */

/* Responsive List Detail */
@media (max-width: 768px) {
    .list-detail-header {
        flex-direction: column;
        align-items: center;
        text-align: center;
    }
    .list-cover { flex-basis: auto; width: 100%; max-width: 300px; }
    .list-info h1 { font-size: var(--font-size-h2); }
}
```

### _mediaDetail.css

```css
/* public/css/pages/_mediaDetail.css */
.media-detail-page {
    /* Container already provides padding */
}

/* Backdrop */
.backdrop-image {
    height: 300px; /* Adjust height */
    background-size: cover;
    background-position: center center;
    margin: calc(-1 * var(--space-lg)) calc(-1 * var(--space-lg)) var(--space-lg); /* Extend outside container padding */
    position: relative;
    border-radius: 0 0 var(--border-radius-lg) var(--border-radius-lg); /* Rounded bottom */
    overflow: hidden;
}
.backdrop-image.placeholder {
    background-color: var(--color-border);
}
/* Optional overlay */
.backdrop-image::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(to top, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.1) 60%, rgba(0,0,0,0) 100%);
}


.detail-content {
    position: relative; /* To position content above backdrop gradient */
    margin-top: -80px; /* Pull content up over the backdrop */
    z-index: 1;
}

/* Main Info Section */
.detail-main-info {
    display: flex;
    gap: var(--space-xl);
    align-items: flex-start; /* Align poster top */
    margin-bottom: var(--space-xl);
}

.detail-poster {
    flex-basis: 200px; /* Fixed width for poster */
    flex-shrink: 0;
    margin-top: -40px; /* Pull poster up further */
}
.detail-poster img {
    width: 100%;
    height: auto;
    aspect-ratio: 2 / 3;
    border-radius: var(--border-radius-md);
    box-shadow: var(--shadow-lg);
    border: 3px solid var(--color-bg-card); /* Border effect */
}

.detail-text {
    flex-grow: 1;
    padding-top: var(--space-md); /* Align text roughly with top of poster visually */
}
.detail-text h1 {
    font-size: var(--font-size-h1);
    margin-bottom: var(--space-xs);
    color: var(--color-text-inverse); /* White text on backdrop */
    text-shadow: 1px 1px 3px rgba(0,0,0,0.5); /* Shadow for readability */
}
.detail-subtitle {
    font-size: var(--font-size-lg);
    color: #e2e8f0; /* Lighter text */
    margin-bottom: var(--space-md);
    font-style: italic;
    text-shadow: 1px 1px 2px rgba(0,0,0,0.4);
}
.detail-meta {
    margin-bottom: var(--space-md);
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm) var(--space-md);
    align-items: center;
    color: #cbd5e0; /* Lighter meta text */
}
.detail-meta .tag {
     background-color: rgba(255,255,255, 0.2);
     color: var(--color-text-inverse);
     border: none;
     font-size: var(--font-size-xs);
}
.detail-meta span {
     font-size: var(--font-size-sm);
}

.detail-actions {
    margin-top: var(--space-lg);
}

.detail-description {
    margin-top: var(--space-lg);
    color: var(--color-text-light); /* Use regular text color now */
    line-height: 1.7;
}
.detail-description:first-of-type { /* If overview is first element */
     margin-top: var(--space-xl); /* Add more space below interaction */
     color: var(--color-text-base);
}
.detail-text h3 { /* Overview heading */
    margin-top: var(--space-xl);
    margin-bottom: var(--space-sm);
     color: var(--color-text-heading);
}


/* Metadata Section */
.detail-metadata {
    padding: var(--space-lg);
    margin-bottom: var(--space-xl);
}
.detail-metadata h3 {
     margin-top: 0;
     margin-bottom: var(--space-md);
}

.metadata-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--space-sm) var(--space-lg);
}
.meta-item {
    font-size: var(--font-size-sm);
}
.meta-label {
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-base);
    margin-right: var(--space-xs);
}
.meta-value {
    color: var(--color-text-light);
}
.rating-display .star {
     font-size: 1.1em;
     color: var(--color-star-empty);
}
.rating-display .star.filled {
    color: var(--color-star-filled);
}
.external-links a {
    margin-right: var(--space-md);
    font-weight: var(--font-weight-medium);
    display: inline-block;
}


/* Cast Section */
.detail-cast-section { padding: var(--space-lg); margin-bottom: var(--space-xl); }
.detail-cast-section h3 { margin-top: 0; margin-bottom: var(--space-md); }

.cast-member {
    text-align: center;
}
.cast-member img {
    width: 80px; /* Size for cast images */
    height: 80px;
    border-radius: 50%;
    object-fit: cover;
    margin: 0 auto var(--space-xs);
    border: 1px solid var(--color-border);
}
.cast-name {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-base);
    margin-bottom: 0;
}
.cast-character {
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
    margin-bottom: 0;
}

/* Related Media / Reviews */
.detail-reviews-section,
.media-carousel-section.card { /* Style related section like a card */
    padding: var(--space-lg);
    margin-bottom: var(--space-xl);
}
.detail-reviews-section h3,
.media-carousel-section.card h3 {
    margin-top: 0;
    margin-bottom: var(--space-md);
}

/* Responsive Adjustments */
@media (max-width: 768px) {
    .backdrop-image { height: 250px; }
    .detail-content { margin-top: -60px; }
    .detail-main-info { flex-direction: column; align-items: center; text-align: center; }
    .detail-poster { flex-basis: auto; width: 180px; margin-top: -80px; /* Adjust pull-up */ }
    .detail-text { padding-top: 0; width: 100%; }
    .detail-text h1 { font-size: 1.8rem; color: var(--color-text-heading); text-shadow: none; margin-top: var(--space-md); }
    .detail-subtitle { color: var(--color-text-light); text-shadow: none; }
    .detail-meta { justify-content: center; color: var(--color-text-light); }
    .detail-meta .tag { background-color: var(--color-bg-button-secondary); color: var(--color-text-light); border: 1px solid var(--color-border); }
}

@media (max-width: 480px) {
     .backdrop-image { height: 200px; }
     .detail-content { margin-top: -50px; }
     .detail-poster { width: 150px; margin-top: -60px; }
     .detail-text h1 { font-size: 1.5rem; }
     .metadata-grid { grid-template-columns: 1fr; } /* Stack metadata */
}
```

### _searchResults.css

```css
/* public/css/pages/_searchResults.css */
.search-results-page {
    padding-top: var(--space-lg);
}

.search-title {
    margin-bottom: var(--space-xl);
    font-size: var(--font-size-h2);
    text-align: center;
}
.search-title strong {
    color: var(--color-primary);
}

.results-category {
    margin-bottom: var(--space-xl);
}

.category-title {
    font-size: var(--font-size-h3);
    margin-bottom: var(--space-md);
    border-bottom: 1px solid var(--color-divider);
    padding-bottom: var(--space-sm);
}

.results-grid {
    display: grid;
    /* Responsive columns */
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: var(--space-lg);
}

/* Adjust card styles slightly for grid */
.results-grid .media-card .card-title {
    font-size: 0.9rem; /* Smaller title in grid */
}
.results-grid .media-card .card-subtitle {
    font-size: 0.75rem;
}
.results-grid .media-card .card-info {
    padding: var(--space-xs) var(--space-sm) var(--space-sm);
}

.placeholder-text.no-results {
    margin-top: var(--space-xl);
    background-color: var(--color-bg-card);
    border-radius: var(--border-radius-md);
    padding: var(--space-xl);
    box-shadow: var(--shadow-sm);
}


@media (max-width: 600px) {
    .results-grid {
        grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
        gap: var(--space-md);
    }
}
@media (max-width: 400px) {
    .results-grid {
        grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
        gap: var(--space-sm);
    }
}
```

### _userProfile.css

```css
/* public/css/pages/_userProfile.css */

.profile-page {
    /* Container provides padding */
}

.profile-header {
    padding: 0; /* Remove default card padding */
    overflow: hidden; /* Contain banner */
    margin-bottom: var(--space-xl);
}

.profile-banner {
    height: 150px; /* Adjust banner height */
    background-color: var(--color-border); /* Placeholder */
    background-image: linear-gradient(to right, var(--color-primary), var(--color-accent)); /* Example gradient */
    background-size: cover;
    background-position: center;
}

.profile-info {
    display: flex;
    align-items: flex-end; /* Align items bottom */
    padding: 0 var(--space-lg) var(--space-lg);
    margin-top: -60px; /* Pull content up over banner */
    position: relative;
    gap: var(--space-lg);
}

.profile-picture {
    width: 120px;
    height: 120px;
    border-radius: 50%;
    border: 4px solid var(--color-bg-card);
    background-color: var(--color-bg-card); /* Ensure bg under image */
    object-fit: cover;
    flex-shrink: 0;
    box-shadow: var(--shadow-md);
}

.profile-details {
    flex-grow: 1;
    padding-bottom: var(--space-sm); /* Align text baseline */
}
.profile-details h2 {
    margin-bottom: var(--space-xs);
    font-size: var(--font-size-h2);
}
.member-since {
    font-size: var(--font-size-sm);
    color: var(--color-text-lighter);
    margin-bottom: var(--space-sm);
}

.profile-privacy {
    font-size: var(--font-size-sm);
    color: var(--color-text-light);
}
.profile-privacy select {
     padding: var(--space-xs);
     font-size: var(--font-size-sm);
     margin-left: var(--space-xs);
     margin-right: var(--space-xs);
     max-width: 100px;
}
.profile-privacy form { display: inline-flex; align-items: center; gap: var(--space-sm); }
.profile-privacy .status-message { padding: 0; margin: 0 0 0 var(--space-sm); background: none; border: none; }


.profile-actions {
    padding-bottom: var(--space-sm);
}


.profile-stats {
    display: flex;
    justify-content: space-around;
    padding: var(--space-md) var(--space-lg);
    border-top: 1px solid var(--color-divider);
    background-color: #f8f9fa; /* Slight bg tint */
    margin-top: var(--space-lg);
}
.stat-item {
    text-align: center;
}
.stat-value {
    display: block;
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-bold);
    color: var(--color-text-heading);
}
.stat-label {
    display: block;
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
    text-transform: uppercase;
}

/* Sections (Last Seen, Favorites, Lists) */
.profile-page .media-carousel-section {
     margin-bottom: var(--space-xl);
     /* Optional: Use card styling for sections */
     /* background-color: var(--color-bg-card); */
     /* padding: var(--space-lg); */
     /* border-radius: var(--border-radius-md); */
     /* box-shadow: var(--shadow-sm); */
}
.profile-page .section-title {
    font-size: var(--font-size-h3);
    margin-bottom: var(--space-md);
}

/* Responsive */
@media (max-width: 768px) {
    .profile-info {
        flex-direction: column;
        align-items: center;
        text-align: center;
        margin-top: -50px;
    }
    .profile-picture {
        width: 100px;
        height: 100px;
    }
    .profile-details {
        padding-bottom: 0;
    }
    .profile-actions {
        margin-top: var(--space-sm);
        width: 100%;
        display: flex;
        justify-content: center;
    }
    .profile-stats {
        flex-wrap: wrap;
        gap: var(--space-md);
    }
    .stat-item {
         flex-basis: calc(50% - var(--space-md)); /* Two columns */
    }
}

@media (max-width: 480px) {
     .profile-banner { height: 120px; }
     .profile-info { margin-top: -40px; }
     .profile-picture { width: 80px; height: 80px; }
     .profile-details h2 { font-size: var(--font-size-h3); }
     .stat-item { flex-basis: 100%; } /* Stack stats */
}
```

### _helpers.css

```css
/* Visually hide element but keep it accessible */
.sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
  }
  
  /* Hide element visually and from screen readers */
  .hidden {
      display: none !important;
  }
  
  /* Add more utility classes as needed, e.g., for text alignment, margins */
  .text-center { text-align: center; }
  /* etc. */
```

### main.js

```js
// public/js/main.js
(function () {
    'use strict';

    // --- Constants ---
    const API_BASE_URL = '/api';
    const TEMPLATE_BASE_URL = '/templates'; // URL for fetching partials

    // --- DOM Elements (Cached where possible) ---
    const body = document.body;
    const logoutBtn = document.getElementById('logoutBtn');

    // Modals
    const formModal = document.getElementById('formModal');
    const deleteConfirmModal = document.getElementById('deleteConfirmModal');

    // --- State ---
    let compiledTemplates = {}; // Cache for fetched Handlebars templates
    let itemToDelete = { id: null, type: null }; // Store ID and type (library/list/listItem) for delete confirmation
    let swiperInstances = []; // To manage Swiper carousels

    // --- Handlebars Setup & Helpers ---
    if (window.Handlebars) {
        // Register helpers (ensure these match server-side helpers)
        const helpers = {
            eq: (v1, v2) => v1 === v2,
            json: (context) => JSON.stringify(context),
            currentYear: () => new Date().getFullYear(),
            capitalize: (str) => (typeof str === 'string' && str.length > 0) ? str.charAt(0).toUpperCase() + str.slice(1) : str,
            formatYear: (dateValue) => { // Handle number or string date
                if (!dateValue) return '';
                if (typeof dateValue === 'number') return dateValue.toString(); // Assume it's already a year
                try {
                    const year = new Date(dateValue).getFullYear();
                    return isNaN(year) ? dateValue.match(/\d{4}/)?.[0] || '' : year;
                } catch {
                    return dateValue.match(/\d{4}/)?.[0] || ''; // Return original or YYYY if not parsable
                }
            },
            formatDate: (dateString) => dateString ? new Date(dateString).toLocaleDateString() : '',
            classify: (str) => typeof str === 'string' ? str.replace(/\s+/g, '-').toLowerCase() : '',
            defaultIfEmpty: (value, defaultValue) => value ?? defaultValue ?? '', // Use ?? for better null/undefined handling
            join: (arr, separator) => Array.isArray(arr) ? arr.join(separator) : '',
            truncate: (str, len) => (str && str.length > len) ? str.substring(0, len) + '...' : str,
            statusOutlineClass: (status) => { // Example implementation
                switch (status?.toLowerCase()) {
                    case 'completed': return 'outline-green';
                    case 'watching': case 'reading': case 'playing': return 'outline-blue';
                    case 'planned': return 'outline-red';
                    case 'paused': return 'outline-yellow';
                    case 'dropped': return 'outline-grey';
                    default: return '';
                }
            },
            renderStars: (rating, maxRating = 10) => {
                let starsHtml = '';
                const filledStars = Math.round(parseFloat(rating)); // Ensure number and round
                const safeMaxRating = parseInt(maxRating, 10) || 10;
                if (isNaN(filledStars)) return ''; // Return empty if rating is invalid

                for (let i = 1; i <= safeMaxRating; i++) {
                    starsHtml += `<span class="star ${i <= filledStars ? 'filled' : ''}">★</span>`;
                }
                return new Handlebars.SafeString(starsHtml); // Return SafeString
            },
             isOwner: (resourceOwnerId, loggedInUserId) => resourceOwnerId === loggedInUserId,
            // Add any other client-side specific helpers if needed
        };
        Object.keys(helpers).forEach(key => Handlebars.registerHelper(key, helpers[key]));

         // Helper to quickly generate a list for partials expecting arrays
         Handlebars.registerHelper('list', function() {
            return Array.from(arguments).slice(0, -1); // Exclude Handlebars options object
        });
    } else {
        console.warn('Handlebars runtime not found. Client-side templates may not work.');
    }

    // --- Utility Functions ---
    function showStatusMessage(elementId, message, type = 'info', duration = 3000) {
        const el = document.getElementById(elementId);
        if (!el) {
             // Fallback to global status if specific element not found
             const globalStatus = document.getElementById('globalStatus');
             if(globalStatus) {
                 globalStatus.textContent = message;
                 globalStatus.className = `status-message ${type}`;
                 globalStatus.classList.remove('hidden');
                 if (duration) {
                     setTimeout(() => globalStatus.classList.add('hidden'), duration);
                 }
             } else {
                 console.warn(`Status element #${elementId} not found.`);
             }
             return;
        }
        el.textContent = message;
        el.className = `status-message ${type}`; // Use classes for styling
        el.classList.remove('hidden');
        // Ensure empty messages are hidden immediately
        if (!message) {
             el.classList.add('hidden');
             return;
        }
        if (duration) {
            setTimeout(() => el.classList.add('hidden'), duration);
        }
    }

    function showSpinner(spinnerId, show = true) {
        document.getElementById(spinnerId)?.classList.toggle('hidden', !show);
    }

    // Simplified API request function
    async function apiRequest(endpoint, method = 'GET', body = null) {
        const url = `${API_BASE_URL}${endpoint}`;
        const options = {
            method,
            headers: {
                'Accept': 'application/json'
                // Cookies are sent automatically
            },
        };
        if (body) {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(body);
        }

        try {
            console.log(`API Request: ${method} ${url}`, body ? 'with body' : ''); // Log request start
            const response = await fetch(url, options);
            console.log(`API Response Status: ${response.status} for ${method} ${url}`); // Log response status

            // Handle 204 No Content specifically
            if (response.status === 204) {
                console.log('API Response: 204 No Content');
                return {}; // Return empty object for success
            }

            const responseData = await response.json();
             console.log(`API Response Data for ${method} ${url}:`, responseData); // Log response data

            if (!response.ok) {
                 const error = new Error(responseData.message || `HTTP error ${response.status}`);
                 error.status = response.status;
                 error.data = responseData;
                 throw error;
            }
            return responseData;
        } catch (error) {
            console.error(`API Request Error (${method} ${url}):`, error);
            const message = error.data?.message || error.message || 'An unknown API error occurred.';
             showStatusMessage('globalStatus', message, 'error', 5000); // Display error globally

            // Handle critical auth errors
            if (error.status === 401) {
                 showStatusMessage('globalStatus', 'Authentication error. Redirecting to login...', 'error', 5000);
                 setTimeout(() => { window.location.href = '/login?errorMessage=Session expired. Please login again.'; }, 1500);
            }
            throw error; // Re-throw for calling function to handle locally
        }
    }

     // Function to fetch and compile Handlebars template
    async function getTemplate(templateName) {
        if (compiledTemplates[templateName]) {
            return compiledTemplates[templateName];
        }
        try {
            // Use the server route to fetch partials
            const response = await fetch(`${TEMPLATE_BASE_URL}/${templateName}`); // Fetch WITHOUT .hbs extension now based on viewRoutes change
            if (!response.ok) {
                throw new Error(`Failed to fetch template: ${templateName} (${response.status})`);
            }
            const templateString = await response.text();
            if (!window.Handlebars) throw new Error("Handlebars runtime missing");
            compiledTemplates[templateName] = Handlebars.compile(templateString);
            return compiledTemplates[templateName];
        } catch (error) {
            console.error(`Error loading template ${templateName}:`, error);
            showStatusMessage('globalStatus', `Error loading UI template ${templateName}.`, 'error');
            return null;
        }
    }

    // --- Modal Handling ---
    function openModal(modalElement, contentHTML = '', modalClass = '') {
        if (!modalElement) return;
        const contentArea = modalElement.querySelector('.modal-content-area') || modalElement.querySelector('#modalContentArea');
         if (contentArea && contentHTML) {
             contentArea.innerHTML = contentHTML;
         }
         // Clear previous specific classes before adding new one
         modalElement.className = modalElement.className.replace(/modal-[\w-]+/g, '');
         if (modalClass) modalElement.classList.add(modalClass);

        modalElement.classList.remove('hidden');
        body.classList.add('modal-open'); // Prevent background scrolling
    }

    function closeModal(modalElement) {
        if (!modalElement) return;
        modalElement.classList.add('hidden');
        modalElement.className = modalElement.className.replace(/modal-[\w-]+/g, ''); // Remove specific modal classes
         const contentArea = modalElement.querySelector('.modal-content-area') || modalElement.querySelector('#modalContentArea');
         if (contentArea) {
             contentArea.innerHTML = ''; // Clear content
         }
          body.classList.remove('modal-open');
    }

    // --- Swiper Initialization ---
    function initSwipers() {
        // Destroy existing instances first
        swiperInstances.forEach(swiper => swiper.destroy(true, true));
        swiperInstances = [];

        // Initialize all carousels on the page
        document.querySelectorAll('.swiper').forEach(element => {
             const config = {
                loop: false,
                slidesPerView: 'auto',
                spaceBetween: 15,
                 navigation: {
                    nextEl: element.querySelector('.swiper-button-next'),
                    prevEl: element.querySelector('.swiper-button-prev'),
                },
                 pagination: {
                    el: element.querySelector('.swiper-pagination'),
                    clickable: true,
                },
                // Default breakpoints for media/list carousels
                 breakpoints: {
                    600: { slidesPerView: 3, spaceBetween: 15 },
                    800: { slidesPerView: 4, spaceBetween: 20 },
                    1024: { slidesPerView: 5, spaceBetween: 20 },
                    1200: { slidesPerView: 6, spaceBetween: 25 },
                 },
            };

            // Specific config for cast
            if (element.classList.contains('cast-swiper')) {
                 config.slidesPerView = 3; // Start mobile with more cast visible
                 config.breakpoints = {
                    640: { slidesPerView: 4, spaceBetween: 15 },
                    768: { slidesPerView: 5, spaceBetween: 15 },
                    1024: { slidesPerView: 7, spaceBetween: 20 },
                 };
            }

            try {
                 const swiper = new Swiper(element, config);
                 swiperInstances.push(swiper);
            } catch (e) {
                console.error("Failed to initialize Swiper for element:", element, e);
            }
        });
         // console.log("Swipers Initialized:", swiperInstances.length);
    }


     // --- Specific Action Handlers ---

     // Add/Edit Library Item (uses Modal)
     async function openLibraryItemFormModal(mode = 'add', itemData = {}) {
         const template = await getTemplate('itemFormModal');
         if (!template || !formModal) return;

         const isAddMode = mode === 'add';
         const context = {
             mode: mode,
             modalTitle: isAddMode ? `Add "${itemData.title}" to Library` : `Edit "${itemData.title}"`,
             submitButtonText: isAddMode ? 'Add to Library' : 'Save Changes',
             item: {
                 ...itemData,
                 libraryItemId: isAddMode ? null : itemData.id, // Use DB id for edit
             }
         };
         openModal(formModal, template(context), 'modal-library-item');
     }

     // Handle Library Item Form Submission (from Modal)
     async function handleLibraryItemFormSubmit(event) {
        event.preventDefault();
        const form = event.target;
        if (form.id !== 'libraryItemForm') return;

        const mode = form.dataset.mode;
        const libraryItemId = form.dataset.libraryItemId || form.dataset.itemId; // Get DB ID for edits (check both dataset attributes)
        const modalErrorEl = form.querySelector('.modal-error-message');
        modalErrorEl?.classList.add('hidden');
        showSpinner('modalSpinner', true);

        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        const payload = {
            ...(mode === 'add' && {
                mediaType: data.mediaType,
                mediaId: data.mediaId,
                title: data.title,
                imageUrl: data.imageUrl,
                releaseYear: data.releaseYear
            }),
            userStatus: data.userStatus,
            userRating: data.userRating || null,
            isFavorite: data.isFavorite === 'true',
            userNotes: data.userNotes,
        };

        try {
            let result;
            let message = '';
            if (mode === 'add') {
                result = await apiRequest('/library', 'POST', payload);
                message = `"${result.title}" added to library!`;
                 if (document.querySelector('.media-detail-page')) {
                    updateInteractionControls(result); // Update controls if on detail page
                }
            } else { // mode === 'edit'
                 if (!libraryItemId) throw new Error("Cannot edit item without library ID.");
                result = await apiRequest(`/library/${libraryItemId}`, 'PUT', payload);
                 message = `"${result.title}" updated in library!`;
                  if (document.querySelector('.media-detail-page')) {
                    updateInteractionControls(result);
                 }
            }
            showStatusMessage('globalStatus', message, 'success');
            closeModal(formModal);

            // Reload if on a page that needs updated lists (Home, Profile)
            if (window.location.pathname === '/' || window.location.pathname.startsWith('/profile')) {
                 setTimeout(() => window.location.reload(), 500); // Short delay before reload
            }


        } catch (error) {
            const message = error.data?.message || error.message || 'Operation failed.';
            if (modalErrorEl) {
                modalErrorEl.textContent = message;
                modalErrorEl.classList.remove('hidden');
            } else {
                 showStatusMessage('globalStatus', message, 'error');
            }
        } finally {
             showSpinner('modalSpinner', false);
        }
     }

     // Remove Item From Library Confirmation Setup
     function handleRemoveFromLibrary(libraryItemId, title) {
        if (!libraryItemId) {
            console.error("Remove failed: libraryItemId is missing.");
            showStatusMessage('interactionStatus', 'Error: Cannot identify item to remove.', 'error');
            return;
        }
        console.log(`Setting up removal for Library Item ID: ${libraryItemId}, Title: ${title}`); // Debug log
        itemToDelete = { id: libraryItemId, type: 'library', title: title };
        const messageEl = deleteConfirmModal?.querySelector('#deleteConfirmMessage');
        if (messageEl) {
            messageEl.textContent = `Are you sure you want to remove "${title}" from your library?`;
        }
        openModal(deleteConfirmModal);
    }



    // Update Interaction Controls on Detail Page (after Add/Update/Remove)
    function updateInteractionControls(libraryItemData = null) {
        const controls = document.querySelector('.user-interaction-controls');
        if (!controls) return;

        const isAdded = !!libraryItemData; // Item exists in library
        console.log(`Updating controls. Is Added: ${isAdded}`, libraryItemData); // Debug log

        controls.dataset.libraryItemId = isAdded ? libraryItemData.id : '';

        const statusSelect = controls.querySelector('#detailStatusSelect');
        const ratingInput = controls.querySelector('#detailRatingInput');
        const favoriteToggle = controls.querySelector('#detailFavoriteToggle');
        const notesInput = controls.querySelector('#detailNotesInput');
        const addButton = controls.querySelector('.add-to-library-btn');
        const updateButton = controls.querySelector('button[type="submit"]'); // Assumes submit is update
        const removeButton = controls.querySelector('.remove-from-library-btn');

        // **Always keep controls enabled now for pre-add editing**
        // Only disable if explicitly needed, perhaps after removal? For now, keep enabled.
        // [statusSelect, ratingInput, favoriteToggle, notesInput].forEach(el => { if(el) el.disabled = !isAdded; });

        if (isAdded) {
            // Populate values
            statusSelect.value = libraryItemData.userStatus || 'planned';
            ratingInput.value = libraryItemData.userRating || '';
            favoriteToggle.checked = libraryItemData.isFavorite || false;
            notesInput.value = libraryItemData.userNotes || '';
        } else {
            // Clear values when removed (or not added)
            statusSelect.value = 'planned'; // Default to planned
            ratingInput.value = '';
            favoriteToggle.checked = false;
            notesInput.value = '';
        }

        // Toggle button visibility
        addButton?.classList.toggle('hidden', isAdded);
        updateButton?.classList.toggle('hidden', !isAdded);
        removeButton?.classList.toggle('hidden', !isAdded);

        // Clear any previous status message in the interaction area
        showStatusMessage('interactionStatus', '', 'info', 0);
    }


    // Handle interaction form submission (UPDATE) on Detail Page
    async function handleInteractionFormSubmit(event) {
        event.preventDefault();
        const form = event.target;
        if (form.id !== 'mediaInteractionForm') return;

        const controls = form.closest('.user-interaction-controls');
        const libraryItemId = controls?.dataset.libraryItemId;

        // This function is ONLY for updates, not adds
        if (!libraryItemId) {
            console.error("Update aborted: library item ID is missing. Was item added first?");
            showStatusMessage('interactionStatus', 'Error: Item must be added before updating.', 'error');
            return;
        }

        showSpinner('interactionSpinner', true);
        showStatusMessage('interactionStatus', '', 'info', 0);

        const formData = new FormData(form);
        const payload = {
           userStatus: formData.get('userStatus'),
           userRating: formData.get('userRating') || null,
           isFavorite: formData.get('isFavorite') === 'true',
           userNotes: formData.get('userNotes'),
       };

       try {
            const result = await apiRequest(`/library/${libraryItemId}`, 'PUT', payload);
            showStatusMessage('interactionStatus', 'Library item updated!', 'success', 2000);
            // Update controls with the latest data returned from API
            updateInteractionControls(result);
       } catch (error) {
            const message = error.data?.message || error.message || 'Failed to update library item.';
            showStatusMessage('interactionStatus', message, 'error', 4000);
       } finally {
            showSpinner('interactionSpinner', false);
       }
   }

    // Handle "Add to Library" button click on Detail Page (Refactored)
    async function handleAddToLibraryClick(event) {
        const button = event.target;
        const controls = button.closest('.user-interaction-controls');
        const form = controls?.querySelector('#mediaInteractionForm');
        const { mediaType, mediaId } = controls.dataset;

        // --- Validation ---
        const statusSelect = controls.querySelector('#detailStatusSelect');
        if (!statusSelect || !statusSelect.value) {
            showStatusMessage('interactionStatus', 'Status is required to add item.', 'error', 4000);
            statusSelect?.focus(); // Focus the status dropdown
            return; // Stop the process
        }

        showSpinner('interactionSpinner', true);
        showStatusMessage('interactionStatus', 'Adding...', 'info', 0);

        try {
            // Get core details stored on the controls/form element (add these in viewRoutes/hbs)
            const title = controls.dataset.title;
            const imageUrl = controls.dataset.imageUrl;
            const releaseYear = controls.dataset.releaseYear;

            if (!title || !mediaType || !mediaId) {
                 throw new Error("Missing core media details (title, type, id) needed to add.");
            }

            // Get current interaction values from the form controls
            const formData = new FormData(form);
            const payload = {
                mediaType: mediaType,
                mediaId: mediaId,
                title: title,
                imageUrl: imageUrl || null, // Handle potentially missing image
                releaseYear: releaseYear || null, // Handle potentially missing year
                // Use values directly from the form
                userStatus: formData.get('userStatus'), // Already validated above
                userRating: formData.get('userRating') || null,
                isFavorite: formData.get('isFavorite') === 'true',
                userNotes: formData.get('userNotes') || '',
            };

            const result = await apiRequest('/library', 'POST', payload);
            showStatusMessage('interactionStatus', 'Added to library!', 'success', 2000);
            updateInteractionControls(result); // Update controls to reflect added state

        } catch (error) {
             const message = error.data?.message || error.message || 'Failed to add item.';
             showStatusMessage('interactionStatus', message, 'error', 4000);
        } finally {
             showSpinner('interactionSpinner', false);
        }
   }

     // Handle Profile Privacy Form Submission
    async function handlePrivacyFormSubmit(event) {
        event.preventDefault();
        const form = event.target;
        if (form.id !== 'privacyForm') return;
        const saveButton = form.querySelector('button[type="submit"]');
        saveButton.disabled = true; // Prevent double submit
        showStatusMessage('privacyStatus', 'Saving...', 'info', 0);

        const formData = new FormData(form);
        const payload = { profilePrivacy: formData.get('profilePrivacy') };
        try {
            await apiRequest('/profile/me', 'PUT', payload);
            showStatusMessage('privacyStatus', 'Privacy updated!', 'success');
        } catch (error) {
             const message = error.data?.message || error.message || 'Failed to update privacy.';
             showStatusMessage('privacyStatus', message, 'error');
        } finally {
             saveButton.disabled = false;
        }
    }

    // Handle List Creation (Show Modal)
    async function handleCreateListClick() {
         // Using getTemplate might be overkill for a simple form, but good for consistency
         // const template = await getTemplate('listFormModal'); // If you create such a partial
         // if (!template) return;
         // const context = { mode: 'create', modalTitle: 'Create New List', submitButtonText: 'Create List', list: {} };
         // openModal(formModal, template(context), 'modal-list-form');

         // Or simpler inline HTML:
         const formHTML = `
            <button class="modal-close-btn" aria-label="Close">×</button>
            <h2>Create New List</h2>
            <form id="listForm" data-mode="create">
                <div class="form-group"> <label for="listTitle">List Title:</label> <input type="text" id="listTitle" name="title" required> </div>
                <div class="form-group"> <label for="listDescription">Description (Optional):</label> <textarea id="listDescription" name="description" rows="3"></textarea> </div>
                <div class="form-group"> <label for="listIsPublic">Visibility:</label> <select id="listIsPublic" name="isPublic"><option value="false">Private</option><option value="true">Public</option></select> </div>
                <div class="form-group"> <label for="listCoverImageUrl">Cover Image URL (Optional):</label> <input type="url" id="listCoverImageUrl" name="coverImageUrl"> </div>
                <div class="modal-actions"> <button type="button" class="btn btn-secondary modal-cancel-btn">Cancel</button> <button type="submit" class="btn btn-primary">Create List</button> <div id="modalSpinner" class="spinner hidden"></div> </div>
                <p class="modal-error-message hidden"></p>
            </form>
         `;
         openModal(formModal, formHTML, 'modal-list-form');
    }

    // Handle List Edit (Show Modal with prefilled data)
    async function handleEditListClick(event) {
         const button = event.target.closest('.edit-list-btn');
         const listId = button?.dataset.listId;
         if (!listId) return;

         openModal(formModal, '<div class="spinner"></div> Loading list details...', 'modal-list-form'); // Show loading state

          try {
             const listData = await apiRequest(`/lists/${listId}`); // Fetch list data
             // const template = await getTemplate('listFormModal'); // Use template if exists
             // const context = { mode: 'edit', modalTitle: 'Edit List', submitButtonText: 'Save Changes', list: listData };
             // const formHTML = template(context);

             // Simple inline HTML version:
             const formHTML = `
                <button class="modal-close-btn" aria-label="Close">×</button>
                <h2>Edit List</h2>
                <form id="listForm" data-mode="edit" data-list-id="${listId}">
                    <div class="form-group"><label for="listTitle">List Title:</label><input type="text" id="listTitle" name="title" required value="${listData.title || ''}"></div>
                    <div class="form-group"><label for="listDescription">Description (Optional):</label><textarea id="listDescription" name="description" rows="3">${listData.description || ''}</textarea></div>
                    <div class="form-group"><label for="listIsPublic">Visibility:</label><select id="listIsPublic" name="isPublic"><option value="false" ${!listData.isPublic ? 'selected' : ''}>Private</option><option value="true" ${listData.isPublic ? 'selected' : ''}>Public</option></select></div>
                    <div class="form-group"><label for="listCoverImageUrl">Cover Image URL (Optional):</label><input type="url" id="listCoverImageUrl" name="coverImageUrl" value="${listData.coverImageUrl || ''}"></div>
                    <div class="modal-actions"><button type="button" class="btn btn-secondary modal-cancel-btn">Cancel</button><button type="submit" class="btn btn-primary">Save Changes</button><div id="modalSpinner" class="spinner hidden"></div></div>
                    <p class="modal-error-message hidden"></p>
                </form>
             `;

              const contentArea = formModal.querySelector('#modalContentArea');
              if(contentArea) contentArea.innerHTML = formHTML;
              else closeModal(formModal); // Close if content area isn't found

          } catch (error) {
               const message = error.data?.message || error.message || 'Failed to load list data.';
                const contentArea = formModal.querySelector('#modalContentArea');
                if(contentArea) contentArea.innerHTML = `<p class="error-message">${message}</p><button class="modal-close-btn" aria-label="Close">×</button>`;
                else showStatusMessage('globalStatus', message, 'error'); // Fallback if modal isn't open/valid
          }
    }


     // Handle List Form Submission (Create/Edit)
     async function handleListFormSubmit(event) {
         event.preventDefault();
         const form = event.target;
         if (form.id !== 'listForm') return;

         const mode = form.dataset.mode;
         const listId = form.dataset.listId; // Only for edit mode
         const modalErrorEl = form.querySelector('.modal-error-message');
         modalErrorEl?.classList.add('hidden');
         showSpinner('modalSpinner', true);

         const formData = new FormData(form);
         const payload = Object.fromEntries(formData.entries());
         payload.isPublic = payload.isPublic === 'true';

         try {
             let result;
             let message = '';
             if (mode === 'create') {
                 result = await apiRequest('/lists', 'POST', payload);
                 message = `List "${result.title}" created!`;
             } else { // mode === 'edit'
                  if (!listId) throw new Error("Missing list ID for edit.");
                 result = await apiRequest(`/lists/${listId}`, 'PUT', payload);
                 message = `List "${result.title}" updated!`;
             }
              showStatusMessage('globalStatus', message, 'success');
              closeModal(formModal);
              // Reload overview page for simplicity
              if (window.location.pathname === '/lists') {
                 setTimeout(() => window.location.reload(), 500);
              }

         } catch (error) {
            const message = error.data?.message || error.message || 'Operation failed.';
            if (modalErrorEl) {
                modalErrorEl.textContent = message;
                modalErrorEl.classList.remove('hidden');
            } else {
                 showStatusMessage('globalStatus', message, 'error');
            }
         } finally {
              showSpinner('modalSpinner', false);
         }
     }

    // Handle Delete List Confirmation
    function handleDeleteListClick(event) {
        const button = event.target.closest('.delete-list-btn');
        const listId = button?.dataset.listId;
        const listTitle = button?.dataset.listTitle || 'this list';
        if (!listId) return;

        itemToDelete = { id: listId, type: 'list', title: listTitle };
        const messageEl = deleteConfirmModal?.querySelector('#deleteConfirmMessage');
        if (messageEl) {
            messageEl.textContent = `Are you sure you want to delete the list "${listTitle}"? This cannot be undone.`;
        }
        openModal(deleteConfirmModal);
    }

     // Handle Add Item to List Form Submission
     async function handleAddToListFormSubmit(event) {
         event.preventDefault();
         const form = event.target;
         if (form.id !== 'addToListForm') return;

         const statusEl = form.querySelector('#addItemStatus');
         statusEl.textContent = 'Adding...';
         statusEl.className = 'status-message info';
         statusEl.classList.remove('hidden');

         const formData = new FormData(form);
         const listId = formData.get('listId');
         const payload = {
            libraryItemId: formData.get('libraryItemId'),
            userComment: formData.get('userComment')
         };

         if(!payload.libraryItemId) {
             statusEl.textContent = 'Library Item ID is required.';
             statusEl.className = 'status-message error';
             return;
         }


         try {
             const result = await apiRequest(`/lists/${listId}/items`, 'POST', payload);
             statusEl.textContent = `"${result.title}" added to list!`;
             statusEl.className = 'status-message success';
              form.reset(); // Clear form
              // Reload page for simplicity for now
              setTimeout(() => window.location.reload(), 1500);
         } catch (error) {
             const message = error.data?.message || error.message || 'Failed to add item.';
             statusEl.textContent = message;
              statusEl.className = 'status-message error';
         } finally {
              // Hide status message after delay?
              setTimeout(() => statusEl.classList.add('hidden'), 5000);
         }
     }

     // Handle Remove Item from List Click
     function handleRemoveListItemClick(event) {
          const button = event.target.closest('.remove-list-item-btn');
          const listItemRow = button?.closest('.list-item-row');
          // Get listId from the parent section/container, assuming it's set there
          const listId = listItemRow?.closest('.list-items-section')?.dataset.listId || document.body.dataset.listId; // Check body dataset as fallback
          const listItemId = listItemRow?.dataset.listItemId;
          const itemTitle = listItemRow?.querySelector('.col-title a')?.textContent || 'this item';

          if (!listId || !listItemId) {
              console.error("Could not determine listId or listItemId for removal.");
              showStatusMessage('globalStatus', 'Error: Could not identify item to remove.', 'error');
              return;
          }

          itemToDelete = { id: listItemId, type: 'listItem', title: itemTitle, listId: listId };
          const messageEl = deleteConfirmModal?.querySelector('#deleteConfirmMessage');
          if (messageEl) {
              messageEl.textContent = `Are you sure you want to remove "${itemTitle}" from this list?`;
          }
          openModal(deleteConfirmModal);
     }

     // Handle Edit List Item Comment Click
     function handleEditListItemCommentClick(event) {
        const button = event.target.closest('.edit-list-item-comment-btn');
        const listItemRow = button?.closest('.list-item-row');
        const editForm = listItemRow?.querySelector('.edit-comment-form');
        const commentDisplay = listItemRow?.querySelector('.col-comment');

        if (!listItemRow || !editForm || !commentDisplay) return;

        // Hide other edit forms in the table first
         listItemRow.closest('.list-items-table')?.querySelectorAll('.edit-comment-form:not(.hidden)')
             .forEach(form => handleCancelEditListItemCommentClick({ target: form.querySelector('.cancel-edit-comment-btn') }));


        commentDisplay.classList.add('hidden');
        editForm.classList.remove('hidden');
        button.classList.add('hidden');
        listItemRow.querySelector('.remove-list-item-btn')?.classList.add('hidden');
        editForm.querySelector('input[name="userComment"]')?.focus();
     }

      // Handle Cancel Edit List Item Comment Click
     function handleCancelEditListItemCommentClick(event) {
         const button = event.target.closest('.cancel-edit-comment-btn') || event.target.closest('.edit-comment-form'); // Allow triggering from form itself
         const listItemRow = button?.closest('.list-item-row');
         const editForm = listItemRow?.querySelector('.edit-comment-form');
         const commentDisplay = listItemRow?.querySelector('.col-comment');

         if (!listItemRow || !editForm || !commentDisplay) return;

         editForm.classList.add('hidden');
         commentDisplay.classList.remove('hidden');
         listItemRow.querySelector('.edit-list-item-comment-btn')?.classList.remove('hidden');
         listItemRow.querySelector('.remove-list-item-btn')?.classList.remove('hidden');
     }


     // Handle List Item Comment Form Submission
     async function handleListItemCommentFormSubmit(event) {
        event.preventDefault();
        const form = event.target;
        if (!form.classList.contains('edit-comment-form')) return;

        const listItemRow = form.closest('.list-item-row');
        // Get listId from the parent section/container
        const listId = listItemRow?.closest('.list-items-section')?.dataset.listId || document.body.dataset.listId;
        const listItemId = listItemRow?.dataset.listItemId;
        const commentInput = form.querySelector('input[name="userComment"]');
        const commentDisplay = listItemRow?.querySelector('.col-comment');
        const originalComment = commentDisplay?.textContent;

        if (!listId || !listItemId || !commentInput || !commentDisplay) return;

        const payload = { userComment: commentInput.value };
        commentDisplay.textContent = 'Saving...';
        commentDisplay.classList.remove('hidden'); // Make sure display is visible while saving
        form.classList.add('hidden'); // Hide form while saving

        try {
            const result = await apiRequest(`/lists/${listId}/items/${listItemId}`, 'PUT', payload);
            commentDisplay.textContent = result.userComment || '---';
            // Reset view (show buttons etc)
            handleCancelEditListItemCommentClick({ target: form }); // Pass form to reset its row
         } catch (error) {
             const message = error.data?.message || error.message || 'Failed to save comment.';
             console.error("Comment save error:", message);
             commentDisplay.textContent = originalComment;
             alert(`Error: ${message}`); // Simple alert
             handleCancelEditListItemCommentClick({ target: form });
         }
     }



    // Handle Delete Confirmation Logic
    async function handleDeleteConfirm() {
        if (!itemToDelete.id || !itemToDelete.type) return;

        const { id, type, listId } = itemToDelete;
        let apiUrl = '';
        let successMessage = '';
        let elementToRemoveSelector = null;

        showSpinner('deleteSpinner', true);
        const confirmBtn = deleteConfirmModal?.querySelector('#deleteConfirmBtn');
        if(confirmBtn) confirmBtn.disabled = true;

        try {
            switch(type) {
                case 'library':
                    apiUrl = `/library/${id}`;
                    successMessage = 'Item removed from library.';
                     if (document.querySelector('.media-detail-page')) {
                         updateInteractionControls(null); // Pass null to reset controls
                     }
                    break;
                case 'list':
                    apiUrl = `/lists/${id}`;
                    successMessage = 'List deleted successfully.';
                    elementToRemoveSelector = `.list-summary-row[data-list-id="${id}"]`;
                    break;
                case 'listItem':
                    if (!listId) throw new Error("Missing listId for listItem deletion");
                    apiUrl = `/lists/${listId}/items/${id}`;
                    successMessage = 'Item removed from list.';
                    elementToRemoveSelector = `.list-item-row[data-list-item-id="${id}"]`;
                    break;
                default:
                     throw new Error("Invalid delete type");
            }

            await apiRequest(apiUrl, 'DELETE');
            showStatusMessage('globalStatus', successMessage, 'success');
            closeModal(deleteConfirmModal);

            if (elementToRemoveSelector) {
                document.querySelector(elementToRemoveSelector)?.remove();
            }

            // Reload if on profile page after deleting library item (simplest way to update carousels)
            if (type === 'library' && window.location.pathname.startsWith('/profile')) {
                 setTimeout(() => window.location.reload(), 500);
            }

        } catch (error) {
             const message = error.data?.message || error.message || 'Deletion failed.';
             showStatusMessage('globalStatus', message, 'error');
             closeModal(deleteConfirmModal);
        } finally {
            itemToDelete = { id: null, type: null }; // Reset
            showSpinner('deleteSpinner', false);
            if(confirmBtn) confirmBtn.disabled = false;
        }
    }

    // --- Global Event Listeners ---
    function setupGlobalListeners() {
         // Logout Button
        logoutBtn?.addEventListener('click', async () => {
            try {
                showStatusMessage('globalStatus', 'Logging out...', 'info', 0);
                await apiRequest('/auth/logout', 'POST');
                showStatusMessage('globalStatus', 'Logout successful. Redirecting...', 'success');
                window.location.href = '/login';
            } catch (error) {
                 showStatusMessage('globalStatus', 'Logout failed.', 'error');
            }
        });

         // Modal generic close/cancel buttons
        formModal?.addEventListener('click', (event) => {
            if (event.target.matches('.modal-close-btn') || event.target.matches('.modal-cancel-btn') || event.target === formModal) {
                closeModal(formModal);
            }
        });
         deleteConfirmModal?.addEventListener('click', (event) => {
             if (event.target.matches('.modal-close-btn') || event.target.matches('.modal-cancel-btn') || event.target === deleteConfirmModal) {
                 closeModal(deleteConfirmModal);
                 itemToDelete = { id: null, type: null }; // Reset on cancel
             } else if (event.target.matches('#deleteConfirmBtn')) {
                 handleDeleteConfirm();
             }
         });

         // Modal Form Submissions (Delegated)
         formModal?.addEventListener('submit', (event) => {
             if (event.target.id === 'libraryItemForm') {
                 handleLibraryItemFormSubmit(event);
             } else if (event.target.id === 'listForm') {
                 handleListFormSubmit(event);
             }
         });

         // Add global status message area if needed (keep this)
         if (!document.getElementById('globalStatus')) {
            const statusDiv = document.createElement('div');
            statusDiv.id = 'globalStatus';
            statusDiv.className = 'status-message hidden';
            statusDiv.setAttribute('aria-live', 'polite');
            document.body.appendChild(statusDiv);
        }

    }

     // --- Page Specific Initializations / Listeners ---
     function initializePage() {
         const path = window.location.pathname;
         const pathParts = path.split('/').filter(p => p); // Filter out empty parts

         // Initialize Swipers on relevant pages
         if (path === '/' || path.startsWith('/profile') || path.startsWith('/media/')) {
             initSwipers();
         }

         // Homepage specific listeners
         if (path === '/') {
             document.querySelector('.horizontal-nav')?.addEventListener('click', (event) => {
                 if (event.target.matches('.nav-item')) {
                     const filter = event.target.dataset.filter;
                     console.log("Homepage Filter selected:", filter); // Implement filtering logic here
                     document.querySelectorAll('.horizontal-nav .nav-item').forEach(el => el.classList.remove('active'));
                     event.target.classList.add('active');
                 }
             });
         }

         // Login Page Listeners
         if (path === '/login') {
            const loginForm = document.getElementById('loginForm');
            const registerForm = document.getElementById('registerForm');

            if (loginForm) {
                console.log("Attaching listener to login form");
                loginForm.addEventListener('submit', handleLogin);
            } else {
                 console.log("Login form not found on page /login");
            }
            if (registerForm) {
                console.log("Attaching listener to register form");
                registerForm.addEventListener('submit', handleRegister);
            } else {
                 console.log("Register form not found on page /login");
            }
         }

         // Media Detail Page listeners
         if (path.startsWith('/media/') && pathParts.length === 3) {
            const controls = document.querySelector('.user-interaction-controls');
            if (controls) {
                // Attach form submit listener (handles UPDATE)
                const interactionForm = controls.querySelector('#mediaInteractionForm');
                interactionForm?.addEventListener('submit', handleInteractionFormSubmit);

                // Attach delegated click listener to controls container
                controls.addEventListener('click', (event) => {
                     // Handle ADD button click
                     if (event.target.matches('.add-to-library-btn')) {
                         console.log("Add to Library button clicked"); // Debug log
                         handleAddToLibraryClick(event);
                     }
                     // Handle REMOVE button click
                     else if (event.target.matches('.remove-from-library-btn')) {
                          const libraryItemId = controls.dataset.libraryItemId;
                          const title = controls.dataset.title || 'this item'; // Get title from dataset
                          console.log(`Remove button clicked, libraryItemId: ${libraryItemId}`); // Debug log
                          if (libraryItemId) {
                              handleRemoveFromLibrary(libraryItemId, title);
                          } else {
                              console.error("Remove button clicked, but libraryItemId is missing from dataset.");
                              showStatusMessage('interactionStatus', 'Error: Cannot identify item to remove.', 'error');
                          }
                     }
                });
                
            } else {
                 console.log("User interaction controls not found on media detail page.");
            }
        }

          // Profile Page listeners
          if (path.startsWith('/profile')) {
             const privacyForm = document.getElementById('privacyForm');
             privacyForm?.addEventListener('submit', handlePrivacyFormSubmit);
         }

         // Lists Overview Page listeners
         if (path === '/lists') {
             const createBtn = document.getElementById('createListBtn');
             createBtn?.addEventListener('click', handleCreateListClick);

             const listsContainer = document.querySelector('.lists-container');
             listsContainer?.addEventListener('click', (event) => {
                  if (event.target.closest('.edit-list-btn')) {
                      handleEditListClick(event);
                  } else if (event.target.closest('.delete-list-btn')) {
                      handleDeleteListClick(event);
                  }
             });
         }

         // List Detail Page listeners
         if (path.startsWith('/lists/') && pathParts.length === 2) { // Check for /lists/:id pattern
             const listDetailContainer = document.querySelector('.list-detail-page');
             const listId = pathParts[1]; // Get listId from URL
             // Set listId on relevant containers if needed for context
             document.body.dataset.listId = listId;
             document.querySelector('.list-items-section')?.setAttribute('data-list-id', listId);


             listDetailContainer?.addEventListener('submit', (event) => {
                 if (event.target.id === 'addToListForm') {
                    handleAddToListFormSubmit(event);
                 } else if (event.target.classList.contains('edit-comment-form')) {
                    handleListItemCommentFormSubmit(event);
                 }
             });

             listDetailContainer?.addEventListener('click', (event) => {
                 if (event.target.closest('.edit-list-btn')) {
                     handleEditListClick(event);
                 } else if (event.target.closest('.delete-list-btn')) {
                     handleDeleteListClick(event);
                 } else if (event.target.closest('.remove-list-item-btn')) {
                     handleRemoveListItemClick(event);
                 } else if (event.target.closest('.edit-list-item-comment-btn')) {
                     handleEditListItemCommentClick(event);
                 } else if (event.target.closest('.cancel-edit-comment-btn')) {
                      handleCancelEditListItemCommentClick(event);
                 }
             });
         }
     }

     // --- Login Handler ---
     async function handleLogin(event) {
        event.preventDefault(); // Prevent default GET submission
        console.log("handleLogin executed");
        const form = event.target;
        const username = form.username.value.trim();
        const password = form.password.value.trim();
        // --- Select specific elements by ID ---
        const errorEl = document.getElementById('loginError');
        const submitButton = form.querySelector('button[type="submit"]');
        const spinnerId = 'loginSpinner';

        // --- Clear previous error ---
        if (errorEl) {
            errorEl.textContent = '';
            errorEl.classList.add('hidden');
        }
        if (submitButton) submitButton.disabled = true;
        showSpinner(spinnerId, true);

        // Basic client-side validation
        if (!username || !password) {
           if(errorEl){ errorEl.textContent = 'Username and password required.'; errorEl.classList.remove('hidden'); }
           if (submitButton) submitButton.disabled = false;
           showSpinner(spinnerId, false);
           return;
        }

        try {
            // Attempt API call
            const result = await apiRequest('/auth/login', 'POST', { username, password });
            if (result && result.user) {
                // Don't show message here, just redirect
                // showStatusMessage('globalStatus', 'Login successful! Redirecting...', 'success', 2000);
                window.location.href = '/'; // Redirect to homepage
            } else {
                // This case might indicate an unexpected successful response without user data
                throw new Error("Login response missing user data.");
            }
        } catch (error) {
            // Display API or network errors in the dedicated login error area
            const message = error.data?.message || error.message || 'Login failed. Please check your credentials.';
            if(errorEl){
                errorEl.textContent = message;
                errorEl.classList.remove('hidden');
            }
            else { showStatusMessage('globalStatus', message, 'error'); } // Fallback
            if (submitButton) submitButton.disabled = false; // Re-enable button on error
            showSpinner(spinnerId, false);
        }
        // Note: No 'finally' needed here as success causes redirect, error handles spinner/button
    }

    // --- Registration Handler ---
    async function handleRegister(event) {
        event.preventDefault(); // Prevent default GET submission
        console.log("handleRegister executed");
        const form = event.target;
        const username = form.username.value.trim();
        const password = form.password.value.trim();
        // --- Select specific elements by ID ---
        const errorEl = document.getElementById('registerError');
        const messageEl = document.getElementById('registerMessage');
        const submitButton = form.querySelector('button[type="submit"]');
        const spinnerId = 'registerSpinner';

        // --- Clear previous messages ---
        if (errorEl) {
           errorEl.textContent = '';
           errorEl.classList.add('hidden');
        }
        if (messageEl) {
           messageEl.textContent = '';
           messageEl.classList.add('hidden');
        }
        if (submitButton) submitButton.disabled = true;
        showSpinner(spinnerId, true);

        // Basic client-side validation
        if (!username || !password) {
             if(errorEl){ errorEl.textContent = 'Username and password required.'; errorEl.classList.remove('hidden'); }
              if (submitButton) submitButton.disabled = false;
              showSpinner(spinnerId, false);
             return;
         }
         if (password.length < 6) {
             if(errorEl){ errorEl.textContent = 'Password must be at least 6 characters.'; errorEl.classList.remove('hidden'); }
              if (submitButton) submitButton.disabled = false;
              showSpinner(spinnerId, false);
             return;
         }

         try {
             // Attempt API call
             const result = await apiRequest('/auth/register', 'POST', { username, password });
             const successMsg = result.message || 'Registration successful! Please login.';
             if (messageEl) {
                // Display success message in the dedicated registration message area
                messageEl.textContent = successMsg;
                messageEl.className = 'form-message success'; // Ensure correct class
                messageEl.classList.remove('hidden');
             } else {
                 showStatusMessage('globalStatus', successMsg, 'success'); // Fallback
             }
             form.reset(); // Clear form on success
         } catch (error) {
             // Display API or network errors in the dedicated registration error area
             const message = error.data?.message || error.message || 'Registration failed.';
              if(errorEl){
                  errorEl.textContent = message;
                  errorEl.classList.remove('hidden');
              }
              else { showStatusMessage('globalStatus', message, 'error'); } // Fallback
         } finally {
             // Always re-enable button and hide spinner
             if (submitButton) submitButton.disabled = false;
             showSpinner(spinnerId, false);
         }
    }

    // --- Initialization ---
    function initialize() {
        setupGlobalListeners();
        initializePage(); // Setup page-specific listeners and elements
        console.log('MediaTracker Initialized (v2.1).');
    }

    // Wait for DOM content and run initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize(); // DOMContentLoaded already fired
    }

})();
```

### viewRoutes.js

```js
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
```

### authRoutes.js

```js
// routes/api/authRoutes.js
// Keep existing file content. No changes needed here.
const express = require('express');
const db = require('../../database'); // Use the promisified db
const { hashPassword, comparePassword, setAuthCookie, clearAuthCookie } = require('../../auth');

const router = express.Router();

// --- Register ---
router.post('/register', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required.' });
    }
    if (password.length < 6) {
         return res.status(400).json({ message: 'Password must be at least 6 characters long.' });
    }

    try {
        const existingUser = await db.getAsync(`SELECT id FROM users WHERE lower(username) = lower(?)`, [username]);
        if (existingUser) {
            return res.status(409).json({ message: 'Username already taken.' }); // 409 Conflict
        }
        const passwordHash = await hashPassword(password);
        // Insert user with default profile settings
        const result = await db.runAsync(`INSERT INTO users (username, passwordHash, profilePrivacy) VALUES (?, ?, 'private')`, [username, passwordHash]);

        res.status(201).json({
            id: result.lastID,
            username: username,
            message: 'User registered successfully. Please login.'
         });
    } catch (error) {
        console.error("Registration Error:", error);
        res.status(500).json({ message: error.message || 'Server error during registration.' });
    }
});

// --- Login ---
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required.' });
    }
    try {
        // Find user (case-insensitive)
        const user = await db.getAsync(`SELECT id, username, passwordHash FROM users WHERE lower(username) = lower(?)`, [username]);
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }
        const isMatch = await comparePassword(password, user.passwordHash);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }
        const userData = { id: user.id, username: user.username };
        setAuthCookie(res, userData);
        res.status(200).json({
            message: 'Login successful.',
            user: userData
        });
    } catch (error) {
        console.error("Login Error:", error);
        res.status(500).json({ message: error.message || 'Server error during login.' });
    }
});

// --- Logout ---
router.post('/logout', (req, res) => {
    clearAuthCookie(res);
    res.status(200).json({ message: 'Logout successful.' });
});

module.exports = router;
```

### detailsRoutes.js

```js
// routes/api/detailsRoutes.js
const express = require('express');
const axios = require('axios');
require('dotenv').config();
const { getIgdbHeaders, convertRatingTo10 } = require('./igdbAuthHelper'); // Use correct helper

const router = express.Router();

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

    // Initialize structured details object
    let combinedDetails = {
        mediaId: mediaId,
        mediaType: mediaType,
        title: null,
        subtitle: null, // e.g., tagline for movies, author/year for books
        description: null,
        imageUrl: null, // Larger image for detail view
        releaseDate: null, // Full date where available
        releaseYear: null,
        apiRating: null, // Normalized 1-10 rating from API
        genres: [],
        // Specific fields
        authors: [], // books
        directors: [], // movies/series (TMDB: Crew job 'Director')
        screenwriters: [], // movies/series (TMDB: Crew job 'Screenplay', 'Writer')
        publisher: null, // books, games
        pageCount: null, // books
        cast: [], // movies/series (TMDB: Cast), games (IGDB: involved_companies?) - simplified for now
        platforms: [], // games (IGDB: platforms.name)
        developers: [], // games (IGDB: involved_companies where developer=true)
        // Links
        imdbId: null, // movies/series
        googleBooksLink: null, // books
        igdbLink: null, // games
        tmdbLink: null, // movies/series
        // Placeholders for related/reviews - not fetched here
        relatedMedia: [],
        reviews: []
    };

    try {
        switch (mediaType) {
            case 'movie':
            case 'series':
                if (!TMDB_API_KEY) throw new Error('TMDB API Key missing.');
                const isMovie = mediaType === 'movie';
                const basePath = isMovie ? 'movie' : 'tv';
                const detailsUrl = `${TMDB_BASE_URL}/${basePath}/${mediaId}?api_key=${TMDB_API_KEY}&language=en-US&append_to_response=credits,external_ids`;

                apiResponseData = await fetchData(detailsUrl);

                 if (apiResponseData?.failed || !apiResponseData) {
                     const status = apiResponseData?.status || 404;
                     const message = apiResponseData?.data?.status_message || `Details not found on TMDB (${status}).`;
                     return res.status(status).json({ message });
                 }

                combinedDetails.title = isMovie ? apiResponseData.title : apiResponseData.name;
                combinedDetails.subtitle = apiResponseData.tagline || null;
                combinedDetails.description = apiResponseData.overview;
                combinedDetails.imageUrl = apiResponseData.poster_path ? `https://image.tmdb.org/t/p/w780${apiResponseData.poster_path}` : null; // Larger poster
                combinedDetails.releaseDate = isMovie ? apiResponseData.release_date : apiResponseData.first_air_date;
                combinedDetails.releaseYear = getYear(combinedDetails.releaseDate);
                combinedDetails.apiRating = convertRatingTo10(apiResponseData.vote_average, 'tmdb');
                combinedDetails.genres = apiResponseData.genres?.map(g => g.name) || [];
                combinedDetails.imdbId = apiResponseData.external_ids?.imdb_id || null;
                combinedDetails.tmdbLink = `https://www.themoviedb.org/${basePath}/${mediaId}`;

                 // Process credits
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
                break;

            case 'book':
                const bookUrl = `${GOOGLE_BOOKS_BASE_URL}/${mediaId}?${GOOGLE_BOOKS_API_KEY ? 'key=' + GOOGLE_BOOKS_API_KEY : ''}`;
                apiResponseData = await fetchData(bookUrl);

                if (apiResponseData?.failed || !apiResponseData?.volumeInfo) {
                    const status = apiResponseData?.status || 404;
                     const message = apiResponseData?.error?.message || `Book details not found on Google Books (${status}).`;
                    return res.status(status).json({ message });
                }

                const volInfo = apiResponseData.volumeInfo;
                combinedDetails.title = volInfo.title;
                combinedDetails.subtitle = volInfo.subtitle || (volInfo.authors ? volInfo.authors.join(', ') : null);
                combinedDetails.description = volInfo.description;
                // Prefer larger images if available
                combinedDetails.imageUrl = volInfo.imageLinks?.thumbnail?.replace(/^http:/, 'https').replace(/zoom=\d/, 'zoom=1') || volInfo.imageLinks?.smallThumbnail?.replace(/^http:/, 'https') || null;
                combinedDetails.releaseDate = volInfo.publishedDate; // Often just year or YYYY-MM
                combinedDetails.releaseYear = getYear(volInfo.publishedDate);
                combinedDetails.apiRating = convertRatingTo10(volInfo.averageRating, 'google');
                combinedDetails.genres = volInfo.categories || [];
                combinedDetails.authors = volInfo.authors || [];
                combinedDetails.publisher = volInfo.publisher || null;
                combinedDetails.pageCount = volInfo.pageCount || null;
                combinedDetails.googleBooksLink = volInfo.infoLink || null;
                break;

            case 'video game':
                 // Fetch more fields for details
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

                combinedDetails.title = apiResponseData.name;
                combinedDetails.description = apiResponseData.summary || apiResponseData.storyline; // Use storyline if summary is missing
                combinedDetails.imageUrl = apiResponseData.cover?.url
                    ? apiResponseData.cover.url.replace('t_thumb', 't_cover_big').replace(/^\/\//, 'https://')
                    : null;
                combinedDetails.releaseDate = apiResponseData.first_release_date
                    ? new Date(apiResponseData.first_release_date * 1000).toISOString().split('T')[0]
                    : null;
                combinedDetails.releaseYear = getYear(combinedDetails.releaseDate);
                combinedDetails.apiRating = convertRatingTo10(apiResponseData.total_rating, 'igdb');
                combinedDetails.genres = apiResponseData.genres?.map(g => g.name) || [];
                combinedDetails.platforms = apiResponseData.platforms?.map(p => p.name) || []; // Get full platform names
                combinedDetails.igdbLink = apiResponseData.url || null;

                // Extract developers and publishers from involved_companies
                if (apiResponseData.involved_companies) {
                    apiResponseData.involved_companies.forEach(ic => {
                        if (ic.company?.name) {
                            if (ic.developer) combinedDetails.developers.push(ic.company.name);
                            if (ic.publisher) { // Assuming single publisher for simplicity, often primary
                                combinedDetails.publisher = combinedDetails.publisher || ic.company.name;
                            }
                        }
                    });
                    combinedDetails.developers = [...new Set(combinedDetails.developers)];
                    // Cast could potentially be derived from involved_companies if actor roles were tagged, but IGDB doesn't focus on this. Keep empty.
                }
                // Add screenshots and videos if needed (keep limited for payload size)
                // combinedDetails.screenshots = apiResponseData.screenshots?.slice(0, 5).map(s => s.url?.replace('t_thumb', 't_screenshot_med').replace(/^\/\//, 'https://')) || [];
                // combinedDetails.videos = apiResponseData.videos?.slice(0, 3).map(v => ({ youtubeId: v.video_id, youtubeLink: `https://www.youtube.com/watch?v=${v.video_id}` })) || [];
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
```

### igdbAuthHelper.js

```js
// routes/api/igdbAuthHelper.js
// Using 1-10 rating scale now, adjust conversion helper
const axios = require('axios');
require('dotenv').config();

// --- Environment Variable Checks ---
const IGDB_CLIENT_ID = process.env.IGDB_CLIENT_ID;
const IGDB_CLIENT_SECRET = process.env.IGDB_CLIENT_SECRET;
const TWITCH_AUTH_URL = 'https://id.twitch.tv/oauth2/token';

let igdbTokenCache = { accessToken: null, expiresAt: 0 };

// Keep getIgdbAccessToken and getIgdbHeaders functions as they are.
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
            // Keep as is, maybe round to 1 decimal?
            return Math.round(rating * 10) / 10;
        case 'google': // Scale 0-5 (averageRating)
            return Math.round(rating * 2 * 10) / 10; // Multiply by 2
        case 'igdb': // Scale 0-100 (total_rating)
            return Math.round(rating / 10 * 10) / 10; // Divide by 10
        default:
            return null;
    }
}


module.exports = {
    getIgdbAccessToken,
    getIgdbHeaders,
    convertRatingTo10 // Export updated helper
};
```

### libraryRoutes.js

```js
// routes/api/libraryRoutes.js
const express = require('express');
const db = require('../../database'); // Use promisified db
const { verifyToken } = require('../../auth');

const router = express.Router();

// Apply auth middleware to all library routes
router.use(verifyToken);

// --- Constants and Helpers ---
const VALID_MEDIA_TYPES = ['movie', 'series', 'book', 'video game'];
const VALID_STATUSES = ['planned', 'watching', 'completed', 'paused', 'dropped'];
const COMPLETED_STATUS = 'completed'; // Single status for completion

// Helper function to validate and parse rating (1-10 scale)
function parseAndValidateRating(ratingInput) {
    if (ratingInput === undefined || ratingInput === null || ratingInput === '') {
        return null; // Allow clearing rating
    }
    const rating = parseInt(ratingInput, 10);
    if (isNaN(rating) || rating < 1 || rating > 10) {
        throw new Error('Invalid userRating. Must be an integer between 1 and 10, or null/empty.');
    }
    return rating;
}

// Helper function to validate status
function validateStatus(statusInput) {
     if (!statusInput || !VALID_STATUSES.includes(statusInput.toLowerCase())) {
         throw new Error(`Invalid userStatus. Must be one of: ${VALID_STATUSES.join(', ')}.`);
     }
     return statusInput.toLowerCase();
}

// Helper function to parse boolean
function parseBoolean(value) {
    if (value === undefined || value === null) return undefined; // Keep undefined if not provided
    return ['true', '1', 'yes', true].includes(value?.toString().toLowerCase());
}

// --- Get Library Items (with filtering/sorting) ---
router.get('/', async (req, res) => {
    // Allow filtering by specific userId (for profile page) or default to logged-in user
    const requestingUserId = req.userId; // User making the request
    const targetUserId = req.query.userId ? parseInt(req.query.userId, 10) : requestingUserId; // User whose library is requested

    if (isNaN(targetUserId)) {
        return res.status(400).json({ message: 'Invalid userId provided.' });
    }

    // Basic permission check: Allow only if requesting own library or target profile is public (implement later if needed)
    // For now, assume access is allowed if authenticated for simplicity of non-social features

    // Filtering/Sorting Params
    const { mediaType, userStatus, isFavorite, sortBy, limit } = req.query;
    const favoriteFilter = parseBoolean(isFavorite); // Convert 'true'/'false'/'1'/'0' to boolean

    let sql = `SELECT id, userId, mediaType, mediaId, title, imageUrl, releaseYear, userStatus, userRating, isFavorite, addedAt, updatedAt, completedAt FROM library_items WHERE userId = ?`;
    const params = [targetUserId];

    try {
        // Apply Filters
        if (mediaType && VALID_MEDIA_TYPES.includes(mediaType)) {
            sql += ` AND mediaType = ?`;
            params.push(mediaType);
        }
        if (userStatus && VALID_STATUSES.includes(userStatus.toLowerCase())) {
             sql += ` AND userStatus = ?`;
             params.push(userStatus.toLowerCase());
        }
        if (favoriteFilter !== undefined) { // Check if the filter was provided
            sql += ` AND isFavorite = ?`;
            params.push(favoriteFilter ? 1 : 0);
        }

        // Apply Sorting (Add more options as needed)
        const validSorts = {
             addedAt: 'addedAt DESC',
             updatedAt: 'updatedAt DESC',
             completedAt: 'completedAt DESC', // Sort by completion date
             rating: 'userRating DESC',
             title: 'lower(title) ASC' // Case-insensitive title sort
        };
        if (sortBy && validSorts[sortBy]) {
            sql += ` ORDER BY ${validSorts[sortBy]}`;
        } else {
            sql += ` ORDER BY updatedAt DESC`; // Default sort
        }

        // Apply Limit
        if (limit && !isNaN(parseInt(limit, 10))) {
             sql += ` LIMIT ?`;
             params.push(parseInt(limit, 10));
        }

        const items = await db.allAsync(sql, params);
        res.status(200).json(items);

    } catch (error) {
        console.error(`Get Library Error (User ${targetUserId}):`, error);
        res.status(500).json({ message: error.message || 'Failed to retrieve library items.' });
    }
});

// --- Get Specific Library Item (by external mediaId and type) ---
router.get('/item/:mediaType/:mediaId', async (req, res) => {
    const userId = req.userId;
    const { mediaType, mediaId } = req.params;

    if (!mediaType || !mediaId || !VALID_MEDIA_TYPES.includes(mediaType)) {
        return res.status(400).json({ message: 'Valid mediaType and mediaId are required.' });
    }

    try {
        const sql = `SELECT * FROM library_items WHERE userId = ? AND mediaType = ? AND mediaId = ?`;
        const item = await db.getAsync(sql, [userId, mediaType, mediaId]);

        if (!item) {
            return res.status(404).json({ message: 'Item not found in your library.' });
        }
        res.status(200).json(item);
    } catch (error) {
        console.error(`Get Specific Library Item Error (User ${userId}, ${mediaType}/${mediaId}):`, error);
        res.status(500).json({ message: error.message || 'Failed to retrieve library item.' });
    }
});


// --- Add Item to Library ---
router.post('/', async (req, res) => {
    const userId = req.userId;
    const {
        mediaType, mediaId, title, imageUrl, releaseYear, // Core details from search/details
        userStatus, userRating, userNotes, isFavorite // User interaction fields
     } = req.body;

    try {
        // Validation
        if (!mediaType || !mediaId || !title ) {
            return res.status(400).json({ message: 'mediaType, mediaId, and title are required.' });
        }
        if (!VALID_MEDIA_TYPES.includes(mediaType)) {
             return res.status(400).json({ message: `Invalid mediaType.` });
        }

        const status = userStatus ? validateStatus(userStatus) : 'planned'; // Default to 'planned' if not provided
        const rating = parseAndValidateRating(userRating); // Validates or returns null
        const favorite = parseBoolean(isFavorite) || false; // Default to false

        // Set completedAt timestamp if status is completed
        const completedAt = (status === COMPLETED_STATUS) ? new Date().toISOString() : null;
        const year = releaseYear ? parseInt(releaseYear, 10) : null;
        if (releaseYear && isNaN(year)){
             console.warn(`Invalid releaseYear format received: ${releaseYear}`);
             // Decide whether to reject or just store null
        }


        const insertSql = `
            INSERT INTO library_items
                (userId, mediaType, mediaId, title, imageUrl, releaseYear,
                 userStatus, userRating, userNotes, isFavorite, completedAt, addedAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `;
        const params = [
            userId, mediaType, mediaId, title, imageUrl || null, !isNaN(year) ? year : null,
            status, rating, userNotes || null, favorite ? 1 : 0, completedAt
        ];

        const result = await db.runAsync(insertSql, params);
        const newItem = await db.getAsync(`SELECT * FROM library_items WHERE id = ?`, [result.lastID]);
        res.status(201).json(newItem);

    } catch (error) {
        console.error("Add Library Item Error:", error);
        if (error.message.includes('UNIQUE constraint failed')) {
             return res.status(409).json({ message: 'This item is already in your library.' });
        }
        // Return validation errors directly
         if (error.message.startsWith('Invalid userRating') || error.message.startsWith('Invalid userStatus')) {
            return res.status(400).json({ message: error.message });
        }
        res.status(500).json({ message: error.message || 'Failed to add item to library.' });
    }
});

// --- Update Library Item (by internal library item ID) ---
router.put('/:id', async (req, res) => {
    const userId = req.userId;
    const itemId = req.params.id;
    const { userStatus, userRating, userNotes, isFavorite } = req.body;

    // Check if at least one field is provided
    if (userStatus === undefined && userRating === undefined && userNotes === undefined && isFavorite === undefined) {
        return res.status(400).json({ message: 'No fields provided for update.' });
    }

    try {
        // Fetch the item first to check ownership and get current status
        const item = await db.getAsync(`SELECT userStatus as currentStatus, completedAt as currentCompletedAt FROM library_items WHERE id = ? AND userId = ?`, [itemId, userId]);
        if (!item) {
            return res.status(404).json({ message: 'Library item not found or not owned by user.' });
        }

        const { currentStatus, currentCompletedAt } = item;
        const updates = [];
        const params = [];
        let newDbStatus = null;
        let newCompletedAt = currentCompletedAt; // Keep existing unless changed

        // Validate and add fields to update
        if (userStatus !== undefined) {
             const status = validateStatus(userStatus);
             updates.push(`userStatus = ?`);
             params.push(status);
             newDbStatus = status; // Store for completedAt logic

             // Handle completedAt timestamp
             const isNowCompleted = (newDbStatus === COMPLETED_STATUS);
             if (isNowCompleted && !currentCompletedAt) { // If becoming completed
                newCompletedAt = new Date().toISOString();
                updates.push(`completedAt = ?`);
                params.push(newCompletedAt);
             } else if (!isNowCompleted && currentCompletedAt) { // If changing away from completed
                 newCompletedAt = null;
                 updates.push(`completedAt = NULL`);
                 // params don't need update for NULL here
             }
        }

        if (userRating !== undefined) {
             const rating = parseAndValidateRating(userRating); // Validates or returns null
             updates.push(`userRating = ?`);
             params.push(rating);
        }

         if (userNotes !== undefined) {
            updates.push(`userNotes = ?`);
            params.push(userNotes); // Allow empty string or null
        }

        const favorite = parseBoolean(isFavorite); // Returns true/false/undefined
        if (favorite !== undefined) {
             updates.push(`isFavorite = ?`);
             params.push(favorite ? 1 : 0);
        }


        if (updates.length === 0) {
             return res.status(400).json({ message: 'No valid update fields provided.' });
        }

        // Construct and run update query (Trigger handles updatedAt)
        const updateSql = `UPDATE library_items SET ${updates.join(', ')} WHERE id = ? AND userId = ?`;
        params.push(itemId, userId);

        const result = await db.runAsync(updateSql, params);

        if (result.changes === 0) {
            // This might happen if the data sent was the same as the existing data
            // Fetch and return current item state as confirmation
             const currentItem = await db.getAsync(`SELECT * FROM library_items WHERE id = ?`, [itemId]);
            return res.status(200).json(currentItem);
            // return res.status(404).json({ message: 'Item not found or no changes needed.' });
        }

        // Fetch and return the updated item
        const updatedItem = await db.getAsync(`SELECT * FROM library_items WHERE id = ?`, [itemId]);
        res.status(200).json(updatedItem);

    } catch (error) {
        console.error("Update Library Item Error:", error);
        // Return validation errors directly
         if (error.message.startsWith('Invalid userRating') || error.message.startsWith('Invalid userStatus')) {
            return res.status(400).json({ message: error.message });
        }
        res.status(500).json({ message: error.message || 'Failed to update library item.' });
    }
});

// --- Delete Item from Library ---
router.delete('/:id', async (req, res) => {
    const userId = req.userId;
    const itemId = req.params.id;

    try {
        // Optional: Check if item is in any lists before deleting? Or rely on CASCADE delete?
        // For now, rely on CASCADE in user_list_items table.

        const result = await db.runAsync(`DELETE FROM library_items WHERE id = ? AND userId = ?`, [itemId, userId]);

        if (result.changes === 0) {
            return res.status(404).json({ message: 'Library item not found or not owned by user.' });
        }
        res.status(200).json({ message: 'Library item deleted successfully.' }); // 200 with message is often preferred over 204

    } catch (error) {
        console.error("Delete Library Item Error:", error);
        res.status(500).json({ message: error.message || 'Failed to delete library item.' });
    }
});


// --- Get Library Stats (for profile page) ---
router.get('/stats/:userId', async (req, res) => {
    const requestingUserId = req.userId;
    const targetUserId = parseInt(req.params.userId, 10);

     if (isNaN(targetUserId)) {
        return res.status(400).json({ message: 'Invalid userId provided.' });
    }

    // Permission check (basic - allow own stats, maybe public later)
    if (requestingUserId !== targetUserId) {
        // Could check target user's profile privacy here if needed
        // return res.status(403).json({ message: 'Cannot access stats for another user.' });
    }


    try {
        // Calculate Average Score (only for items rated by the user)
        const avgScoreResult = await db.getAsync(
            `SELECT AVG(userRating) as averageScore FROM library_items WHERE userId = ? AND userRating IS NOT NULL`,
            [targetUserId]
        );
        const averageScore = avgScoreResult?.averageScore ? parseFloat(avgScoreResult.averageScore.toFixed(1)) : null; // 1 decimal place

        // Count Completed Items
        const countResult = await db.getAsync(
            `SELECT COUNT(*) as countCompleted FROM library_items WHERE userId = ? AND userStatus = ?`,
            [targetUserId, COMPLETED_STATUS]
        );
        const countCompleted = countResult?.countCompleted || 0;

         // Count Total Items in Library
        const countTotalResult = await db.getAsync(
            `SELECT COUNT(*) as countTotal FROM library_items WHERE userId = ?`,
            [targetUserId]
        );
        const countTotal = countTotalResult?.countTotal || 0;


        res.status(200).json({
            userId: targetUserId,
            averageScore: averageScore, // Average rating given (1-10)
            countCompleted: countCompleted, // "Nb vues"
            countTotal: countTotal, // Total items tracked
            // Add more stats as needed (e.g., counts per type, per status)
        });

    } catch (error) {
        console.error(`Get Library Stats Error (User ${targetUserId}):`, error);
        res.status(500).json({ message: error.message || 'Failed to retrieve library stats.' });
    }
});


module.exports = router;
```

### listRoutes.js

```js
// routes/api/listRoutes.js (New File)
const express = require('express');
const db = require('../../database');
const { verifyToken } = require('../../auth');

const router = express.Router();

// Apply auth middleware
router.use(verifyToken);


// --- Get Lists ---
// GET /api/lists?userId=<id>&publicOnly=true/false&limit=<num>
router.get('/', async (req, res) => {
    const requestingUserId = req.userId;
    // Default to requesting user if no userId specified
    const targetUserId = req.query.userId ? parseInt(req.query.userId, 10) : requestingUserId;
    const publicOnly = req.query.publicOnly === 'true';
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : null;

    if (isNaN(targetUserId)) {
        return res.status(400).json({ message: 'Invalid userId.' });
    }

    try {
         // Base query to get list summaries and item counts
         // Use COALESCE to handle lists with 0 items correctly
         let sql = `
            SELECT
                l.id, l.userId, l.title, l.description, l.coverImageUrl, l.isPublic, l.createdAt, l.updatedAt,
                u.username as ownerUsername,
                COALESCE(COUNT(li.id), 0) as itemCount
            FROM user_lists l
            JOIN users u ON l.userId = u.id
            LEFT JOIN user_list_items li ON l.id = li.listId
            WHERE l.userId = ?
        `;
        const params = [targetUserId];

        // Apply public filter if requested AND if not viewing own lists
        if (publicOnly && targetUserId !== requestingUserId) {
            sql += ` AND l.isPublic = 1`;
        }

        sql += ` GROUP BY l.id`; // Group to count items per list
        sql += ` ORDER BY l.updatedAt DESC`; // Default sort

        if (limit && !isNaN(limit)) {
            sql += ` LIMIT ?`;
            params.push(limit);
        }

        const lists = await db.allAsync(sql, params);
        res.status(200).json(lists);

    } catch (error) {
        console.error(`Get Lists Error (User ${targetUserId}):`, error);
        res.status(500).json({ message: error.message || 'Failed to retrieve lists.' });
    }
});

// --- Create New List ---
// POST /api/lists
router.post('/', async (req, res) => {
    const userId = req.userId;
    const { title, description, isPublic, coverImageUrl } = req.body;

    if (!title || typeof title !== 'string' || title.trim() === '') {
        return res.status(400).json({ message: 'List title is required.' });
    }

    const publicFlag = [true, 'true', 1].includes(isPublic) ? 1 : 0;

    try {
        const sql = `
            INSERT INTO user_lists (userId, title, description, isPublic, coverImageUrl, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `;
        const params = [
            userId,
            title.trim(),
            description || null,
            publicFlag,
            coverImageUrl || null
        ];
        const result = await db.runAsync(sql, params);

        // Fetch and return the newly created list summary
        const newList = await db.getAsync(`
             SELECT l.*, u.username as ownerUsername, 0 as itemCount
             FROM user_lists l JOIN users u ON l.userId = u.id
             WHERE l.id = ?`, [result.lastID]);
        res.status(201).json(newList);

    } catch (error) {
        console.error(`Create List Error (User ${userId}):`, error);
        res.status(500).json({ message: error.message || 'Failed to create list.' });
    }
});

// --- Get Single List Details (including items) ---
// GET /api/lists/:listId
router.get('/:listId', async (req, res) => {
    const requestingUserId = req.userId;
    const listId = parseInt(req.params.listId, 10);

    if (isNaN(listId)) {
        return res.status(400).json({ message: 'Invalid list ID.' });
    }

    try {
        // 1. Fetch List Metadata
        const listSql = `
            SELECT l.*, u.username as ownerUsername
            FROM user_lists l JOIN users u ON l.userId = u.id
            WHERE l.id = ?
        `;
        const list = await db.getAsync(listSql, [listId]);

        if (!list) {
            return res.status(404).json({ message: 'List not found.' });
        }

        // 2. Permission Check
        const isOwner = list.userId === requestingUserId;
        if (!isOwner && !list.isPublic) {
            return res.status(403).json({ message: 'You do not have permission to view this list.' });
        }

        // 3. Fetch List Items (join with library_items to get details)
        const itemsSql = `
            SELECT
                li.id as listItemId, li.userComment, li.dateAdded,
                lib.id as libraryItemId, lib.mediaType, lib.mediaId, lib.title, lib.imageUrl, lib.releaseYear,
                lib.userStatus, lib.userRating, lib.isFavorite, lib.userNotes as libraryNotes
            FROM user_list_items li
            JOIN library_items lib ON li.libraryItemId = lib.id
            WHERE li.listId = ?
            ORDER BY li.dateAdded DESC
        `;
        const items = await db.allAsync(itemsSql, [listId]);

        // 4. Combine and Respond
        res.status(200).json({ ...list, items: items });

    } catch (error) {
        console.error(`Get List Detail Error (List ${listId}):`, error);
        res.status(500).json({ message: error.message || 'Failed to retrieve list details.' });
    }
});


// --- Update List Metadata ---
// PUT /api/lists/:listId
router.put('/:listId', async (req, res) => {
    const userId = req.userId;
    const listId = parseInt(req.params.listId, 10);
    const { title, description, isPublic, coverImageUrl } = req.body;

    if (isNaN(listId)) {
        return res.status(400).json({ message: 'Invalid list ID.' });
    }

    // Check if at least one field is provided
     if (title === undefined && description === undefined && isPublic === undefined && coverImageUrl === undefined) {
        return res.status(400).json({ message: 'No fields provided for update.' });
    }

    try {
        // Check ownership first
        const list = await db.getAsync(`SELECT userId FROM user_lists WHERE id = ?`, [listId]);
        if (!list) {
            return res.status(404).json({ message: 'List not found.' });
        }
        if (list.userId !== userId) {
            return res.status(403).json({ message: 'You do not have permission to modify this list.' });
        }

        // Build update query
        const updates = [];
        const params = [];

        if (title !== undefined) {
             if (typeof title !== 'string' || title.trim() === '') {
                 return res.status(400).json({ message: 'List title cannot be empty.' });
             }
            updates.push(`title = ?`);
            params.push(title.trim());
        }
        if (description !== undefined) {
            updates.push(`description = ?`);
            params.push(description);
        }
         if (isPublic !== undefined) {
             const publicFlag = [true, 'true', 1].includes(isPublic) ? 1 : 0;
            updates.push(`isPublic = ?`);
            params.push(publicFlag);
        }
        if (coverImageUrl !== undefined) {
            updates.push(`coverImageUrl = ?`);
            params.push(coverImageUrl);
        }

        if (updates.length === 0) {
              // Should not happen due to initial check
             return res.status(400).json({ message: 'No valid update fields provided.' });
        }

        // Add listId and userId for WHERE clause
        params.push(listId, userId);
        const sql = `UPDATE user_lists SET ${updates.join(', ')} WHERE id = ? AND userId = ?`;
        // Trigger handles updatedAt

        const result = await db.runAsync(sql, params);

        if (result.changes === 0) {
            // Possible if data was identical or concurrent modification
            // return res.status(404).json({ message: 'List not found or no changes needed.' });
        }

        // Fetch and return updated list data
        const updatedList = await db.getAsync(`
             SELECT l.*, u.username as ownerUsername, COALESCE(COUNT(li.id), 0) as itemCount
             FROM user_lists l
             JOIN users u ON l.userId = u.id
             LEFT JOIN user_list_items li ON l.id = li.listId
             WHERE l.id = ?
             GROUP BY l.id`, [listId]);
        res.status(200).json(updatedList);


    } catch (error) {
        console.error(`Update List Error (List ${listId}, User ${userId}):`, error);
        res.status(500).json({ message: error.message || 'Failed to update list.' });
    }
});

// --- Delete List ---
// DELETE /api/lists/:listId
router.delete('/:listId', async (req, res) => {
    const userId = req.userId;
    const listId = parseInt(req.params.listId, 10);

    if (isNaN(listId)) {
        return res.status(400).json({ message: 'Invalid list ID.' });
    }

    try {
        // Check ownership
         const list = await db.getAsync(`SELECT userId FROM user_lists WHERE id = ?`, [listId]);
         if (!list) {
             return res.status(404).json({ message: 'List not found.' });
         }
         if (list.userId !== userId) {
             return res.status(403).json({ message: 'You do not have permission to delete this list.' });
         }

        // Delete the list (CASCADE should handle user_list_items)
        const result = await db.runAsync(`DELETE FROM user_lists WHERE id = ? AND userId = ?`, [listId, userId]);

         if (result.changes === 0) {
            // Should not happen if previous checks passed
            return res.status(404).json({ message: 'List not found or already deleted.' });
        }

        res.status(200).json({ message: 'List deleted successfully.' });

    } catch (error) {
        console.error(`Delete List Error (List ${listId}, User ${userId}):`, error);
        res.status(500).json({ message: error.message || 'Failed to delete list.' });
    }
});


// --- Add Item to List ---
// POST /api/lists/:listId/items
router.post('/:listId/items', async (req, res) => {
    const userId = req.userId;
    const listId = parseInt(req.params.listId, 10);
    const { libraryItemId, userComment } = req.body; // Expect the ID from the user's library_items table

    if (isNaN(listId)) return res.status(400).json({ message: 'Invalid list ID.' });
    if (!libraryItemId || isNaN(parseInt(libraryItemId, 10))) {
        return res.status(400).json({ message: 'Valid libraryItemId is required.' });
    }
    const libItemId = parseInt(libraryItemId, 10);

    try {
        // 1. Verify list ownership
         const list = await db.getAsync(`SELECT userId FROM user_lists WHERE id = ?`, [listId]);
         if (!list) return res.status(404).json({ message: 'List not found.' });
         if (list.userId !== userId) return res.status(403).json({ message: 'You cannot add items to this list.' });

        // 2. Verify library item ownership and existence
        const libraryItem = await db.getAsync(`SELECT id FROM library_items WHERE id = ? AND userId = ?`, [libItemId, userId]);
        if (!libraryItem) return res.status(404).json({ message: 'Library item not found or does not belong to you.' });

        // 3. Add the item
        const sql = `INSERT INTO user_list_items (listId, libraryItemId, userComment, dateAdded) VALUES (?, ?, ?, datetime('now'))`;
        const result = await db.runAsync(sql, [listId, libItemId, userComment || null]);

        // 4. Fetch and return the newly added list item details (joined)
        const newItem = await db.getAsync(`
            SELECT li.*, lib.mediaType, lib.title
            FROM user_list_items li JOIN library_items lib ON li.libraryItemId = lib.id
            WHERE li.id = ?`, [result.lastID]);
        res.status(201).json(newItem);

    } catch (error) {
        console.error(`Add List Item Error (List ${listId}, LibItem ${libItemId}, User ${userId}):`, error);
        if (error.message.includes('UNIQUE constraint failed')) {
             return res.status(409).json({ message: 'This item is already in this list.' });
        }
         if (error.message.includes('FOREIGN KEY constraint failed')) {
             // This could mean listId or libraryItemId was invalid despite checks (race condition?)
             return res.status(404).json({ message: 'List or Library item not found.' });
        }
        res.status(500).json({ message: error.message || 'Failed to add item to list.' });
    }
});


// --- Remove Item from List ---
// DELETE /api/lists/:listId/items/:listItemId
router.delete('/:listId/items/:listItemId', async (req, res) => {
     const userId = req.userId;
     const listId = parseInt(req.params.listId, 10);
     const listItemId = parseInt(req.params.listItemId, 10); // This is the ID from user_list_items table

    if (isNaN(listId) || isNaN(listItemId)) {
        return res.status(400).json({ message: 'Invalid list ID or list item ID.' });
    }

     try {
        // 1. Verify list ownership (needed to allow deletion)
         const list = await db.getAsync(`SELECT userId FROM user_lists WHERE id = ?`, [listId]);
         if (!list) return res.status(404).json({ message: 'List not found.' });
         if (list.userId !== userId) return res.status(403).json({ message: 'You cannot remove items from this list.' });

         // 2. Delete the specific list item entry
         // We know the user owns the list, so deleting the entry within that list is permitted
         const sql = `DELETE FROM user_list_items WHERE id = ? AND listId = ?`;
         const result = await db.runAsync(sql, [listItemId, listId]);

         if (result.changes === 0) {
            return res.status(404).json({ message: 'List item not found in this list.' });
         }
         res.status(200).json({ message: 'Item removed from list successfully.' });

     } catch (error) {
         console.error(`Remove List Item Error (List ${listId}, ListItem ${listItemId}, User ${userId}):`, error);
         res.status(500).json({ message: error.message || 'Failed to remove item from list.' });
     }
});

// --- Update Item within List (e.g., comment) ---
// PUT /api/lists/:listId/items/:listItemId
router.put('/:listId/items/:listItemId', async (req, res) => {
    const userId = req.userId;
    const listId = parseInt(req.params.listId, 10);
    const listItemId = parseInt(req.params.listItemId, 10);
    const { userComment } = req.body;

    if (isNaN(listId) || isNaN(listItemId)) {
        return res.status(400).json({ message: 'Invalid list ID or list item ID.' });
    }
    if (userComment === undefined) {
         return res.status(400).json({ message: 'No update fields provided (only userComment is supported).' });
    }

    try {
         // Verify list ownership
         const list = await db.getAsync(`SELECT userId FROM user_lists WHERE id = ?`, [listId]);
         if (!list) return res.status(404).json({ message: 'List not found.' });
         if (list.userId !== userId) return res.status(403).json({ message: 'You cannot modify items in this list.' });

         // Update the comment
         const sql = `UPDATE user_list_items SET userComment = ? WHERE id = ? AND listId = ?`;
         const result = await db.runAsync(sql, [userComment, listItemId, listId]);

          if (result.changes === 0) {
             return res.status(404).json({ message: 'List item not found in this list or comment unchanged.' });
         }

         // Fetch and return updated item details
         const updatedItem = await db.getAsync(`
            SELECT li.*, lib.mediaType, lib.title
            FROM user_list_items li JOIN library_items lib ON li.libraryItemId = lib.id
            WHERE li.id = ?`, [listItemId]);
         res.status(200).json(updatedItem);

    } catch (error) {
         console.error(`Update List Item Comment Error (ListItem ${listItemId}, User ${userId}):`, error);
         res.status(500).json({ message: error.message || 'Failed to update list item comment.' });
    }
});


module.exports = router;
```

### profileRoutes.js

```js
// routes/api/profileRoutes.js (New File)
const express = require('express');
const db = require('../../database');
const { verifyToken } = require('../../auth');
const axios = require('axios'); // To call library stats endpoint

const router = express.Router();

// Apply auth to all profile routes (viewing others might need different logic later)
router.use(verifyToken);

// Helper to build API URL
const getApiUrl = (req) => `${req.protocol}://${req.get('host')}/api`;

// GET /api/profile/:userId (Get basic profile info and stats)
router.get('/:userId', async (req, res) => {
    const requestingUserId = req.userId;
    const targetUserId = parseInt(req.params.userId, 10);

    if (isNaN(targetUserId)) {
        return res.status(400).json({ message: 'Invalid userId provided.' });
    }

    try {
        // Fetch basic user info
        const user = await db.getAsync(
            `SELECT id, username, profileImageUrl, profilePrivacy, createdAt FROM users WHERE id = ?`,
            [targetUserId]
        );

        if (!user) {
            return res.status(404).json({ message: 'User profile not found.' });
        }

        // Permission Check: Allow if own profile or target is public
        const isOwnProfile = requestingUserId === targetUserId;
        if (!isOwnProfile && user.profilePrivacy !== 'public') {
            // Return minimal info for private profiles viewed by others? Or just forbid?
             return res.status(403).json({ message: 'This profile is private.' });
        }

        // Fetch library stats by calling the library API endpoint
        let stats = {};
        try {
            const apiUrl = getApiUrl(req);
            const statsResponse = await axios.get(`${apiUrl}/library/stats/${targetUserId}`, {
                headers: { Cookie: req.headers.cookie } // Forward cookie
            });
            stats = statsResponse.data;
        } catch (statsError) {
             console.error(`Failed to fetch stats for user ${targetUserId}:`, statsError.response?.data || statsError.message);
             // Continue without stats, or return an error? Let's continue for now.
             stats = { averageScore: null, countCompleted: 0, countTotal: 0 }; // Default/empty stats
        }


        res.status(200).json({
            id: user.id,
            username: user.username,
            profileImageUrl: user.profileImageUrl || '/images/placeholder_avatar.png', // Default avatar
            profilePrivacy: user.profilePrivacy,
            memberSince: user.createdAt,
            // Include fetched stats
            averageScore: stats.averageScore, // From library API
            countMediaCompleted: stats.countCompleted, // From library API
            countMediaTotal: stats.countTotal // From library API
            // Add friend status later if implementing social features
        });

    } catch (error) {
        console.error(`Get Profile Error (User ${targetUserId}):`, error);
        res.status(500).json({ message: error.message || 'Failed to retrieve user profile.' });
    }
});

// PUT /api/profile/me (Update logged-in user's profile settings)
router.put('/me', async (req, res) => {
    const userId = req.userId;
    const { profilePrivacy, profileImageUrl } = req.body; // Add other updatable fields later

    const updates = [];
    const params = [];

    // Validate and add fields to update
    if (profilePrivacy !== undefined) {
        const privacy = profilePrivacy.toLowerCase();
        if (!['public', 'private'].includes(privacy)) {
            return res.status(400).json({ message: 'Invalid profilePrivacy value. Must be "public" or "private".' });
        }
        updates.push(`profilePrivacy = ?`);
        params.push(privacy);
    }

    if (profileImageUrl !== undefined) {
         // Add basic URL validation later if needed
         updates.push(`profileImageUrl = ?`);
         params.push(profileImageUrl);
    }

    if (updates.length === 0) {
        return res.status(400).json({ message: 'No fields provided for update.' });
    }

    try {
        const updateSql = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
        params.push(userId);

        const result = await db.runAsync(updateSql, params);

        if (result.changes === 0) {
            // Should not happen if user exists, maybe no change needed?
             return res.status(404).json({ message: 'User not found or no changes applied.' });
        }

        // Fetch and return the updated profile info
        const updatedUser = await db.getAsync(
            `SELECT id, username, profileImageUrl, profilePrivacy, createdAt FROM users WHERE id = ?`,
            [userId]
        );
         // Refetch stats as well? No, stats aren't changed by profile update. Call the GET /api/profile/:userId instead?
         // For now, just return the updated basic user data.
        res.status(200).json({
             id: updatedUser.id,
             username: updatedUser.username,
             profileImageUrl: updatedUser.profileImageUrl || '/images/placeholder_avatar.png',
             profilePrivacy: updatedUser.profilePrivacy,
             memberSince: updatedUser.createdAt
        });


    } catch (error) {
        console.error(`Update Profile Error (User ${userId}):`, error);
        res.status(500).json({ message: error.message || 'Failed to update profile.' });
    }
});


module.exports = router;
```

### searchRoutes.js

```js
// routes/api/searchRoutes.js
const express = require('express');
const axios = require('axios');
require('dotenv').config();
const { getIgdbHeaders, convertRatingTo10 } = require('./igdbAuthHelper'); // Use updated helper

const router = express.Router();

// --- Environment Variable Checks & API URLs (Keep as before) ---
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

    console.log(`API Search: Type=${mediaType}, Query="${query}"`);
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
```

### about.hbs

```hbs
<section>
    <h2>About Media Watchlist</h2>
    <p>This application helps you manage the media you want to consume.</p>
    <p>Built with Node.js, Express, SQLite, and Handlebars.</p>
    <p>Search powered by TMDB, Google Books, and IGDB.</p>
</section>
```

### error.hbs

```hbs
{{! views/error.hbs }}

<section class="error-page card">
  <h2 class="error-code">{{#if errorCode}}{{errorCode}}{{else}}Error{{/if}}</h2>
  <p class="error-message-text">
    {{#if errorMessage}}
      {{errorMessage}}
    {{else}}
      An unexpected error occurred. Please try again later.
    {{/if}}
  </p>
  <div class="error-actions">
    <a href="/" class="btn btn-primary">Go to Homepage</a>
    {{#if user}} {{!-- Show library link only if logged in --}}
      <a href="/library" class="btn btn-secondary">Go to My Library</a>
    {{/if}}
  </div>
</section>
```

### home.hbs

```hbs
{{! views/home.hbs }}
{{#if homeError}}
<div class="container error-message">{{homeError}}</div>
{{/if}}

{{!-- Horizontal Navigation Bar --}}
<nav class="horizontal-nav container">
    {{!-- Use buttons or links to filter content (JS needed) or navigate --}}
    <button class="nav-item active" data-filter="all">All</button>
    <button class="nav-item" data-filter="movie">Movies</button>
    <button class="nav-item" data-filter="series">Series</button>
    <button class="nav-item" data-filter="book">Books</button>
    <button class="nav-item" data-filter="video game">Video Games</button>
</nav>

{{!-- Hottest Section (Placeholder) --}}
<section class="media-carousel-section container">
    <h2 class="section-title">🔥 Hottest Right Now</h2>
    <div class="swiper media-swiper">
        <div class="swiper-wrapper">
            {{#each hottest}}
             <div class="swiper-slide">
                {{> mediaCard items=(list this) }} {{!-- Pass single item as list --}}
             </div>
            {{/each}}
        </div>
        <div class="swiper-button-prev"></div>
        <div class="swiper-button-next"></div>
        {{!-- <div class="swiper-pagination"></div> --}}
    </div>
</section>

{{!-- In Your Watchlist Section --}}
{{#if user}} {{!-- Only show if logged in --}}
<section class="media-carousel-section container">
    <h2 class="section-title">📑 In Your Watchlist (Planned)</h2>
     {{#if watchlist.length}}
    <div class="swiper media-swiper">
        <div class="swiper-wrapper">
             {{!-- Render watchlist items using mediaCard partial --}}
             {{!-- The 'watchlist' variable comes from viewRoutes.js --}}
            {{#each watchlist}}
            <div class="swiper-slide">
                 {{!-- Need to adapt watchlist data if structure differs from mediaCard expectation --}}
                {{> mediaCard items=(list this) userStatus='planned' }} {{!-- Override status visually for this section --}}
             </div>
            {{/each}}
        </div>
         <div class="swiper-button-prev"></div>
         <div class="swiper-button-next"></div>
    </div>
    {{else}}
        <p class="placeholder-text">Your watchlist is empty. Search and add items!</p>
    {{/if}}
</section>
{{/if}}


{{!-- Recommendation Section (Placeholder) --}}
<section class="media-carousel-section container">
    <h2 class="section-title">✨ Recommendations For You</h2>
     <div class="swiper media-swiper">
        <div class="swiper-wrapper">
            {{#each recommendations}}
            <div class="swiper-slide">
                 {{> mediaCard items=(list this) }}
             </div>
            {{/each}}
        </div>
        <div class="swiper-button-prev"></div>
        <div class="swiper-button-next"></div>
    </div>
</section>

{{!-- Helper function to wrap single item in list for partial --}}
{{#*inline "list"}}[{{> (lookup . '0')}}] {{/inline}}

```

### listDetail.hbs

```hbs
{{! views/listDetail.hbs }}
<div class="list-detail-page container">
    <section class="list-detail-header card">
         <div class="list-cover">
            <img src="{{defaultIfEmpty list.coverImageUrl '/images/placeholder_list.png'}}" alt="{{list.title}} Cover" onerror="this.onerror=null; this.src='/images/placeholder_list.png';">
         </div>
         <div class="list-info">
             <h1>{{list.title}}</h1>
             <p class="list-owner">Created by <a href="/profile/{{list.ownerUsername}}">{{list.ownerUsername}}</a></p>
             <p class="list-description">{{defaultIfEmpty list.description "No description provided."}}</p>
              <div class="list-meta">
                 <span>{{list.items.length}} items</span>
                 <span>Status: {{#if list.isPublic}}Public{{else}}Private{{/if}}</span>
                 <span>Last updated: {{formatDate list.updatedAt}}</span>
             </div>
             {{#if isOwner}}
                 <div class="list-owner-actions">
                     <button class="btn btn-secondary btn-small edit-list-btn" data-list-id="{{list.id}}">Edit List Details</button>
                     {{!-- Add Item button could go here or below the table --}}
                      <button class="btn btn-danger btn-small delete-list-btn" data-list-id="{{list.id}}" data-list-title="{{list.title}}">Delete List</button>
                 </div>
             {{/if}}
         </div>
    </section>

    <section class="list-items-section card">
        <h2>Items in this list</h2>
         {{#if isOwner}}
             <div class="add-item-to-list">
                 {{!-- Simple Add Item Form - Could be more complex (search library) --}}
                 <form id="addToListForm">
                    <input type="hidden" name="listId" value="{{list.id}}">
                    <div class="form-group">
                        <label for="libraryItemIdToAdd">Add Item (Enter Library Item ID):</label>
                        <input type="number" id="libraryItemIdToAdd" name="libraryItemId" placeholder="Find item in your library first" required>
                        <small>You need the ID from your main library.</small>
                    </div>
                     <div class="form-group">
                         <label for="itemCommentToAdd">Comment (Optional):</label>
                         <input type="text" id="itemCommentToAdd" name="userComment">
                     </div>
                    <button type="submit" class="btn btn-primary btn-small">Add to List</button>
                     <span id="addItemStatus" class="status-message"></span>
                 </form>
             </div>
             <hr>
         {{/if}}

        {{#if list.items.length}}
            <div class="list-items-table">
                 <div class="table-header">
                    <div class="col-title">Title</div>
                    <div class="col-status">My Status</div>
                    <div class="col-comment">List Comment</div>
                    <div class="col-added">Added</div>
                    {{#if isOwner}}<div class="col-actions">Actions</div>{{/if}}
                 </div>
                 {{#each list.items}}
                     {{> listItemRow item=this isOwner=../isOwner listId=../list.id}}
                 {{/each}}
             </div>
        {{else}}
            <p class="placeholder-text">This list is currently empty.</p>
        {{/if}}
    </section>
</div>

```

### login.hbs

```hbs
{{! views/login.hbs }}
{{!-- Use a different layout potentially without the main header/nav --}}
{{!< auth }} {{!-- Assuming an auth.hbs layout exists or modify main.hbs --}}

<div class="auth-container">
    <div class="auth-logo">
        <span class="logo-icon">🎬</span> MediaTracker
    </div>

    {{#if loginError}}
        <p class="error-message">{{loginError}}</p>
    {{/if}}
     {{#if registerMessage}}
        <p class="success-message">{{registerMessage}}</p>
    {{/if}}
     {{#if errorMessage}} {{!-- General errors passed via query param maybe --}}
        <p class="error-message">{{errorMessage}}</p>
    {{/if}}


    <div class="auth-forms">
        {{!-- Login Form --}}
        <div class="auth-form-card">
            {{> loginForm }}
        </div>

         {{!-- Separator --}}
         <div class="auth-separator">
            <span>OR</span>
         </div>


        {{!-- Register Form --}}
         <div class="auth-form-card">
            {{> registerForm }}
        </div>
    </div>

     <p class="auth-footer-link"><a href="/">Back to Home</a></p>
</div>

```

### mediaDetail.hbs

```hbs
{{! views/mediaDetail.hbs }}
<div class="media-detail-page">
    {{!-- Background Image / Backdrop --}}
    {{#if item.backdropPath}} {{!-- Assuming backdropPath is provided by details API --}}
        <div class="backdrop-image" style="background-image: url('{{item.backdropPath}}');"></div>
    {{else}}
         <div class="backdrop-image placeholder"></div>
    {{/if}}

    <div class="detail-content container">
        {{!-- Main Info Section --}}
        <section class="detail-main-info">
            <div class="detail-poster">
                <img src="{{defaultIfEmpty item.imageUrl '/images/placeholder.png'}}" alt="{{item.title}} Poster" onerror="this.onerror=null; this.src='/images/placeholder.png';">
            </div>
            <div class="detail-text">
                <h1>{{item.title}} {{#if item.releaseYear}}({{item.releaseYear}}){{/if}}</h1>
                <p class="detail-subtitle">{{item.subtitle}}</p>
                <div class="detail-meta">
                    <span class="tag tag-{{classify item.mediaType}}">{{capitalize item.mediaType}}</span>
                    {{#if item.genres.length}}<span>{{join item.genres ", "}}</span>{{/if}}
                     {{#if item.runtime}}<span>{{item.runtime}}</span>{{/if}} {{!-- Add runtime if available --}}
                     {{#if item.releaseDate}}<span>Released: {{formatDate item.releaseDate}}</span>{{/if}}
                </div>
                <div class="detail-actions">
                     {{!-- User Interaction Partial --}}
                     {{> userInteractionControls item=item user=user}}
                </div>
                <h3>Overview</h3>
                <p class="detail-description">{{defaultIfEmpty item.description "No description available."}}</p>
            </div>
        </section>

         {{!-- Metadata Section --}}
        <section class="detail-metadata card">
            <h3>Details</h3>
            <div class="metadata-grid">
                {{#if item.directors.length}}<div class="meta-item"><span class="meta-label">Director(s):</span> <span class="meta-value">{{join item.directors ", "}}</span></div>{{/if}}
                {{#if item.screenwriters.length}}<div class="meta-item"><span class="meta-label">Writer(s):</span> <span class="meta-value">{{join item.screenwriters ", "}}</span></div>{{/if}}
                {{#if item.authors.length}}<div class="meta-item"><span class="meta-label">Author(s):</span> <span class="meta-value">{{join item.authors ", "}}</span></div>{{/if}}
                 {{#if item.developers.length}}<div class="meta-item"><span class="meta-label">Developer(s):</span> <span class="meta-value">{{join item.developers ", "}}</span></div>{{/if}}
                {{#if item.publisher}}<div class="meta-item"><span class="meta-label">Publisher:</span> <span class="meta-value">{{item.publisher}}</span></div>{{/if}}
                {{#if item.platforms.length}}<div class="meta-item"><span class="meta-label">Platform(s):</span> <span class="meta-value">{{join item.platforms ", "}}</span></div>{{/if}}
                 {{#if item.pageCount}}<div class="meta-item"><span class="meta-label">Pages:</span> <span class="meta-value">{{item.pageCount}}</span></div>{{/if}}

                 {{#if item.apiRating}}
                 <div class="meta-item">
                     <span class="meta-label">Community Rating:</span>
                     <span class="meta-value rating-display">
                        {{renderStars item.apiRating 10}} ({{item.apiRating}}/10)
                     </span>
                 </div>
                 {{/if}}
                 {{!-- External Links --}}
                  <div class="meta-item external-links">
                     {{#if item.imdbId}} <a href="https://www.imdb.com/title/{{item.imdbId}}/" target="_blank" rel="noopener">IMDb</a> {{/if}}
                     {{#if item.tmdbLink}} <a href="{{item.tmdbLink}}" target="_blank" rel="noopener">TMDB</a> {{/if}}
                     {{#if item.googleBooksLink}} <a href="{{item.googleBooksLink}}" target="_blank" rel="noopener">Google Books</a> {{/if}}
                     {{#if item.igdbLink}} <a href="{{item.igdbLink}}" target="_blank" rel="noopener">IGDB</a> {{/if}}
                 </div>
            </div>
        </section>

        {{!-- Cast/Characters Section --}}
         {{#if item.cast.length}}
         <section class="detail-cast-section card">
             <h3>Cast</h3>
              <div class="swiper cast-swiper">
                 <div class="swiper-wrapper">
                     {{#each item.cast}}
                         <div class="swiper-slide cast-member">
                             <img src="{{#if profilePath}}https://image.tmdb.org/t/p/w185{{profilePath}}{{else}}/images/placeholder_avatar.png{{/if}}" alt="{{name}}" loading="lazy" onerror="this.src='/images/placeholder_avatar.png';">
                             <p class="cast-name">{{name}}</p>
                             <p class="cast-character">{{character}}</p>
                         </div>
                     {{/each}}
                 </div>
                 <div class="swiper-button-prev"></div>
                 <div class="swiper-button-next"></div>
             </div>
         </section>
         {{/if}}


        {{!-- Related Media Section (Placeholder Data) --}}
        {{#if relatedMedia.length}}
        <section class="media-carousel-section card">
            <h3 class="section-title">Related Media</h3>
            <div class="swiper media-swiper">
                <div class="swiper-wrapper">
                     {{#each relatedMedia}}
                     <div class="swiper-slide">
                         {{> mediaCard items=(list this) }}
                      </div>
                     {{/each}}
                </div>
                 <div class="swiper-button-prev"></div>
                 <div class="swiper-button-next"></div>
            </div>
        </section>
        {{/if}}

        {{!-- Reviews Section (Placeholder) --}}
        <section class="detail-reviews-section card">
            <h3>Reviews (Coming Soon)</h3>
            <p class="placeholder-text">User reviews will appear here.</p>
             {{!-- Example Review structure --}}
             {{#each reviews}}
             <div class="review-item"> ... </div>
             {{/each}}
        </section>

    </div>
</div>

```

### searchResults.hbs

```hbs
{{! views/searchResults.hbs }}
<div class="search-results-page container">
    {{#if query}}
        <h1 class="search-title">Search Results for: <strong>"{{query}}"</strong></h1>
    {{else}}
         <h1 class="search-title">Search</h1>
         <p>Please enter a search term in the header search bar.</p>
    {{/if}}

    {{#if query}} {{!-- Only show results sections if query exists --}}
        {{#each results}} {{!-- Iterate through categories (movie, series, book, video game) --}}
            {{#if this.length}} {{!-- Only show section if it has results --}}
                <section class="results-category">
                    <h2 class="category-title">{{capitalize @key}}</h2>
                     {{#if (eq @key 'video game')}}<h2 class="category-title">Video Games</h2>{{/if}} {{!-- Fix key display --}}

                    <div class="results-grid">
                         {{!-- Render media cards for this category --}}
                         {{> mediaCard items=this cardClass=(concat "result-" @key) }}
                    </div>
                     {{!-- Placeholder for Load More/Pagination --}}
                     {{!-- <div class="pagination-controls text-center">
                         <button class="btn btn-secondary load-more-btn" data-category="{{@key}}" data-page="1">Load More {{capitalize @key}}s</button>
                     </div> --}}
                 </section>
            {{/if}}
        {{/each}}

        {{!-- Handle Case Where No Results Found Across All Categories --}}
        {{#unless (or results.movie.length results.series.length results.book.length results.video_game.length)}}
             <p class="placeholder-text no-results">No results found for "{{query}}". Try a different search term.</p>
        {{/unless}}

    {{/if}}
</div>

```

### userListsOverview.hbs

```hbs
{{! views/userListsOverview.hbs }}
<div class="lists-overview-page container">
    <h1>My Media Lists</h1>

    <div class="list-actions">
        {{!-- This button's click is handled by main.js to open the list creation modal --}}
        <button id="createListBtn" class="btn btn-primary">
             <span class="icon">➕</span> Create New List
        </button>
    </div>

     {{#if lists.length}}
         <section class="lists-container">
             {{!-- Iterate through the lists fetched by the viewRoute --}}
             {{#each lists}}
                 {{!-- Render each list using the summary row partial --}}
                 {{!-- isOwner is true because this page only shows the logged-in user's lists --}}
                 {{> listSummaryRow list=this isOwner=true}}
             {{/each}}
         </section>
     {{else}}
        {{!-- Message shown if the user has no lists --}}
        <p class="placeholder-text card">You haven't created any lists yet. Click "Create New List" to start!</p>
     {{/if}}

     {{!--
        This hidden area is targeted by main.js when the 'Create New List' or 'Edit List'
        buttons are clicked. The JavaScript will inject the appropriate form (likely using
        a template fetched from the server or built dynamically) into the generic 'formModal'.
        We don't strictly need this #listFormArea div here if the JS always targets #formModal,
        but keeping it can be a reminder or fallback target if needed.
     --}}
     {{!-- <div id="listFormArea" class="hidden"></div> --}}
</div>
```

### userProfile.hbs

```hbs
{{! views/userProfile.hbs }}
<div class="profile-page container">
    <section class="profile-header card">
        <div class="profile-banner"> {{!-- Placeholder banner --}} </div>
        <div class="profile-info">
            <img src="{{defaultIfEmpty profile.profileImageUrl '/images/placeholder_avatar.png'}}" alt="{{profile.username}}'s Profile Picture" class="profile-picture" onerror="this.onerror=null; this.src='/images/placeholder_avatar.png';">
            <div class="profile-details">
                <h2>{{profile.username}}</h2>
                <p class="member-since">Member since {{formatDate profile.memberSince}}</p>
                <div class="profile-privacy">
                     {{#if isOwnProfile}}
                        <form id="privacyForm">
                            <label for="privacyToggle">Profile:</label>
                            <select id="privacyToggle" name="profilePrivacy">
                                <option value="private" {{#eq profile.profilePrivacy 'private'}}selected{{/eq}}>Private</option>
                                <option value="public" {{#eq profile.profilePrivacy 'public'}}selected{{/eq}}>Public</option>
                            </select>
                             <button type="submit" class="btn btn-secondary btn-small">Save</button>
                             <span id="privacyStatus" class="status-message"></span>
                        </form>
                    {{else}}
                        <span>Profile is {{capitalize profile.profilePrivacy}}</span>
                    {{/if}}
                 </div>
            </div>
            <div class="profile-actions">
                {{#unless isOwnProfile}}
                    {{!-- Social Feature: Add Friend Button (Skipped) --}}
                    {{!-- <button class="btn btn-primary add-friend-btn">Add Friend</button> --}}
                {{else}}
                     {{!-- <button class="btn btn-secondary edit-profile-btn">Edit Profile</button> --}}
                {{/unless}}
            </div>
        </div>
        <div class="profile-stats">
            <div class="stat-item">
                <span class="stat-value">{{defaultIfEmpty profile.countMediaCompleted 0}}</span>
                <span class="stat-label">Media Completed</span>
            </div>
             <div class="stat-item">
                <span class="stat-value">{{defaultIfEmpty profile.averageScore "-"}}</span>
                <span class="stat-label">Average Score</span>
            </div>
             <div class="stat-item">
                <span class="stat-value">{{defaultIfEmpty profile.countMediaTotal 0}}</span>
                <span class="stat-label">Items Tracked</span>
            </div>
            {{!-- Add more stats here if available --}}
        </div>
    </section>

    {{!-- Last Seen Section --}}
    <section class="media-carousel-section container">
        <h2 class="section-title">Recently Completed</h2>
         {{#if lastSeen.length}}
         <div class="swiper media-swiper">
            <div class="swiper-wrapper">
                {{#each lastSeen}}
                <div class="swiper-slide">
                    {{> mediaCard items=(list this) }}
                 </div>
                {{/each}}
            </div>
             <div class="swiper-button-prev"></div>
             <div class="swiper-button-next"></div>
        </div>
        {{else}}
        <p class="placeholder-text">No recently completed items.</p>
        {{/if}}
    </section>

    {{!-- Favorites Section --}}
    <section class="media-carousel-section container">
        <h2 class="section-title">⭐ Favorites</h2>
         {{#if favorites.length}}
         <div class="swiper media-swiper">
            <div class="swiper-wrapper">
                {{#each favorites}}
                <div class="swiper-slide">
                    {{> mediaCard items=(list this) }}
                </div>
                {{/each}}
            </div>
            <div class="swiper-button-prev"></div>
            <div class="swiper-button-next"></div>
        </div>
        {{else}}
        <p class="placeholder-text">No favorite items marked yet.</p>
        {{/if}}
    </section>

    {{!-- Public Lists Section --}}
    <section class="media-carousel-section container">
        <h2 class="section-title">Public Lists</h2>
         {{#if publicLists.length}}
          <div class="swiper list-swiper"> {{!-- Potentially use a different card for lists --}}
            <div class="swiper-wrapper">
                 {{#each publicLists}}
                 <div class="swiper-slide">
                     {{!-- Render List Summary Card (Need a partial 'listCard' or adapt 'listSummaryRow') --}}
                      <div class="list-card">
                          <a href="/lists/{{this.id}}">
                             <img src="{{defaultIfEmpty this.coverImageUrl '/images/placeholder_list.png'}}" alt="{{this.title}} Cover" class="list-card-image" onerror="this.onerror=null; this.src='/images/placeholder_list.png';">
                             <div class="list-card-info">
                                 <h3 class="list-card-title">{{truncate this.title 40}}</h3>
                                 <p>{{this.itemCount}} items</p>
                             </div>
                          </a>
                      </div>
                  </div>
                 {{/each}}
            </div>
             <div class="swiper-button-prev"></div>
             <div class="swiper-button-next"></div>
        </div>
        <p><a href="/lists?userId={{profile.id}}">View all lists...</a></p> {{!-- Link to full list overview --}}
        {{else}}
        <p class="placeholder-text">{{#if isOwnProfile}}You haven't created any public lists.{{else}}This user has no public lists.{{/if}}</p>
        {{/if}}
    </section>

</div>

```

### auth.hbs

```hbs
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{pageTitle}} - MediaTracker</title>
    {{!-- Link main stylesheet which includes auth page styles --}}
    <link rel="stylesheet" href="/css/style.css">
    {{!-- Add specific auth layout class to body for targeting --}}
    <style>
        /* Minimal inline style to ensure body takes full height if needed */
        html, body { height: 100%; margin: 0; padding: 0; }
        body { display: flex; justify-content: center; align-items: center; }
    </style>
</head>
{{!-- Add class to body for auth page specific styling --}}
<body class="auth-layout">

    {{{body}}}

    <script src="/js/main.js"></script>
</body>
</html>
```

### main.hbs

```hbs
{{! views/layouts/main.hbs }}
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{pageTitle}} - MediaTracker</title>
    {{!-- Link Swiper CSS if using for carousels --}}
     <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css"/>
    <link rel="stylesheet" href="/css/style.css">
</head>
<body>
    {{!-- Render the new header partial --}}
    {{> header user=user}} {{!-- Pass user explicitly if needed --}}

    <main class="container {{#if pageClass}}{{pageClass}}{{/if}}">
        {{{body}}}
    </main>

    {{> footer }}

    {{!-- Reusable Modal for Forms (Add/Edit Library Item, Create List etc.) --}}
    <div id="formModal" class="modal-overlay hidden">
        <div class="modal-content" id="modalContentArea">
            {{!-- Content loaded dynamically via JS --}}
            Loading form...
        </div>
    </div>

    {{!-- Delete Confirmation Modal (Keep as is, or adapt if needed) --}}
    <div id="deleteConfirmModal" class="modal-overlay hidden">
        <div class="modal-content modal-confirm">
             <button class="modal-close-btn" aria-label="Close">×</button>
             <h3>Confirm Action</h3>
             <p id="deleteConfirmMessage">Are you sure?</p>
             <div class="modal-actions">
                 <button type="button" class="btn btn-secondary modal-cancel-btn">Cancel</button>
                 <button type="button" id="deleteConfirmBtn" class="btn btn-danger">Confirm</button>
                  <div id="deleteSpinner" class="spinner hidden"></div>
             </div>
        </div>
    </div>

    {{!-- Handlebars Runtime --}}
    <script src="https://cdnjs.cloudflare.com/ajax/libs/handlebars.js/4.7.8/handlebars.min.js"></script>
    {{!-- Swiper JS if using --}}
    <script src="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js"></script>
    {{!-- Main Client-Side JS --}}
    <script src="/js/main.js"></script>
</body>
</html>

```

### footer.hbs

```hbs
{{! views/partials/footer.hbs }}
<footer>
    <div class="container">
        <p>© {{currentYear}} MediaTracker. All rights reserved.</p>
        {{!-- Add other links if needed --}}
    </div>
</footer>

```

### header.hbs

```hbs
{{! views/partials/header.hbs }}
<header class="site-header">
    <div class="container header-content">
        <a href="/" class="logo" aria-label="Homepage">
            {{!-- Replace with actual SVG or Image Logo --}}
            <span class="logo-icon">🎬</span>
            <span class="logo-text">MediaTracker</span>
        </a>

        <div class="search-container">
            <form action="/search" method="GET" class="header-search-form">
                <label for="headerSearchQuery" class="sr-only">Search Media</label>
                <input type="search" id="headerSearchQuery" name="q" placeholder="Search movies, series, books, games..." required
                       value="{{query}}"> {{!-- Populate if on search results page --}}
                <button type="submit" class="search-button" aria-label="Search">
                     <span class="icon">🔍</span>
                </button>
            </form>
        </div>

        <nav class="user-nav">
            {{#if user}}
                <a href="/profile" class="profile-link" aria-label="My Profile">
                    {{!-- Placeholder Profile Icon/Image --}}
                    <img src="{{user.profileImageUrl}}" alt="My Profile" class="profile-icon" onerror="this.src='/images/placeholder_avatar.png';">
                    {{!-- <span class="profile-icon">👤</span> --}}
                </a>
                 <button id="logoutBtn" class="btn btn-secondary btn-small" title="Logout">Logout</button>
            {{else}}
                <a href="/login" class="btn btn-primary btn-small">Login</a>
            {{/if}}
        </nav>
    </div>
</header>

```

### itemFormModal.hbs

```hbs
{{! views/partials/itemFormModal.hbs }}
{{! Modal used for Adding/Editing items in the LIBRARY }}
<button class="modal-close-btn" aria-label="Close">×</button>
<h2>{{modalTitle}}</h2>

<form id="libraryItemForm" data-mode="{{mode}}" data-item-id="{{item.id}}" data-library-item-id="{{item.libraryItemId}}">
    {{!-- Hidden fields for context if needed --}}
    <input type="hidden" name="mediaType" value="{{item.mediaType}}">
    <input type="hidden" name="mediaId" value="{{item.mediaId}}">
     {{!-- Core details needed only for ADD --}}
     {{#if (eq mode 'add')}}
    <input type="hidden" name="title" value="{{item.title}}">
    <input type="hidden" name="imageUrl" value="{{item.imageUrl}}">
    <input type="hidden" name="releaseYear" value="{{item.releaseYear}}">
     {{/if}}


    {{#if item.imageUrl}}
        <img src="{{item.imageUrl}}" alt="{{item.title}}" class="modal-image-preview" onerror="this.style.display='none';">
    {{/if}}
    <p><strong>{{item.title}}</strong> ({{item.releaseYear}})</p>

    <div class="form-group">
        <label for="userStatus">Status:</label>
        <select id="userStatus" name="userStatus" required>
            {{!-- Use new statuses --}}
            <option value="planned" {{#if (eq item.userStatus 'planned')}}selected{{/if}}>Planned</option>
            <option value="watching" {{#if (eq item.userStatus 'watching')}}selected{{/if}}>Watching / Reading / Playing</option>
            <option value="completed" {{#if (eq item.userStatus 'completed')}}selected{{/if}}>Completed</option>
            <option value="paused" {{#if (eq item.userStatus 'paused')}}selected{{/if}}>Paused</option>
            <option value="dropped" {{#if (eq item.userStatus 'dropped')}}selected{{/if}}>Dropped</option>
        </select>
    </div>
    <div class="form-group">
        <label for="userRating">Rating (1-10):</label>
        <input type="number" id="userRating" name="userRating" min="1" max="10" placeholder="None" value="{{item.userRating}}">
    </div>
     <div class="form-group">
        <label for="isFavorite">Favorite:</label>
         <input type="checkbox" id="isFavorite" name="isFavorite" value="true" {{#if item.isFavorite}}checked{{/if}}>
    </div>
    <div class="form-group">
        <label for="userNotes">Notes:</label>
        <textarea id="userNotes" name="userNotes" rows="3" placeholder="Your personal notes...">{{item.userNotes}}</textarea>
    </div>
    <div class="modal-actions">
        <button type="button" class="btn btn-secondary modal-cancel-btn">Cancel</button>
        <button type="submit" class="btn btn-primary">{{submitButtonText}}</button>
        <div id="modalSpinner" class="spinner hidden"></div>
    </div>
     <p class="modal-error-message hidden"></p>
</form>

```

### libraryControls.hbs

```hbs
<div id="libraryControls" class="library-controls">
    <button id="getLibraryBtn" class="btn btn-secondary btn-small" title="Refresh Library">🔄</button>
    <div class="filters">
        <span class="filter-label sr-only">Filter by:</span>
        <select id="filterMediaType" title="Filter by Type">
            <option value="">All Types</option>
            <option value="movie">Movie</option>
            <option value="series">Series</option>
            <option value="book">Book</option>
            <option value="video game">Video Game</option>
        </select>
        <select id="filterStatus" title="Filter by Status">
            <option value="">All Statuses</option>
            <option value="to watch">To Watch</option>
            <option value="watching">Watching</option>
            <option value="watched">Watched</option>
            <option value="to read">To Read</option>
            <option value="reading">Reading</option>
            <option value="read">Read</option>
             <option value="to play">To Play</option>
            <option value="playing">Playing</option>
            <option value="played">Played</option>
        </select>
        <input type="number" id="filterMinRating" min="1" max="20" placeholder="Min Rate" title="Minimum User Rating">
        <input type="number" id="filterMaxRating" min="1" max="20" placeholder="Max Rate" title="Maximum User Rating">
    </div>
     <div id="librarySpinner" class="spinner hidden"></div>
</div>
```

### listItemRow.hbs

```hbs
{{! views/partials/listItemRow.hbs }}
<div class="list-item-row" data-list-item-id="{{item.listItemId}}" data-library-item-id="{{item.libraryItemId}}">
    {{!-- Checkbox functionality undefined --}}
    {{!-- <div class="col-checkbox"><input type="checkbox"></div> --}}
    <div class="col-title">
        <img src="{{defaultIfEmpty item.imageUrl '/images/placeholder.png'}}" alt="" class="item-row-thumb" loading="lazy" onerror="this.onerror=null; this.src='/images/placeholder.png';">
        <a href="/media/{{item.mediaType}}/{{item.mediaId}}">{{item.title}}</a>
         <span class="item-row-year">({{item.releaseYear}})</span>
    </div>
    <div class="col-status">
         <span class="tag tag-status-{{classify item.userStatus}}">{{capitalize item.userStatus}}</span>
         {{#if item.userRating}}({{item.userRating}}/10){{/if}}
    </div>
    <div class="col-comment">{{defaultIfEmpty item.userComment "---"}}</div>
    <div class="col-added">{{formatDate item.dateAdded}}</div>
     {{#if isOwner}}
    <div class="col-actions">
        <button class="btn btn-secondary btn-small edit-list-item-comment-btn" title="Edit Comment"><span class="icon">✏️</span></button>
        <button class="btn btn-danger btn-small remove-list-item-btn" title="Remove from List"><span class="icon">🗑️</span></button>
    </div>
    {{/if}}
     {{#if isOwner}}
     {{!-- Hidden Edit Comment Form --}}
     <form class="edit-comment-form hidden">
         <input type="text" name="userComment" value="{{item.userComment}}" placeholder="Enter comment">
         <button type="submit" class="btn btn-primary btn-small">Save</button>
         <button type="button" class="btn btn-secondary btn-small cancel-edit-comment-btn">Cancel</button>
     </form>
     {{/if}}
</div>

```

### listSummaryRow.hbs

```hbs
{{! views/partials/listSummaryRow.hbs }}
<div class="list-summary-row card" data-list-id="{{list.id}}">
     {{!-- Checkbox functionality undefined, maybe remove for now --}}
     {{!-- <input type="checkbox" class="list-checkbox" aria-label="Select list {{list.title}}"> --}}
    <div class="list-summary-details">
        <h3><a href="/lists/{{list.id}}">{{list.title}}</a></h3>
        <p class="list-summary-meta">
             By <a href="/profile/{{list.ownerUsername}}">{{list.ownerUsername}}</a> | {{list.itemCount}} items | {{#if list.isPublic}}Public{{else}}Private{{/if}}
        </p>
        <p class="list-summary-desc">{{truncate list.description 100}}</p>
    </div>
     {{#if isOwner}}
    <div class="list-summary-actions">
        <button class="btn btn-secondary btn-small edit-list-btn" title="Edit List"><span class="icon">✏️</span></button>
        <button class="btn btn-danger btn-small delete-list-btn" title="Delete List" data-list-title="{{list.title}}"><span class="icon">🗑️</span></button>
    </div>
     {{/if}}
</div>

```

### loginForm.hbs

```hbs
{{!-- Ensure the id="loginForm" is present on the form tag --}}
<form id="loginForm">
    <h3>Login</h3>
    <div class="form-group">
        <label for="loginUsername">Username:</label>
        <input type="text" id="loginUsername" name="username" required>
    </div>
    <div class="form-group">
        <label for="loginPassword">Password:</label>
        <input type="password" id="loginPassword" name="password" required>
    </div>
    <div class="form-actions">
        <button type="submit" class="btn btn-primary">Login</button>
        <div id="loginSpinner" class="spinner hidden"></div>
    </div>
    <p id="loginError" class="form-error hidden" aria-live="assertive"></p>
</form>
```

### mediaCard.hbs

```hbs
{{! views/partials/mediaCard.hbs }}
{{! Simplified card for grids and horizontal lists }}

{{#each items}}
<div class="media-card {{statusOutlineClass userStatus}}" data-media-type="{{mediaType}}" data-media-id="{{mediaId}}">
    <a href="/media/{{mediaType}}/{{mediaId}}" class="card-link" aria-label="View details for {{title}}">
        <div class="card-image-container">
            <img src="{{defaultIfEmpty imageUrl '/images/placeholder.png'}}" alt="{{title}} Poster" class="card-image" loading="lazy" onerror="this.onerror=null; this.src='/images/placeholder.png';">
             {{!-- Optional: Add overlay/icons based on status or type --}}
             {{#if userStatus}}
                <span class="status-indicator status-{{userStatus}}">{{capitalize userStatus}}</span>
             {{/if}}
        </div>
        <div class="card-info">
            <h3 class="card-title">{{truncate title 50}}</h3>
            <p class="card-subtitle">
                 {{#if authors}}
                    {{truncate (join authors ", ") 30}}
                 {{else}}
                     {{!-- Show type or year if no author --}}
                     {{capitalize mediaType}}
                 {{/if}}
                 {{#if releaseYear}}
                    <span class="card-year">({{releaseYear}})</span>
                 {{/if}}
            </p>
        </div>
    </a>
     {{!-- Removed action buttons - Interaction is now clicking the card --}}
</div>
{{else}}
    {{!-- No items placeholder (optional, handled by parent typically) --}}
    {{!-- <p class="no-items">No items to display.</p> --}}
{{/each}}

```

### registerForm.hbs

```hbs
{{!-- Ensure the id="registerForm" is present on the form tag --}}
<form id="registerForm">
    <h3>Register</h3>
    <div class="form-group">
        <label for="regUsername">Username:</label>
        <input type="text" id="regUsername" name="username" required>
    </div>
    <div class="form-group">
        <label for="regPassword">Password (min 6 chars):</label>
        <input type="password" id="regPassword" name="password" required minlength="6">
    </div>
     <div class="form-actions">
        <button type="submit" class="btn btn-secondary">Register</button>
         <div id="registerSpinner" class="spinner hidden"></div>
    </div>
     <p id="registerMessage" class="form-message hidden" aria-live="polite"></p>
     <p id="registerError" class="form-error hidden" aria-live="assertive"></p>
</form>
```

### userInteractionControls.hbs

```hbs
{{! views/partials/userInteractionControls.hbs }}

{{!-- Store core details needed for the "Add" action --}}
<div class="user-interaction-controls"
     data-library-item-id="{{item.libraryItemId}}"
     data-media-type="{{item.mediaType}}"
     data-media-id="{{item.mediaId}}"
     data-title="{{item.title}}"
     data-image-url="{{item.imageUrl}}"
     data-release-year="{{item.releaseYear}}">
     {{#if user}} {{!-- Outer #if user --}}
        <form id="mediaInteractionForm">
            {{!-- Status Dropdown --}}
            <div class="interaction-group status-group">
                 <label for="detailStatusSelect">My Status:</label>
                 <select id="detailStatusSelect" name="userStatus">
                    {{#unless item.isInLibrary}} {{!-- #unless --}}
                        {{!-- Default options for adding --}}
                        <option value="planned" selected>Planned</option>
                        <option value="watching">Watching</option>
                        <option value="completed">Completed</option>
                        <option value="paused">Paused</option>
                        <option value="dropped">Dropped</option>
                    {{else}} {{!-- else for #unless --}}
                        {{!-- Options selected based on current status for editing --}}
                         <option value="planned" {{#if (eq item.userStatus 'planned')}}selected{{/if}}>Planned</option>
                         <option value="watching" {{#if (eq item.userStatus 'watching')}}selected{{/if}}>Watching</option>
                         <option value="completed" {{#if (eq item.userStatus 'completed')}}selected{{/if}}>Completed</option>
                         <option value="paused" {{#if (eq item.userStatus 'paused')}}selected{{/if}}>Paused</option>
                         <option value="dropped" {{#if (eq item.userStatus 'dropped')}}selected{{/if}}>Dropped</option>
                      {{!-- No inner ifs to close here in the corrected version --}}
                    {{/unless}} {{!-- Close #unless --}}
                 </select>
            </div>
            {{!-- Rating Input --}}
             <div class="interaction-group rating-group">
                 <label for="detailRatingInput">My Rating:</label>
                 <input type="number" id="detailRatingInput" name="userRating" min="1" max="10" placeholder="-" value="{{item.userRating}}">
                 <span>/ 10</span>
            </div>
            {{!-- Favorite Checkbox --}}
             <div class="interaction-group favorite-group">
                 <label for="detailFavoriteToggle">Favorite:</label>
                 <input type="checkbox" id="detailFavoriteToggle" name="isFavorite" value="true" {{#if item.isFavorite}}checked{{/if}}> {{!-- Single #if, no /if needed for attribute --}}
             </div>
             {{!-- Notes Textarea --}}
              <div class="interaction-group notes-group">
                 <label for="detailNotesInput">My Notes:</label>
                 <textarea id="detailNotesInput" name="userNotes" rows="2" placeholder="Add notes...">{{item.userNotes}}</textarea>
            </div>

            {{!-- Action Buttons --}}
            <div class="interaction-actions">
                {{!-- Buttons' visibility controlled by updateInteractionControls JS --}}
                <button type="button" class="btn btn-primary btn-small add-to-library-btn {{#if item.isInLibrary}}hidden{{/if}}">Add to Library</button>
                <button type="submit" class="btn btn-primary btn-small {{#unless item.isInLibrary}}hidden{{/unless}}">Update</button>
                <button type="button" class="btn btn-danger btn-small remove-from-library-btn {{#unless item.isInLibrary}}hidden{{/unless}}">Remove from Library</button>

                <span id="interactionStatus" class="status-message hidden"></span>
                <div id="interactionSpinner" class="spinner hidden"></div>
            </div>
        </form>
    {{else}} {{!-- else for #if user --}}
        <p><a href="/login">Login</a> to track this item.</p>
    {{/if}} {{!-- Close #if user --}}
</div>
```


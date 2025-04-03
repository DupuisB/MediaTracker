# Folder Architecture for `C:\Users\benjamin\Documents\igr\MediaTracker`

## Folder Structure

- MediaTracker/
    - .env
    - .gitignore
    - auth.js
    - database.js
    - dbUtils.js
    - folder_structure.md
    - package-lock.json
    - package.json
    - server.js
    - server.md
    - useless.py
    - watchlist.db
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
                - _modal.css
                - _navigation.css
                - _spinner.css
                - _tags.css
            - layout/
                - _container.css
                - _footer.css
                - _grid.css
                - _header.css
            - pages/
                - _auth.css
                - _home.css
                - _library.css
            - utils/
                - _helpers.css
        - images/
            - placeholder.png
        - js/
            - main.js
    - routes/
        - viewRoutes.js
        - api/
            - authRoutes.js
            - detailsRoutes.js
            - igdbAuthHelper.js
            - libraryRoutes.js
            - searchRoutes.js
    - views/
        - about.hbs
        - error.hbs
        - home.hbs
        - library.hbs
        - login.hbs
        - layouts/
            - main.hbs
        - partials/
            - footer.hbs
            - header.hbs
            - itemFormModal.hbs
            - libraryControls.hbs
            - loginForm.hbs
            - mediaCard.hbs
            - mediaDetailsModal.hbs
            - registerForm.hbs
            - searchForm.hbs

## Code Files

### auth.js

```js
// auth.js
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
        req.user = decoded; // Optional: Add full decoded payload
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
        return res.redirect('/login');
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
const dbPath = path.resolve(__dirname, 'watchlist.db');

// Create or open the database
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('FATAL: Error opening database:', err.message);
        process.exit(1); // Exit if DB can't be opened
    } else {
        console.log('Connected to the SQLite database.');
        initializeDatabase();
    }
});

// --- Promise Wrappers for DB Methods ---
// These make it easier to use async/await with the sqlite3 library

/**
 * Promisified version of db.get
 * @param {string} sql The SQL query to execute.
 * @param {Array} [params=[]] Optional parameters for the SQL query.
 * @returns {Promise<object|undefined>} Resolves with the row found, or undefined if not found. Rejects on error.
 */
db.getAsync = util.promisify(db.get).bind(db);

/**
 * Promisified version of db.all
 * @param {string} sql The SQL query to execute.
 * @param {Array} [params=[]] Optional parameters for the SQL query.
 * @returns {Promise<Array>} Resolves with an array of rows found. Rejects on error.
 */
db.allAsync = util.promisify(db.all).bind(db);

/**
 * Promisified version of db.run
 * IMPORTANT: Resolves with `this` context from the callback, which contains `lastID` and `changes`.
 * @param {string} sql The SQL query to execute.
 * @param {Array} [params=[]] Optional parameters for the SQL query.
 * @returns {Promise<{lastID: number, changes: number}>} Resolves with an object containing lastID and changes. Rejects on error.
 */
db.runAsync = function(sql, params = []) {
    return new Promise((resolve, reject) => {
        this.run(sql, params, function(err) { // Use `this` from the original callback
            if (err) {
                console.error('DB Run Error:', err.message, 'SQL:', sql); // Log details on error
                reject(err);
            } else {
                // Resolve with the context containing lastID and changes
                resolve({ lastID: this.lastID, changes: this.changes });
            }
        });
    });
}.bind(db); // Bind the function to the db context


// Function to initialize database schema (remains largely the same)
function initializeDatabase() {
    db.serialize(() => {
        // Wrap runs in try/catch for better initialization error reporting
        try {
            // Create Users table
            db.run(`
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    passwordHash TEXT NOT NULL,
                    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);
            console.log('Users table checked/created successfully.');

            // Create Library Items table with NEW COLUMNS
            db.run(`
                CREATE TABLE IF NOT EXISTS library_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    userId INTEGER NOT NULL,
                    mediaType TEXT NOT NULL CHECK(mediaType IN ('movie', 'series', 'book', 'video game')),
                    mediaId TEXT NOT NULL, -- ID from external API

                    -- Core media details stored at time of adding
                    title TEXT NOT NULL,
                    imageUrl TEXT,
                    apiDescription TEXT, -- Original description from API

                    -- User-specific details
                    userDescription TEXT,
                    userRating INTEGER CHECK(userRating IS NULL OR (userRating >= 1 AND userRating <= 20)), -- Allow NULL
                    userStatus TEXT NOT NULL CHECK(userStatus IN ('to watch', 'to read', 'to play', 'watching', 'reading', 'playing', 'watched', 'read', 'played')),

                    -- Timestamps
                    addedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    watchedAt DATETIME, -- Timestamp when marked as watched/read/played

                    FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE,
                    UNIQUE(userId, mediaType, mediaId) -- Prevent adding the same item multiple times per user
                )
            `);
             console.log('Library Items table checked/created successfully.');

            // Add triggers to automatically update 'updatedAt' timestamp
            // Drop existing trigger first (safer for development)
            db.run(`DROP TRIGGER IF EXISTS update_library_item_timestamp;`);
            db.run(`
                CREATE TRIGGER update_library_item_timestamp
                AFTER UPDATE ON library_items
                FOR EACH ROW
                BEGIN
                    UPDATE library_items SET updatedAt = CURRENT_TIMESTAMP WHERE id = OLD.id;
                END;
            `);
             console.log('Update timestamp trigger created/checked successfully.');

        } catch (err) {
             console.error('Error during database initialization:', err.message);
             // Depending on the error, might want to exit: process.exit(1);
        }
    });
}

// Export the db object with the added Async methods
module.exports = db;
```

### dbUtils.js

```js
// dbUtils.js
const db = require('./database'); // Assuming database.js exports the db connection

/**
 * Promisified version of db.get
 * @param {string} sql SQL query with placeholders
 * @param {Array} params Parameters for the SQL query
 * @returns {Promise<object|undefined>} Resolves with the row object or undefined if not found
 */
function get(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) {
                console.error('DB Get Error:', err.message);
                return reject(new Error(`Database error: ${err.message}`));
            }
            resolve(row);
        });
    });
}

/**
 * Promisified version of db.all
 * @param {string} sql SQL query with placeholders
 * @param {Array} params Parameters for the SQL query
 * @returns {Promise<Array<object>>} Resolves with an array of row objects
 */
function all(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) {
                console.error('DB All Error:', err.message);
                return reject(new Error(`Database error: ${err.message}`));
            }
            resolve(rows);
        });
    });
}

/**
 * Promisified version of db.run
 * @param {string} sql SQL query with placeholders
 * @param {Array} params Parameters for the SQL query
 * @returns {Promise<{lastID: number, changes: number}>} Resolves with an object containing lastID and changes
 */
function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        // Use function() to access this.lastID and this.changes
        db.run(sql, params, function (err) {
            if (err) {
                console.error('DB Run Error:', err.message);
                // Handle specific errors if needed, e.g., UNIQUE constraint
                if (err.message.includes('UNIQUE constraint failed')) {
                    return reject(new Error('UNIQUE constraint failed. Item might already exist.'));
                }
                return reject(new Error(`Database error: ${err.message}`));
            }
            resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

module.exports = {
    get,
    all,
    run
};
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
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const { engine } = require('express-handlebars');

const db = require('./database'); // Ensures DB init runs
const { checkAuthStatus } = require('./auth'); // Middleware for view user status

// Route Imports
const authApiRoutes = require('./routes/api/authRoutes');
const searchApiRoutes = require('./routes/api/searchRoutes');
const libraryApiRoutes = require('./routes/api/libraryRoutes');
const viewRoutes = require('./routes/viewRoutes');
const detailsApiRoutes = require('./routes/api/detailsRoutes');

const app = express();
const PORT = process.env.PORT || 3001;

// --- Handlebars Engine Setup ---
app.engine('hbs', engine({
    extname: '.hbs',
    defaultLayout: 'main',
    layoutsDir: path.join(__dirname, 'views/layouts'),
    partialsDir: path.join(__dirname, 'views/partials'),
    // Server-side helpers (can mirror client-side ones if needed)
    helpers: {
        eq: (v1, v2) => v1 === v2,
        json: (context) => JSON.stringify(context),
        // Add other helpers needed by server-rendered templates (e.g., date formatting)
        currentYear: () => new Date().getFullYear(),
         // Basic capitalize helper
         capitalize: (str) => (typeof str === 'string' && str.length > 0) ? str.charAt(0).toUpperCase() + str.slice(1) : str,
         // Simple formatYear helper (add more robust date formatting if needed)
         formatYear: (dateString) => dateString ? new Date(dateString).getFullYear() : '',
         formatDate: (dateString) => dateString ? new Date(dateString).toLocaleDateString() : '',
         classify: (str) => typeof str === 'string' ? str.replace(/\s+/g, '-').toLowerCase() : '',
         defaultIfEmpty: (value, defaultValue) => value || defaultValue || '',
         join: (arr, separator) => Array.isArray(arr) ? arr.join(separator) : '',
         truncate: (str, len) => (str && str.length > len) ? str.substring(0, len) + '...' : str,
    }
}));
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

// --- Core Middleware ---
// Configure CORS more restrictively if frontend is served separately
// For same-origin, basic CORS might not be strictly needed but doesn't hurt
app.use(cors({
    origin: `http://localhost:${PORT}`, // Allow requests only from own origin
    credentials: true // Allow cookies
}));
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: false })); // Parse URL-encoded bodies
app.use(cookieParser()); // Parse cookies
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files

// --- Routes ---
// Check auth status *before* view routes that might use res.locals.user
// Note: API routes use `verifyToken` internally where needed.
// `checkAuthStatus` is primarily for VIEW rendering.
// Placing it here makes `res.locals.user` available everywhere *after* this line.
app.use(checkAuthStatus);

app.use('/', viewRoutes); // View routes first
app.use('/api/auth', authApiRoutes);
app.use('/api/search', searchApiRoutes);
app.use('/api/library', libraryApiRoutes); 
app.use('/api/details', detailsApiRoutes); // Library API routes are protected internally

// --- Error Handling ---

// API 404 Handler (Specific to /api paths)
app.use('/api/*', (req, res) => {
    res.status(404).json({ message: 'API endpoint not found.' });
});

// General 404 Handler (Catches non-API, non-matched routes)
app.use((req, res) => {
     res.status(404).render('error', { // Render a generic 404 page
        layout: 'main', // Use the main layout
        pageTitle: 'Not Found',
        errorCode: 404,
        errorMessage: 'Sorry, the page you are looking for does not exist.',
        // user is available via res.locals.user from checkAuthStatus
     });
});

// Final Error Handler (Catches errors from routes or middleware)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error("Unhandled Error:", err); // Log the full error stack

    const status = err.status || 500;
    const message = err.message || 'An unexpected server error occurred.';

    // Respond differently based on request type
    if (req.originalUrl.startsWith('/api/')) {
         res.status(status).json({ message: message });
    } else {
        // Avoid sending stack trace in production
        const displayMessage = (process.env.NODE_ENV === 'production' && status === 500)
            ? 'An internal server error occurred.'
            : message;

        res.status(status).render('error', {
            layout: 'main',
            pageTitle: 'Error',
            errorCode: status,
            errorMessage: displayMessage,
            // user is available via res.locals.user
        });
    }
});

// --- Start Server ---
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nSIGINT received: Closing server and database connection...');
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err.message);
      process.exit(1); // Exit with error code
    } else {
      console.log('Database connection closed.');
      process.exit(0); // Exit cleanly
    }
  });
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
@import url('layout/_grid.css'); /* Specific grid layout */

/* 3. Component Styles */
@import url('components/_buttons.css');
@import url('components/_card.css');
@import url('components/_forms.css');
@import url('components/_modal.css');
@import url('components/_navigation.css');
@import url('components/_tags.css');
@import url('components/_spinner.css');

/* 4. Page-Specific Styles */
@import url('pages/_home.css');
@import url('pages/_auth.css');
@import url('pages/_library.css');

/* 5. Utility Styles */
@import url('utils/_helpers.css');

/* Add any final overrides or theme adjustments here */
```

### _base.css

```css
body {
    font-family: var(--font-family-base);
    font-size: var(--font-size-base);
    color: var(--color-text);
    background-color: var(--color-bg);
    line-height: 1.6;
    padding-bottom: 60px; /* Space for potential fixed footer */
}

a {
    color: var(--color-text-link);
    transition: var(--transition-base);
}

a:hover {
    color: var(--color-primary-dark);
    text-decoration: underline;
}

h1, h2, h3, h4, h5, h6 {
    margin-bottom: var(--space-md);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text);
}

h1 { font-size: 2rem; }
h2 { font-size: 1.5rem; }
h3 { font-size: 1.25rem; }
h4 { font-size: 1.1rem; }

p {
    margin-bottom: var(--space-md);
}

/* Main content wrapper */
main {
    margin-top: var(--space-xl);
    margin-bottom: var(--space-xl);
}

/* Basic status/error/success message styles */
.error-message {
    color: var(--color-danger);
    font-weight: var(--font-weight-medium);
    margin-bottom: var(--space-md);
}
.success-message {
    color: var(--color-success);
    font-weight: var(--font-weight-medium);
    margin-bottom: var(--space-md);
}
```

### _reset.css

```css
/* Simple Reset */
*,
*::before,
*::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
}

html {
    line-height: 1.5;
    -webkit-text-size-adjust: 100%; /* Prevent font scaling in landscape */
    -moz-tab-size: 4;
    tab-size: 4;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"; /* System font stack */
}

body {
    min-height: 100vh;
}

img, picture, video, canvas, svg {
    display: block;
    max-width: 100%;
}

input, button, textarea, select {
    font: inherit; /* Inherit font styles */
}

button {
    cursor: pointer;
    background: none;
    border: none;
    color: inherit;
}

ol, ul {
    list-style: none;
}

a {
    text-decoration: none;
    color: inherit;
}

h1, h2, h3, h4, h5, h6 {
    text-wrap: balance; /* Improve heading wrapping */
}

p {
   text-wrap: pretty; /* Improve paragraph wrapping */
}

/* Improve screen reader experience */
@media (prefers-reduced-motion: reduce) {
  html:focus-within {
   scroll-behavior: auto;
  }
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
:root {
    /* Colors */
    --color-primary: #4299e1; /* Blue */
    --color-primary-dark: #3182ce;
    --color-secondary: #e2e8f0; /* Light Gray */
    --color-secondary-dark: #cbd5e0;
    --color-danger: #e53e3e; /* Red */
    --color-danger-dark: #c53030;
    --color-warning: #ecc94b; /* Yellow */
    --color-warning-dark: #d69e2e;
    --color-success: #48bb78; /* Green */
    --color-success-dark: #38a169;

    --color-text: #2d3748; /* Dark Gray */
    --color-text-light: #4a5568;
    --color-text-lighter: #718096;
    --color-text-inverse: #ffffff;
    --color-text-link: var(--color-primary);

    --color-bg: #f7fafc; /* Very Light Gray */
    --color-bg-alt: #ffffff; /* White */
    --color-border: #e2e8f0;
    --color-border-focus: var(--color-primary);
    --color-overlay: rgba(0, 0, 0, 0.6);
    --color-code-bg: #2d3748;
    --color-code-text: #e2e8f0;

    /* Fonts */
    --font-family-base: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
    --font-family-code: "Courier New", Courier, monospace;
    --font-size-base: 1rem; /* Approx 16px */
    --font-size-sm: 0.875rem;
    --font-size-lg: 1.125rem;
    --font-weight-normal: 400;
    --font-weight-medium: 500;
    --font-weight-semibold: 600;
    --font-weight-bold: 700;

    /* Spacing */
    --space-xs: 0.25rem; /* 4px */
    --space-sm: 0.5rem;  /* 8px */
    --space-md: 1rem;    /* 16px */
    --space-lg: 1.5rem;  /* 24px */
    --space-xl: 2rem;    /* 32px */
    --space-xxl: 3rem;   /* 48px */

    /* Borders */
    --border-radius-sm: 4px;
    --border-radius-md: 8px;
    --border-width: 1px;

    /* Shadows */
    --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
    --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);

    /* Transitions */
    --transition-base: all 0.2s ease-in-out;
}
```

### _buttons.css

```css
.btn {
    display: inline-block;
    padding: var(--space-sm) var(--space-lg);
    border: var(--border-width) solid transparent; /* Base border */
    border-radius: var(--border-radius-sm);
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    text-align: center;
    transition: var(--transition-base);
    line-height: 1.2; /* Adjust for button height */
}

.btn:focus-visible { /* Modern focus outline */
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
}

.btn:active {
    transform: scale(0.98); /* Subtle click effect */
}

/* Primary Button */
.btn-primary {
    background-color: var(--color-primary);
    color: var(--color-text-inverse);
    border-color: var(--color-primary);
}
.btn-primary:hover {
    background-color: var(--color-primary-dark);
    border-color: var(--color-primary-dark);
    color: var(--color-text-inverse); /* Ensure hover color remains */
    text-decoration: none;
}

/* Secondary Button */
.btn-secondary {
    background-color: var(--color-secondary);
    color: var(--color-text-light);
    border-color: var(--color-secondary);
}
.btn-secondary:hover {
    background-color: var(--color-secondary-dark);
    border-color: var(--color-secondary-dark);
    color: var(--color-text);
    text-decoration: none;
}

/* Danger Button */
.btn-danger {
    background-color: var(--color-danger);
    color: var(--color-text-inverse);
    border-color: var(--color-danger);
}
.btn-danger:hover {
    background-color: var(--color-danger-dark);
    border-color: var(--color-danger-dark);
    color: var(--color-text-inverse);
    text-decoration: none;
}

/* Small Button Modifier */
.btn-small {
    padding: var(--space-xs) var(--space-sm);
    font-size: var(--font-size-sm);
}
```

### _card.css

```css
.card { /* General card style used for sections */
    background-color: var(--color-bg-alt);
    border-radius: var(--border-radius-md);
    padding: var(--space-lg);
    box-shadow: var(--shadow-md);
    margin-bottom: var(--space-lg);
}

.result-card, .library-card { /* Specific card style for media items */
    background-color: var(--color-bg-alt);
    border-radius: var(--border-radius-md);
    box-shadow: var(--shadow-sm); /* Lighter shadow for grid items */
    overflow: hidden;
    display: flex;
    flex-direction: column;
    transition: transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out;
}

.result-card:hover, .library-card:hover {
    transform: translateY(-3px);
    box-shadow: var(--shadow-md);
}

.card-image {
    width: 100%;
    height: 200px; /* Consistent height */
    object-fit: cover;
    background-color: var(--color-secondary); /* Placeholder bg */
    border-bottom: var(--border-width) solid var(--color-border);
}

.card-content {
    padding: var(--space-md);
    flex-grow: 1;
    display: flex;
    flex-direction: column;
}

.card-title {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    margin-bottom: var(--space-xs);
    color: var(--color-text);
}

.card-meta {
    font-size: var(--font-size-sm);
    color: var(--color-text-lighter);
    margin-bottom: var(--space-sm);
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
    align-items: center;
}

.card-meta span { /* Generic meta item */
    display: inline-block; /* Helps with alignment */
}

.card-description {
    font-size: var(--font-size-sm);
    color: var(--color-text-light);
    margin-bottom: var(--space-md);
    flex-grow: 1; /* Take up space before actions */
    line-height: 1.5;
}
.card-description.truncated {
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 3; /* Limit lines */
    -webkit-box-orient: vertical;
}

.api-desc-details {
    margin-top: var(--space-sm);
    margin-bottom: var(--space-md);
}
.api-desc-details summary {
    cursor: pointer;
    font-weight: var(--font-weight-medium);
    color: var(--color-text-link);
    font-size: var(--font-size-sm);
    margin-bottom: var(--space-xs);
}
.api-desc-details p {
    font-size: var(--font-size-sm);
    color: var(--color-text-light);
    margin-bottom: 0; /* Remove margin within details */
    border-left: 3px solid var(--color-border);
    padding-left: var(--space-sm);
}

.card-actions {
    margin-top: auto; /* Push to bottom */
    padding-top: var(--space-sm);
    border-top: var(--border-width) solid var(--color-border);
    display: flex;
    gap: var(--space-sm);
    flex-wrap: wrap;
}
```

### _forms.css

```css
.form-group {
    margin-bottom: var(--space-md);
}

.form-group label {
    display: block;
    margin-bottom: var(--space-xs);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-light);
}

/* Input, Select, Textarea common styles */
.form-group input[type="text"],
.form-group input[type="password"],
.form-group input[type="number"],
.form-group input[type="email"], /* Add other types if needed */
.form-group select,
.form-group textarea {
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--border-radius-sm);
    font-size: var(--font-size-base);
    background-color: var(--color-bg-alt);
    color: var(--color-text);
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.form-group select {
    appearance: none; /* Remove default arrow */
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%23a0aec0'%3E%3Cpath fill-rule='evenodd' d='M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z' clip-rule='evenodd'/%3E%3C/svg%3E"); /* Custom arrow */
    background-repeat: no-repeat;
    background-position: right var(--space-sm) center;
    background-size: 1.2em 1.2em;
    padding-right: calc(var(--space-sm) * 2 + 1.2em); /* Space for arrow */
}


.form-group textarea {
    resize: vertical; /* Allow vertical resize */
    min-height: 80px;
}

/* Focus styles */
.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
    outline: none;
    border-color: var(--color-border-focus);
    box-shadow: 0 0 0 2px rgba(66, 153, 225, 0.3); /* Subtle blue glow */
}

/* Form specific error/message */
.form-error, .form-message {
    font-size: var(--font-size-sm);
    margin-top: var(--space-xs);
    display: block; /* Ensure it takes space */
}
.form-error {
    color: var(--color-danger);
}
.form-message { /* For success registration etc */
    color: var(--color-success);
}
```

### _modal.css

```css
.modal-overlay {
    position: fixed;
    inset: 0;
    background-color: var(--color-overlay);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.3s ease, visibility 0s linear 0.3s;
    padding: var(--space-md); /* Padding for smaller screens */
}

.modal-overlay:not(.hidden) {
    opacity: 1;
    visibility: visible;
    transition: opacity 0.3s ease;
}

.modal-content {
    background-color: var(--color-bg-alt);
    padding: var(--space-lg);
    border-radius: var(--border-radius-md);
    box-shadow: var(--shadow-lg);
    width: 100%;
    max-width: 500px;
    position: relative;
    transform: scale(0.95);
    transition: transform 0.3s ease;
    max-height: 90vh; /* Limit height */
    overflow-y: auto; /* Add scroll if content exceeds */
}
.modal-overlay:not(.hidden) .modal-content {
     transform: scale(1);
}


.modal-close-btn {
    position: absolute;
    top: var(--space-sm);
    right: var(--space-md);
    background: none;
    border: none;
    font-size: 1.8rem;
    color: var(--color-text-lighter);
    cursor: pointer;
    line-height: 1;
    padding: var(--space-xs); /* Increase click area */
}
.modal-close-btn:hover {
    color: var(--color-text);
}

.modal-content h2 {
    margin-top: 0;
    margin-bottom: var(--space-lg);
    text-align: center;
    font-size: 1.4rem;
}

.modal-actions {
    margin-top: var(--space-lg);
    display: flex;
    justify-content: flex-end;
    gap: var(--space-sm);
    border-top: var(--border-width) solid var(--color-border);
    padding-top: var(--space-md);
}

.modal-error-message {
    color: var(--color-danger);
    font-weight: var(--font-weight-medium);
    margin-top: var(--space-md);
    text-align: center;
    font-size: var(--font-size-sm);
}

/* Add to public/css/components/_modal.css */

.modal-confirm {
    max-width: 400px; /* Smaller width for confirmation */
    text-align: center;
}

.modal-confirm h3 {
    margin-bottom: var(--space-sm);
    color: var(--color-danger);
}

.modal-confirm p {
    margin-bottom: var(--space-lg);
    color: var(--color-text-light);
}

.modal-confirm .modal-actions {
    justify-content: center; /* Center buttons */
    border-top: none; /* Remove top border */
    padding-top: 0;
}
```

### _navigation.css

```css
header nav ul {
    display: flex;
    align-items: center;
    gap: var(--space-md);
}

header nav a {
    color: var(--color-text-inverse);
    font-weight: var(--font-weight-medium);
    padding: var(--space-xs) var(--space-sm);
    border-radius: var(--border-radius-sm);
    transition: background-color 0.2s ease;
}

header nav a:hover,
header nav a.active { /* Add active class via JS if needed */
    background-color: rgba(255, 255, 255, 0.1);
    text-decoration: none;
}

.username-display {
    font-weight: var(--font-weight-medium);
    color: var(--color-text-inverse);
    margin-right: var(--space-sm); /* Space before logout */
}

#logoutBtn {
    color: var(--color-text-inverse);
    background-color: transparent;
    border: var(--border-width) solid var(--color-secondary);
}
#logoutBtn:hover {
    background-color: var(--color-secondary);
    color: var(--color-text);
}

/* Add to public/css/components/_modal.css or a new _mediaDetails.css and import */

.media-details-modal .details-header {
    display: flex;
    gap: var(--space-lg);
    margin-bottom: var(--space-lg);
    padding-bottom: var(--space-lg);
    border-bottom: var(--border-width) solid var(--color-border);
}

.media-details-modal .details-image {
    flex-shrink: 0;
    width: 120px;
    height: 180px;
    object-fit: cover;
    border-radius: var(--border-radius-sm);
    background-color: var(--color-secondary);
}

.media-details-modal .details-header-info h2 {
    margin-top: 0;
    margin-bottom: var(--space-sm);
    font-size: 1.6rem;
}

.media-details-modal .details-meta {
    font-size: var(--font-size-sm);
    color: var(--color-text-lighter);
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
    align-items: center;
    margin-bottom: var(--space-sm); /* Reset default p margin */
}

.media-details-modal .details-body h3,
.media-details-modal .details-body h4 {
    margin-top: var(--space-lg);
    margin-bottom: var(--space-xs);
    font-size: 1.1rem;
    font-weight: var(--font-weight-semibold);
}
.media-details-modal .details-body p {
     font-size: 0.95rem;
     margin-bottom: var(--space-sm);
     color: var(--color-text-light);
}
.media-details-modal .details-body hr {
    border: none;
    border-top: var(--border-width) solid var(--color-border);
    margin: var(--space-lg) 0;
}

.media-details-modal .details-actions {
     justify-content: space-between; /* Space out actions */
}

/* Responsive adjustments for details modal */
@media (max-width: 500px) {
    .media-details-modal .details-header {
        flex-direction: column;
        align-items: center;
        text-align: center;
    }
    .media-details-modal .details-header-info h2 {
        font-size: 1.4rem;
    }
     .media-details-modal .details-meta {
        justify-content: center;
    }
    .media-details-modal .details-actions {
         flex-direction: column;
         align-items: stretch;
    }
     .media-details-modal .details-actions button {
        width: 100%;
     }
     .media-details-modal .details-actions button:last-child {
        margin-top: var(--space-sm); /* Add space above close button */
     }
}
```

### _spinner.css

```css
.spinner {
    border: 4px solid var(--color-secondary); /* Light grey */
    border-top: 4px solid var(--color-primary); /* Blue */
    border-radius: 50%;
    width: 24px;
    height: 24px;
    animation: spin 1s linear infinite;
    margin-left: var(--space-sm); /* Position relative to trigger */
    display: inline-block; /* Keep it inline */
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

/* Hide spinner by default */
.spinner.hidden {
    display: none;
}
```

### _tags.css

```css
.tag {
    display: inline-block;
    padding: var(--space-xs) var(--space-sm);
    font-size: 0.75rem; /* Smaller font */
    font-weight: var(--font-weight-semibold);
    border-radius: var(--border-radius-sm);
    line-height: 1;
    text-transform: capitalize;
}

/* Base tag colors (can be overridden) */
.tag {
    background-color: var(--color-secondary);
    color: var(--color-text-light);
}

/* Type specific tags */
.tag-movie { background-color: #e6f7ff; color: #096dd9; border: 1px solid #91d5ff;}
.tag-series { background-color: #fffbe6; color: #d48806; border: 1px solid #ffe58f;}
.tag-book { background-color: #f6ffed; color: #389e0d; border: 1px solid #b7eb8f;}
.tag-video-game { background-color: #fff0f6; color: #c41d7f; border: 1px solid #ffadd2;}

/* Status specific tags */
.tag-status-to-watch, .tag-status-to-read, .tag-status-to-play {
    background-color: var(--color-secondary-dark); color: var(--color-text);
}
.tag-status-watching, .tag-status-reading, .tag-status-playing {
    background-color: #fff1b8; color: #d46b08; border: 1px solid #ffd591; /* Orange/Yellow */
}
.tag-status-watched, .tag-status-read, .tag-status-played {
    background-color: #e6fffb; color: #08979c; border: 1px solid #87e8de; /* Teal/Green */
}
```

### _container.css

```css
.container {
    width: 100%;
    max-width: 1200px;
    margin-left: auto;
    margin-right: auto;
    padding-left: var(--space-md);
    padding-right: var(--space-md);
}
```

### _footer.css

```css
footer {
    margin-top: var(--space-xxl);
    padding: var(--space-lg) 0;
    text-align: center;
    font-size: var(--font-size-sm);
    color: var(--color-text-lighter);
    border-top: var(--border-width) solid var(--color-border);
    /* Uncomment for sticky footer: */
    /* position: fixed; */
    /* bottom: 0; */
    /* left: 0; */
    /* width: 100%; */
    /* background-color: var(--color-bg); */
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
header {
    background-color: var(--color-text-light);
    color: var(--color-text-inverse);
    padding-top: var(--space-sm);
    padding-bottom: var(--space-sm);
    box-shadow: var(--shadow-sm);
}

.header-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap; /* Allow wrapping on small screens */
    gap: var(--space-sm);
}

.logo h1 {
    font-size: 1.5rem;
    font-weight: var(--font-weight-bold);
    margin-bottom: 0; /* Reset margin */
    color: inherit; /* Inherit color from header */
}

.logo a:hover {
    text-decoration: none;
    opacity: 0.9;
}

/* Responsive header adjustments */
@media (max-width: 768px) {
    .header-content {
        flex-direction: column;
        align-items: flex-start;
    }
    header nav {
        width: 100%;
    }
    header nav ul {
        flex-direction: column;
        align-items: flex-start;
    }
    header nav li {
        margin-top: var(--space-xs);
    }
}
```

### _auth.css

```css
.auth-page {
    max-width: 800px;
    margin: var(--space-xl) auto;
}

.auth-forms-container {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xl); /* Gap between login/register */
}

.auth-form {
    flex: 1; /* Each form tries to take equal space */
    min-width: 280px; /* Minimum width before stacking */
    padding: var(--space-md);
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--border-radius-sm);
}

.auth-form h3 {
    margin-top: 0;
    margin-bottom: var(--space-lg);
    text-align: center;
}
```

### _home.css

```css
.hero {
    background-color: var(--color-primary); /* Or use a background image */
    color: var(--color-text-inverse);
    padding: var(--space-xxl) var(--space-lg);
    text-align: center;
    border-radius: var(--border-radius-md);
    margin-bottom: var(--space-xl);
}

.hero h2 {
    font-size: 2.5rem;
    margin-bottom: var(--space-sm);
    color: inherit;
}

.hero p {
    font-size: var(--font-size-lg);
    margin-bottom: var(--space-lg);
    opacity: 0.9;
}

.hero .btn-primary {
    background-color: var(--color-bg-alt);
    color: var(--color-primary);
    font-weight: var(--font-weight-bold);
}
.hero .btn-primary:hover {
    background-color: var(--color-secondary);
}


.features {
    text-align: center;
    padding: var(--space-xl) 0;
}

.features h2 {
    margin-bottom: var(--space-xl);
}

.feature-list {
    display: flex;
    justify-content: space-around;
    flex-wrap: wrap;
    gap: var(--space-lg);
}

.feature-item {
    flex-basis: 250px; /* Minimum width for feature items */
    padding: var(--space-md);
    /* Add icons later */
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
    const TEMPLATE_BASE_URL = '/templates';

    // --- DOM Elements (Cached) ---
    const mainContent = document.querySelector('main.container'); // Event delegation target
    const statusMessageEl = document.getElementById('statusMessage');
    const responseAreaEl = document.getElementById('responseArea');
    const statusSectionEl = document.getElementById('statusSection');
    const logoutBtn = document.getElementById('logoutBtn');
    const searchForm = document.getElementById('searchForm');
    const libraryControls = document.getElementById('libraryControls');
    const resultsArea = document.getElementById('resultsArea');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const infoModal = document.getElementById('infoModal');
    const modalContentArea = document.getElementById('modalContentArea');
    const deleteConfirmModal = document.getElementById('deleteConfirmModal');

    // --- State ---
    let compiledTemplates = {}; // Cache for fetched Handlebars templates
    let itemToDeleteId = null; // Store ID for delete confirmation

    // --- Handlebars Setup & Helpers ---
    // Register client-side helpers (if not relying solely on server-side for initial render)
    // Ensure these match server-side helpers if templates are used in both places
    if (window.Handlebars) {
        const helpers = {
            eq: (v1, v2) => v1 === v2,
            json: (context) => JSON.stringify(context),
            currentYear: () => new Date().getFullYear(),
            capitalize: (str) => (typeof str === 'string' && str.length > 0) ? str.charAt(0).toUpperCase() + str.slice(1) : str,
            formatYear: (dateString) => dateString ? new Date(dateString).getFullYear() : '',
            formatDate: (dateString) => dateString ? new Date(dateString).toLocaleDateString() : '',
            classify: (str) => typeof str === 'string' ? str.replace(/\s+/g, '-').toLowerCase() : '',
            defaultIfEmpty: (value, defaultValue) => value || defaultValue || '',
            join: (arr, separator) => Array.isArray(arr) ? arr.join(separator) : '',
            truncate: (str, len) => (str && str.length > len) ? str.substring(0, len) + '...' : str,
        };
        Object.keys(helpers).forEach(key => Handlebars.registerHelper(key, helpers[key]));
    } else {
        console.warn('Handlebars runtime not found. Client-side templates may not work.');
    }

    // --- Utility Functions ---
    function showStatus(message, type = 'info') { // type = 'info', 'success', 'error'
        if (!statusMessageEl || !statusSectionEl) return;
        statusMessageEl.textContent = message;
        statusMessageEl.className = `status-${type}`; // Use classes for styling
        statusSectionEl.classList.remove('hidden');
        console.log(`Status [${type}]: ${message}`);
        // Optional: Auto-hide after a delay?
        // setTimeout(() => statusSectionEl.classList.add('hidden'), 5000);
    }

    function showResponse(data) {
        if (!responseAreaEl) return;
        responseAreaEl.textContent = JSON.stringify(data, null, 2);
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
                // Cookies are sent automatically by the browser
            },
        };
        if (body) {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(body);
        }

        try {
            const response = await fetch(url, options);
            const responseData = response.status === 204 ? {} : await response.json(); // Handle No Content

            if (!response.ok) {
                 // Throw an error object with status and message
                 const error = new Error(responseData.message || `HTTP error ${response.status}`);
                 error.status = response.status;
                 error.data = responseData;
                 throw error;
            }
            showResponse(responseData); // Show successful response data
            return responseData;
        } catch (error) {
            console.error(`API Request Error (${method} ${endpoint}):`, error);
            const message = error.message || 'An unknown API error occurred.';
            showStatus(message, 'error');
            showResponse({ error: message, status: error.status, data: error.data });

            // Handle critical auth errors (e.g., redirect to login)
            if (error.status === 401) {
                showStatus('Authentication error. Redirecting to login...', 'error');
                setTimeout(() => { window.location.href = '/login'; }, 1500);
            }
            throw error; // Re-throw for calling function to handle if needed
        }
    }

    // Function to fetch and compile Handlebars template
    async function getTemplate(templateName) {
        if (compiledTemplates[templateName]) {
            return compiledTemplates[templateName];
        }
        try {
            const response = await fetch(`${TEMPLATE_BASE_URL}/${templateName}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch template: ${templateName} (${response.status})`);
            }
            const templateString = await response.text();
            if (!window.Handlebars) throw new Error("Handlebars runtime missing");
            compiledTemplates[templateName] = Handlebars.compile(templateString);
            return compiledTemplates[templateName];
        } catch (error) {
            console.error(`Error loading template ${templateName}:`, error);
            showStatus(`Error loading template ${templateName}.`, 'error');
            return null;
        }
    }

    // Render items using a template
    async function renderItems(items, targetElement, templateName, context = {}) {
        if (!targetElement) return;

        const template = await getTemplate(templateName);
        if (!template) {
            targetElement.innerHTML = `<p class="placeholder-text error">Error loading display template.</p>`;
            return;
        }

        const defaultContext = {
            items: items,
            placeholder: 'No items to display.',
            hidePlaceholder: false
        };
        targetElement.innerHTML = template({ ...defaultContext, ...context });
    }

    // --- Modal Handling ---
    function openModal(modalElement, contentHTML = '') {
        if (!modalElement) return;
        const contentArea = modalElement.querySelector('.modal-content-area') || modalElement.querySelector('#modalContentArea'); // Flexible content area selector
         if (contentArea && contentHTML) {
             contentArea.innerHTML = contentHTML;
         }
        modalElement.classList.remove('hidden');
        // Focus management could be added here
    }

    function closeModal(modalElement) {
        if (!modalElement) return;
        modalElement.classList.add('hidden');
         const contentArea = modalElement.querySelector('.modal-content-area') || modalElement.querySelector('#modalContentArea');
         if (contentArea) {
             contentArea.innerHTML = ''; // Clear content on close
         }
    }

    // Open the Add/Edit Item Form Modal
    async function openItemFormModal(mode = 'add', itemData = {}) {
        const template = await getTemplate('itemFormModal');
        if (!template || !infoModal) return;

        const isAddMode = mode === 'add';
        const context = {
            mode: mode,
            modalTitle: isAddMode ? `Add "${itemData.title}" to Library` : `Edit "${itemData.title}"`,
            submitButtonText: isAddMode ? 'Add Item' : 'Save Changes',
            item: isAddMode ? {
                // For adding, map search result data or defaults
                mediaId: itemData.id || itemData.mediaId, // Use id from search result
                mediaType: itemData.type || itemData.mediaType,
                title: itemData.title,
                imageUrl: itemData.imageUrl,
                apiDescription: itemData.description || itemData.apiDescription,
                // Provide empty user fields for add form
                id: null,
                userStatus: '',
                userRating: '',
                userDescription: '',
            } : itemData, // For editing, use the full library item data
            validStatuses: getValidStatuses(itemData.type || itemData.mediaType),
        };

        openModal(infoModal, template(context));
    }

    // Open the Details Modal
    async function openDetailsModal(mergedItemData, isLibraryItem) {
        const template = await getTemplate('mediaDetailsModal');
        if (!template || !infoModal) return;

        const context = {
            item: mergedItemData,
            isLibraryItem: isLibraryItem
        };
        openModal(infoModal, template(context));
    }

    // Open Delete Confirmation Modal
    function openDeleteConfirmModal(itemId, itemTitle) {
        itemToDeleteId = itemId; // Store the ID
        const messageEl = deleteConfirmModal?.querySelector('#deleteConfirmMessage');
        if (messageEl) {
            messageEl.textContent = `Are you sure you want to delete "${itemTitle}" from your library?`;
        }
        openModal(deleteConfirmModal);
    }

    // --- Event Handlers ---

    // Delegate clicks within the main content area
    async function handleMainContentClick(event) {
        const target = event.target;
        const card = target.closest('.library-card, .result-card'); // Find parent card

        // Determine the action based on the button clicked
        const action = target.matches('.action-add') ? 'add' :
                       target.matches('.action-edit') ? 'edit' :
                       target.matches('.action-delete') ? 'delete' :
                       target.matches('.action-details') ? 'details' : null;

        // Exit if no card or no recognized action button was clicked
        if (!action || !card) {
            return;
        }

        event.stopPropagation(); // Prevent card click bubbling if a button was hit

        // Retrieve the basic data stored on the card
        const basicItemData = JSON.parse(card?.dataset.itemJson || '{}');
        const isLibraryItem = card.classList.contains('library-card');

        // --- Handle Actions ---
        switch (action) {
            case 'add':
                // Add action is only relevant for search results (isLibraryItem should be false)
                if (isLibraryItem) {
                    console.warn("Add action clicked on a library item card. Ignoring.");
                    return;
                }
                openItemFormModal('add', basicItemData);
                break;

            case 'edit':
                // Edit action only applies to library items which MUST have a database id
                if (!isLibraryItem || !basicItemData.id) {
                    console.error("Edit action failed: Not a library item or missing database ID.", basicItemData);
                    showStatus("Error: Cannot edit item, invalid data.", 'error');
                    return;
                }
                openItemFormModal('edit', basicItemData);
                break;

            case 'delete':
                // Delete action only applies to library items which MUST have a database id
                if (!isLibraryItem || !basicItemData.id) {
                    console.error("Delete action failed: Not a library item or missing database ID.", basicItemData);
                    showStatus("Error: Cannot delete item, invalid data.", 'error');
                    return;
                }
                openDeleteConfirmModal(basicItemData.id, basicItemData.title);
                break;

                case 'details':
                    const mediaType = basicItemData.mediaType || basicItemData.type; // Get type
                    const externalApiId = basicItemData.mediaId;
    
                    // Ensure we have the necessary ID to make the API call
                    if (!externalApiId) {
                        showStatus(`Cannot fetch details: Missing external media ID.`, 'error');
                        console.error("Missing externalApiId for details:", basicItemData);
                        await openDetailsModal(basicItemData, isLibraryItem);
                        return;
                    }
    
                    // Show loading state
                    openModal(infoModal, '<div class="modal-loading">Loading details... <div class="spinner"></div></div>');
    
                    try {
                        // Fetch detailed data using the CORRECT externalApiId
                        // This now works for all types handled by the backend route
                        const detailedData = await apiRequest(`/details/${mediaType}/${externalApiId}`);
    
                        // Merge basic data with detailed data
                        // (The merging logic should generally work as the backend now returns consistent fields)
                        const mergedData = {
                            ...basicItemData,
                            ...detailedData,
                            // Ensure core identifiers are correct
                            mediaType: mediaType,
                            mediaId: externalApiId, // Store the ID used for the lookup
                            // Use the normalized rating from the details API if available
                            rating: detailedData.rating ?? basicItemData.rating ?? null,
                            // Ensure description uses the one from details if available
                            description: detailedData.description ?? basicItemData.description ?? basicItemData.apiDescription ?? null,
    
                            // Preserve library-specific fields if it is one
                            ...(isLibraryItem && {
                                id: basicItemData.id, // Keep DB ID
                                userStatus: basicItemData.userStatus,
                                userRating: basicItemData.userRating,
                                userDescription: basicItemData.userDescription,
                                addedAt: basicItemData.addedAt,
                                watchedAt: basicItemData.watchedAt
                            })
                        };
    
                        // Open the modal with the complete data
                        await openDetailsModal(mergedData, isLibraryItem);
    
                    } catch (error) {
                         showStatus(`Failed to load details for "${basicItemData.title}". Showing basic info.`, 'error');
                         // On error loading details, fall back to showing basic info
                         await openDetailsModal(basicItemData, isLibraryItem);
                    }
                    break; // End case 'details'
        }
    }

    // Delegate clicks within the main info modal
    function handleInfoModalClick(event) {
        const target = event.target;

        // Close buttons
        if (target.matches('.modal-close-btn') || target.matches('.modal-cancel-btn')) {
            closeModal(infoModal);
        }
        // Handle actions *inside* the modal (e.g., if details modal has add/edit buttons)
        else if (target.matches('.action-add')) {
             const itemData = JSON.parse(target.closest('.modal-actions')?.dataset.itemJson || '{}');
             closeModal(infoModal); // Close details
             setTimeout(() => openItemFormModal('add', itemData), 50); // Open add form after small delay
        }
        else if (target.matches('.action-edit')) {
             const itemData = JSON.parse(target.closest('.modal-actions')?.dataset.itemJson || '{}');
             closeModal(infoModal);
             setTimeout(() => openItemFormModal('edit', itemData), 50);
        }
        else if (target.matches('.action-delete')) {
             const itemData = JSON.parse(target.closest('.modal-actions')?.dataset.itemJson || '{}');
             closeModal(infoModal);
             setTimeout(() => openDeleteConfirmModal(itemData.id, itemData.title), 50);
        }

        // Close on overlay click
        else if (target === infoModal) {
            closeModal(infoModal);
        }
    }

    // Handle Add/Edit Form Submission (inside infoModal)
    async function handleItemFormSubmit(event) {
        event.preventDefault();
        const form = event.target;
        const modalErrorEl = form.querySelector('.modal-error-message');
        modalErrorEl?.classList.add('hidden');
        showSpinner('modalSpinner', true); // Assuming a spinner exists in the modal

        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        // Get hidden core data needed for add/edit
        const mode = form.querySelector('#formMode')?.value;
        const itemId = form.querySelector('#itemId')?.value; // Will be empty string for 'add'
        const mediaId = form.querySelector('#mediaId')?.value;
        const mediaType = form.querySelector('#mediaType')?.value;
        const title = form.querySelector('#coreTitle')?.value;
        const imageUrl = form.querySelector('#coreImageUrl')?.value;
        const apiDescription = form.querySelector('#coreApiDescription')?.value;

        const payload = {
            userStatus: data.userStatus,
            userRating: data.userRating, // API handles parsing/validation
            userDescription: data.userDescription,
        };

        try {
            let result;
            if (mode === 'add') {
                // Add requires core media info + user info
                const addPayload = {
                    ...payload,
                    mediaId,
                    mediaType,
                    title,
                    imageUrl,
                    apiDescription
                };
                result = await apiRequest('/library', 'POST', addPayload);
                showStatus(`"${result.title}" added successfully!`, 'success');
            } else { // mode === 'edit'
                // Edit only sends fields to update
                result = await apiRequest(`/library/${itemId}`, 'PUT', payload);
                showStatus(`"${result.title}" updated successfully!`, 'success');
            }
            closeModal(infoModal);
            fetchLibrary(); // Refresh library view
        } catch (error) {
            // Display error within the modal
            const message = error.data?.message || error.message || 'Operation failed.';
            if (modalErrorEl) {
                modalErrorEl.textContent = message;
                modalErrorEl.classList.remove('hidden');
            } else {
                showStatus(message, 'error'); // Fallback to main status
            }
        } finally {
             showSpinner('modalSpinner', false);
        }
    }

    // Handle Delete Confirmation
    async function handleDeleteConfirm() {
        if (!itemToDeleteId) return;
        showSpinner('deleteSpinner', true); // Assuming spinner in delete modal

        try {
            await apiRequest(`/library/${itemToDeleteId}`, 'DELETE');
            showStatus(`Item deleted successfully.`, 'success');
            closeModal(deleteConfirmModal);
            fetchLibrary(); // Refresh library
        } catch (error) {
            // Error already shown by apiRequest
             showStatus(`Failed to delete item: ${error.message}`, 'error');
        } finally {
            itemToDeleteId = null; // Reset ID
            showSpinner('deleteSpinner', false);
        }
    }

    // Handle Library Fetching and Filtering
    async function fetchLibrary() {
        if (!resultsArea) return;
        showSpinner('librarySpinner', true);
        // Use placeholder rendering during load
        await renderItems([], resultsArea, 'mediaCard', { hidePlaceholder: true });
        resultsArea.classList.add('loading'); // Optional: for styling

        const params = new URLSearchParams();
        if (libraryControls) {
            // Get values directly from filter elements by ID
            const mediaTypeSelect = libraryControls.querySelector('#filterMediaType');
            const statusSelect = libraryControls.querySelector('#filterStatus');
            const minRatingInput = libraryControls.querySelector('#filterMinRating');
            const maxRatingInput = libraryControls.querySelector('#filterMaxRating');

            if (mediaTypeSelect?.value) {
                params.append('mediaType', mediaTypeSelect.value);
            }
            if (statusSelect?.value) {
                params.append('userStatus', statusSelect.value);
            }
            if (minRatingInput?.value) {
                params.append('minRating', minRatingInput.value);
            }
            if (maxRatingInput?.value) {
                params.append('maxRating', maxRatingInput.value);
            }
        }
        const queryParams = params.toString() ? `?${params.toString()}` : ''; // Add '?' only if params exist

        try {
            const items = await apiRequest(`/library${queryParams}`, 'GET');
            await renderItems(items, resultsArea, 'mediaCard', {
                 isSearchResult: false,
                 cardClass: 'library-card',
                 placeholder: 'Library is empty or filters match no items.'
             });
        } catch (error) {
            // Error already shown by apiRequest
            await renderItems([], resultsArea, 'mediaCard', {
                 isSearchResult: false,
                 cardClass: 'library-card',
                 placeholder: 'Error loading library.'
             });
        } finally {
            showSpinner('librarySpinner', false);
            resultsArea.classList.remove('loading');
        }
    }

    // Handle Search
    async function handleSearch(event) {
        event.preventDefault();
        if (!resultsArea || !searchForm) return;

        const queryInput = searchForm.querySelector('#searchQuery');
        const typeSelect = searchForm.querySelector('#searchType');
        const query = queryInput.value.trim();
        const type = typeSelect.value;

        if (!query) {
            showStatus('Please enter a search term.', 'error');
            queryInput.focus();
            return;
        }

        showSpinner('searchSpinner', true);
        await renderItems([], resultsArea, 'mediaCard', { hidePlaceholder: true }); // Clear previous results
        resultsArea.classList.add('loading');

        try {
            const results = await apiRequest(`/search?query=${encodeURIComponent(query)}&type=${type}`, 'GET');
            await renderItems(results, resultsArea, 'mediaCard', {
                 isSearchResult: true,
                 cardClass: 'result-card',
                 placeholder: 'No results found.'
             });
        } catch (error) {
            // Error handled by apiRequest
             await renderItems([], resultsArea, 'mediaCard', {
                 isSearchResult: true,
                 cardClass: 'result-card',
                 placeholder: 'Search failed.'
             });
        } finally {
            showSpinner('searchSpinner', false);
            resultsArea.classList.remove('loading');
        }
    }

    // Handle Login
    async function handleLogin(event) {
         event.preventDefault();
         const form = event.target;
         const username = form.username.value.trim();
         const password = form.password.value.trim();
         const errorEl = form.querySelector('#loginError') || form.querySelector('.form-error'); // General error element
         errorEl?.classList.add('hidden');

         if (!username || !password) {
            if(errorEl){ errorEl.textContent = 'Username and password required.'; errorEl.classList.remove('hidden'); }
             return;
         }

         try {
             showSpinner('loginSpinner', true); // Assuming spinner ID
             const result = await apiRequest('/auth/login', 'POST', { username, password });
             if (result && result.user) {
                 showStatus('Login successful! Redirecting...', 'success');
                 window.location.href = '/library'; // Redirect
             }
             // Shouldn't reach here if successful due to redirect, but good practice
         } catch (error) {
             const message = error.data?.message || error.message || 'Login failed.';
             if(errorEl){ errorEl.textContent = message; errorEl.classList.remove('hidden'); }
         } finally {
            showSpinner('loginSpinner', false);
         }
    }

    // Handle Registration
    async function handleRegister(event) {
        event.preventDefault();
        const form = event.target;
        const username = form.username.value.trim();
        const password = form.password.value.trim();
        const errorEl = form.querySelector('#registerError') || form.querySelector('.form-error');
        const messageEl = form.querySelector('#registerMessage') || form.querySelector('.form-message');
        errorEl?.classList.add('hidden');
        messageEl?.classList.add('hidden');


        if (!username || !password) {
             if(errorEl){ errorEl.textContent = 'Username and password required.'; errorEl.classList.remove('hidden'); }
             return;
         }
         if (password.length < 6) {
             if(errorEl){ errorEl.textContent = 'Password must be at least 6 characters.'; errorEl.classList.remove('hidden'); }
             return;
         }

         try {
             showSpinner('registerSpinner', true); // Assuming spinner ID
             const result = await apiRequest('/auth/register', 'POST', { username, password });
             if (messageEl) {
                messageEl.textContent = result.message || 'Registration successful! Please login.';
                messageEl.classList.remove('hidden');
             } else {
                 showStatus('Registration successful! Please login.', 'success');
             }
             form.reset(); // Clear form on success
         } catch (error) {
             const message = error.data?.message || error.message || 'Registration failed.';
              if(errorEl){ errorEl.textContent = message; errorEl.classList.remove('hidden'); }
         } finally {
             showSpinner('registerSpinner', false);
         }
    }

    // Handle Logout
    async function handleLogout() {
        try {
            showStatus('Logging out...', 'info');
            await apiRequest('/auth/logout', 'POST');
            showStatus('Logout successful. Redirecting...', 'success');
            window.location.href = '/'; // Redirect to home
        } catch (error) {
            // Error already shown by apiRequest
            showStatus('Logout failed.', 'error');
        }
    }

     // Helper to get valid statuses based on media type (client-side)
     function getValidStatuses(mediaType) {
        switch (mediaType?.toLowerCase()) {
            case 'movie':
            case 'series': return ['to watch', 'watching', 'watched'];
            case 'book': return ['to read', 'reading', 'read'];
            case 'video game': return ['to play', 'playing', 'played'];
            default: return ['to watch', 'watching', 'watched', 'to read', 'reading', 'read', 'to play', 'playing', 'played']; // Default or fallback
        }
    }

    // --- Initialization ---
    function initialize() {
        // Global Listeners
        logoutBtn?.addEventListener('click', handleLogout);

        // Use event delegation on main content area for dynamic elements
        mainContent?.addEventListener('click', handleMainContentClick);

        // Modal Listeners (delegated or direct)
        infoModal?.addEventListener('click', handleInfoModalClick);
        infoModal?.addEventListener('submit', (event) => { // Handle form submission inside modal
            if (event.target.id === 'itemForm') {
                handleItemFormSubmit(event);
            }
        });

        deleteConfirmModal?.addEventListener('click', (event) => {
            if (event.target.matches('#deleteConfirmBtn')) handleDeleteConfirm();
            if (event.target.matches('#deleteCancelBtn') || event.target.matches('#deleteModalCloseBtn') || event.target === deleteConfirmModal) {
                 closeModal(deleteConfirmModal);
                 itemToDeleteId = null; // Clear ID on cancel/close
            }
        });


        // Page Specific Initializations / Listeners
        if (searchForm) {
            searchForm.addEventListener('submit', handleSearch);
        }

        if (libraryControls) {
            // Use event delegation or listen to specific inputs for filtering
            libraryControls.addEventListener('change', fetchLibrary); // Fetch on any filter change
            libraryControls.addEventListener('input', (e) => { // Handle input for range filters if needed (debounced?)
                if (e.target.type === 'number') {
                     fetchLibrary(); // Basic fetch on number input change
                     // Add debounce here if API calls become too frequent
                }
            });
             libraryControls.querySelector('#getLibraryBtn')?.addEventListener('click', fetchLibrary); // Refresh button

            // Initial library load on library page
            if (window.location.pathname === '/library') {
                fetchLibrary();
            }
        }

        if (loginForm) {
            loginForm.addEventListener('submit', handleLogin);
        }
        if (registerForm) {
            registerForm.addEventListener('submit', handleRegister);
        }

        console.log('MediaTracker Initialized.');
    }

    // Wait for DOM content to be loaded before initializing
    document.addEventListener('DOMContentLoaded', initialize);

})();
```

### viewRoutes.js

```js
// routes/viewRoutes.js
const express = require('express');
const path = require('path');
const fs = require('fs').promises; // Use promise-based fs
const { requireLogin, checkAuthStatus } = require('../auth');

const router = express.Router();

// Middleware to add user status to all view routes
router.use(checkAuthStatus);

// --- Public Routes ---
router.get('/', (req, res) => {
    res.render('home', { pageTitle: 'Welcome' });
});

router.get('/about', (req, res) => {
    res.render('about', { pageTitle: 'About Us' });
});

router.get('/login', (req, res) => {
    if (res.locals.user) { // Redirect if already logged in
        return res.redirect('/library');
    }
    res.render('login', { pageTitle: 'Login / Register' });
});

// --- Protected Routes ---
router.get('/library', requireLogin, (req, res) => {
    res.render('library', {
        pageTitle: 'My Library',
        // username is available via res.locals.user automatically passed by Handlebars
    });
});

// --- Route to Serve Client-Side Handlebars Partials ---
// Consider security implications: only allow known partials.
const ALLOWED_PARTIALS = new Set(['mediaCard', 'itemFormModal', 'mediaDetailsModal']);
const partialsDir = path.join(__dirname, '../views/partials');

router.get('/templates/:templateName', requireLogin, async (req, res) => {
    const templateName = req.params.templateName;

    if (!ALLOWED_PARTIALS.has(templateName)) {
        return res.status(404).send('Template not found or not allowed.');
    }

    const filePath = path.join(partialsDir, `${templateName}.hbs`);

    try {
        // Check if file exists before sending
        await fs.access(filePath); // Throws if file doesn't exist
        // Set appropriate content type
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
const express = require('express');
const db = require('../../dbUtils'); // Use the promisified utils
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
        // Check if username exists
        const existingUser = await db.get(`SELECT id FROM users WHERE username = ?`, [username]);
        if (existingUser) {
            return res.status(409).json({ message: 'Username already taken.' }); // 409 Conflict
        }

        // Hash password
        const passwordHash = await hashPassword(password);

        // Insert user
        const result = await db.run(`INSERT INTO users (username, passwordHash) VALUES (?, ?)`, [username, passwordHash]);

        res.status(201).json({
            id: result.lastID,
            username: username,
            message: 'User registered successfully. Please login.'
         });

    } catch (error) {
        console.error("Registration Error:", error);
        // dbUtils throws specific errors we might catch if needed
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
        // Find user
        const user = await db.get(`SELECT id, username, passwordHash FROM users WHERE username = ?`, [username]);
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials.' }); // User not found
        }

        // Compare password
        const isMatch = await comparePassword(password, user.passwordHash);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials.' }); // Password mismatch
        }

        // Set auth cookie
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
```

### igdbAuthHelper.js

```js
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
```

### libraryRoutes.js

```js
// routes/api/libraryRoutes.js
const express = require('express');
const db = require('../../dbUtils'); // Use promisified utils
const { verifyToken } = require('../../auth');

const router = express.Router();

// Apply auth middleware to all library routes
router.use(verifyToken);

// --- Helpers ---
const VALID_MEDIA_TYPES = ['movie', 'series', 'book', 'video game'];
const STATUS_MAP = {
    'movie': ['to watch', 'watching', 'watched'],
    'series': ['to watch', 'watching', 'watched'],
    'book': ['to read', 'reading', 'read'],
    'video game': ['to play', 'playing', 'played'],
};
const COMPLETED_STATUSES = ['watched', 'read', 'played'];

function isValidStatusForType(status, mediaType) {
    return STATUS_MAP[mediaType]?.includes(status.toLowerCase());
}

function getValidStatusesForType(mediaType) {
    return STATUS_MAP[mediaType] || [];
}

// --- Get Library Items (with filtering) ---
router.get('/', async (req, res) => {
    const userId = req.userId;
    const { mediaType, userStatus, minRating, maxRating } = req.query;

    let sql = `SELECT * FROM library_items WHERE userId = ?`;
    const params = [userId];

    try {
        if (mediaType) {
            if (!VALID_MEDIA_TYPES.includes(mediaType)) {
                return res.status(400).json({ message: 'Invalid mediaType specified.' });
            }
            sql += ` AND mediaType = ?`;
            params.push(mediaType);
        }
        if (userStatus) {
            // Basic check - more robust validation could check against mediatype if needed
             sql += ` AND userStatus = ?`;
             params.push(userStatus.toLowerCase());
        }
        if (minRating) {
            const minR = parseInt(minRating, 10);
            if (isNaN(minR) || minR < 1 || minR > 20) {
                return res.status(400).json({ message: 'Invalid minRating. Must be between 1 and 20.' });
            }
            sql += ` AND userRating >= ?`;
            params.push(minR);
        }
         if (maxRating) {
            const maxR = parseInt(maxRating, 10);
             if (isNaN(maxR) || maxR < 1 || maxR > 20) {
                return res.status(400).json({ message: 'Invalid maxRating. Must be between 1 and 20.' });
            }
            sql += ` AND userRating <= ?`;
            params.push(maxR);
        }
        // Check min <= max
        if (minRating && maxRating && parseInt(minRating) > parseInt(maxRating)) {
            return res.status(400).json({ message: 'minRating cannot be greater than maxRating.' });
        }

        sql += ` ORDER BY addedAt DESC`;

        const items = await db.all(sql, params);
        res.status(200).json(items);

    } catch (error) {
        console.error("Get Library Error:", error);
        res.status(500).json({ message: error.message || 'Failed to retrieve library items.' });
    }
});

// --- Add Item ---
router.post('/', async (req, res) => {
    const userId = req.userId;
    const {
        mediaType, mediaId, title, imageUrl, apiDescription,
        userDescription, userRating, userStatus
     } = req.body;

    // Validation
    if (!mediaType || !mediaId || !title || !userStatus) {
        return res.status(400).json({ message: 'mediaType, mediaId, title, and userStatus are required.' });
    }
    if (!VALID_MEDIA_TYPES.includes(mediaType)) {
         return res.status(400).json({ message: `Invalid mediaType.` });
    }
    if (!isValidStatusForType(userStatus, mediaType)) {
        const valid = getValidStatusesForType(mediaType);
        return res.status(400).json({ message: `Invalid userStatus for ${mediaType}. Must be one of: ${valid.join(', ')}.` });
    }
    let ratingValue = null;
    if (userRating !== undefined && userRating !== null && userRating !== '') {
        ratingValue = parseInt(userRating, 10);
        if (isNaN(ratingValue) || ratingValue < 1 || ratingValue > 20) {
            return res.status(400).json({ message: 'Invalid userRating. Must be an integer between 1 and 20.' });
        }
    }

    const watchedAt = COMPLETED_STATUSES.includes(userStatus.toLowerCase()) ? new Date().toISOString() : null;

    const insertSql = `
        INSERT INTO library_items
            (userId, mediaType, mediaId, title, imageUrl, apiDescription,
             userDescription, userRating, userStatus, watchedAt, addedAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `;
    const params = [
        userId, mediaType, mediaId, title, imageUrl || null, apiDescription || null,
        userDescription || null, ratingValue, userStatus.toLowerCase(), watchedAt
    ];

    try {
        const result = await db.run(insertSql, params);
        // Fetch and return the newly added item
        const newItem = await db.get(`SELECT * FROM library_items WHERE id = ?`, [result.lastID]);
        res.status(201).json(newItem);

    } catch (error) {
        console.error("Add Library Item Error:", error);
        // Handle UNIQUE constraint error from dbUtils
        if (error.message.includes('UNIQUE constraint failed')) {
             return res.status(409).json({ message: 'This item is already in your library.' });
        }
        res.status(500).json({ message: error.message || 'Failed to add item to library.' });
    }
});

// --- Edit Item ---
router.put('/:id', async (req, res) => {
    const userId = req.userId;
    const itemId = req.params.id;
    const { userDescription, userRating, userStatus } = req.body;

    if (userDescription === undefined && userRating === undefined && userStatus === undefined) {
        return res.status(400).json({ message: 'No fields provided for update.' });
    }

    try {
        // Fetch the item first to get its type and current status
        const item = await db.get(`SELECT mediaType, userStatus as currentStatus FROM library_items WHERE id = ? AND userId = ?`, [itemId, userId]);
        if (!item) {
            return res.status(404).json({ message: 'Library item not found or not owned by user.' });
        }

        const { mediaType, currentStatus } = item;
        const updates = [];
        const params = [];
        let newDbStatus = null;

        // Validate and add fields to update
        if (userStatus !== undefined) {
            const status = userStatus.toLowerCase();
             if (!isValidStatusForType(status, mediaType)) {
                 const valid = getValidStatusesForType(mediaType);
                 return res.status(400).json({ message: `Invalid userStatus for ${mediaType}. Must be one of: ${valid.join(', ')}.` });
             }
             updates.push(`userStatus = ?`);
             params.push(status);
             newDbStatus = status; // Store for watchedAt logic

             // Handle watchedAt timestamp
             const isNowCompleted = COMPLETED_STATUSES.includes(newDbStatus);
             const wasCompleted = COMPLETED_STATUSES.includes(currentStatus);
             if (isNowCompleted && !wasCompleted) {
                updates.push(`watchedAt = datetime('now')`);
             } else if (!isNowCompleted && wasCompleted) {
                 updates.push(`watchedAt = NULL`);
             }
        }

        if (userDescription !== undefined) {
            updates.push(`userDescription = ?`);
            params.push(userDescription); // Allow empty string or null
        }

        if (userRating !== undefined) {
             let ratingValue = null;
             // Allow setting to null or empty string means null
             if (userRating !== null && userRating !== '') {
                 ratingValue = parseInt(userRating, 10);
                 if (isNaN(ratingValue) || ratingValue < 1 || ratingValue > 20) {
                     return res.status(400).json({ message: 'Invalid userRating. Must be an integer between 1 and 20, or null/empty.' });
                 }
             }
             updates.push(`userRating = ?`);
             params.push(ratingValue);
        }

        if (updates.length === 0) {
            // Should not happen due to initial check, but safe fallback
             return res.status(400).json({ message: 'No valid update fields provided.' });
        }

        // Construct and run update query (Trigger handles updatedAt)
        const updateSql = `UPDATE library_items SET ${updates.join(', ')} WHERE id = ? AND userId = ?`;
        params.push(itemId, userId);

        const result = await db.run(updateSql, params);

        if (result.changes === 0) {
            // Should be rare given the initial fetch, maybe concurrent modification?
            return res.status(404).json({ message: 'Item not found or no changes applied.' });
        }

        // Fetch and return the updated item
        const updatedItem = await db.get(`SELECT * FROM library_items WHERE id = ?`, [itemId]);
        res.status(200).json(updatedItem);

    } catch (error) {
        console.error("Update Library Item Error:", error);
        res.status(500).json({ message: error.message || 'Failed to update library item.' });
    }
});

// --- Delete Item ---
router.delete('/:id', async (req, res) => {
    const userId = req.userId;
    const itemId = req.params.id;

    try {
        const result = await db.run(`DELETE FROM library_items WHERE id = ? AND userId = ?`, [itemId, userId]);

        if (result.changes === 0) {
            return res.status(404).json({ message: 'Library item not found or not owned by user.' });
        }
        // Prefer 200 with message or 204 No Content
        res.status(200).json({ message: 'Library item deleted successfully.' });
        // res.status(204).send();

    } catch (error) {
        console.error("Delete Library Item Error:", error);
        res.status(500).json({ message: error.message || 'Failed to delete library item.' });
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
                const booksUrl = `${GOOGLE_BOOKS_BASE_URL}?q=${encodedQuery}&maxResults=20${GOOGLE_BOOKS_API_KEY ? '&key=' + GOOGLE_BOOKS_API_KEY : ''}`;
                const booksResponse = await axios.get(booksUrl);
                // Ensure items array exists before mapping
                results = (booksResponse.data.items || []).map(item => ({
                    mediaId: item.id, // Google Books ID is usually a string
                    mediaType: 'book',
                    title: item.volumeInfo?.title || 'Unknown Title',
                    authors: item.volumeInfo?.authors || [], // Ensure array
                    description: item.volumeInfo?.description,
                    // Prefer HTTPS for images if available
                    imageUrl: item.volumeInfo?.imageLinks?.thumbnail?.replace(/^http:/, 'https') || item.volumeInfo?.imageLinks?.smallThumbnail?.replace(/^http:/, 'https') || null,
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
<section class="hero">
    <h2>Organize Your Entertainment</h2>
    <p>Keep track of movies, series, books, and video games you want to watch, read, or play.</p>
    {{#if user}}
        <a href="/library" class="btn btn-primary">Go to My Library</a>
    {{else}}
        <a href="/login" class="btn btn-primary">Get Started</a>
    {{/if}}
</section>

<section class="features">
    <h2>Features</h2>
    <div class="feature-list">
        <div class="feature-item">Icon 1: Search across multiple platforms.</div>
        <div class="feature-item">Icon 2: Add items to your personal library.</div>
        <div class="feature-item">Icon 3: Track your progress and ratings.</div>
    </div>
</section>
```

### library.hbs

```hbs
<h2>Welcome, {{user.username}}!</h2>

<section class="card search-section">
     {{> searchForm }}
</section>

<section class="card library-section">
    <div class="library-header">
         <h2><span class="icon">📚</span> My Library</h2>
         {{> libraryControls }}
    </div>
     <div id="resultsArea" class="results-grid loading">
         <p class="placeholder-text">Loading library...</p>
     </div>
</section>

<!-- Status/Response Area (optional, for debugging) -->
<section id="statusSection" class="status-section card hidden">
     <p id="statusMessage">Status: Idle</p>
     <details>
         <summary>Show Last API Response</summary>
         <pre id="responseArea">---</pre>
     </details>
</section>

<div id="addItemModal" class="modal-overlay hidden">
    <div class="modal-content" id="modalContentArea">
        Loading modal...
    </div>
</div>
```

### login.hbs

```hbs
<section class="auth-page card">
    <h2>Login or Register</h2>
    {{#if loginError}}
        <p class="error-message">{{loginError}}</p>
    {{/if}}
     {{#if registerMessage}}
        <p class="success-message">{{registerMessage}}</p>
    {{/if}}

    <div class="auth-forms-container">
        <div class="auth-form">
            {{> loginForm }}
        </div>
        <div class="auth-form">
             {{> registerForm }}
        </div>
    </div>
</section>
```

### main.hbs

```hbs
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{pageTitle}} - Media Watchlist</title>
    <link rel="stylesheet" href="/css/style.css">
</head>
<body>
    {{> header }}

    <main class="container">
        {{{body}}}
    </main>

    {{> footer }}

    <!-- Reusable Modal Structure -->
    <div id="infoModal" class="modal-overlay hidden">
        <div class="modal-content" id="modalContentArea">
            Loading details...
        </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <div id="deleteConfirmModal" class="modal-overlay hidden">
        <div class="modal-content modal-confirm">
             <button id="deleteModalCloseBtn" class="modal-close-btn" aria-label="Close">×</button>
             <h3>Confirm Deletion</h3>
             <p id="deleteConfirmMessage">Are you sure you want to delete this item?</p>
             <div class="modal-actions">
                 <button type="button" id="deleteCancelBtn" class="btn btn-secondary">Cancel</button>
                 <button type="button" id="deleteConfirmBtn" class="btn btn-danger">Delete</button>
             </div>
        </div>
    </div>



    <!-- Use Handlebars Runtime from CDN -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/handlebars.js/4.7.8/handlebars.min.js"
            integrity="sha512-E1dSFxg+wsfJ4HKjutk/WaCzK7S2wv1POn1RRPGh8ZK+ag9l244Vqxji3r6wgz9YBf6+vhQEYJZpSjqWFPg9gg=="
            crossorigin="anonymous"
            referrerpolicy="no-referrer"></script>

    <!-- Main Client-Side JS -->
    <script src="/js/main.js"></script>
</body>
</html>
```

### footer.hbs

```hbs
<footer>
    <div class="container">
        <p>© {{currentYear}} Media Watchlist App. All rights reserved.</p>
    </div>
</footer>
```

### header.hbs

```hbs
<header>
    <div class="container header-content">
        <a href="/" class="logo"><h1>Media Watchlist</h1></a>
        <nav>
            <ul>
                <li><a href="/">Home</a></li>
                <li><a href="/about">About</a></li>
                {{#if user}}
                    <li><a href="/library">My Library</a></li>
                    <li><span class="username-display">Hi, {{user.username}}!</span></li>
                    <li><button id="logoutBtn" class="btn btn-secondary btn-small">Logout</button></li>
                {{else}}
                    <li><a href="/login">Login / Register</a></li>
                {{/if}}
            </ul>
        </nav>
    </div>
</header>
```

### itemFormModal.hbs

```hbs
{{! views/partials/itemFormModal.hbs }}
{{! Used by client-side JS to populate the generic modal }}
<button class="modal-close-btn" aria-label="Close">×</button>
<h2 id="modalTitle">{{modalTitle}}</h2>

<form id="itemForm">
    {{!-- Hidden fields managed by JS --}}
    <input type="hidden" id="formMode" value="{{mode}}">
    <input type="hidden" id="itemId" value="{{item.id}}">
    <input type="hidden" id="mediaId" value="{{item.mediaId}}">
    <input type="hidden" id="mediaType" value="{{item.mediaType}}">
    {{!-- Store core data needed if adding --}}
    <input type="hidden" id="coreTitle" value="{{item.title}}">
    <input type="hidden" id="coreImageUrl" value="{{item.imageUrl}}">
    <input type="hidden" id="coreApiDescription" value="{{item.apiDescription}}">

    {{#if item.imageUrl}}
    <img src="{{item.imageUrl}}" alt="{{item.title}}" class="modal-image-preview" onerror="this.style.display='none';">
    {{/if}}

    <div class="form-group">
        <label for="userStatus">Your Status:</label>
        <select id="userStatus" name="userStatus" required>
            <option value="" disabled {{#unless item.userStatus}}selected{{/unless}}>-- Select Status --</option>
            {{#each validStatuses}}
            <option value="{{this}}" {{#if (eq this ../item.userStatus)}}selected{{/if}}>
                {{capitalize this}}
            </option>
            {{/each}}
        </select>
    </div>
    <div class="form-group">
        <label for="userRating">Your Rating (1-20):</label>
        <input type="number" id="userRating" name="userRating" min="1" max="20" placeholder="Optional" value="{{item.userRating}}">
    </div>
    <div class="form-group">
        <label for="userDescription">Your Notes:</label>
        <textarea id="userDescription" name="userDescription" rows="3" placeholder="Optional">{{item.userDescription}}</textarea>
    </div>
    <div class="modal-actions">
        <button type="button" class="btn btn-secondary modal-cancel-btn">Cancel</button>
        <button type="submit" class="btn btn-primary">{{submitButtonText}}</button>
    </div>
     <p class="modal-error-message hidden"></p> {{!-- For displaying form errors --}}
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

### loginForm.hbs

```hbs
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
    <button type="submit" class="btn btn-primary">Login</button>
    <p id="loginError" class="form-error hidden"></p>
</form>
```

### mediaCard.hbs

```hbs
{{! views/partials/mediaCard.hbs }}
{{#each items}}
<div class="{{../cardClass}}" data-item-json="{{json this}}"> {{!-- Store item data --}}
    <img src="{{defaultIfEmpty imageUrl '/images/placeholder.png'}}" alt="{{title}}" class="card-image" onerror="this.onerror=null; this.src='/images/placeholder.png';">
    <div class="card-content">
        <h3 class="card-title">{{title}}</h3>
        <p class="card-meta">
            <span class="tag tag-{{classify (defaultIfEmpty mediaType type)}}">{{defaultIfEmpty mediaType type}}</span>
            {{#if releaseDate}}<span>Released: {{formatYear releaseDate}}</span>{{/if}}
            {{#if publishedDate}}<span>Published: {{formatYear publishedDate}}</span>{{/if}} {{!-- For books --}}
             {{#if authors}}<span>Author(s): {{join authors ", "}}</span>{{/if}}

            {{!-- API Rating (from search or stored) --}}
            {{#if rating}}<span>API Rating: {{rating}}/20</span>{{/if}}

            {{#unless ../isSearchResult}} {{!-- Library item specific meta --}}
                 <span class="tag tag-status-{{classify userStatus}}">Status: <strong>{{userStatus}}</strong></span>
                 {{#if userRating}}<span>My Rating: {{userRating}}/20</span>{{/if}}
                 {{#if addedAt}}<span>Added: {{formatDate addedAt}}</span>{{/if}}
                 {{#if watchedAt}}<span>Completed: {{formatDate watchedAt}}</span>{{/if}}
            {{/unless}}
        </p>
        <p class="card-description truncated">
            {{#if ../isSearchResult}}
                {{! Use description from search, fallback to apiDescription if structure differs }}
                {{defaultIfEmpty description apiDescription}}
            {{else}}
                <strong>My Notes:</strong> {{defaultIfEmpty userDescription "None"}}
            {{/if}}
        </p>
        {{#unless ../isSearchResult}}
             {{#if apiDescription}}
             <details class="api-desc-details"><summary>Original Description</summary><p>{{apiDescription}}</p></details>
             {{/if}}
        {{/unless}}

        <div class="card-actions">
            {{#if ../isSearchResult}}
                 {{!-- Add button triggers modal via event delegation --}}
                <button class="btn btn-primary btn-small action-add">Add to Library</button>
            {{else}}
                 {{!-- Edit/Delete buttons trigger actions via event delegation --}}
                <button class="btn btn-secondary btn-small action-edit">Edit</button>
                <button class="btn btn-danger btn-small action-delete">Delete</button>
            {{/if}}
             {{!-- Details button triggers modal via event delegation (even on library items) --}}
             <button class="btn btn-secondary btn-small action-details">Details</button>
        </div>
    </div>
</div>
{{else}}
    {{#unless ../hidePlaceholder}} {{!-- Allow hiding placeholder during loading --}}
    <p class="placeholder-text">{{defaultIfEmpty ../placeholder "No items found."}}</p>
    {{/unless}}
{{/each}}
```

### mediaDetailsModal.hbs

```hbs
{{! views/partials/mediaDetailsModal.hbs }}
<button class="modal-close-btn" aria-label="Close">×</button>

<div class="media-details-modal">
    <div class="details-header">
        <img src="{{defaultIfEmpty item.imageUrl '/images/placeholder.png'}}" alt="{{item.title}}" class="details-image" onerror="this.onerror=null; this.src='/images/placeholder.png';">
        <div class="details-header-info">
            {{!-- Title and Year --}}
            <h2>{{item.title}} {{#if item.releaseDate}}({{formatYear item.releaseDate}}){{/if}}</h2>

            {{!-- Common Meta --}}
            <p class="details-meta">
                <span class="tag tag-{{classify item.mediaType}}">{{capitalize item.mediaType}}</span>
                 {{#if item.genres.length}}
                    <span>Genres: {{join item.genres ", "}}</span>
                 {{/if}}
                 {{#if item.rating}} {{!-- Display normalized rating --}}
                    <span>Rating: {{item.rating}}/20</span>
                 {{/if}}
            </p>
            {{!-- Type-Specific Meta Links/Info --}}
            <p class="details-meta">
                 {{#if item.imdbId}}
                    <span><a href="https://www.imdb.com/title/{{item.imdbId}}/" target="_blank" rel="noopener noreferrer">IMDb</a></span>
                 {{/if}}
                  {{#if item.googleBooksLink}}
                    <span><a href="{{item.googleBooksLink}}" target="_blank" rel="noopener noreferrer">Google Books</a></span>
                 {{/if}}
                 {{#if item.igdbLink}}
                    <span><a href="{{item.igdbLink}}" target="_blank" rel="noopener noreferrer">IGDB</a></span>
                 {{/if}}
                 {{!-- Authors (Books) --}}
                 {{#if item.authors.length}}<span>Author(s): {{join item.authors ", "}}</span>{{/if}}
                 {{!-- Platforms (Games) --}}
                 {{#if item.platforms.length}}<span>Platform(s): {{join item.platforms ", "}}</span>{{/if}}
            </p>
        </div>
    </div>

    <div class="details-body">
        <h3>Overview/Description</h3>
        <p>{{defaultIfEmpty item.description item.overview "No description available."}}</p>

        {{!-- Movie/Series Specific --}}
        {{#if item.cast.length}}
            <hr><h4>Cast</h4>
            <ul class="details-list">
                {{#each item.cast}}<li><strong>{{this.name}}</strong> as {{this.character}}</li>{{/each}}
            </ul>
        {{/if}}
        {{#if item.producers.length}}
            <h4>Producers</h4><p>{{join item.producers ", "}}</p>
        {{/if}}

        {{!-- Book Specific --}}
        {{#eq item.mediaType 'book'}}
            <hr>
            {{#if item.publisher}}<h4>Publisher</h4><p>{{item.publisher}}</p>{{/if}}
            {{#if item.pageCount}}<h4>Pages</h4><p>{{item.pageCount}}</p>{{/if}}
        {{/eq}}

        {{!-- Video Game Specific --}}
         {{#eq item.mediaType 'video game'}}
            <hr>
            {{#if item.developers.length}}<h4>Developer(s)</h4><p>{{join item.developers ", "}}</p>{{/if}}
            {{#if item.publishers.length}}<h4>Publisher(s)</h4><p>{{join item.publishers ", "}}</p>{{/if}}
            {{#if item.screenshots.length}}
                <h4>Screenshots</h4>
                <div class="details-screenshots">
                    {{#each item.screenshots}} <img src="{{this}}" alt="Screenshot" loading="lazy"> {{/each}}
                </div>
            {{/if}}
             {{#if item.videos.length}}
                <h4>Videos</h4>
                 <ul class="details-list">
                    {{#each item.videos}}<li><a href="{{this.youtubeLink}}" target="_blank" rel="noopener noreferrer">Watch Trailer/Video (YouTube)</a></li>{{/each}}
                 </ul>
            {{/if}}
        {{/eq}}


        {{!-- Library Info (If Applicable) --}}
        {{#if isLibraryItem}}
            <hr>
            <h3>My Library Info</h3>
            <p class="details-meta">
                <span class="tag tag-status-{{classify item.userStatus}}">Status: <strong>{{item.userStatus}}</strong></span>
                {{#if item.userRating}}<span>My Rating: {{item.userRating}}/20</span>{{/if}}
                {{#if item.addedAt}}<span>Added: {{formatDate item.addedAt}}</span>{{/if}}
                 {{#if item.watchedAt}}<span>Completed: {{formatDate item.watchedAt}}</span>{{/if}}
            </p>
            <h4>My Notes:</h4>
            <p>{{defaultIfEmpty item.userDescription "No personal notes added."}}</p>
        {{/if}}
    </div>

    {{!-- Action Buttons --}}
    <div class="modal-actions details-actions" data-item-json="{{json item}}">
        <div>
            {{#if isLibraryItem}}
                <button class="btn btn-secondary action-edit">Edit</button>
                <button class="btn btn-danger action-delete">Delete</button>
            {{else}}
                <button class="btn btn-primary action-add">Add to Library</button>
            {{/if}}
        </div>
         <button type="button" class="btn btn-secondary modal-cancel-btn">Close</button>
    </div>
     <p class="modal-error-message hidden"></p>
</div>
```

### registerForm.hbs

```hbs
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
    <button type="submit" class="btn btn-secondary">Register</button>
     <p id="registerMessage" class="form-message hidden"></p>
     <p id="registerError" class="form-error hidden"></p>
</form>
```

### searchForm.hbs

```hbs
<form id="searchForm" class="search-form">
     <h3><span class="icon">🔍</span> Search Media</h3>
    <div class="form-group">
        <label for="searchQuery" class="sr-only">Search Term:</label>
        <input type="text" id="searchQuery" required placeholder="Search movies, series, books, games..."> 
    </div>
    <div class="form-group">
        <label for="searchType" class="sr-only">Media Type:</label>
        <select id="searchType">
            <option value="movie">Movie</option>
            <option value="series">Series</option>
            <option value="book">Book</option>
            <option value="video game">Video Game</option>
        </select>
    </div>
    <button type="submit" class="btn btn-primary">Search</button>
</form>
 <div id="searchSpinner" class="spinner hidden"></div>
```


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
            - libraryRoutes.js
            - searchRoutes.js
    - views/
        - about.hbs
        - home.hbs
        - library.hbs
        - login.hbs
        - layouts/
            - main.hbs
        - partials/
            - addItemModal.hbs
            - footer.hbs
            - header.hbs
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
const COOKIE_NAME = 'authToken'; // Name for the JWT cookie

if (!JWT_SECRET) {
    console.error("FATAL ERROR: JWT_SECRET is not defined in .env file.");
    process.exit(1); // Exit if the secret is missing
}

// --- Password Hashing ---
async function hashPassword(password) {
    return await bcrypt.hash(password, SALT_ROUNDS);
}

async function comparePassword(password, hash) {
    return await bcrypt.compare(password, hash);
}

// --- Token Generation ---
function generateToken(user) {
    const payload = { id: user.id, username: user.username };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '1d' }); // Expires in 1 day
}

// --- Set Auth Cookie ---
function setAuthCookie(res, user) {
    const token = generateToken(user);
    res.cookie(COOKIE_NAME, token, {
        httpOnly: true, // Prevents client-side JS access
        secure: process.env.NODE_ENV === 'production', // Use secure cookies in production (HTTPS)
        maxAge: 24 * 60 * 60 * 1000, // 1 day expiration (matches token)
        sameSite: 'lax' // Protects against CSRF to some extent
    });
}

// --- Clear Auth Cookie (NEW) ---
function clearAuthCookie(res) {
    res.clearCookie(COOKIE_NAME, {
         httpOnly: true,
         secure: process.env.NODE_ENV === 'production',
         sameSite: 'lax'
     });
}

// --- Verify Token Middleware (for API routes) ---
// This verifies the cookie now instead of the header
function verifyToken(req, res, next) {
    const token = req.cookies[COOKIE_NAME]; // Get token from cookie

    if (!token) {
        // For API requests, return 401 directly
        return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.id; // Add user ID for API use
        req.user = decoded; // Optionally add full user payload
        next();
    } catch (error) {
        // Clear invalid/expired cookie
        clearAuthCookie(res);
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Token expired. Please login again.' });
        }
        return res.status(401).json({ message: 'Invalid token.' }); // Use 401 for auth issues
    }
}

// --- Check Auth Status Middleware (for VIEW routes) ---
// Attaches user info to res.locals if logged in, otherwise proceeds
function checkAuthStatus(req, res, next) {
    const token = req.cookies[COOKIE_NAME];
    res.locals.user = null; // Default to not logged in

    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            // Make user info available to Handlebars templates
            res.locals.user = { id: decoded.id, username: decoded.username };
        } catch (error) {
            // Invalid or expired token - clear cookie but don't block the request
            console.log('Auth status check failed:', error.name);
            clearAuthCookie(res);
        }
    }
    next(); // Always proceed to the next middleware/route
}

// --- Protect View Route Middleware (NEW) ---
// Redirects to login page if user is not authenticated
function requireLogin(req, res, next) {
    if (!res.locals.user) {
        // Store the original URL they were trying to access (optional)
        // req.session.returnTo = req.originalUrl; // Requires express-session
        return res.redirect('/login'); // Redirect to login page
    }
    next(); // User is logged in, proceed
}


module.exports = {
    hashPassword,
    comparePassword,
    setAuthCookie,
    clearAuthCookie,
    verifyToken, // For API protection
    checkAuthStatus, // For adding user to res.locals
    requireLogin // For protecting specific view routes
};
```

### database.js

```js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Define the path to the database file
const dbPath = path.resolve(__dirname, 'watchlist.db');

// Create or open the database
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        initializeDatabase();
    }
});

// Function to initialize database schema
function initializeDatabase() {
    db.serialize(() => {
        // Create Users table
        db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        passwordHash TEXT NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
            if (err) {
                console.error('Error creating users table:', err.message);
            } else {
                console.log('Users table checked/created successfully.');
            }
        });

        // Create Library Items table
        // Create Library Items table with NEW COLUMNS
        db.run(`
            CREATE TABLE IF NOT EXISTS library_items (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              userId INTEGER NOT NULL,
              mediaType TEXT NOT NULL CHECK(mediaType IN ('movie', 'series', 'book', 'video game')),
              mediaId TEXT NOT NULL, -- ID from external API
  
              -- NEW: Core media details stored at time of adding
              title TEXT,
              imageUrl TEXT,
              apiDescription TEXT, -- Original description from API
  
              -- User-specific details
              userDescription TEXT,
              userRating INTEGER CHECK(userRating >= 1 AND userRating <= 20),
              userStatus TEXT NOT NULL CHECK(userStatus IN ('to watch', 'to read', 'to play', 'watching', 'reading', 'playing', 'watched', 'read', 'played')),
  
              -- Timestamps
              addedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
              updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
              watchedAt DATETIME, -- Timestamp when marked as watched/read/played
  
              FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE,
              UNIQUE(userId, mediaType, mediaId) -- Prevent adding the same item multiple times per user
            )
          `, (err) => {
              if (err) {
                  console.error('Error creating library_items table:', err.message);
              } else {
                  console.log('Library Items table checked/created successfully.');
              }
          });
  
        // Add triggers to automatically update 'updatedAt' timestamp
        // Drop existing trigger first (optional, good for development)
        db.run(`DROP TRIGGER IF EXISTS update_library_item_timestamp;`);
        db.run(`
          CREATE TRIGGER update_library_item_timestamp
          AFTER UPDATE ON library_items
          FOR EACH ROW
          BEGIN
              UPDATE library_items SET updatedAt = CURRENT_TIMESTAMP WHERE id = OLD.id;
          END;
        `, (err) => {
            if (err) {
                // Ignore error if trigger already exists (less critical)
                if (!err.message.includes('already exists')) {
                    console.error('Error creating update timestamp trigger:', err.message);
                }
            } else {
                console.log('Update timestamp trigger created successfully.');
            }
        });
    });
}

module.exports = db;
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
const cookieParser = require('cookie-parser'); // Import cookie-parser
const { engine } = require('express-handlebars'); // Import handlebars engine

const db = require('./database'); // Ensure DB connection

// --- Middleware for Auth Status (used by view routes) ---
const { checkAuthStatus } = require('./auth'); // We'll add this function to auth.js

// --- Route Imports ---
const authApiRoutes = require('./routes/api/authRoutes');
const searchApiRoutes = require('./routes/api/searchRoutes');
const libraryApiRoutes = require('./routes/api/libraryRoutes');
const viewRoutes = require('./routes/viewRoutes'); // Import view routes

const app = express();
const PORT = process.env.PORT || 3001;

// --- Handlebars Engine Setup ---
app.engine('hbs', engine({
    extname: '.hbs', // Use .hbs extension
    defaultLayout: 'main', // Specify main.hbs as the default layout
    layoutsDir: path.join(__dirname, 'views/layouts'), // Layouts directory
    partialsDir: path.join(__dirname, 'views/partials'), // Partials directory
    // Optional: Add helpers here if needed
    helpers: {
        eq: (v1, v2) => v1 === v2,
        json: (context) => JSON.stringify(context), // For debugging in templates
    }
}));
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views')); // Views directory

// --- Core Middleware ---
app.use(cors({ // Configure CORS if your API might be called from other origins
    origin: `http://localhost:${PORT}`, // Allow requests from frontend origin
    credentials: true // Allow cookies to be sent
}));
app.use(express.json()); // Parse JSON request bodies
app.use(express.urlencoded({ extended: false })); // Parse URL-encoded bodies (for forms if any)
app.use(cookieParser()); // Parse cookies
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files

// --- Middleware to make auth status available to ALL views ---
app.use(checkAuthStatus); // Run checkAuthStatus on every request

// --- View Routes ---
app.use('/', viewRoutes); // Use view routes for page rendering

// --- API Routes ---
// Note: API routes might not need CORS if only called from the same origin,
// but it's safer to leave it enabled globally or configure specifically.
app.use('/api/auth', authApiRoutes);
app.use('/api/search', searchApiRoutes);
app.use('/api/library', libraryApiRoutes);

// --- Error Handling ---
// API 404 Handler
app.use('/api/*', (req, res) => {
    res.status(404).json({ message: 'API endpoint not found.' });
});

// General 404 Handler for views (after all other routes)
app.use((req, res) => {
     res.status(404).render('error', { // Assuming you create an error.hbs view
        layout: 'main', // Use the main layout
        pageTitle: 'Not Found',
        errorCode: 404,
        errorMessage: 'Sorry, the page you are looking for does not exist.',
        user: res.locals.user // Pass user status
     });
});


// General error handler (should be last)
app.use((err, req, res, next) => {
    console.error("Unhandled error:", err.stack); // Log stack trace
     const status = err.status || 500;
     const message = err.message || 'An unexpected server error occurred.';

    // Respond differently for API requests vs View requests
    if (req.originalUrl.startsWith('/api/')) {
         res.status(status).json({ message: message });
    } else {
        res.status(status).render('error', { // Render an error page
            layout: 'main',
            pageTitle: 'Error',
            errorCode: status,
            errorMessage: message,
            // In production, you might hide the detailed error message
            // errorMessage: status === 500 ? 'An internal server error occurred.' : message,
            user: res.locals.user
        });
    }
});

// --- Start Server ---
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server and DB connection')
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err.message);
    } else {
      console.log('Database connection closed.');
    }
    process.exit(0)
  })
})
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

// --- IIFE to encapsulate code ---
(function() {
    // --- Configuration ---
    const API_BASE_URL = '/api'; // Relative URL

    // --- State ---
    let compiledTemplates = {}; // Cache for compiled Handlebars templates

    // --- DOM Elements (Cache elements present on load) ---
    const resultsArea = document.getElementById('resultsArea');
    const statusMessage = document.getElementById('statusMessage');
    const responseArea = document.getElementById('responseArea');
    const statusSection = document.getElementById('statusSection'); // To hide/show
    const logoutBtn = document.getElementById('logoutBtn');

    // Elements potentially added/removed or specific to pages
    const getSearchForm = () => document.getElementById('searchForm');
    const getLibraryControls = () => document.getElementById('libraryControls');
    const getResultsArea = () => document.getElementById('resultsArea');
    const getLoginForm = () => document.getElementById('loginForm');
    const getRegisterForm = () => document.getElementById('registerForm');
    const getAddItemModal = () => document.getElementById('addItemModal');
    const getModalContentArea = () => document.getElementById('modalContentArea');
    const getInfoModal = () => document.getElementById('infoModal');
    const getModalOverlay = () => document.getElementById('infoModal');
    
    // --- Handlebars Setup & Helpers ---
    // Register helpers needed by mediaCard.hbs, addItemModal.hbs etc.
    // These are simple examples, use a library like Moment.js/date-fns for robust date formatting
    Handlebars.registerHelper('formatYear', function(dateString) {
        return dateString ? new Date(dateString).getFullYear() : '';
    });
     Handlebars.registerHelper('formatDate', function(dateString) {
        return dateString ? new Date(dateString).toLocaleDateString() : '';
    });
    Handlebars.registerHelper('join', function(arr, separator) {
        return Array.isArray(arr) ? arr.join(separator) : '';
    });
    Handlebars.registerHelper('truncate', function(str, len) {
        if (str && str.length > len) {
            return str.substring(0, len) + '...';
        }
        return str;
    });
    Handlebars.registerHelper('classify', function(str) {
        // Basic helper to create CSS class from status (e.g., "to watch" -> "to-watch")
         return typeof str === 'string' ? str.replace(/\s+/g, '-').toLowerCase() : '';
    });
     Handlebars.registerHelper('capitalize', function(str) {
         return typeof str === 'string' ? str.charAt(0).toUpperCase() + str.slice(1) : '';
    });
    // Add to Handlebars helpers registration in main.js
    Handlebars.registerHelper('defaultIfEmpty', function(value1, value2) {
        return value1 || value2 || '';
    });
    // Register a custom helper to check equality
    Handlebars.registerHelper('eq', function(arg1, arg2) {
        return arg1 === arg2;
    });


    // Function to fetch and compile a Handlebars template (with caching)
    async function getTemplate(templateName) {
        if (compiledTemplates[templateName]) {
            return compiledTemplates[templateName];
        }
        try {
            // Use the /templates/:templateName route we created
            const response = await fetch(`/templates/${templateName}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch template: ${templateName} (${response.status})`);
            }
            const templateString = await response.text();
            compiledTemplates[templateName] = Handlebars.compile(templateString);
            return compiledTemplates[templateName];
        } catch (error) {
            console.error(`Error getting template ${templateName}:`, error);
            displayStatus(`Error loading template ${templateName}.`, true);
            return null; // Indicate failure
        }
    }

    // --- Helper Functions ---
    function displayStatus(message, isError = false, isSuccess = false) {
        if (!statusMessage) return; // Element might not exist on all pages
        statusMessage.textContent = `Status: ${message}`;
        statusMessage.className = isError ? 'error' : (isSuccess ? 'success' : '');
        statusSection?.classList.remove('hidden'); // Show status section on message
        console.log(message);
    }

    function displayResponse(data) {
         if (!responseArea) return;
        try {
            responseArea.textContent = JSON.stringify(data, null, 2);
        } catch (e) {
            responseArea.textContent = String(data);
        }
    }

    function showSpinner(spinnerId) {
        document.getElementById(spinnerId)?.classList.remove('hidden');
    }
    function hideSpinner(spinnerId) {
        document.getElementById(spinnerId)?.classList.add('hidden');
    }


    // --- API Request Function (Handles Cookies Automatically) ---
    async function makeApiRequest(endpoint, method = 'GET', body = null) {
        displayStatus('Sending request...');
        showSpinner(endpoint.includes('library') ? 'librarySpinner' : 'searchSpinner'); // Show relevant spinner
        const url = `${API_BASE_URL}${endpoint}`;
        const options = {
            method: method,
            headers: {} // No Authorization header needed, cookies handled by browser
        };

        if (body) {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(body);
        }

        try {
            const response = await fetch(url, options);
            let responseData;

            // Handle different success statuses
             if (response.status === 204) { // No Content (e.g., DELETE)
                responseData = { message: 'Operation successful.' }; // Create success data
            } else if (response.ok) { // 200, 201
                responseData = await response.json();
            } else { // Handle HTTP errors (4xx, 5xx)
                 responseData = await response.json().catch(() => ({ message: `HTTP error ${response.status}` })); // Try to parse error JSON
                 const errorMessage = responseData?.message || `Request failed with status: ${response.status}`;
                 throw new Error(errorMessage); // Throw error to be caught below
            }

            displayResponse(responseData);
            displayStatus(`${method} ${endpoint} - Success!`, false, true); // Mark as success
            return responseData;

        } catch (error) {
            console.error('API Request Error:', error);
            const errorMsg = error.message || 'An unknown API error occurred.';
            displayStatus(`Error: ${errorMsg}`, true);
            displayResponse({ error: errorMsg }); // Show error in response area
            // Specific handling for auth errors (redirect to login)
            if (error.message.includes('Access denied') || error.message.includes('expired') || error.message.includes('Invalid token')) {
                 // Wait a moment for user to see message, then redirect
                 setTimeout(() => {
                    window.location.href = '/login'; // Redirect to login page
                 }, 1500);
            }
            return null; // Indicate failure
        } finally {
             hideSpinner(endpoint.includes('library') ? 'librarySpinner' : 'searchSpinner'); // Hide spinner
        }
    }

     // --- REFINED: renderResults to add data to card ---
     async function renderResults(items, targetElement, templateName, cardClass, placeholderText) {
        if (!targetElement) return;
        targetElement.innerHTML = ''; // Clear previous
        targetElement.classList.remove('loading');

        const template = await getTemplate(templateName); // Use mediaCard template
        if (!template) {
            targetElement.innerHTML = `<p class="placeholder-text error">Error loading display template.</p>`;
            return;
        }

        // Render items one by one to attach data easily
        if (!items || items.length === 0) {
             targetElement.innerHTML = `<p class="placeholder-text">${placeholderText}</p>`;
             return;
        }

        items.forEach(item => {
             const itemForTemplate = {
                ...item,
                // Ensure consistent naming
                apiDescription: item.description || item.apiDescription || '',
                mediaType: item.type || item.mediaType,
             };

            const html = template({ // Render single item
                items: [itemForTemplate], // Pass as array for the #each block
                cardClass: cardClass,
                isSearchResult: cardClass === 'result-card'
             });

            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html.trim(); // Render into temporary div
            const cardElement = tempDiv.firstChild; // Get the rendered card element

            if (cardElement) {
                // Attach the full original item data to the card element
                cardElement.dataset.itemData = JSON.stringify(item); // <<< Store data here
                targetElement.appendChild(cardElement); // Add card to the results area
            }
        });

        attachCardListeners(targetElement); // Attach listeners after all cards are added
    }

    // --- NEW: Function to attach listeners to cards ---
    function attachCardListeners(parentElement) {
        parentElement.querySelectorAll('.result-card, .library-card').forEach(card => {
            // Store item data directly on the card element
            const button = card.querySelector('.add-to-library-btn, .edit-library-item-btn'); // Find a button to get initial data string
            if (button) {
                // Find the corresponding item data using mediaId or id
                const item = JSON.parse(button.closest('.result-card, .library-card').querySelector('.add-to-library-btn, .edit-library-item-btn,[data-id]')?.closest('.result-card, .library-card')?.dataset.itemData || '{}'); // Need a better way to get data back if button isn't the source

                // Let's refine renderResults to add data directly to card
            }


            card.addEventListener('click', handleCardClick);
            // Prevent card click if a button inside was clicked
            card.querySelectorAll('button, a, details, summary, input, select, textarea').forEach(interactiveElement => {
                interactiveElement.addEventListener('click', (event) => {
                    event.stopPropagation(); // Stop click from bubbling up to the card
                });
            });
        });
    }
   
    // --- Event Handlers ---
    async function handleLogout(event) {
        event.preventDefault();
        const result = await makeApiRequest('/auth/logout', 'POST');
        if (result) {
            displayStatus('Logout successful. Redirecting...', false, true);
            // Redirect to home page after logout
            window.location.href = '/';
        }
    }

    async function handleRegister(event) {
        event.preventDefault();
        const form = event.target;
        const username = form.username.value.trim();
        const password = form.password.value.trim();
        // Get elements reliably
        const errorEl = document.getElementById('registerError');
        const messageEl = document.getElementById('registerMessage');
    
        // Hide messages initially IF elements exist
        if(errorEl) errorEl.classList.add('hidden');
        if(messageEl) messageEl.classList.add('hidden');
    
        // --- Validation ---
        if (!username || !password) return displayStatus('Username and password required.', true);
        if (password.length < 6) {
            if (errorEl) { // Check if element exists before setting text
                errorEl.textContent = 'Password must be at least 6 characters.';
                errorEl.classList.remove('hidden');
            } else {
                 displayStatus('Password must be at least 6 characters.', true); // Fallback status
            }
            return;
        }
    
        // --- API Call ---
        const result = await makeApiRequest('/auth/register', 'POST', { username, password });
    
        // --- Handle Response ---
        if (result) {
            if (messageEl) { // Check if element exists
                messageEl.textContent = result.message || `User ${username} registered! Please login.`;
                messageEl.classList.remove('hidden');
            } else {
                displayStatus(result.message || `User ${username} registered! Please login.`, false, true); // Fallback
            }
            form.reset();
        } else {
             // Display error from status or response
             const apiErrorMsg = statusMessage.textContent.includes('Error:')
                               ? statusMessage.textContent.replace('Status: Error: ', '')
                               : 'Registration failed. Please try again.';
             if (errorEl) { // Check if element exists
                 errorEl.textContent = apiErrorMsg;
                 errorEl.classList.remove('hidden');
             } else {
                 displayStatus(apiErrorMsg, true); // Fallback
             }
        }
    }
    
    async function handleLogin(event) {
        event.preventDefault();
        const form = event.target;
        const username = form.username.value.trim();
        const password = form.password.value.trim();
        const errorEl = document.getElementById('loginError');
        errorEl?.classList.add('hidden');

        if (!username || !password) return displayStatus('Username and password required.', true);

        const result = await makeApiRequest('/auth/login', 'POST', { username, password });
        if (result && result.user) {
            displayStatus('Login successful! Redirecting...', false, true);
            // Redirect to library page after successful login
            window.location.href = '/library';
        } else {
            errorEl.textContent = statusMessage.textContent.replace('Status: Error: ',''); // Display API error
            errorEl.classList.remove('hidden');
        }
    }

    async function handleSearch(event) {
        event.preventDefault();
        const form = event.target;
        const query = form.querySelector('#searchQuery').value.trim();
        const type = form.querySelector('#searchType').value;
        const resultsTarget = getResultsArea();

        if (!query) return displayStatus('Search query required.', true);
        if (!resultsTarget) return; // Should be on library page

        resultsTarget.classList.add('loading');
        resultsTarget.innerHTML = '<p class="placeholder-text">Searching...</p>';

        const results = await makeApiRequest(`/search?query=${encodeURIComponent(query)}&type=${type}`, 'GET');

        if (results !== null) {
            renderResults(results, resultsTarget, 'mediaCard', 'result-card', 'No results found.');
        } else {
            renderResults([], resultsTarget, 'mediaCard', 'result-card', 'Failed to fetch search results.');
        }
    }

    // --- NEW: Handle click on a media card (not buttons inside) ---
    function handleCardClick(event) {
        const card = event.currentTarget; // The card element itself
        const itemDataString = card.dataset.itemData;
        if (!itemDataString) {
            console.error('Could not find item data on clicked card.');
            return;
        }
        try {
            const item = JSON.parse(itemDataString);
            console.log('Card clicked, item data:', item);
                // Determine if it's a library item or search result
            const isLibrary = card.classList.contains('library-card');
            openDetailsModal(item, isLibrary);
        } catch (e) {
                console.error('Failed to parse item data from card:', e);
        }
    }
    
    async function fetchLibrary() {
        const resultsTarget = getResultsArea();
        if (!resultsTarget) return; // Not on library page

        resultsTarget.classList.add('loading');
        resultsTarget.innerHTML = '<p class="placeholder-text">Loading library...</p>';

        // Build query string from filters
        const controls = getLibraryControls();
        let queryParams = [];
        if(controls){
             const mediaType = controls.querySelector('#filterMediaType').value;
             const status = controls.querySelector('#filterStatus').value;
             const minRating = controls.querySelector('#filterMinRating').value;
             const maxRating = controls.querySelector('#filterMaxRating').value;
             if (mediaType) queryParams.push(`mediaType=${mediaType}`);
             if (status) queryParams.push(`userStatus=${status}`);
             if (minRating) queryParams.push(`minRating=${minRating}`);
             if (maxRating) queryParams.push(`maxRating=${maxRating}`);
        }
        const queryString = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';

        const items = await makeApiRequest(`/library${queryString}`, 'GET');
        if (items !== null) {
            renderResults(items, resultsTarget, 'mediaCard', 'library-card', 'Your library is empty.');
        } else {
             renderResults([], resultsTarget, 'mediaCard', 'library-card', 'Could not load library.');
        }
    }

    // --- Modal Handling ---
    async function openAddItemModal(data) {
        const modal = getAddItemModal();
        const contentArea = getModalContentArea();
        if (!modal || !contentArea) return;

        contentArea.innerHTML = 'Loading...'; // Placeholder while template loads
        modal.classList.remove('hidden'); // Show modal structure immediately

        const template = await getTemplate('addItemModal');
        if (!template) {
            contentArea.innerHTML = '<p class="error">Error loading modal content.</p>';
            return;
        }

        console.log(data.mediaType); // Debugging line
        console.log(getValidStatuses(data.mediaType)); // Debugging line
        // Prepare data for the modal template
        const templateData = {
            itemTitle: data.title,
            mediaId: data.mediaId,
            mediaType: data.mediaType,
            imageUrl: data.imageUrl,
            apiDescription: data.apiDescription,
            validStatuses: getValidStatuses(data.mediaType)
        };

        contentArea.innerHTML = template(templateData);

        // Add specific listeners for the newly added modal elements
        contentArea.querySelector('#addItemForm')?.addEventListener('submit', handleAddItemSubmit);
        contentArea.querySelector('#modalCloseBtn')?.addEventListener('click', closeAddItemModal);
        contentArea.querySelector('#modalCancelBtn')?.addEventListener('click', closeAddItemModal);
    }

    // --- NEW: Open Details Modal ---
    async function openDetailsModal(item, isLibraryItem) {
        const modal = getInfoModal(); // Target the generic modal overlay
        const contentArea = modal?.querySelector('#modalContentArea'); // Target content area
        if (!modal || !contentArea) return;

        contentArea.innerHTML = 'Loading details...';
        modal.classList.remove('hidden'); // Show modal overlay

        const template = await getTemplate('mediaDetailsModal');
        if (!template) {
             contentArea.innerHTML = '<p class="error">Error loading details template.</p>';
             return;
        }

        // Prepare data for the details template
        const templateData = {
            item: {
                ...item,
                // Ensure consistent naming used by the template
                mediaType: item.type || item.mediaType,
                apiDescription: item.description || item.apiDescription || ''
            },
            isLibraryItem: isLibraryItem
        };

        contentArea.innerHTML = template(templateData);

        // Add listeners for elements INSIDE the details modal
        contentArea.querySelector('#modalCloseBtn')?.addEventListener('click', closeInfoModal);
        contentArea.querySelector('#modalCancelBtn')?.addEventListener('click', closeInfoModal); // Close button

        // Re-attach handlers for action buttons IF they exist in this modal
        contentArea.querySelector('.add-to-library-btn')?.addEventListener('click', handleOpenAddItemModalFromDetails); // Special handler needed
        contentArea.querySelector('.edit-library-item-btn')?.addEventListener('click', handleEditLibraryItem);
        contentArea.querySelector('.delete-library-item-btn')?.addEventListener('click', handleDeleteLibraryItem);
    }

    // --- NEW: Close Generic Info Modal ---
    function closeInfoModal() {
        const modal = getInfoModal();
        modal?.classList.add('hidden');
        const contentArea = modal?.querySelector('#modalContentArea');
        if(contentArea) contentArea.innerHTML = ''; // Clear content
    }


    // --- NEW: Handler to open ADD modal from DETAILS modal ---
    function handleOpenAddItemModalFromDetails(event) {
        const button = event.target.closest('.add-to-library-btn');
        if (!button) return;
         // Data is already on the button from the details template rendering
        const itemData = {
            mediaId: button.dataset.mediaId,
            mediaType: button.dataset.mediaType,
            title: button.dataset.title,
            imageUrl: button.dataset.imageUrl,
            apiDescription: button.dataset.apiDescription,
        };
         closeInfoModal(); // Close the details modal first
         // Short delay to allow closing animation
         setTimeout(() => {
             openAddItemModal(itemData); // Now open the add item modal
         }, 100); // Adjust delay if needed
    }

     function closeAddItemModal() {
        const modal = getAddItemModal();
        modal?.classList.add('hidden');
        const contentArea = getModalContentArea();
        if(contentArea) contentArea.innerHTML = ''; // Clear content
    }

    async function handleOpenModalClick(event) {
        const button = event.target.closest('.add-to-library-btn'); // Find button even if icon inside is clicked
        if (!button) return;

        const itemData = {
            mediaId: button.dataset.mediaId,
            mediaType: button.dataset.mediaType,
            title: button.dataset.title,
            imageUrl: button.dataset.imageUrl,
            apiDescription: button.dataset.apiDescription,
        };
        openAddItemModal(itemData);
    }

     async function handleAddItemSubmit(event) {
        event.preventDefault();
        const form = event.target;
        const modalError = form.querySelector('#modalError');
        modalError?.classList.add('hidden');

        const userStatus = form.querySelector('#modalUserStatus').value;
        const userRatingInput = form.querySelector('#modalUserRating').value;
        const userDescription = form.querySelector('#modalUserDescription').value.trim();

        const mediaId = form.querySelector('#modalMediaId').value;
        const mediaType = form.querySelector('#modalMediaType').value;
        const title = form.querySelector('#modalTitleData').value;
        const imageUrl = form.querySelector('#modalImageUrlData').value;
        const apiDescription = form.querySelector('#modalApiDescriptionData').value;

        let userRating = null;
        if (userRatingInput) {
            userRating = parseInt(userRatingInput, 10);
            if (isNaN(userRating) || userRating < 1 || userRating > 20) {
                modalError.textContent = 'Rating must be between 1 and 20.';
                modalError.classList.remove('hidden');
                return;
            }
        }
        // Construct payload for API
        const payload = {
            mediaId, mediaType, title, imageUrl, apiDescription, // Core data
            userStatus, // User input
            ...(userRating !== null && { userRating }), // Optional user input
            ...(userDescription && { userDescription }) // Optional user input
        };

        const result = await makeApiRequest('/library', 'POST', payload);

        if (result) {
            displayStatus(`"${title}" added to library!`, false, true);
            closeAddItemModal();
            fetchLibrary();
        } else {
             if(modalError){
                 modalError.textContent = statusMessage.textContent.replace('Status: Error: ', '');
                 modalError.classList.remove('hidden');
             }
        }
    }

    // --- Edit/Delete Handlers (Keep prompt-based for brevity, or upgrade later) ---
    async function handleEditLibraryItem(event) {
        const button = event.target.closest('.edit-library-item-btn');
        if (!button) return;
        const itemId = button.dataset.id;
        closeInfoModal();
        // In a real app, you'd fetch the item details first to pre-fill prompts
        // and know the mediaType to validate status.
        // For simplicity, we'll ask for everything again.

        const userStatus = prompt(`Enter new status (e.g., watched, reading, playing) or leave blank for no change:`);
        const userRatingInput = prompt(`Enter new rating (1-20) or leave blank for no change:`);
        const userDescription = prompt(`Enter new description or leave blank for no change:`);

        const updateData = {};
        if (userStatus) updateData.userStatus = userStatus.trim().toLowerCase(); // Basic validation needed based on type!
        if (userRatingInput) {
            const rating = parseInt(userRatingInput, 10);
             if (!isNaN(rating) && rating >= 1 && rating <= 20) {
                updateData.userRating = rating;
             } else {
                 return displayStatus('Invalid rating entered.', true);
             }
        }
        // Allow setting description to empty string if user enters something then clears it?
        // Current prompt returns null if cancelled, empty string if OK'd with no text.
        if (userDescription !== null) { // Check if prompt wasn't cancelled
             updateData.userDescription = userDescription.trim();
        }


        if (Object.keys(updateData).length === 0) {
             return displayStatus('No changes entered.');
        }

         // ** Crucial: Backend needs to validate status based on item's mediaType **
         // Frontend can't easily do this without fetching item first.

        const result = await makeApiRequest(`/library/${itemId}`, 'PUT', updateData, true);
        if (result) {
            displayStatus(`Library item ${itemId} updated.`);
            fetchLibrary(); // Refresh view
        }
     }


    async function handleDeleteLibraryItem(event) {
         const button = event.target.closest('.delete-library-item-btn');
        if (!button) return;
        const itemId = button.dataset.id;
        closeInfoModal();
        if (!confirm(`Are you sure you want to delete library item ${itemId}?`)) return;

        const result = await makeApiRequest(`/library/${itemId}`, 'DELETE');
        if (result) {
            displayStatus(`Library item ${itemId} deleted.`, false, true);
            fetchLibrary(); // Refresh view
        }
    }

     // --- Helper to get valid statuses (no changes) ---
     function getValidStatuses(mediaType) {
        switch (mediaType) {
            case 'movie':
            case 'series': return ['to watch', 'watching', 'watched'];
            case 'book': return ['to read', 'reading', 'read'];
            case 'video game': return ['to play', 'playing', 'played'];
            default: return [];
        }
    }

    // --- Initialize Page ---
    function initializePage() {
        console.log('Initializing page...');

        // Global Listeners
        logoutBtn?.addEventListener('click', handleLogout);
        getAddItemModal()?.addEventListener('click', (event) => { // Close modal on overlay click
            if (event.target === getAddItemModal()) closeAddItemModal();
        });

        // Page Specific Listeners
        const pathname = window.location.pathname;

        if (pathname === '/login') {
            getLoginForm()?.addEventListener('submit', handleLogin);
            getRegisterForm()?.addEventListener('submit', handleRegister);
        } else if (pathname === '/library') {
            getSearchForm()?.addEventListener('submit', handleSearch);
            const controls = getLibraryControls();
            if (controls) {
                controls.querySelector('#getLibraryBtn')?.addEventListener('click', fetchLibrary);
                controls.querySelector('#filterMediaType')?.addEventListener('change', fetchLibrary);
                controls.querySelector('#filterStatus')?.addEventListener('change', fetchLibrary);
                controls.querySelector('#filterMinRating')?.addEventListener('input', fetchLibrary); // Use input for faster feedback? Debounce?
                controls.querySelector('#filterMaxRating')?.addEventListener('input', fetchLibrary);
            }

            // Event delegation for dynamic results area content
            const resultsTarget = getResultsArea();
            resultsTarget?.addEventListener('click', handleOpenModalClick);
            resultsTarget?.addEventListener('click', handleEditLibraryItem);
            resultsTarget?.addEventListener('click', handleDeleteLibraryItem);

            // Initial library load
            fetchLibrary();
        }
    }

    // --- Run Initialization ---
    initializePage();

})(); // End IIFE
```

### viewRoutes.js

```js
// routes/viewRoutes.js
const express = require('express');
const path = require('path');
const { requireLogin } = require('../auth'); // Middleware to protect routes

const router = express.Router();

// --- Public Routes ---
router.get('/', (req, res) => {
    res.render('home', { // Render views/home.hbs
        pageTitle: 'Welcome'
        // user is automatically available from res.locals.user via checkAuthStatus middleware
    });
});

router.get('/about', (req, res) => {
    res.render('about', {
        pageTitle: 'About Us'
    });
});

router.get('/login', (req, res) => {
    // If user is already logged in, redirect to library
    if (res.locals.user) {
        return res.redirect('/library');
    }
    res.render('login', { // Render views/login.hbs
        pageTitle: 'Login / Register',
        layout: 'main' // Explicitly use main layout (usually default)
    });
});

// --- Protected Routes (Require Login) ---
// Apply requireLogin middleware to all routes below this point in this router,
// OR apply it individually as shown for /library
// router.use(requireLogin);

router.get('/library', requireLogin, (req, res) => { // Apply middleware here
    // User is guaranteed to be logged in by requireLogin
    res.render('library', { // Render views/library.hbs
        pageTitle: 'My Library',
        username: res.locals.user.username // Pass username to the template if needed
    });
});

// Route to serve client-side Handlebars templates (if not pre-compiling)
// This allows fetching templates via JS
router.get('/templates/:templateName', requireLogin, (req, res) => {
    const templateName = req.params.templateName;
    // Basic security: only allow specific template names
    const allowedTemplates = ['mediaCard', 'addItemModal', 'libraryCard', 'mediaDetailsModal'];
    if (!allowedTemplates.includes(templateName)) {
        return res.status(404).send('Template not found');
    }
    // Render the partial directly - needs specific setup or just send file
    // Simpler: Send the file content
    const filePath = path.join(__dirname, `../views/partials/${templateName}.hbs`);
    res.sendFile(filePath, (err) => {
        if (err) {
            console.error("Error sending template file:", err);
            res.status(404).send('Template not found');
        }
    });
});


module.exports = router;
```

### authRoutes.js

```js
const express = require('express');
const db = require('../../database'); // Import the database connection
const { hashPassword, comparePassword, setAuthCookie, clearAuthCookie } = require('../../auth');

const router = express.Router();

// --- Register a New User ---
router.post('/register', async (req, res) => {
    const { username, password } = req.body;

    // Basic validation
    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required.' });
    }
    if (password.length < 6) { // Example: Minimum password length
         return res.status(400).json({ message: 'Password must be at least 6 characters long.' });
    }

    try {
        // Check if username already exists
        const checkUserSql = `SELECT id FROM users WHERE username = ?`;
        db.get(checkUserSql, [username], async (err, row) => {
            if (err) {
                console.error("Database error checking username:", err.message);
                return res.status(500).json({ message: 'Error checking username.' });
            }
            if (row) {
                return res.status(409).json({ message: 'Username already taken.' }); // 409 Conflict
            }

            // Hash the password
            const passwordHash = await hashPassword(password);

            // Insert the new user
            const insertSql = `INSERT INTO users (username, passwordHash) VALUES (?, ?)`;
            db.run(insertSql, [username, passwordHash], function(err) { // Use function() to access this.lastID
                if (err) {
                    console.error("Database error registering user:", err.message);
                    return res.status(500).json({ message: 'Failed to register user.' });
                }
                // Return basic user info (excluding password)
                res.status(201).json({
                    id: this.lastID, // Get the ID of the inserted row
                    username: username,
                    message: 'User registered successfully.'
                 });
            });
        });
    } catch (error) {
        console.error("Error during registration:", error);
        res.status(500).json({ message: 'Server error during registration.' });
    }
});

// --- Login User ---
router.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required.' });
    }

    const sql = `SELECT id, username, passwordHash FROM users WHERE username = ?`;
    db.get(sql, [username], async (err, user) => {
        if (err) {
            console.error("Database error during login:", err.message);
            return res.status(500).json({ message: 'Error logging in.' });
        }
        if (!user) {
            // User not found
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        try {
            // Compare the provided password with the stored hash
            const isMatch = await comparePassword(password, user.passwordHash);

            if (!isMatch) {
                // Password doesn't match
                return res.status(401).json({ message: 'Invalid credentials.' });
            }

            // Passwords match - Generate JWT
            setAuthCookie(res, { id: user.id, username: user.username });

            res.status(200).json({
                message: 'Login successful.',
                user: { id: user.id, username: user.username }
            });

        } catch (error) {
            console.error("Error comparing password or generating token:", error);
            res.status(500).json({ message: 'Server error during login process.' });
        }
    });
});

// --- Logout ---
router.post('/logout', (req, res) => {
    clearAuthCookie(res);
    res.status(200).json({ message: 'Logout successful.' });
});


module.exports = router;
```

### libraryRoutes.js

```js
const express = require('express');
const db = require('../../database');
const { verifyToken } = require('../../auth'); // Import the authentication middleware

const router = express.Router();

// Apply authentication middleware to all library routes
router.use(verifyToken);

// Helper function to map request status to db status based on type
function getDbStatus(requestStatus, mediaType) {
    switch (mediaType) {
        case 'movie':
        case 'series':
            return requestStatus === 'to watch' ? 'to watch' :
                   requestStatus === 'watching' ? 'watching' :
                   requestStatus === 'watched' ? 'watched' : null;
        case 'book':
            return requestStatus === 'to read' ? 'to read' :
                   requestStatus === 'reading' ? 'reading' :
                   requestStatus === 'read' ? 'read' : null;
        case 'video game':
             return requestStatus === 'to play' ? 'to play' :
                   requestStatus === 'playing' ? 'playing' :
                   requestStatus === 'played' ? 'played' : null;
        default:
            return null; // Invalid media type
    }
}

// Helper function to determine valid statuses for a media type
function getValidStatuses(mediaType) {
    switch (mediaType) {
        case 'movie':
        case 'series': return ['to watch', 'watching', 'watched'];
        case 'book': return ['to read', 'reading', 'read'];
        case 'video game': return ['to play', 'playing', 'played'];
        default: return [];
    }
}


// --- Get All Library Items (with optional filtering) ---
router.get('/', (req, res) => {
    const userId = req.userId; // Get user ID from the token verification middleware
    const { mediaType, userStatus, minRating, maxRating } = req.query;

    let sql = `SELECT * FROM library_items WHERE userId = ?`;
    const params = [userId];

    if (mediaType) {
        sql += ` AND mediaType = ?`;
        params.push(mediaType);
    }
    if (userStatus) {
        sql += ` AND userStatus = ?`;
        params.push(userStatus);
    }
    if (minRating) {
        const minR = parseInt(minRating, 10);
        if (!isNaN(minR) && minR >= 1 && minR <= 20) {
            sql += ` AND userRating >= ?`;
            params.push(minR);
        } else {
             return res.status(400).json({ message: 'Invalid minRating. Must be between 1 and 20.' });
        }
    }
     if (maxRating) {
        const maxR = parseInt(maxRating, 10);
         if (!isNaN(maxR) && maxR >= 1 && maxR <= 20) {
            sql += ` AND userRating <= ?`;
            params.push(maxR);
        } else {
            return res.status(400).json({ message: 'Invalid maxRating. Must be between 1 and 20.' });
        }
    }
     // Ensure minRating <= maxRating if both are provided
    if (minRating && maxRating && parseInt(minRating) > parseInt(maxRating)) {
        return res.status(400).json({ message: 'minRating cannot be greater than maxRating.' });
    }

    sql += ` ORDER BY addedAt DESC`; // Default sort order

    db.all(sql, params, (err, rows) => {
        if (err) {
            console.error("Database error getting library items:", err.message);
            return res.status(500).json({ message: 'Failed to retrieve library items.' });
        }
        res.status(200).json(rows);
    });
});

// --- Add a Media Item to the Library (Async/Await Version) ---
router.post('/', async (req, res) => { // <<< Make handler async
    const userId = req.userId;
    const {
        mediaType, mediaId, title, imageUrl, apiDescription,
        userDescription, userRating, userStatus: requestStatus
     } = req.body;

    try { // <<< Wrap in try...catch
        // === Validation ===
        if (!mediaType || !mediaId || !requestStatus || !title) {
            return res.status(400).json({ message: 'mediaType, mediaId, title, and userStatus are required.' });
        }
        const validMediaTypes = ['movie', 'series', 'book', 'video game'];
        if (!validMediaTypes.includes(mediaType)) {
             return res.status(400).json({ message: `Invalid mediaType.` });
        }
        const userStatus = getDbStatus(requestStatus, mediaType);
        if (!userStatus) {
            const validStatuses = getValidStatuses(mediaType);
            return res.status(400).json({ message: `Invalid userStatus for ${mediaType}. Must be one of: ${validStatuses.join(', ')}.` });
        }
        let ratingValue = null;
        if (userRating !== undefined && userRating !== null) {
            ratingValue = parseInt(userRating, 10);
            if (isNaN(ratingValue) || ratingValue < 1 || ratingValue > 20) {
                return res.status(400).json({ message: 'Invalid userRating. Must be an integer between 1 and 20.' });
            }
        }

        // === Check if item already exists (Promisified) ===
        const existingItem = await new Promise((resolve, reject) => {
            const checkSql = `SELECT id FROM library_items WHERE userId = ? AND mediaType = ? AND mediaId = ?`;
            db.get(checkSql, [userId, mediaType, mediaId], (err, row) => {
                 if (err) {
                    console.error("Database error checking for existing library item:", err.message);
                    return reject(new Error('Error checking library.')); // Reject promise
                 }
                 resolve(row); // Resolve with row or undefined
            });
        });

        if (existingItem) {
            return res.status(409).json({ message: 'This item is already in your library.' });
        }

        // === Prepare for Insert ===
        // userStatus is available here directly
        const watchedAt = ['watched', 'read', 'played'].includes(userStatus) ? new Date().toISOString() : null;

        const insertSql = `
            INSERT INTO library_items
                (userId, mediaType, mediaId, title, imageUrl, apiDescription,
                 userDescription, userRating, userStatus, watchedAt, addedAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `;
        const params = [
            userId, mediaType, mediaId, title, imageUrl || null, apiDescription || null,
            userDescription || null, ratingValue, userStatus, watchedAt
        ];

        // === Insert the new item (Promisified) ===
        const newItemIdResult = await new Promise((resolve, reject) => {
            db.run(insertSql, params, function(err) {
                 if (err) {
                     console.error("Database error adding library item:", err.message);
                     // Handle potential UNIQUE constraint error specifically
                     if (err.message.includes('UNIQUE constraint failed')) {
                         return reject(new Error('This item seems to already be in your library (Unique constraint).'));
                     }
                     return reject(new Error('Failed to add item to library.')); // Reject promise
                 }
                 resolve({ id: this.lastID }); // Resolve with new ID
            });
        });

        // === Fetch and Return Newly Added Item (Promisified) ===
        const newItem = await new Promise((resolve, reject) => {
             db.get(`SELECT * FROM library_items WHERE id = ?`, [newItemIdResult.id], (err, item) => {
                 if (err) {
                    console.error("Database error fetching newly added library item:", err.message);
                    // Even if fetch fails, the item WAS added, maybe return partial success?
                    // Or reject to indicate something went wrong after insert. Let's reject.
                    return reject(new Error('Item added, but failed to fetch details.'));
                 }
                 resolve(item); // Resolve with the full new item
             });
        });

        res.status(201).json(newItem); // Send the complete new item back

    } catch (error) { // Catch errors from promises or validation
        console.error("Error during add library item:", error);
        // Determine status code based on error message?
        const statusCode = error.message.includes('already in your library') ? 409 : 500;
        res.status(statusCode).json({ message: error.message || 'Server error while adding item.' });
    }
});


// --- Edit a Library Item ---
router.put('/:id', (req, res) => {
    const userId = req.userId;
    const itemId = req.params.id;
    const { userDescription, userRating, userStatus: requestStatus } = req.body;

    // Check if at least one field is being updated
    if (userDescription === undefined && userRating === undefined && requestStatus === undefined) {
        return res.status(400).json({ message: 'No fields provided for update.' });
    }

    // Fetch the existing item to validate status based on its mediaType
    const getSql = `SELECT mediaType, userStatus as currentStatus FROM library_items WHERE id = ? AND userId = ?`;
    db.get(getSql, [itemId, userId], (err, item) => {
        if (err) {
            console.error("Database error fetching item for update:", err.message);
            return res.status(500).json({ message: 'Error finding library item.' });
        }
        if (!item) {
            return res.status(404).json({ message: 'Library item not found or you do not have permission to edit it.' });
        }

        const { mediaType, currentStatus } = item;
        const updates = [];
        const params = [];
        let newDbStatus = null; // Will hold the validated status if provided

         // Validate and prepare status update
        if (requestStatus !== undefined) {
            newDbStatus = getDbStatus(requestStatus, mediaType);
            if (newDbStatus === null) {
                 const validStatuses = getValidStatuses(mediaType);
                return res.status(400).json({ message: `Invalid userStatus for ${mediaType}. Must be one of: ${validStatuses.join(', ')}.` });
            }
            updates.push(`userStatus = ?`);
            params.push(newDbStatus);

            // Handle watchedAt timestamp
             const isNowWatched = ['watched', 'read', 'played'].includes(newDbStatus);
             const wasAlreadyWatched = ['watched', 'read', 'played'].includes(currentStatus);

             if (isNowWatched && !wasAlreadyWatched) {
                // Status changed to watched/read/played
                updates.push(`watchedAt = datetime('now')`);
             } else if (!isNowWatched && wasAlreadyWatched) {
                 // Status changed away from watched/read/played - clear the timestamp
                 updates.push(`watchedAt = NULL`);
             } // else: no change in watched status relevance, do nothing to watchedAt
        }

        // Prepare description update
        if (userDescription !== undefined) {
            updates.push(`userDescription = ?`);
            params.push(userDescription); // Allow null or empty string
        }

        // Prepare rating update
        if (userRating !== undefined) {
            if (userRating === null) { // Allow setting rating to null
                 updates.push(`userRating = ?`);
                 params.push(null);
            } else {
                const ratingValue = parseInt(userRating, 10);
                if (isNaN(ratingValue) || ratingValue < 1 || ratingValue > 20) {
                    return res.status(400).json({ message: 'Invalid userRating. Must be an integer between 1 and 20, or null.' });
                }
                updates.push(`userRating = ?`);
                params.push(ratingValue);
            }
        }

        // Always update the 'updatedAt' timestamp (handled by trigger, but explicitly adding is fine too)
        // updates.push(`updatedAt = datetime('now')`); // Trigger handles this

        if (updates.length === 0) {
             return res.status(400).json({ message: 'No valid fields provided for update.' }); // Should be caught earlier, but good fallback
        }

        // Construct the final SQL query
        const updateSql = `UPDATE library_items SET ${updates.join(', ')} WHERE id = ? AND userId = ?`;
        params.push(itemId, userId);

        db.run(updateSql, params, function(err) {
            if (err) {
                console.error("Database error updating library item:", err.message);
                return res.status(500).json({ message: 'Failed to update library item.' });
            }
            if (this.changes === 0) {
                // This case should be rare because we fetched the item first, but handle it
                return res.status(404).json({ message: 'Library item not found or no changes made.' });
            }

            // Fetch the updated item to return it
            db.get(`SELECT * FROM library_items WHERE id = ?`, [itemId], (err, updatedItem) => {
                 if (err) {
                    console.error("Database error fetching updated item:", err.message);
                    return res.status(200).json({ message: 'Item updated successfully, but failed to fetch details.' });
                 }
                 res.status(200).json(updatedItem);
            });
        });
    });
});


// --- Delete a Library Item ---
router.delete('/:id', (req, res) => {
    const userId = req.userId;
    const itemId = req.params.id;

    const sql = `DELETE FROM library_items WHERE id = ? AND userId = ?`;
    db.run(sql, [itemId, userId], function(err) {
        if (err) {
            console.error("Database error deleting library item:", err.message);
            return res.status(500).json({ message: 'Failed to delete library item.' });
        }
        if (this.changes === 0) {
            // Item didn't exist or didn't belong to the user
            return res.status(404).json({ message: 'Library item not found or you do not have permission to delete it.' });
        }
        res.status(200).json({ message: 'Library item deleted successfully.' });
        // Alternatively, use status 204 No Content (often preferred for DELETE)
        // res.status(204).send();
    });
});

module.exports = router;
```

### searchRoutes.js

```js
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

### addItemModal.hbs

```hbs
{{! views/partials/addItemModal.hbs }}
<button id="modalCloseBtn" class="modal-close-btn" aria-label="Close">×</button>
<h2 id="modalTitle">{{modalTitle}}</h2>
<form id="modalForm" data-mode="{{mode}}" {{#if itemId}}data-item-id="{{itemId}}"{{/if}}>

    {/* Hidden fields for ADD mode (less critical if data is passed differently for edit) */}
    {{#if isAddMode}}
    <input type="hidden" id="modalMediaId" value="{{mediaId}}">
    <input type="hidden" id="modalMediaType" value="{{mediaType}}">
    <input type="hidden" id="modalTitleData" value="{{itemTitle}}">
    <input type="hidden" id="modalImageUrlData" value="{{imageUrl}}">
    <input type="hidden" id="modalApiDescriptionData" value="{{apiDescription}}">
    {{/if}}

    <div class="form-group">
        <label for="modalUserStatus">Your Status:</label>
        <select id="modalUserStatus" name="userStatus" required>
            <option value="" disabled {{#unless currentStatus}}selected{{/unless}}>-- Select Status --</option>
            {{#each validStatuses}}
            <option value="{{this}}" {{#if (eq this ../currentStatus)}}selected{{/if}}>
                {{capitalize this}}
            </option>
            {{/each}}
        </select>
    </div>
    <div class="form-group">
        <label for="modalUserRating">Your Rating (1-20):</label>
        <input type="number" id="modalUserRating" name="userRating" min="1" max="20" placeholder="Optional" value="{{currentRating}}">
    <div class="form-group">
        <label for="modalUserDescription">Your Notes:</label>
        <textarea id="modalUserDescription" name="userDescription" rows="3" placeholder="Optional">{{currentUserDescription}}</textarea>
    </div>
    <div class="modal-actions">
        <button type="button" id="modalCancelBtn" class="btn btn-secondary">Cancel</button>
        <button type="submit" class="btn btn-primary">{{submitButtonText}}</button>
    </div>
     <p id="modalError" class="modal-error-message hidden"></p>
</form>
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
{{! Template used by client-side JS for search results and library items }}
{{#each items}}
<div class="{{../cardClass}}">
    <img src="{{#if imageUrl}}{{imageUrl}}{{else}}/images/placeholder.png{{/if}}" alt="{{title}}" class="card-image" onerror="this.onerror=null; this.src='/images/placeholder.png';">
    <div class="card-content">
        <h3 class="card-title">{{title}}</h3>
        <p class="card-meta">
            <span class="tag tag-{{mediaType}}">{{mediaType}}</span>
            {{#if releaseDate}}<span>Released: {{formatYear releaseDate}}</span>{{/if}}
            {{#if ../isSearchResult}}
                {{#if rating}}<span>API Rating: {{rating}}/20</span>{{/if}}
                {{#if authors}}<span>Author(s): {{join authors ", "}}</span>{{/if}}
            {{else}}
                {{! Library item specific meta }}
                 <span class="tag tag-status-{{classify userStatus}}">Status: <strong>{{userStatus}}</strong></span>
                 {{#if userRating}}<span>My Rating: {{userRating}}/20</span>{{/if}}
                <span>Added: {{formatDate addedAt}}</span>
                {{#if watchedAt}}<span>Completed: {{formatDate watchedAt}}</span>{{/if}}
            {{/if}}
        </p>
        <p class="card-description">
            {{#if ../isSearchResult}}
                {{truncate (defaultIfEmpty description apiDescription) 150}}
            {{else}}
                <strong>My Notes:</strong> {{#if userDescription}}{{userDescription}}{{else}}None{{/if}}
            {{/if}}
        </p>
        {{#unless ../isSearchResult}}
             {{#if apiDescription}}
             <details class="api-desc-details"><summary>Original Description</summary><p>{{apiDescription}}</p></details>
             {{/if}}
        {{/unless}}

        <div class="card-actions">
            {{#if ../isSearchResult}}
                <button class="btn btn-primary btn-small add-to-library-btn"
                        data-media-id="{{id}}"
                        data-media-type="{{mediaType}}"
                        data-title="{{title}}"
                        data-image-url="{{imageUrl}}"
                        {{!-- Use 'description' from search result for consistency if available --}}
                        data-api-description="{{defaultIfEmpty description apiDescription}}"
                        >Add to Library</button>
            {{else}}
                <button class="btn btn-secondary btn-small edit-library-item-btn" data-id="{{id}}">Edit</button>
                <button class="btn btn-danger btn-small delete-library-item-btn" data-id="{{id}}">Delete</button>
            {{/if}}
        </div>
    </div>
</div>
{{else}}
    <p class="placeholder-text">{{../placeholder}}</p>
{{/each}}
```

### mediaDetailsModal.hbs

```hbs
{{! views/partials/mediaDetailsModal.hbs }}
<button id="modalCloseBtn" class="modal-close-btn" aria-label="Close">×</button>

<div class="media-details-modal">
    <div class="details-header">
        <img src="{{#if item.imageUrl}}{{item.imageUrl}}{{else}}/images/placeholder.png{{/if}}" alt="{{item.title}}" class="details-image" onerror="this.onerror=null; this.src='/images/placeholder.png';">
        <div class="details-header-info">
            <h2>{{item.title}}</h2>
            <p class="details-meta">
                <span class="tag tag-{{item.mediaType}}">{{item.mediaType}}</span>
                 {{#if item.releaseDate}}<span>Released: {{formatYear item.releaseDate}}</span>{{/if}}
                 {{#if item.authors}}<span>Author(s): {{join item.authors ", "}}</span>{{/if}}
                 {{!-- API Rating (only if available from search/stored) --}}
                 {{#if item.rating}}<span>API Rating: {{item.rating}}/20</span>{{/if}}
            </p>
        </div>
    </div>

    <div class="details-body">
        <h3>Original Description</h3>
        <p>{{#if item.apiDescription}}{{item.apiDescription}}{{else}}No description available.{{/if}}</p>

        {{#if isLibraryItem}}
            <hr>
            <h3>My Library Info</h3>
            <p class="details-meta">
                <span class="tag tag-status-{{classify item.userStatus}}">Status: <strong>{{item.userStatus}}</strong></span>
                {{#if item.userRating}}<span>My Rating: {{item.userRating}}/20</span>{{/if}}
                <span>Added: {{formatDate item.addedAt}}</span>
                {{#if item.watchedAt}}<span>Completed: {{formatDate item.watchedAt}}</span>{{/if}}
            </p>
            <h4>My Notes:</h4>
            <p>{{#if item.userDescription}}{{item.userDescription}}{{else}}No personal notes added.{{/if}}</p>
        {{/if}}
    </div>

    <div class="modal-actions details-actions">
        {{#if isLibraryItem}}
            <button class="btn btn-secondary edit-library-item-btn" data-id="{{item.id}}">Edit</button>
            <button class="btn btn-danger delete-library-item-btn" data-id="{{item.id}}">Delete</button>
        {{else}}
            <button class="btn btn-primary add-to-library-btn"
                    data-media-id="{{item.id}}"
                    data-media-type="{{item.mediaType}}"
                    data-title="{{item.title}}"
                    data-image-url="{{item.imageUrl}}"
                    data-api-description="{{item.apiDescription}}"
                    >Add to Library</button>
        {{/if}}
        <button type="button" id="modalCancelBtn" class="btn btn-secondary">Close</button>
    </div>
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


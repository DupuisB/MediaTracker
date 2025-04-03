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
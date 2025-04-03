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
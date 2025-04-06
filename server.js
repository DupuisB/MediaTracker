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
const profileApiRoutes = require('./routes/api/profileRoutes');
const listApiRoutes = require('./routes/api/listRoutes');
const homepageDataApiRoutes = require('./routes/api/homepageDataRoutes');

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
app.use('/api/profile', profileApiRoutes);
app.use('/api/lists', listApiRoutes);
app.use('/api/homepage-data', homepageDataApiRoutes);

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
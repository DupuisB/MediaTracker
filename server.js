require('dotenv').config(); // Load environment variables from .env file first
const express = require('express');
const cors = require('cors');
const path = require('path'); // Import path module
const db = require('./database'); // Import to ensure connection is established & tables created
const authRoutes = require('./routes/authRoutes');
const searchRoutes = require('./routes/searchRoutes');
const libraryRoutes = require('./routes/libraryRoutes');

const app = express();
const PORT = process.env.PORT || 3001;

// --- Middleware ---
app.use(cors()); // Enable Cross-Origin Resource Sharing for all routes
app.use(express.json()); // Parse JSON request bodies

// --- Serve Static files ---
// Serve files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// --- API Routes ---
// API routes should come AFTER static serving middleware
app.use('/api/auth', authRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/library', libraryRoutes); // Library routes are protected within the router file

// --- Route for serving the main application (optional, static middleware handles '/') ---
// If you want requests to the root path '/' to explicitly serve index.html
// (express.static usually does this automatically if index.html exists)
// You might uncomment this if you have specific needs or routing conflicts later.
// app.get('/', (req, res) => {
//     res.sendFile(path.join(__dirname, 'public', 'index.html'));
// });


// --- Basic Error Handling ---
// Not Found handler for API routes (won't catch static file misses handled by express.static)
// This needs to be placed carefully. If placed before API routes, it might catch them.
// Let's refine this: Only apply 404 for routes starting with /api that aren't matched.
app.use('/api/*', (req, res, next) => {
     res.status(404).json({ message: 'API endpoint not found.' });
});

// General error handler (should be last)
app.use((err, req, res, next) => {
    console.error("Unhandled error:", err); // Log the error for debugging
    res.status(err.status || 500).json({
        message: err.message || 'An unexpected server error occurred.'
    });
});


// --- Start the Server ---
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Frontend served at http://localhost:${PORT}`);
    // Note: Database connection is initiated in database.js
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
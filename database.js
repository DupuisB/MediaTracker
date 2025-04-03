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
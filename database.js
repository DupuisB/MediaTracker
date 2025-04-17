// database.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const util = require('util'); // Import the util module

// Define the path to the database file
const dbPath = path.resolve(__dirname, 'watchlist.db'); // Existing DB file name

// Create or open the database
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('FATAL: Error opening database:', err.message);
        process.exit(1); // Exit if DB can't be opened
    } else {
        console.log('Connected to the SQLite database (v2).');
        initializeDatabaseV2(); // Call the initialization function
    }
});

// --- Promise Wrappers ---
db.getAsync = util.promisify(db.get).bind(db);
db.allAsync = util.promisify(db.all).bind(db);
db.runAsync = function(sql, params = []) {
    return new Promise((resolve, reject) => {
        this.run(sql, params, function(err) {
            if (err) {
                console.error('DB Run Error:', err.message, 'SQL:', sql.substring(0, 100) + (sql.length > 100 ? '...' : '')); // Log SQL snippet
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


// Function to initialize the database schema IF TABLES DO NOT EXIST
function initializeDatabaseV2() {
    db.serialize(() => {
        try {
            console.log("Checking/Initializing Database Schema V2...");

            // 1. Users Table (Uses IF NOT EXISTS - Safe)
            db.run(`
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    passwordHash TEXT NOT NULL,
                    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    profileImageUrl TEXT,
                    profilePrivacy TEXT DEFAULT 'private' CHECK(profilePrivacy IN ('public', 'private'))
                )
            `);
            console.log('- Users table checked/created.');

            // 2. Library Items Table (Uses IF NOT EXISTS - Safe)
            // --- REMOVED: db.run(`DROP TABLE IF EXISTS library_items;`); ---
            db.run(`
                CREATE TABLE IF NOT EXISTS library_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    userId INTEGER NOT NULL,
                    mediaType TEXT NOT NULL CHECK(mediaType IN ('movie', 'series', 'book', 'video game')),
                    mediaId TEXT NOT NULL, -- ID from external API

                    -- Core details stored at time of adding
                    title TEXT NOT NULL,
                    imageUrl TEXT,
                    releaseYear INTEGER,

                    -- User-specific interaction data
                    userStatus TEXT NOT NULL DEFAULT 'planned' CHECK(userStatus IN ('planned', 'watching', 'completed', 'paused', 'dropped')),
                    userRating REAL CHECK(userRating IS NULL OR (userRating >= 0 AND userRating <= 20)), -- Use REAL for decimals 0-20
                    userNotes TEXT,
                    isFavorite BOOLEAN DEFAULT 0,

                    -- Timestamps
                    addedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    completedAt DATETIME,

                    FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE,
                    UNIQUE(userId, mediaType, mediaId)
                )
            `);
            console.log('- Library Items table checked/created.');

            // Index for faster library lookups (Uses IF NOT EXISTS - Safe)
            db.run(`CREATE INDEX IF NOT EXISTS idx_library_user_status ON library_items (userId, userStatus);`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_library_user_favorite ON library_items (userId, isFavorite);`);
            console.log('- Library Items indexes checked/created.');

            // 3. User Lists Table (Uses IF NOT EXISTS - Safe)
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
            console.log('- User Lists table checked/created.');

            // 4. User List Items Table (Uses IF NOT EXISTS - Safe)
            db.run(`
                CREATE TABLE IF NOT EXISTS user_list_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    listId INTEGER NOT NULL,
                    libraryItemId INTEGER NOT NULL,
                    userComment TEXT,
                    dateAdded DATETIME DEFAULT CURRENT_TIMESTAMP,

                    FOREIGN KEY (listId) REFERENCES user_lists (id) ON DELETE CASCADE,
                    FOREIGN KEY (libraryItemId) REFERENCES library_items (id) ON DELETE CASCADE,
                    UNIQUE(listId, libraryItemId)
                )
            `);
            console.log('- User List Items table checked/created.');

            // --- Triggers for updatedAt ---
            // Drop old triggers first (needed if definition changes) then create.
            // This pattern is generally safe as it doesn't affect table data.
            db.run(`DROP TRIGGER IF EXISTS update_library_item_timestamp;`);
            db.run(`
                CREATE TRIGGER update_library_item_timestamp
                AFTER UPDATE ON library_items
                FOR EACH ROW
                BEGIN
                    UPDATE library_items SET updatedAt = CURRENT_TIMESTAMP WHERE id = OLD.id;
                END;
            `);

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
module.exports = db;
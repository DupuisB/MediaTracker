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
        db.run(`
      CREATE TABLE IF NOT EXISTS library_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        mediaType TEXT NOT NULL CHECK(mediaType IN ('movie', 'series', 'book', 'video game')),
        mediaId TEXT NOT NULL, -- ID from external API
        userDescription TEXT,
        userRating INTEGER CHECK(userRating >= 1 AND userRating <= 20),
        userStatus TEXT NOT NULL CHECK(userStatus IN ('to watch', 'to read', 'to play', 'watching', 'reading', 'playing', 'watched', 'read', 'played')),
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
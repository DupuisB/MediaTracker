const express = require('express');
const db = require('../database');
const { verifyToken } = require('../auth'); // Import the authentication middleware

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

// --- Add a Media Item to the Library ---
router.post('/', (req, res) => {
    const userId = req.userId;
    const { mediaType, mediaId, userDescription, userRating, userStatus: requestStatus } = req.body;

    // Validate required fields
    if (!mediaType || !mediaId || !requestStatus) {
        return res.status(400).json({ message: 'mediaType, mediaId, and userStatus are required.' });
    }

    // Validate mediaType
     const validMediaTypes = ['movie', 'series', 'book', 'video game'];
    if (!validMediaTypes.includes(mediaType)) {
         return res.status(400).json({ message: `Invalid mediaType. Must be one of: ${validMediaTypes.join(', ')}.` });
    }

    // Validate and map status based on media type
    const userStatus = getDbStatus(requestStatus, mediaType);
    if (!userStatus) {
        const validStatuses = getValidStatuses(mediaType);
        return res.status(400).json({ message: `Invalid userStatus for ${mediaType}. Must be one of: ${validStatuses.join(', ')}.` });
    }


    // Validate userRating (optional, but if provided, must be in range)
    let ratingValue = null;
    if (userRating !== undefined && userRating !== null) {
        ratingValue = parseInt(userRating, 10);
        if (isNaN(ratingValue) || ratingValue < 1 || ratingValue > 20) {
            return res.status(400).json({ message: 'Invalid userRating. Must be an integer between 1 and 20.' });
        }
    }

    // Check if item already exists for this user
    const checkSql = `SELECT id FROM library_items WHERE userId = ? AND mediaType = ? AND mediaId = ?`;
    db.get(checkSql, [userId, mediaType, mediaId], (err, row) => {
        if (err) {
            console.error("Database error checking for existing library item:", err.message);
            return res.status(500).json({ message: 'Error checking library.' });
        }
        if (row) {
            return res.status(409).json({ message: 'This item is already in your library.' }); // 409 Conflict
        }

        // Determine if watchedAt should be set
        const watchedAt = ['watched', 'read', 'played'].includes(userStatus) ? new Date().toISOString() : null;

        // Insert the new item
        const insertSql = `
            INSERT INTO library_items
                (userId, mediaType, mediaId, userDescription, userRating, userStatus, watchedAt, addedAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `;
        const params = [userId, mediaType, mediaId, userDescription || null, ratingValue, userStatus, watchedAt];

        db.run(insertSql, params, function(err) {
            if (err) {
                console.error("Database error adding library item:", err.message);
                return res.status(500).json({ message: 'Failed to add item to library.' });
            }
            const newItemId = this.lastID;
            // Fetch the newly created item to return it
            db.get(`SELECT * FROM library_items WHERE id = ?`, [newItemId], (err, newItem) => {
                 if (err) {
                    console.error("Database error fetching newly added library item:", err.message);
                    // Still return success, but maybe log the fetch error
                    return res.status(201).json({ message: 'Item added successfully, but failed to fetch details.', id: newItemId });
                }
                 res.status(201).json(newItem);
            });
        });
    });
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
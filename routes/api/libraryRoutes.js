// routes/api/libraryRoutes.js
const express = require('express');
const db = require('../../database'); // Use promisified db
const { verifyToken } = require('../../auth');

const router = express.Router();

// Apply auth middleware to all library routes
router.use(verifyToken);

// --- Constants and Helpers ---
const VALID_MEDIA_TYPES = ['movie', 'series', 'book', 'video game'];
const VALID_STATUSES = ['planned', 'watching', 'completed', 'paused', 'dropped'];
const COMPLETED_STATUS = 'completed'; // Single status for completion

// Helper function to validate and parse rating (MODIFIED for 0-20 REAL)
function parseAndValidateRating(ratingInput) {
    if (ratingInput === undefined || ratingInput === null || ratingInput === '') {
        return null;
    }
    // Use parseFloat for decimals
    const rating = parseFloat(ratingInput);
    // Check range 0-20 inclusive
    if (isNaN(rating) || rating < 0 || rating > 20) {
        throw new Error('Invalid userRating. Must be a number between 0 and 20, or null/empty.');
    }
    return parseFloat(rating.toFixed(2));
}

// Helper function to validate status
function validateStatus(statusInput) {
     if (!statusInput || !VALID_STATUSES.includes(statusInput.toLowerCase())) {
         throw new Error(`Invalid userStatus. Must be one of: ${VALID_STATUSES.join(', ')}.`);
     }
     return statusInput.toLowerCase();
}

// Helper function to parse boolean
function parseBoolean(value) {
    if (value === undefined || value === null) return undefined; // Keep undefined if not provided
    return ['true', '1', 'yes', true].includes(value?.toString().toLowerCase());
}

// --- Get Library Items (with filtering/sorting) ---
router.get('/', async (req, res) => {
    // Allow filtering by specific userId (for profile page) or default to logged-in user
    const requestingUserId = req.userId; // User making the request
    const targetUserId = req.query.userId ? parseInt(req.query.userId, 10) : requestingUserId; // User whose library is requested

    if (isNaN(targetUserId)) {
        return res.status(400).json({ message: 'Invalid userId provided.' });
    }

    // Filtering/Sorting Params
    const { mediaType, userStatus, isFavorite, sortBy, limit } = req.query;
    const favoriteFilter = parseBoolean(isFavorite); // Convert 'true'/'false'/'1'/'0' to boolean

    let sql = `SELECT id, userId, mediaType, mediaId, title, imageUrl, releaseYear, userStatus, userRating, isFavorite, addedAt, updatedAt, completedAt FROM library_items WHERE userId = ?`;
    const params = [targetUserId];

    try {
        // Apply Filters
        if (mediaType && VALID_MEDIA_TYPES.includes(mediaType)) {
            sql += ` AND mediaType = ?`;
            params.push(mediaType);
        }
        if (userStatus && VALID_STATUSES.includes(userStatus.toLowerCase())) {
             sql += ` AND userStatus = ?`;
             params.push(userStatus.toLowerCase());
        }
        if (favoriteFilter !== undefined) { // Check if the filter was provided
            sql += ` AND isFavorite = ?`;
            params.push(favoriteFilter ? 1 : 0);
        }

        // Apply Sorting
        const validSorts = {
             addedAt: 'addedAt DESC',
             updatedAt: 'updatedAt DESC',
             completedAt: 'completedAt DESC', // Sort by completion date
             rating: 'userRating DESC',
             title: 'lower(title) ASC' // Case-insensitive title sort
        };
        if (sortBy && validSorts[sortBy]) {
            sql += ` ORDER BY ${validSorts[sortBy]}`;
        } else {
            sql += ` ORDER BY updatedAt DESC`; // Default sort
        }

        // Apply Limit
        if (limit && !isNaN(parseInt(limit, 10))) {
             sql += ` LIMIT ?`;
             params.push(parseInt(limit, 10));
        }

        const items = await db.allAsync(sql, params);
        res.status(200).json(items);

    } catch (error) {
        console.error(`Get Library Error (User ${targetUserId}):`, error);
        res.status(500).json({ message: error.message || 'Failed to retrieve library items.' });
    }
});

// --- Get Specific Library Item (by external mediaId and type) ---
router.get('/item/:mediaType/:mediaId', async (req, res) => {
    const userId = req.userId;
    const { mediaType, mediaId } = req.params;

    if (!mediaType || !mediaId || !VALID_MEDIA_TYPES.includes(mediaType)) {
        return res.status(400).json({ message: 'Valid mediaType and mediaId are required.' });
    }

    try {
        const sql = `SELECT * FROM library_items WHERE userId = ? AND mediaType = ? AND mediaId = ?`;
        const item = await db.getAsync(sql, [userId, mediaType, mediaId]);

        if (!item) {
            return res.status(404).json({ message: 'Item not found in your library.' });
        }
        res.status(200).json(item);
    } catch (error) {
        console.error(`Get Specific Library Item Error (User ${userId}, ${mediaType}/${mediaId}):`, error);
        res.status(500).json({ message: error.message || 'Failed to retrieve library item.' });
    }
});


// --- Add Item to Library ---
router.post('/', async (req, res) => {
    const userId = req.userId;
    const {
        mediaType, mediaId, title, imageUrl, releaseYear, // Core details from search/details
        userStatus, userRating, userNotes, isFavorite // User interaction fields
     } = req.body;

    try {
        // Validation
        if (!mediaType || !mediaId || !title ) {
            return res.status(400).json({ message: 'mediaType, mediaId, and title are required.' });
        }
        if (!VALID_MEDIA_TYPES.includes(mediaType)) {
             return res.status(400).json({ message: `Invalid mediaType.` });
        }

        const status = userStatus ? validateStatus(userStatus) : 'planned'; // Default to 'planned' if not provided
        const rating = parseAndValidateRating(userRating); // Validates or returns null
        const favorite = parseBoolean(isFavorite) || false; // Default to false

        // Set completedAt timestamp if status is completed
        const completedAt = (status === COMPLETED_STATUS) ? new Date().toISOString() : null;
        const year = releaseYear ? parseInt(releaseYear, 10) : null;
        if (releaseYear && isNaN(year)){
             console.warn(`Invalid releaseYear format received: ${releaseYear}`);
        }


        const insertSql = `
            INSERT INTO library_items
                (userId, mediaType, mediaId, title, imageUrl, releaseYear,
                 userStatus, userRating, userNotes, isFavorite, completedAt, addedAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `;
        const params = [
            userId, mediaType, mediaId, title, imageUrl || null, !isNaN(year) ? year : null,
            status, rating, userNotes || null, favorite ? 1 : 0, completedAt
        ];

        const result = await db.runAsync(insertSql, params);
        const newItem = await db.getAsync(`SELECT * FROM library_items WHERE id = ?`, [result.lastID]);
        res.status(201).json(newItem);

    } catch (error) {
        console.error("Add Library Item Error:", error);
        if (error.message.includes('UNIQUE constraint failed')) {
             return res.status(409).json({ message: 'This item is already in your library.' });
        }
        // Return validation errors directly
         if (error.message.startsWith('Invalid userRating') || error.message.startsWith('Invalid userStatus')) {
            return res.status(400).json({ message: error.message });
        }
        res.status(500).json({ message: error.message || 'Failed to add item to library.' });
    }
});

// --- Update Library Item (by internal library item ID) ---
router.put('/:id', async (req, res) => {
    const userId = req.userId;
    const itemId = req.params.id;
    const { userStatus, userRating, userNotes, isFavorite } = req.body;

    // Check if at least one field is provided
    if (userStatus === undefined && userRating === undefined && userNotes === undefined && isFavorite === undefined) {
        return res.status(400).json({ message: 'No fields provided for update.' });
    }

    try {
        // Fetch the item first to check ownership and get current status
        const item = await db.getAsync(`SELECT userStatus as currentStatus, completedAt as currentCompletedAt FROM library_items WHERE id = ? AND userId = ?`, [itemId, userId]);
        if (!item) {
            return res.status(404).json({ message: 'Library item not found or not owned by user.' });
        }

        const { currentStatus, currentCompletedAt } = item;
        const updates = [];
        const params = [];
        let newDbStatus = null;
        let newCompletedAt = currentCompletedAt; // Keep existing unless changed

        // Validate and add fields to update
        if (userStatus !== undefined) {
             const status = validateStatus(userStatus);
             updates.push(`userStatus = ?`);
             params.push(status);
             newDbStatus = status; // Store for completedAt logic

             // Handle completedAt timestamp
             const isNowCompleted = (newDbStatus === COMPLETED_STATUS);
             if (isNowCompleted && !currentCompletedAt) { // If becoming completed
                newCompletedAt = new Date().toISOString();
                updates.push(`completedAt = ?`);
                params.push(newCompletedAt);
             } else if (!isNowCompleted && currentCompletedAt) { // If changing away from completed
                 newCompletedAt = null;
                 updates.push(`completedAt = NULL`);
                 // params don't need update for NULL here
             }
        }

        if (userRating !== undefined) {
             const rating = parseAndValidateRating(userRating); // Validates or returns null
             updates.push(`userRating = ?`);
             params.push(rating);
        }

         if (userNotes !== undefined) {
            updates.push(`userNotes = ?`);
            params.push(userNotes); // Allow empty string or null
        }

        const favorite = parseBoolean(isFavorite); // Returns true/false/undefined
        if (favorite !== undefined) {
             updates.push(`isFavorite = ?`);
             params.push(favorite ? 1 : 0);
        }


        if (updates.length === 0) {
             return res.status(400).json({ message: 'No valid update fields provided.' });
        }

        // Construct and run update query (Trigger handles updatedAt)
        const updateSql = `UPDATE library_items SET ${updates.join(', ')} WHERE id = ? AND userId = ?`;
        params.push(itemId, userId);

        const result = await db.runAsync(updateSql, params);

        if (result.changes === 0) {
            // This might happen if the data sent was the same as the existing data
            // Fetch and return current item state as confirmation
             const currentItem = await db.getAsync(`SELECT * FROM library_items WHERE id = ?`, [itemId]);
            return res.status(200).json(currentItem);
        }

        // Fetch and return the updated item
        const updatedItem = await db.getAsync(`SELECT * FROM library_items WHERE id = ?`, [itemId]);
        res.status(200).json(updatedItem);

    } catch (error) {
        console.error("Update Library Item Error:", error);
        // Return validation errors directly
         if (error.message.startsWith('Invalid userRating') || error.message.startsWith('Invalid userStatus')) {
            return res.status(400).json({ message: error.message });
        }
        res.status(500).json({ message: error.message || 'Failed to update library item.' });
    }
});

// --- Delete Item from Library ---
router.delete('/:id', async (req, res) => {
    const userId = req.userId;
    const itemId = req.params.id;

    try {
        // For now, rely on CASCADE in user_list_items table.

        const result = await db.runAsync(`DELETE FROM library_items WHERE id = ? AND userId = ?`, [itemId, userId]);

        if (result.changes === 0) {
            return res.status(404).json({ message: 'Library item not found or not owned by user.' });
        }
        res.status(200).json({ message: 'Library item deleted successfully.' }); // 200 with message is often preferred over 204

    } catch (error) {
        console.error("Delete Library Item Error:", error);
        res.status(500).json({ message: error.message || 'Failed to delete library item.' });
    }
});


// --- Get Library Stats (for profile page) ---
router.get('/stats/:userId', async (req, res) => {
    const requestingUserId = req.userId;
    const targetUserId = parseInt(req.params.userId, 10);

     if (isNaN(targetUserId)) {
        return res.status(400).json({ message: 'Invalid userId provided.' });
    }

    // Permission check (basic - allow own stats, maybe public later)
    if (requestingUserId !== targetUserId) {
        // Could check target user's profile privacy here if needed
    }


    try {
        // Calculate Average Score (only for items rated by the user)
        const avgScoreResult = await db.getAsync(
            `SELECT AVG(userRating) as averageScore FROM library_items WHERE userId = ? AND userRating IS NOT NULL`,
            [targetUserId]
        );
        const averageScore = avgScoreResult?.averageScore ? parseFloat(avgScoreResult.averageScore.toFixed(1)) : null; // 1 decimal place

        // Count Completed Items
        const countResult = await db.getAsync(
            `SELECT COUNT(*) as countCompleted FROM library_items WHERE userId = ? AND userStatus = ?`,
            [targetUserId, COMPLETED_STATUS]
        );
        const countCompleted = countResult?.countCompleted || 0;

         // Count Total Items in Library
        const countTotalResult = await db.getAsync(
            `SELECT COUNT(*) as countTotal FROM library_items WHERE userId = ?`,
            [targetUserId]
        );
        const countTotal = countTotalResult?.countTotal || 0;


        res.status(200).json({
            userId: targetUserId,
            averageScore: averageScore, // Average rating given (1-10)
            countCompleted: countCompleted, // "Nb vues"
            countTotal: countTotal, // Total items tracked
            // Add more stats as needed (for instance counts per type, per status)
        });

    } catch (error) {
        console.error(`Get Library Stats Error (User ${targetUserId}):`, error);
        res.status(500).json({ message: error.message || 'Failed to retrieve library stats.' });
    }
});


module.exports = router;
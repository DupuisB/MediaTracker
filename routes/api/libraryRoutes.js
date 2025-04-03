// routes/api/libraryRoutes.js
const express = require('express');
const db = require('../../dbUtils'); // Use promisified utils
const { verifyToken } = require('../../auth');

const router = express.Router();

// Apply auth middleware to all library routes
router.use(verifyToken);

// --- Helpers ---
const VALID_MEDIA_TYPES = ['movie', 'series', 'book', 'video game'];
const STATUS_MAP = {
    'movie': ['to watch', 'watching', 'watched'],
    'series': ['to watch', 'watching', 'watched'],
    'book': ['to read', 'reading', 'read'],
    'video game': ['to play', 'playing', 'played'],
};
const COMPLETED_STATUSES = ['watched', 'read', 'played'];

function isValidStatusForType(status, mediaType) {
    return STATUS_MAP[mediaType]?.includes(status.toLowerCase());
}

function getValidStatusesForType(mediaType) {
    return STATUS_MAP[mediaType] || [];
}

// --- Get Library Items (with filtering) ---
router.get('/', async (req, res) => {
    const userId = req.userId;
    const { mediaType, userStatus, minRating, maxRating } = req.query;

    let sql = `SELECT * FROM library_items WHERE userId = ?`;
    const params = [userId];

    try {
        if (mediaType) {
            if (!VALID_MEDIA_TYPES.includes(mediaType)) {
                return res.status(400).json({ message: 'Invalid mediaType specified.' });
            }
            sql += ` AND mediaType = ?`;
            params.push(mediaType);
        }
        if (userStatus) {
            // Basic check - more robust validation could check against mediatype if needed
             sql += ` AND userStatus = ?`;
             params.push(userStatus.toLowerCase());
        }
        if (minRating) {
            const minR = parseInt(minRating, 10);
            if (isNaN(minR) || minR < 1 || minR > 20) {
                return res.status(400).json({ message: 'Invalid minRating. Must be between 1 and 20.' });
            }
            sql += ` AND userRating >= ?`;
            params.push(minR);
        }
         if (maxRating) {
            const maxR = parseInt(maxRating, 10);
             if (isNaN(maxR) || maxR < 1 || maxR > 20) {
                return res.status(400).json({ message: 'Invalid maxRating. Must be between 1 and 20.' });
            }
            sql += ` AND userRating <= ?`;
            params.push(maxR);
        }
        // Check min <= max
        if (minRating && maxRating && parseInt(minRating) > parseInt(maxRating)) {
            return res.status(400).json({ message: 'minRating cannot be greater than maxRating.' });
        }

        sql += ` ORDER BY addedAt DESC`;

        const items = await db.all(sql, params);
        res.status(200).json(items);

    } catch (error) {
        console.error("Get Library Error:", error);
        res.status(500).json({ message: error.message || 'Failed to retrieve library items.' });
    }
});

// --- Add Item ---
router.post('/', async (req, res) => {
    const userId = req.userId;
    const {
        mediaType, mediaId, title, imageUrl, apiDescription,
        userDescription, userRating, userStatus
     } = req.body;

    // Validation
    if (!mediaType || !mediaId || !title || !userStatus) {
        return res.status(400).json({ message: 'mediaType, mediaId, title, and userStatus are required.' });
    }
    if (!VALID_MEDIA_TYPES.includes(mediaType)) {
         return res.status(400).json({ message: `Invalid mediaType.` });
    }
    if (!isValidStatusForType(userStatus, mediaType)) {
        const valid = getValidStatusesForType(mediaType);
        return res.status(400).json({ message: `Invalid userStatus for ${mediaType}. Must be one of: ${valid.join(', ')}.` });
    }
    let ratingValue = null;
    if (userRating !== undefined && userRating !== null && userRating !== '') {
        ratingValue = parseInt(userRating, 10);
        if (isNaN(ratingValue) || ratingValue < 1 || ratingValue > 20) {
            return res.status(400).json({ message: 'Invalid userRating. Must be an integer between 1 and 20.' });
        }
    }

    const watchedAt = COMPLETED_STATUSES.includes(userStatus.toLowerCase()) ? new Date().toISOString() : null;

    const insertSql = `
        INSERT INTO library_items
            (userId, mediaType, mediaId, title, imageUrl, apiDescription,
             userDescription, userRating, userStatus, watchedAt, addedAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `;
    const params = [
        userId, mediaType, mediaId, title, imageUrl || null, apiDescription || null,
        userDescription || null, ratingValue, userStatus.toLowerCase(), watchedAt
    ];

    try {
        const result = await db.run(insertSql, params);
        // Fetch and return the newly added item
        const newItem = await db.get(`SELECT * FROM library_items WHERE id = ?`, [result.lastID]);
        res.status(201).json(newItem);

    } catch (error) {
        console.error("Add Library Item Error:", error);
        // Handle UNIQUE constraint error from dbUtils
        if (error.message.includes('UNIQUE constraint failed')) {
             return res.status(409).json({ message: 'This item is already in your library.' });
        }
        res.status(500).json({ message: error.message || 'Failed to add item to library.' });
    }
});

// --- Edit Item ---
router.put('/:id', async (req, res) => {
    const userId = req.userId;
    const itemId = req.params.id;
    const { userDescription, userRating, userStatus } = req.body;

    if (userDescription === undefined && userRating === undefined && userStatus === undefined) {
        return res.status(400).json({ message: 'No fields provided for update.' });
    }

    try {
        // Fetch the item first to get its type and current status
        const item = await db.get(`SELECT mediaType, userStatus as currentStatus FROM library_items WHERE id = ? AND userId = ?`, [itemId, userId]);
        if (!item) {
            return res.status(404).json({ message: 'Library item not found or not owned by user.' });
        }

        const { mediaType, currentStatus } = item;
        const updates = [];
        const params = [];
        let newDbStatus = null;

        // Validate and add fields to update
        if (userStatus !== undefined) {
            const status = userStatus.toLowerCase();
             if (!isValidStatusForType(status, mediaType)) {
                 const valid = getValidStatusesForType(mediaType);
                 return res.status(400).json({ message: `Invalid userStatus for ${mediaType}. Must be one of: ${valid.join(', ')}.` });
             }
             updates.push(`userStatus = ?`);
             params.push(status);
             newDbStatus = status; // Store for watchedAt logic

             // Handle watchedAt timestamp
             const isNowCompleted = COMPLETED_STATUSES.includes(newDbStatus);
             const wasCompleted = COMPLETED_STATUSES.includes(currentStatus);
             if (isNowCompleted && !wasCompleted) {
                updates.push(`watchedAt = datetime('now')`);
             } else if (!isNowCompleted && wasCompleted) {
                 updates.push(`watchedAt = NULL`);
             }
        }

        if (userDescription !== undefined) {
            updates.push(`userDescription = ?`);
            params.push(userDescription); // Allow empty string or null
        }

        if (userRating !== undefined) {
             let ratingValue = null;
             // Allow setting to null or empty string means null
             if (userRating !== null && userRating !== '') {
                 ratingValue = parseInt(userRating, 10);
                 if (isNaN(ratingValue) || ratingValue < 1 || ratingValue > 20) {
                     return res.status(400).json({ message: 'Invalid userRating. Must be an integer between 1 and 20, or null/empty.' });
                 }
             }
             updates.push(`userRating = ?`);
             params.push(ratingValue);
        }

        if (updates.length === 0) {
            // Should not happen due to initial check, but safe fallback
             return res.status(400).json({ message: 'No valid update fields provided.' });
        }

        // Construct and run update query (Trigger handles updatedAt)
        const updateSql = `UPDATE library_items SET ${updates.join(', ')} WHERE id = ? AND userId = ?`;
        params.push(itemId, userId);

        const result = await db.run(updateSql, params);

        if (result.changes === 0) {
            // Should be rare given the initial fetch, maybe concurrent modification?
            return res.status(404).json({ message: 'Item not found or no changes applied.' });
        }

        // Fetch and return the updated item
        const updatedItem = await db.get(`SELECT * FROM library_items WHERE id = ?`, [itemId]);
        res.status(200).json(updatedItem);

    } catch (error) {
        console.error("Update Library Item Error:", error);
        res.status(500).json({ message: error.message || 'Failed to update library item.' });
    }
});

// --- Delete Item ---
router.delete('/:id', async (req, res) => {
    const userId = req.userId;
    const itemId = req.params.id;

    try {
        const result = await db.run(`DELETE FROM library_items WHERE id = ? AND userId = ?`, [itemId, userId]);

        if (result.changes === 0) {
            return res.status(404).json({ message: 'Library item not found or not owned by user.' });
        }
        // Prefer 200 with message or 204 No Content
        res.status(200).json({ message: 'Library item deleted successfully.' });
        // res.status(204).send();

    } catch (error) {
        console.error("Delete Library Item Error:", error);
        res.status(500).json({ message: error.message || 'Failed to delete library item.' });
    }
});

module.exports = router;
// routes/api/listRoutes.js (New File)
const express = require('express');
const db = require('../../database');
const { verifyToken } = require('../../auth');

const router = express.Router();

// Apply auth middleware
router.use(verifyToken);


// --- Get Lists ---
// GET /api/lists?userId=<id>&publicOnly=true/false&limit=<num>
router.get('/', async (req, res) => {
    const requestingUserId = req.userId;
    // Default to requesting user if no userId specified
    const targetUserId = req.query.userId ? parseInt(req.query.userId, 10) : requestingUserId;
    const publicOnly = req.query.publicOnly === 'true';
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : null;

    if (isNaN(targetUserId)) {
        return res.status(400).json({ message: 'Invalid userId.' });
    }

    try {
         // Base query to get list summaries and item counts
         // Use COALESCE to handle lists with 0 items correctly
         let sql = `
            SELECT
                l.id, l.userId, l.title, l.description, l.coverImageUrl, l.isPublic, l.createdAt, l.updatedAt,
                u.username as ownerUsername,
                COALESCE(COUNT(li.id), 0) as itemCount
            FROM user_lists l
            JOIN users u ON l.userId = u.id
            LEFT JOIN user_list_items li ON l.id = li.listId
            WHERE l.userId = ?
        `;
        const params = [targetUserId];

        // Apply public filter if requested AND if not viewing own lists
        if (publicOnly && targetUserId !== requestingUserId) {
            sql += ` AND l.isPublic = 1`;
        }

        sql += ` GROUP BY l.id`; // Group to count items per list
        sql += ` ORDER BY l.updatedAt DESC`; // Default sort

        if (limit && !isNaN(limit)) {
            sql += ` LIMIT ?`;
            params.push(limit);
        }

        const lists = await db.allAsync(sql, params);
        res.status(200).json(lists);

    } catch (error) {
        console.error(`Get Lists Error (User ${targetUserId}):`, error);
        res.status(500).json({ message: error.message || 'Failed to retrieve lists.' });
    }
});

// --- Create New List ---
// POST /api/lists
router.post('/', async (req, res) => {
    const userId = req.userId;
    const { title, description, isPublic, coverImageUrl } = req.body;

    if (!title || typeof title !== 'string' || title.trim() === '') {
        return res.status(400).json({ message: 'List title is required.' });
    }

    const publicFlag = [true, 'true', 1].includes(isPublic) ? 1 : 0;

    try {
        const sql = `
            INSERT INTO user_lists (userId, title, description, isPublic, coverImageUrl, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `;
        const params = [
            userId,
            title.trim(),
            description || null,
            publicFlag,
            coverImageUrl || null
        ];
        const result = await db.runAsync(sql, params);

        // Fetch and return the newly created list summary
        const newList = await db.getAsync(`
             SELECT l.*, u.username as ownerUsername, 0 as itemCount
             FROM user_lists l JOIN users u ON l.userId = u.id
             WHERE l.id = ?`, [result.lastID]);
        res.status(201).json(newList);

    } catch (error) {
        console.error(`Create List Error (User ${userId}):`, error);
        res.status(500).json({ message: error.message || 'Failed to create list.' });
    }
});

// --- Get Single List Details (including items) ---
// GET /api/lists/:listId
router.get('/:listId', async (req, res) => {
    const requestingUserId = req.userId;
    const listId = parseInt(req.params.listId, 10);

    if (isNaN(listId)) {
        return res.status(400).json({ message: 'Invalid list ID.' });
    }

    try {
        // 1. Fetch List Metadata
        const listSql = `
            SELECT l.*, u.username as ownerUsername
            FROM user_lists l JOIN users u ON l.userId = u.id
            WHERE l.id = ?
        `;
        const list = await db.getAsync(listSql, [listId]);

        if (!list) {
            return res.status(404).json({ message: 'List not found.' });
        }

        // 2. Permission Check
        const isOwner = list.userId === requestingUserId;
        if (!isOwner && !list.isPublic) {
            return res.status(403).json({ message: 'You do not have permission to view this list.' });
        }

        // 3. Fetch List Items (join with library_items to get details)
        const itemsSql = `
            SELECT
                li.id as listItemId, li.userComment, li.dateAdded,
                lib.id as libraryItemId, lib.mediaType, lib.mediaId, lib.title, lib.imageUrl, lib.releaseYear,
                lib.userStatus, lib.userRating, lib.isFavorite, lib.userNotes as libraryNotes
            FROM user_list_items li
            JOIN library_items lib ON li.libraryItemId = lib.id
            WHERE li.listId = ?
            ORDER BY li.dateAdded DESC
        `;
        const items = await db.allAsync(itemsSql, [listId]);

        // 4. Combine and Respond
        res.status(200).json({ ...list, items: items });

    } catch (error) {
        console.error(`Get List Detail Error (List ${listId}):`, error);
        res.status(500).json({ message: error.message || 'Failed to retrieve list details.' });
    }
});


// --- Update List Metadata ---
// PUT /api/lists/:listId
router.put('/:listId', async (req, res) => {
    const userId = req.userId;
    const listId = parseInt(req.params.listId, 10);
    const { title, description, isPublic, coverImageUrl } = req.body;

    if (isNaN(listId)) {
        return res.status(400).json({ message: 'Invalid list ID.' });
    }

    // Check if at least one field is provided
     if (title === undefined && description === undefined && isPublic === undefined && coverImageUrl === undefined) {
        return res.status(400).json({ message: 'No fields provided for update.' });
    }

    try {
        // Check ownership first
        const list = await db.getAsync(`SELECT userId FROM user_lists WHERE id = ?`, [listId]);
        if (!list) {
            return res.status(404).json({ message: 'List not found.' });
        }
        if (list.userId !== userId) {
            return res.status(403).json({ message: 'You do not have permission to modify this list.' });
        }

        // Build update query
        const updates = [];
        const params = [];

        if (title !== undefined) {
             if (typeof title !== 'string' || title.trim() === '') {
                 return res.status(400).json({ message: 'List title cannot be empty.' });
             }
            updates.push(`title = ?`);
            params.push(title.trim());
        }
        if (description !== undefined) {
            updates.push(`description = ?`);
            params.push(description);
        }
         if (isPublic !== undefined) {
             const publicFlag = [true, 'true', 1].includes(isPublic) ? 1 : 0;
            updates.push(`isPublic = ?`);
            params.push(publicFlag);
        }
        if (coverImageUrl !== undefined) {
            updates.push(`coverImageUrl = ?`);
            params.push(coverImageUrl);
        }

        if (updates.length === 0) {
              // Should not happen due to initial check
             return res.status(400).json({ message: 'No valid update fields provided.' });
        }

        // Add listId and userId for WHERE clause
        params.push(listId, userId);
        const sql = `UPDATE user_lists SET ${updates.join(', ')} WHERE id = ? AND userId = ?`;
        // Trigger handles updatedAt

        const result = await db.runAsync(sql, params);

        if (result.changes === 0) {
            // Possible if data was identical or concurrent modification
            // return res.status(404).json({ message: 'List not found or no changes needed.' });
        }

        // Fetch and return updated list data
        const updatedList = await db.getAsync(`
             SELECT l.*, u.username as ownerUsername, COALESCE(COUNT(li.id), 0) as itemCount
             FROM user_lists l
             JOIN users u ON l.userId = u.id
             LEFT JOIN user_list_items li ON l.id = li.listId
             WHERE l.id = ?
             GROUP BY l.id`, [listId]);
        res.status(200).json(updatedList);


    } catch (error) {
        console.error(`Update List Error (List ${listId}, User ${userId}):`, error);
        res.status(500).json({ message: error.message || 'Failed to update list.' });
    }
});

// --- Delete List ---
// DELETE /api/lists/:listId
router.delete('/:listId', async (req, res) => {
    const userId = req.userId;
    const listId = parseInt(req.params.listId, 10);

    if (isNaN(listId)) {
        return res.status(400).json({ message: 'Invalid list ID.' });
    }

    try {
        // Check ownership
         const list = await db.getAsync(`SELECT userId FROM user_lists WHERE id = ?`, [listId]);
         if (!list) {
             return res.status(404).json({ message: 'List not found.' });
         }
         if (list.userId !== userId) {
             return res.status(403).json({ message: 'You do not have permission to delete this list.' });
         }

        // Delete the list (CASCADE should handle user_list_items)
        const result = await db.runAsync(`DELETE FROM user_lists WHERE id = ? AND userId = ?`, [listId, userId]);

         if (result.changes === 0) {
            // Should not happen if previous checks passed
            return res.status(404).json({ message: 'List not found or already deleted.' });
        }

        res.status(200).json({ message: 'List deleted successfully.' });

    } catch (error) {
        console.error(`Delete List Error (List ${listId}, User ${userId}):`, error);
        res.status(500).json({ message: error.message || 'Failed to delete list.' });
    }
});


// --- Add Item to List ---
// POST /api/lists/:listId/items
router.post('/:listId/items', async (req, res) => {
    const userId = req.userId;
    const listId = parseInt(req.params.listId, 10);
    const { libraryItemId, userComment } = req.body; // Expect the ID from the user's library_items table

    if (isNaN(listId)) return res.status(400).json({ message: 'Invalid list ID.' });
    if (!libraryItemId || isNaN(parseInt(libraryItemId, 10))) {
        return res.status(400).json({ message: 'Valid libraryItemId is required.' });
    }
    const libItemId = parseInt(libraryItemId, 10);

    try {
        // 1. Verify list ownership
         const list = await db.getAsync(`SELECT userId FROM user_lists WHERE id = ?`, [listId]);
         if (!list) return res.status(404).json({ message: 'List not found.' });
         if (list.userId !== userId) return res.status(403).json({ message: 'You cannot add items to this list.' });

        // 2. Verify library item ownership and existence
        const libraryItem = await db.getAsync(`SELECT id FROM library_items WHERE id = ? AND userId = ?`, [libItemId, userId]);
        if (!libraryItem) return res.status(404).json({ message: 'Library item not found or does not belong to you.' });

        // 3. Add the item
        const sql = `INSERT INTO user_list_items (listId, libraryItemId, userComment, dateAdded) VALUES (?, ?, ?, datetime('now'))`;
        const result = await db.runAsync(sql, [listId, libItemId, userComment || null]);

        // 4. Fetch and return the newly added list item details (joined)
        const newItem = await db.getAsync(`
            SELECT li.*, lib.mediaType, lib.title
            FROM user_list_items li JOIN library_items lib ON li.libraryItemId = lib.id
            WHERE li.id = ?`, [result.lastID]);
        res.status(201).json(newItem);

    } catch (error) {
        console.error(`Add List Item Error (List ${listId}, LibItem ${libItemId}, User ${userId}):`, error);
        if (error.message.includes('UNIQUE constraint failed')) {
             return res.status(409).json({ message: 'This item is already in this list.' });
        }
         if (error.message.includes('FOREIGN KEY constraint failed')) {
             // This could mean listId or libraryItemId was invalid despite checks (race condition?)
             return res.status(404).json({ message: 'List or Library item not found.' });
        }
        res.status(500).json({ message: error.message || 'Failed to add item to list.' });
    }
});


// --- Remove Item from List ---
// DELETE /api/lists/:listId/items/:listItemId
router.delete('/:listId/items/:listItemId', async (req, res) => {
     const userId = req.userId;
     const listId = parseInt(req.params.listId, 10);
     const listItemId = parseInt(req.params.listItemId, 10); // This is the ID from user_list_items table

    if (isNaN(listId) || isNaN(listItemId)) {
        return res.status(400).json({ message: 'Invalid list ID or list item ID.' });
    }

     try {
        // 1. Verify list ownership (needed to allow deletion)
         const list = await db.getAsync(`SELECT userId FROM user_lists WHERE id = ?`, [listId]);
         if (!list) return res.status(404).json({ message: 'List not found.' });
         if (list.userId !== userId) return res.status(403).json({ message: 'You cannot remove items from this list.' });

         // 2. Delete the specific list item entry
         // We know the user owns the list, so deleting the entry within that list is permitted
         const sql = `DELETE FROM user_list_items WHERE id = ? AND listId = ?`;
         const result = await db.runAsync(sql, [listItemId, listId]);

         if (result.changes === 0) {
            return res.status(404).json({ message: 'List item not found in this list.' });
         }
         res.status(200).json({ message: 'Item removed from list successfully.' });

     } catch (error) {
         console.error(`Remove List Item Error (List ${listId}, ListItem ${listItemId}, User ${userId}):`, error);
         res.status(500).json({ message: error.message || 'Failed to remove item from list.' });
     }
});

// --- Update Item within List (e.g., comment) ---
// PUT /api/lists/:listId/items/:listItemId
router.put('/:listId/items/:listItemId', async (req, res) => {
    const userId = req.userId;
    const listId = parseInt(req.params.listId, 10);
    const listItemId = parseInt(req.params.listItemId, 10);
    const { userComment } = req.body;

    if (isNaN(listId) || isNaN(listItemId)) {
        return res.status(400).json({ message: 'Invalid list ID or list item ID.' });
    }
    if (userComment === undefined) {
         return res.status(400).json({ message: 'No update fields provided (only userComment is supported).' });
    }

    try {
         // Verify list ownership
         const list = await db.getAsync(`SELECT userId FROM user_lists WHERE id = ?`, [listId]);
         if (!list) return res.status(404).json({ message: 'List not found.' });
         if (list.userId !== userId) return res.status(403).json({ message: 'You cannot modify items in this list.' });

         // Update the comment
         const sql = `UPDATE user_list_items SET userComment = ? WHERE id = ? AND listId = ?`;
         const result = await db.runAsync(sql, [userComment, listItemId, listId]);

          if (result.changes === 0) {
             return res.status(404).json({ message: 'List item not found in this list or comment unchanged.' });
         }

         // Fetch and return updated item details
         const updatedItem = await db.getAsync(`
            SELECT li.*, lib.mediaType, lib.title
            FROM user_list_items li JOIN library_items lib ON li.libraryItemId = lib.id
            WHERE li.id = ?`, [listItemId]);
         res.status(200).json(updatedItem);

    } catch (error) {
         console.error(`Update List Item Comment Error (ListItem ${listItemId}, User ${userId}):`, error);
         res.status(500).json({ message: error.message || 'Failed to update list item comment.' });
    }
});


module.exports = router;
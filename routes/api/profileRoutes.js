// routes/api/profileRoutes.js (New File)
const express = require('express');
const db = require('../../database');
const { verifyToken } = require('../../auth');
const axios = require('axios'); // To call library stats endpoint

const router = express.Router();

// Apply auth to all profile routes (viewing others might need different logic later)
router.use(verifyToken);

// Helper to build API URL
const getApiUrl = (req) => `${req.protocol}://${req.get('host')}/api`;

// GET /api/profile/:userId (Get basic profile info and stats)
router.get('/:userId', async (req, res) => {
    const requestingUserId = req.userId;
    const targetUserId = parseInt(req.params.userId, 10);

    if (isNaN(targetUserId)) {
        return res.status(400).json({ message: 'Invalid userId provided.' });
    }

    try {
        // Fetch basic user info
        const user = await db.getAsync(
            `SELECT id, username, profileImageUrl, profilePrivacy, createdAt FROM users WHERE id = ?`,
            [targetUserId]
        );

        if (!user) {
            return res.status(404).json({ message: 'User profile not found.' });
        }

        // Permission Check: Allow if own profile or target is public
        const isOwnProfile = requestingUserId === targetUserId;
        if (!isOwnProfile && user.profilePrivacy !== 'public') {
            // Return minimal info for private profiles viewed by others? Or just forbid?
             return res.status(403).json({ message: 'This profile is private.' });
        }

        // Fetch library stats by calling the library API endpoint
        let stats = {};
        try {
            const apiUrl = getApiUrl(req);
            const statsResponse = await axios.get(`${apiUrl}/library/stats/${targetUserId}`, {
                headers: { Cookie: req.headers.cookie } // Forward cookie
            });
            stats = statsResponse.data;
        } catch (statsError) {
             console.error(`Failed to fetch stats for user ${targetUserId}:`, statsError.response?.data || statsError.message);
             // Continue without stats, or return an error? Let's continue for now.
             stats = { averageScore: null, countCompleted: 0, countTotal: 0 }; // Default/empty stats
        }


        res.status(200).json({
            id: user.id,
            username: user.username,
            profileImageUrl: user.profileImageUrl || '/images/placeholder_avatar.png', // Default avatar
            profilePrivacy: user.profilePrivacy,
            memberSince: user.createdAt,
            // Include fetched stats
            averageScore: stats.averageScore, // From library API
            countMediaCompleted: stats.countCompleted, // From library API
            countMediaTotal: stats.countTotal // From library API
            // Add friend status later if implementing social features
        });

    } catch (error) {
        console.error(`Get Profile Error (User ${targetUserId}):`, error);
        res.status(500).json({ message: error.message || 'Failed to retrieve user profile.' });
    }
});

// PUT /api/profile/me (Update logged-in user's profile settings)
router.put('/me', async (req, res) => {
    const userId = req.userId;
    const { profilePrivacy, profileImageUrl } = req.body; // Add other updatable fields later

    const updates = [];
    const params = [];

    // Validate and add fields to update
    if (profilePrivacy !== undefined) {
        const privacy = profilePrivacy.toLowerCase();
        if (!['public', 'private'].includes(privacy)) {
            return res.status(400).json({ message: 'Invalid profilePrivacy value. Must be "public" or "private".' });
        }
        updates.push(`profilePrivacy = ?`);
        params.push(privacy);
    }

    if (profileImageUrl !== undefined) {
         // Add basic URL validation later if needed
         updates.push(`profileImageUrl = ?`);
         params.push(profileImageUrl);
    }

    if (updates.length === 0) {
        return res.status(400).json({ message: 'No fields provided for update.' });
    }

    try {
        const updateSql = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
        params.push(userId);

        const result = await db.runAsync(updateSql, params);

        if (result.changes === 0) {
            // Should not happen if user exists, maybe no change needed?
             return res.status(404).json({ message: 'User not found or no changes applied.' });
        }

        // Fetch and return the updated profile info
        const updatedUser = await db.getAsync(
            `SELECT id, username, profileImageUrl, profilePrivacy, createdAt FROM users WHERE id = ?`,
            [userId]
        );
         // Refetch stats as well? No, stats aren't changed by profile update. Call the GET /api/profile/:userId instead?
         // For now, just return the updated basic user data.
        res.status(200).json({
             id: updatedUser.id,
             username: updatedUser.username,
             profileImageUrl: updatedUser.profileImageUrl || '/images/placeholder_avatar.png',
             profilePrivacy: updatedUser.profilePrivacy,
             memberSince: updatedUser.createdAt
        });


    } catch (error) {
        console.error(`Update Profile Error (User ${userId}):`, error);
        res.status(500).json({ message: error.message || 'Failed to update profile.' });
    }
});


module.exports = router;
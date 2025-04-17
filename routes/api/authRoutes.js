// routes/api/authRoutes.js
const express = require('express');
const db = require('../../database'); // Use the promisified db
const { hashPassword, comparePassword, setAuthCookie, clearAuthCookie } = require('../../auth');

const router = express.Router();

// --- Register ---
router.post('/register', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required.' });
    }
    if (password.length < 6) {
         return res.status(400).json({ message: 'Password must be at least 6 characters long.' });
    }

    try {
        const existingUser = await db.getAsync(`SELECT id FROM users WHERE lower(username) = lower(?)`, [username]);
        if (existingUser) {
            return res.status(409).json({ message: 'Username already taken.' }); // 409 Conflict
        }
        const passwordHash = await hashPassword(password);
        // Insert user with default profile settings
        const result = await db.runAsync(`INSERT INTO users (username, passwordHash, profilePrivacy) VALUES (?, ?, 'private')`, [username, passwordHash]);

        res.status(201).json({
            id: result.lastID,
            username: username,
            message: 'User registered successfully. Please login.'
         });
    } catch (error) {
        console.error("Registration Error:", error);
        res.status(500).json({ message: error.message || 'Server error during registration.' });
    }
});

// --- Login ---
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required.' });
    }
    try {
        // Find user (case-insensitive)
        const user = await db.getAsync(`SELECT id, username, passwordHash FROM users WHERE lower(username) = lower(?)`, [username]);
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }
        const isMatch = await comparePassword(password, user.passwordHash);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }
        const userData = { id: user.id, username: user.username };
        setAuthCookie(res, userData);
        res.status(200).json({
            message: 'Login successful.',
            user: userData
        });
    } catch (error) {
        console.error("Login Error:", error);
        res.status(500).json({ message: error.message || 'Server error during login.' });
    }
});

// --- Logout ---
router.post('/logout', (req, res) => {
    clearAuthCookie(res);
    res.status(200).json({ message: 'Logout successful.' });
});

module.exports = router;
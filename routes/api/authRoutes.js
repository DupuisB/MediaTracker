// routes/api/authRoutes.js
const express = require('express');
const db = require('../../dbUtils'); // Use the promisified utils
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
        // Check if username exists
        const existingUser = await db.get(`SELECT id FROM users WHERE username = ?`, [username]);
        if (existingUser) {
            return res.status(409).json({ message: 'Username already taken.' }); // 409 Conflict
        }

        // Hash password
        const passwordHash = await hashPassword(password);

        // Insert user
        const result = await db.run(`INSERT INTO users (username, passwordHash) VALUES (?, ?)`, [username, passwordHash]);

        res.status(201).json({
            id: result.lastID,
            username: username,
            message: 'User registered successfully. Please login.'
         });

    } catch (error) {
        console.error("Registration Error:", error);
        // dbUtils throws specific errors we might catch if needed
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
        // Find user
        const user = await db.get(`SELECT id, username, passwordHash FROM users WHERE username = ?`, [username]);
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials.' }); // User not found
        }

        // Compare password
        const isMatch = await comparePassword(password, user.passwordHash);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials.' }); // Password mismatch
        }

        // Set auth cookie
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
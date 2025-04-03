const express = require('express');
const db = require('../../database'); // Import the database connection
const { hashPassword, comparePassword, setAuthCookie, clearAuthCookie } = require('../../auth');

const router = express.Router();

// --- Register a New User ---
router.post('/register', async (req, res) => {
    const { username, password } = req.body;

    // Basic validation
    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required.' });
    }
    if (password.length < 6) { // Example: Minimum password length
         return res.status(400).json({ message: 'Password must be at least 6 characters long.' });
    }

    try {
        // Check if username already exists
        const checkUserSql = `SELECT id FROM users WHERE username = ?`;
        db.get(checkUserSql, [username], async (err, row) => {
            if (err) {
                console.error("Database error checking username:", err.message);
                return res.status(500).json({ message: 'Error checking username.' });
            }
            if (row) {
                return res.status(409).json({ message: 'Username already taken.' }); // 409 Conflict
            }

            // Hash the password
            const passwordHash = await hashPassword(password);

            // Insert the new user
            const insertSql = `INSERT INTO users (username, passwordHash) VALUES (?, ?)`;
            db.run(insertSql, [username, passwordHash], function(err) { // Use function() to access this.lastID
                if (err) {
                    console.error("Database error registering user:", err.message);
                    return res.status(500).json({ message: 'Failed to register user.' });
                }
                // Return basic user info (excluding password)
                res.status(201).json({
                    id: this.lastID, // Get the ID of the inserted row
                    username: username,
                    message: 'User registered successfully.'
                 });
            });
        });
    } catch (error) {
        console.error("Error during registration:", error);
        res.status(500).json({ message: 'Server error during registration.' });
    }
});

// --- Login User ---
router.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required.' });
    }

    const sql = `SELECT id, username, passwordHash FROM users WHERE username = ?`;
    db.get(sql, [username], async (err, user) => {
        if (err) {
            console.error("Database error during login:", err.message);
            return res.status(500).json({ message: 'Error logging in.' });
        }
        if (!user) {
            // User not found
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        try {
            // Compare the provided password with the stored hash
            const isMatch = await comparePassword(password, user.passwordHash);

            if (!isMatch) {
                // Password doesn't match
                return res.status(401).json({ message: 'Invalid credentials.' });
            }

            // Passwords match - Generate JWT
            setAuthCookie(res, { id: user.id, username: user.username });

            res.status(200).json({
                message: 'Login successful.',
                user: { id: user.id, username: user.username }
            });

        } catch (error) {
            console.error("Error comparing password or generating token:", error);
            res.status(500).json({ message: 'Server error during login process.' });
        }
    });
});

// --- Logout ---
router.post('/logout', (req, res) => {
    clearAuthCookie(res);
    res.status(200).json({ message: 'Logout successful.' });
});


module.exports = router;
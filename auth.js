const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config(); // Ensure environment variables are loaded

const JWT_SECRET = process.env.JWT_SECRET;
const SALT_ROUNDS = 10; // Cost factor for bcrypt hashing

if (!JWT_SECRET) {
    console.error("FATAL ERROR: JWT_SECRET is not defined in .env file.");
    process.exit(1); // Exit if the secret is missing
}

/**
 * Hashes a plain text password.
 * @param {string} password - The plain text password.
 * @returns {Promise<string>} - The hashed password.
 */
async function hashPassword(password) {
    return await bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Compares a plain text password with a hash.
 * @param {string} password - The plain text password.
 * @param {string} hash - The hashed password from the database.
 * @returns {Promise<boolean>} - True if the password matches the hash, false otherwise.
 */
async function comparePassword(password, hash) {
    return await bcrypt.compare(password, hash);
}

/**
 * Generates a JWT for a user.
 * @param {object} user - The user object (should contain at least 'id' and 'username').
 * @returns {string} - The generated JWT.
 */
function generateToken(user) {
    const payload = {
        id: user.id,
        username: user.username
    };
    // Token expires in 1 day (adjust as needed)
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '1d' });
}

/**
 * Middleware to verify JWT token.
 * Attaches user ID to the request object (req.userId) if valid.
 */
function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Expect "Bearer TOKEN"

    if (!token) {
        return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.id; // Add user ID to the request object
        next(); // Proceed to the next middleware or route handler
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
             return res.status(401).json({ message: 'Token expired.' });
        }
        return res.status(400).json({ message: 'Invalid token.' }); // Use 400 for malformed/invalid tokens
    }
}

module.exports = {
    hashPassword,
    comparePassword,
    generateToken,
    verifyToken
};
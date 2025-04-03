// auth.js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;
const SALT_ROUNDS = 10;
const COOKIE_NAME = 'authToken'; // Name for the JWT cookie

if (!JWT_SECRET) {
    console.error("FATAL ERROR: JWT_SECRET is not defined in .env file.");
    process.exit(1); // Exit if the secret is missing
}

// --- Password Hashing ---
async function hashPassword(password) {
    return await bcrypt.hash(password, SALT_ROUNDS);
}

async function comparePassword(password, hash) {
    return await bcrypt.compare(password, hash);
}

// --- Token Generation ---
function generateToken(user) {
    const payload = { id: user.id, username: user.username };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '1d' }); // Expires in 1 day
}

// --- Set Auth Cookie ---
function setAuthCookie(res, user) {
    const token = generateToken(user);
    res.cookie(COOKIE_NAME, token, {
        httpOnly: true, // Prevents client-side JS access
        secure: process.env.NODE_ENV === 'production', // Use secure cookies in production (HTTPS)
        maxAge: 24 * 60 * 60 * 1000, // 1 day expiration (matches token)
        sameSite: 'lax' // Protects against CSRF to some extent
    });
}

// --- Clear Auth Cookie (NEW) ---
function clearAuthCookie(res) {
    res.clearCookie(COOKIE_NAME, {
         httpOnly: true,
         secure: process.env.NODE_ENV === 'production',
         sameSite: 'lax'
     });
}

// --- Verify Token Middleware (for API routes) ---
// This verifies the cookie now instead of the header
function verifyToken(req, res, next) {
    const token = req.cookies[COOKIE_NAME]; // Get token from cookie

    if (!token) {
        // For API requests, return 401 directly
        return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.id; // Add user ID for API use
        req.user = decoded; // Optionally add full user payload
        next();
    } catch (error) {
        // Clear invalid/expired cookie
        clearAuthCookie(res);
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Token expired. Please login again.' });
        }
        return res.status(401).json({ message: 'Invalid token.' }); // Use 401 for auth issues
    }
}

// --- Check Auth Status Middleware (for VIEW routes) ---
// Attaches user info to res.locals if logged in, otherwise proceeds
function checkAuthStatus(req, res, next) {
    const token = req.cookies[COOKIE_NAME];
    res.locals.user = null; // Default to not logged in

    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            // Make user info available to Handlebars templates
            res.locals.user = { id: decoded.id, username: decoded.username };
        } catch (error) {
            // Invalid or expired token - clear cookie but don't block the request
            console.log('Auth status check failed:', error.name);
            clearAuthCookie(res);
        }
    }
    next(); // Always proceed to the next middleware/route
}

// --- Protect View Route Middleware (NEW) ---
// Redirects to login page if user is not authenticated
function requireLogin(req, res, next) {
    if (!res.locals.user) {
        // Store the original URL they were trying to access (optional)
        // req.session.returnTo = req.originalUrl; // Requires express-session
        return res.redirect('/login'); // Redirect to login page
    }
    next(); // User is logged in, proceed
}


module.exports = {
    hashPassword,
    comparePassword,
    setAuthCookie,
    clearAuthCookie,
    verifyToken, // For API protection
    checkAuthStatus, // For adding user to res.locals
    requireLogin // For protecting specific view routes
};
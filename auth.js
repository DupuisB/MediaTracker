// auth.js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;
const SALT_ROUNDS = 10;
const COOKIE_NAME = 'authToken';

if (!JWT_SECRET) {
    console.error("FATAL ERROR: JWT_SECRET is not defined in .env file.");
    process.exit(1);
}

async function hashPassword(password) {
    return await bcrypt.hash(password, SALT_ROUNDS);
}

async function comparePassword(password, hash) {
    // Add check for null/undefined hash to prevent bcrypt errors
    if (!hash) return false;
    return await bcrypt.compare(password, hash);
}

function generateToken(user) {
    // Ensure user and user.id exist
    if (!user || !user.id) {
        throw new Error('Cannot generate token without valid user object (id, username)');
    }
    const payload = { id: user.id, username: user.username };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '1d' });
}

function setAuthCookie(res, user) {
    try {
        const token = generateToken(user);
        res.cookie(COOKIE_NAME, token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 24 * 60 * 60 * 1000, // 1 day
            sameSite: 'lax'
        });
    } catch (error) {
        console.error('Error setting auth cookie:', error);
        // Handle the error appropriately, maybe send an error response earlier
    }
}

function clearAuthCookie(res) {
    res.clearCookie(COOKIE_NAME, {
         httpOnly: true,
         secure: process.env.NODE_ENV === 'production',
         sameSite: 'lax'
     });
}

// --- Middleware ---

// Verify Token for API routes (Checks cookie)
function verifyToken(req, res, next) {
    const token = req.cookies[COOKIE_NAME];

    if (!token) {
        return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.id; // Add user ID for API route handlers
        req.user = decoded; // Optional: Add full decoded payload
        next();
    } catch (error) {
        clearAuthCookie(res); // Clear invalid/expired cookie
        let status = 401;
        let message = 'Invalid token.';
        if (error.name === 'TokenExpiredError') {
            message = 'Token expired. Please login again.';
        } else if (error.name === 'JsonWebTokenError') {
            message = 'Token signature is invalid.';
        }
         console.log('Token verification failed:', error.name);
        return res.status(status).json({ message });
    }
}

// Check Auth Status for View routes (Adds user to res.locals)
function checkAuthStatus(req, res, next) {
    const token = req.cookies[COOKIE_NAME];
    res.locals.user = null; // Default: not logged in

    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            // Make user info available to Handlebars templates
            res.locals.user = { id: decoded.id, username: decoded.username };
        } catch (error) {
            // Invalid or expired token - clear cookie but don't block view rendering
            console.log('Auth status check failed (clearing cookie):', error.name);
            clearAuthCookie(res);
        }
    }
    next();
}

// Protect View Route Middleware (Redirects if not logged in)
function requireLogin(req, res, next) {
    if (!res.locals.user) {
        // Optional: Store intended URL using session middleware if needed
        // req.session.returnTo = req.originalUrl;
        return res.redirect('/login');
    }
    next(); // User is logged in
}

module.exports = {
    hashPassword,
    comparePassword,
    setAuthCookie,
    clearAuthCookie,
    verifyToken,
    checkAuthStatus,
    requireLogin
};
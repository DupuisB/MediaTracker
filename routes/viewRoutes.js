// routes/viewRoutes.js
const express = require('express');
const path = require('path');
const fs = require('fs').promises; // Use promise-based fs
const { requireLogin, checkAuthStatus } = require('../auth');

const router = express.Router();

// Middleware to add user status to all view routes
router.use(checkAuthStatus);

// --- Public Routes ---
router.get('/', (req, res) => {
    res.render('home', { pageTitle: 'Welcome' });
});

router.get('/about', (req, res) => {
    res.render('about', { pageTitle: 'About Us' });
});

router.get('/login', (req, res) => {
    if (res.locals.user) { // Redirect if already logged in
        return res.redirect('/library');
    }
    res.render('login', { pageTitle: 'Login / Register' });
});

// --- Protected Routes ---
router.get('/library', requireLogin, (req, res) => {
    res.render('library', {
        pageTitle: 'My Library',
        // username is available via res.locals.user automatically passed by Handlebars
    });
});

// --- Route to Serve Client-Side Handlebars Partials ---
// Consider security implications: only allow known partials.
const ALLOWED_PARTIALS = new Set(['mediaCard', 'itemFormModal', 'mediaDetailsModal']);
const partialsDir = path.join(__dirname, '../views/partials');

router.get('/templates/:templateName', requireLogin, async (req, res) => {
    const templateName = req.params.templateName;

    if (!ALLOWED_PARTIALS.has(templateName)) {
        return res.status(404).send('Template not found or not allowed.');
    }

    const filePath = path.join(partialsDir, `${templateName}.hbs`);

    try {
        // Check if file exists before sending
        await fs.access(filePath); // Throws if file doesn't exist
        // Set appropriate content type
        res.type('text/html'); // Or 'text/x-handlebars-template'
        res.sendFile(filePath);
    } catch (error) {
        console.error(`Error serving template ${templateName}:`, error);
        res.status(404).send('Template not found.');
    }
});

module.exports = router;
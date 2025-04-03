// routes/viewRoutes.js
const express = require('express');
const path = require('path');
const { requireLogin } = require('../auth'); // Middleware to protect routes

const router = express.Router();

// --- Public Routes ---
router.get('/', (req, res) => {
    res.render('home', { // Render views/home.hbs
        pageTitle: 'Welcome'
        // user is automatically available from res.locals.user via checkAuthStatus middleware
    });
});

router.get('/about', (req, res) => {
    res.render('about', {
        pageTitle: 'About Us'
    });
});

router.get('/login', (req, res) => {
    // If user is already logged in, redirect to library
    if (res.locals.user) {
        return res.redirect('/library');
    }
    res.render('login', { // Render views/login.hbs
        pageTitle: 'Login / Register',
        layout: 'main' // Explicitly use main layout (usually default)
    });
});

// --- Protected Routes (Require Login) ---
// Apply requireLogin middleware to all routes below this point in this router,
// OR apply it individually as shown for /library
// router.use(requireLogin);

router.get('/library', requireLogin, (req, res) => { // Apply middleware here
    // User is guaranteed to be logged in by requireLogin
    res.render('library', { // Render views/library.hbs
        pageTitle: 'My Library',
        username: res.locals.user.username // Pass username to the template if needed
    });
});

// Route to serve client-side Handlebars templates (if not pre-compiling)
// This allows fetching templates via JS
router.get('/templates/:templateName', requireLogin, (req, res) => {
    const templateName = req.params.templateName;
    // Basic security: only allow specific template names
    const allowedTemplates = ['mediaCard', 'addItemModal', 'libraryCard', 'mediaDetailsModal'];
    if (!allowedTemplates.includes(templateName)) {
        return res.status(404).send('Template not found');
    }
    // Render the partial directly - needs specific setup or just send file
    // Simpler: Send the file content
    const filePath = path.join(__dirname, `../views/partials/${templateName}.hbs`);
    res.sendFile(filePath, (err) => {
        if (err) {
            console.error("Error sending template file:", err);
            res.status(404).send('Template not found');
        }
    });
});


module.exports = router;
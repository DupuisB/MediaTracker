// public/js/main.js
import { initAuthListeners } from './modules/authHandlers.js';
import { setupHandlebarsHelpers } from './modules/templates.js';
import { initSwipers } from './modules/swiperSetup.js';
import { initMediaDetailInteraction, handleLibraryItemFormSubmit } from './modules/libraryHandlers.js';
import { initListInteractions, handleListFormSubmit } from './modules/listHandlers.js';
import { initProfileInteractions } from './modules/profileHandlers.js';
import { initHomepageTabs } from './modules/homepageHandlers.js';
import { closeModal, deleteConfirmModal, formModal, handleDeleteConfirm } from './modules/ui.js';

(function () {
    'use strict';

    /**
     * Sets up global event listeners (modals, etc.).
     */
    function setupGlobalListeners() {
        // Modal generic close/cancel buttons
        formModal?.addEventListener('click', (event) => {
            if (event.target.matches('.modal-close-btn') || event.target.matches('.modal-cancel-btn') || event.target === formModal) {
                closeModal(formModal);
            }
        });
        deleteConfirmModal?.addEventListener('click', (event) => {
            if (event.target.matches('.modal-close-btn') || event.target.matches('.modal-cancel-btn') || event.target === deleteConfirmModal) {
                closeModal(deleteConfirmModal);
                // Reset itemToDelete state here? The handler does it too, maybe redundant.
            } else if (event.target.matches('#deleteConfirmBtn')) {
                handleDeleteConfirm(); // Call the imported handler
            }
        });

        // Modal Form Submissions (Delegated) - Route based on form ID
        formModal?.addEventListener('submit', (event) => {
            if (event.target.id === 'libraryItemForm') {
                handleLibraryItemFormSubmit(event); // Call imported handler
            } else if (event.target.id === 'listForm') {
                handleListFormSubmit(event); // Call imported handler
            }
        });

        // Add global status message area
        if (!document.getElementById('globalStatus')) {
           const statusDiv = document.createElement('div');
           statusDiv.id = 'globalStatus';
           statusDiv.className = 'status-message hidden';
           statusDiv.setAttribute('aria-live', 'polite');
           document.body.appendChild(statusDiv);
       }
    }

    /**
     * Initializes page-specific listeners and functionality based on URL path.
     */
    function initializePageSpecific() {
        const path = window.location.pathname;
        const pathParts = path.split('/').filter(p => p);

        // Initialize Swipers on relevant pages
        if (path === '/' || path.startsWith('/profile') || path.startsWith('/media/')) {
            initSwipers();
        }

        // Homepage specific listeners
        if (path === '/') {
            initHomepageTabs();
            initSwipers();
        } else if (path.startsWith('/profile') || path.startsWith('/media/')) {
            initSwipers();
        }

        // Login/Register Page (Handled by initAuthListeners)
        // Search Results Page
        if (path.startsWith('/media/') && pathParts.length === 3) { initMediaDetailInteraction(); }
        if (path.startsWith('/profile')) { initProfileInteractions(); }
        if (path === '/lists') { initListInteractions(); }
        if (path.startsWith('/lists/') && pathParts.length === 2) { initListInteractions(); }
        // Keep search results nav handler or integrate into a search specific module
        if (path === '/search') {
            const searchNav = document.querySelector('.search-nav');
            searchNav?.addEventListener('click', handleSearchNavFilter);
            // Apply 'All' filter on load if needed
            const allButton = searchNav?.querySelector('.nav-item[data-filter="all"]');
            if (allButton && allButton.classList.contains('active')) {
                handleSearchNavFilter({ target: allButton });
            }
        }
    }

     // Apply the 'All' filter logic specifically for the search page nav handler
     function handleSearchNavFilter(event) {
        const target = event.target;
        if (!target.matches('.search-nav .nav-item')) {
            return;
        }
        const filter = target.dataset.filter;
        const resultsArea = document.getElementById('search-results-area');
        if (!resultsArea) return;
        target.closest('.search-nav').querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
        target.classList.add('active');
        resultsArea.querySelectorAll('.results-category').forEach(section => {
            section.style.display = (filter === 'all' || section.dataset.category === filter) ? '' : 'none';
        });
    }


    /**
     * Main initialization function.
     */
    function initialize() {
        console.log('MediaTracker Initializing...');
        setupHandlebarsHelpers(); // Setup helpers first
        setupGlobalListeners();   // Then global listeners (modals etc.)
        initAuthListeners();      // Setup listeners for auth elements (login/register/logout)
        initializePageSpecific(); // Setup listeners/features for the current page
        console.log('MediaTracker Initialized.');
    }

    // --- Run Initialization ---
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

})(); // End IIFE
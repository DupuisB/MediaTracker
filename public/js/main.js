// public/js/main.js
(function () {
    'use strict';

    // --- Constants ---
    const API_BASE_URL = '/api';
    const TEMPLATE_BASE_URL = '/templates';

    // --- DOM Elements (Cached) ---
    const mainContent = document.querySelector('main.container'); // Event delegation target
    const statusMessageEl = document.getElementById('statusMessage');
    const responseAreaEl = document.getElementById('responseArea');
    const statusSectionEl = document.getElementById('statusSection');
    const logoutBtn = document.getElementById('logoutBtn');
    const searchForm = document.getElementById('searchForm');
    const libraryControls = document.getElementById('libraryControls');
    const resultsArea = document.getElementById('resultsArea');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const infoModal = document.getElementById('infoModal');
    const modalContentArea = document.getElementById('modalContentArea');
    const deleteConfirmModal = document.getElementById('deleteConfirmModal');

    // --- State ---
    let compiledTemplates = {}; // Cache for fetched Handlebars templates
    let itemToDeleteId = null; // Store ID for delete confirmation

    // --- Handlebars Setup & Helpers ---
    // Register client-side helpers (if not relying solely on server-side for initial render)
    // Ensure these match server-side helpers if templates are used in both places
    if (window.Handlebars) {
        const helpers = {
            eq: (v1, v2) => v1 === v2,
            json: (context) => JSON.stringify(context),
            currentYear: () => new Date().getFullYear(),
            capitalize: (str) => (typeof str === 'string' && str.length > 0) ? str.charAt(0).toUpperCase() + str.slice(1) : str,
            formatYear: (dateString) => dateString ? new Date(dateString).getFullYear() : '',
            formatDate: (dateString) => dateString ? new Date(dateString).toLocaleDateString() : '',
            classify: (str) => typeof str === 'string' ? str.replace(/\s+/g, '-').toLowerCase() : '',
            defaultIfEmpty: (value, defaultValue) => value || defaultValue || '',
            join: (arr, separator) => Array.isArray(arr) ? arr.join(separator) : '',
            truncate: (str, len) => (str && str.length > len) ? str.substring(0, len) + '...' : str,
        };
        Object.keys(helpers).forEach(key => Handlebars.registerHelper(key, helpers[key]));
    } else {
        console.warn('Handlebars runtime not found. Client-side templates may not work.');
    }

    // --- Utility Functions ---
    function showStatus(message, type = 'info') { // type = 'info', 'success', 'error'
        if (!statusMessageEl || !statusSectionEl) return;
        statusMessageEl.textContent = message;
        statusMessageEl.className = `status-${type}`; // Use classes for styling
        statusSectionEl.classList.remove('hidden');
        console.log(`Status [${type}]: ${message}`);
        // Optional: Auto-hide after a delay?
        // setTimeout(() => statusSectionEl.classList.add('hidden'), 5000);
    }

    function showResponse(data) {
        if (!responseAreaEl) return;
        responseAreaEl.textContent = JSON.stringify(data, null, 2);
    }

    function showSpinner(spinnerId, show = true) {
        document.getElementById(spinnerId)?.classList.toggle('hidden', !show);
    }

    // Simplified API request function
    async function apiRequest(endpoint, method = 'GET', body = null) {
        const url = `${API_BASE_URL}${endpoint}`;
        const options = {
            method,
            headers: {
                // Cookies are sent automatically by the browser
            },
        };
        if (body) {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(body);
        }

        try {
            const response = await fetch(url, options);
            const responseData = response.status === 204 ? {} : await response.json(); // Handle No Content

            if (!response.ok) {
                 // Throw an error object with status and message
                 const error = new Error(responseData.message || `HTTP error ${response.status}`);
                 error.status = response.status;
                 error.data = responseData;
                 throw error;
            }
            showResponse(responseData); // Show successful response data
            return responseData;
        } catch (error) {
            console.error(`API Request Error (${method} ${endpoint}):`, error);
            const message = error.message || 'An unknown API error occurred.';
            showStatus(message, 'error');
            showResponse({ error: message, status: error.status, data: error.data });

            // Handle critical auth errors (e.g., redirect to login)
            if (error.status === 401) {
                showStatus('Authentication error. Redirecting to login...', 'error');
                setTimeout(() => { window.location.href = '/login'; }, 1500);
            }
            throw error; // Re-throw for calling function to handle if needed
        }
    }

    // Function to fetch and compile Handlebars template
    async function getTemplate(templateName) {
        if (compiledTemplates[templateName]) {
            return compiledTemplates[templateName];
        }
        try {
            const response = await fetch(`${TEMPLATE_BASE_URL}/${templateName}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch template: ${templateName} (${response.status})`);
            }
            const templateString = await response.text();
            if (!window.Handlebars) throw new Error("Handlebars runtime missing");
            compiledTemplates[templateName] = Handlebars.compile(templateString);
            return compiledTemplates[templateName];
        } catch (error) {
            console.error(`Error loading template ${templateName}:`, error);
            showStatus(`Error loading template ${templateName}.`, 'error');
            return null;
        }
    }

    // Render items using a template
    async function renderItems(items, targetElement, templateName, context = {}) {
        if (!targetElement) return;

        const template = await getTemplate(templateName);
        if (!template) {
            targetElement.innerHTML = `<p class="placeholder-text error">Error loading display template.</p>`;
            return;
        }

        const defaultContext = {
            items: items,
            placeholder: 'No items to display.',
            hidePlaceholder: false
        };
        targetElement.innerHTML = template({ ...defaultContext, ...context });
    }

    // --- Modal Handling ---
    function openModal(modalElement, contentHTML = '') {
        if (!modalElement) return;
        const contentArea = modalElement.querySelector('.modal-content-area') || modalElement.querySelector('#modalContentArea'); // Flexible content area selector
         if (contentArea && contentHTML) {
             contentArea.innerHTML = contentHTML;
         }
        modalElement.classList.remove('hidden');
        // Focus management could be added here
    }

    function closeModal(modalElement) {
        if (!modalElement) return;
        modalElement.classList.add('hidden');
         const contentArea = modalElement.querySelector('.modal-content-area') || modalElement.querySelector('#modalContentArea');
         if (contentArea) {
             contentArea.innerHTML = ''; // Clear content on close
         }
    }

    // Open the Add/Edit Item Form Modal
    async function openItemFormModal(mode = 'add', itemData = {}) {
        const template = await getTemplate('itemFormModal');
        if (!template || !infoModal) return;

        const isAddMode = mode === 'add';
        const context = {
            mode: mode,
            modalTitle: isAddMode ? `Add "${itemData.title}" to Library` : `Edit "${itemData.title}"`,
            submitButtonText: isAddMode ? 'Add Item' : 'Save Changes',
            item: isAddMode ? {
                // For adding, map search result data or defaults
                mediaId: itemData.id || itemData.mediaId, // Use id from search result
                mediaType: itemData.type || itemData.mediaType,
                title: itemData.title,
                imageUrl: itemData.imageUrl,
                apiDescription: itemData.description || itemData.apiDescription,
                // Provide empty user fields for add form
                id: null,
                userStatus: '',
                userRating: '',
                userDescription: '',
            } : itemData, // For editing, use the full library item data
            validStatuses: getValidStatuses(itemData.type || itemData.mediaType),
        };

        openModal(infoModal, template(context));
    }

    // Open the Details Modal
    async function openDetailsModal(mergedItemData, isLibraryItem) {
        const template = await getTemplate('mediaDetailsModal');
        if (!template || !infoModal) return;

        const context = {
            item: mergedItemData,
            isLibraryItem: isLibraryItem
        };
        openModal(infoModal, template(context));
    }

    // Open Delete Confirmation Modal
    function openDeleteConfirmModal(itemId, itemTitle) {
        itemToDeleteId = itemId; // Store the ID
        const messageEl = deleteConfirmModal?.querySelector('#deleteConfirmMessage');
        if (messageEl) {
            messageEl.textContent = `Are you sure you want to delete "${itemTitle}" from your library?`;
        }
        openModal(deleteConfirmModal);
    }

    // --- Event Handlers ---

    // Delegate clicks within the main content area
    async function handleMainContentClick(event) {
        const target = event.target;
        const card = target.closest('.library-card, .result-card'); // Find parent card

        // Determine the action based on the button clicked
        const action = target.matches('.action-add') ? 'add' :
                       target.matches('.action-edit') ? 'edit' :
                       target.matches('.action-delete') ? 'delete' :
                       target.matches('.action-details') ? 'details' : null;

        // Exit if no card or no recognized action button was clicked
        if (!action || !card) {
            return;
        }

        event.stopPropagation(); // Prevent card click bubbling if a button was hit

        // Retrieve the basic data stored on the card
        const basicItemData = JSON.parse(card?.dataset.itemJson || '{}');
        const isLibraryItem = card.classList.contains('library-card');

        // --- Handle Actions ---
        switch (action) {
            case 'add':
                // Add action is only relevant for search results (isLibraryItem should be false)
                if (isLibraryItem) {
                    console.warn("Add action clicked on a library item card. Ignoring.");
                    return;
                }
                openItemFormModal('add', basicItemData);
                break;

            case 'edit':
                // Edit action only applies to library items which MUST have a database id
                if (!isLibraryItem || !basicItemData.id) {
                    console.error("Edit action failed: Not a library item or missing database ID.", basicItemData);
                    showStatus("Error: Cannot edit item, invalid data.", 'error');
                    return;
                }
                openItemFormModal('edit', basicItemData);
                break;

            case 'delete':
                // Delete action only applies to library items which MUST have a database id
                if (!isLibraryItem || !basicItemData.id) {
                    console.error("Delete action failed: Not a library item or missing database ID.", basicItemData);
                    showStatus("Error: Cannot delete item, invalid data.", 'error');
                    return;
                }
                openDeleteConfirmModal(basicItemData.id, basicItemData.title);
                break;

                case 'details':
                    const mediaType = basicItemData.mediaType || basicItemData.type; // Get type
                    const externalApiId = basicItemData.mediaId;
    
                    // Ensure we have the necessary ID to make the API call
                    if (!externalApiId) {
                        showStatus(`Cannot fetch details: Missing external media ID.`, 'error');
                        console.error("Missing externalApiId for details:", basicItemData);
                        await openDetailsModal(basicItemData, isLibraryItem);
                        return;
                    }
    
                    // Show loading state
                    openModal(infoModal, '<div class="modal-loading">Loading details... <div class="spinner"></div></div>');
    
                    try {
                        // Fetch detailed data using the CORRECT externalApiId
                        // This now works for all types handled by the backend route
                        const detailedData = await apiRequest(`/details/${mediaType}/${externalApiId}`);
    
                        // Merge basic data with detailed data
                        // (The merging logic should generally work as the backend now returns consistent fields)
                        const mergedData = {
                            ...basicItemData,
                            ...detailedData,
                            // Ensure core identifiers are correct
                            mediaType: mediaType,
                            mediaId: externalApiId, // Store the ID used for the lookup
                            // Use the normalized rating from the details API if available
                            rating: detailedData.rating ?? basicItemData.rating ?? null,
                            // Ensure description uses the one from details if available
                            description: detailedData.description ?? basicItemData.description ?? basicItemData.apiDescription ?? null,
    
                            // Preserve library-specific fields if it is one
                            ...(isLibraryItem && {
                                id: basicItemData.id, // Keep DB ID
                                userStatus: basicItemData.userStatus,
                                userRating: basicItemData.userRating,
                                userDescription: basicItemData.userDescription,
                                addedAt: basicItemData.addedAt,
                                watchedAt: basicItemData.watchedAt
                            })
                        };
    
                        // Open the modal with the complete data
                        await openDetailsModal(mergedData, isLibraryItem);
    
                    } catch (error) {
                         showStatus(`Failed to load details for "${basicItemData.title}". Showing basic info.`, 'error');
                         // On error loading details, fall back to showing basic info
                         await openDetailsModal(basicItemData, isLibraryItem);
                    }
                    break; // End case 'details'
        }
    }

    // Delegate clicks within the main info modal
    function handleInfoModalClick(event) {
        const target = event.target;

        // Close buttons
        if (target.matches('.modal-close-btn') || target.matches('.modal-cancel-btn')) {
            closeModal(infoModal);
        }
        // Handle actions *inside* the modal (e.g., if details modal has add/edit buttons)
        else if (target.matches('.action-add')) {
             const itemData = JSON.parse(target.closest('.modal-actions')?.dataset.itemJson || '{}');
             closeModal(infoModal); // Close details
             setTimeout(() => openItemFormModal('add', itemData), 50); // Open add form after small delay
        }
        else if (target.matches('.action-edit')) {
             const itemData = JSON.parse(target.closest('.modal-actions')?.dataset.itemJson || '{}');
             closeModal(infoModal);
             setTimeout(() => openItemFormModal('edit', itemData), 50);
        }
        else if (target.matches('.action-delete')) {
             const itemData = JSON.parse(target.closest('.modal-actions')?.dataset.itemJson || '{}');
             closeModal(infoModal);
             setTimeout(() => openDeleteConfirmModal(itemData.id, itemData.title), 50);
        }

        // Close on overlay click
        else if (target === infoModal) {
            closeModal(infoModal);
        }
    }

    // Handle Add/Edit Form Submission (inside infoModal)
    async function handleItemFormSubmit(event) {
        event.preventDefault();
        const form = event.target;
        const modalErrorEl = form.querySelector('.modal-error-message');
        modalErrorEl?.classList.add('hidden');
        showSpinner('modalSpinner', true); // Assuming a spinner exists in the modal

        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        // Get hidden core data needed for add/edit
        const mode = form.querySelector('#formMode')?.value;
        const itemId = form.querySelector('#itemId')?.value; // Will be empty string for 'add'
        const mediaId = form.querySelector('#mediaId')?.value;
        const mediaType = form.querySelector('#mediaType')?.value;
        const title = form.querySelector('#coreTitle')?.value;
        const imageUrl = form.querySelector('#coreImageUrl')?.value;
        const apiDescription = form.querySelector('#coreApiDescription')?.value;

        const payload = {
            userStatus: data.userStatus,
            userRating: data.userRating, // API handles parsing/validation
            userDescription: data.userDescription,
        };

        try {
            let result;
            if (mode === 'add') {
                // Add requires core media info + user info
                const addPayload = {
                    ...payload,
                    mediaId,
                    mediaType,
                    title,
                    imageUrl,
                    apiDescription
                };
                result = await apiRequest('/library', 'POST', addPayload);
                showStatus(`"${result.title}" added successfully!`, 'success');
            } else { // mode === 'edit'
                // Edit only sends fields to update
                result = await apiRequest(`/library/${itemId}`, 'PUT', payload);
                showStatus(`"${result.title}" updated successfully!`, 'success');
            }
            closeModal(infoModal);
            fetchLibrary(); // Refresh library view
        } catch (error) {
            // Display error within the modal
            const message = error.data?.message || error.message || 'Operation failed.';
            if (modalErrorEl) {
                modalErrorEl.textContent = message;
                modalErrorEl.classList.remove('hidden');
            } else {
                showStatus(message, 'error'); // Fallback to main status
            }
        } finally {
             showSpinner('modalSpinner', false);
        }
    }

    // Handle Delete Confirmation
    async function handleDeleteConfirm() {
        if (!itemToDeleteId) return;
        showSpinner('deleteSpinner', true); // Assuming spinner in delete modal

        try {
            await apiRequest(`/library/${itemToDeleteId}`, 'DELETE');
            showStatus(`Item deleted successfully.`, 'success');
            closeModal(deleteConfirmModal);
            fetchLibrary(); // Refresh library
        } catch (error) {
            // Error already shown by apiRequest
             showStatus(`Failed to delete item: ${error.message}`, 'error');
        } finally {
            itemToDeleteId = null; // Reset ID
            showSpinner('deleteSpinner', false);
        }
    }

    // Handle Library Fetching and Filtering
    async function fetchLibrary() {
        if (!resultsArea) return;
        showSpinner('librarySpinner', true);
        // Use placeholder rendering during load
        await renderItems([], resultsArea, 'mediaCard', { hidePlaceholder: true });
        resultsArea.classList.add('loading'); // Optional: for styling

        const params = new URLSearchParams();
        if (libraryControls) {
            // Get values directly from filter elements by ID
            const mediaTypeSelect = libraryControls.querySelector('#filterMediaType');
            const statusSelect = libraryControls.querySelector('#filterStatus');
            const minRatingInput = libraryControls.querySelector('#filterMinRating');
            const maxRatingInput = libraryControls.querySelector('#filterMaxRating');

            if (mediaTypeSelect?.value) {
                params.append('mediaType', mediaTypeSelect.value);
            }
            if (statusSelect?.value) {
                params.append('userStatus', statusSelect.value);
            }
            if (minRatingInput?.value) {
                params.append('minRating', minRatingInput.value);
            }
            if (maxRatingInput?.value) {
                params.append('maxRating', maxRatingInput.value);
            }
        }
        const queryParams = params.toString() ? `?${params.toString()}` : ''; // Add '?' only if params exist

        try {
            const items = await apiRequest(`/library${queryParams}`, 'GET');
            await renderItems(items, resultsArea, 'mediaCard', {
                 isSearchResult: false,
                 cardClass: 'library-card',
                 placeholder: 'Library is empty or filters match no items.'
             });
        } catch (error) {
            // Error already shown by apiRequest
            await renderItems([], resultsArea, 'mediaCard', {
                 isSearchResult: false,
                 cardClass: 'library-card',
                 placeholder: 'Error loading library.'
             });
        } finally {
            showSpinner('librarySpinner', false);
            resultsArea.classList.remove('loading');
        }
    }

    // Handle Search
    async function handleSearch(event) {
        event.preventDefault();
        if (!resultsArea || !searchForm) return;

        const queryInput = searchForm.querySelector('#searchQuery');
        const typeSelect = searchForm.querySelector('#searchType');
        const query = queryInput.value.trim();
        const type = typeSelect.value;

        if (!query) {
            showStatus('Please enter a search term.', 'error');
            queryInput.focus();
            return;
        }

        showSpinner('searchSpinner', true);
        await renderItems([], resultsArea, 'mediaCard', { hidePlaceholder: true }); // Clear previous results
        resultsArea.classList.add('loading');

        try {
            const results = await apiRequest(`/search?query=${encodeURIComponent(query)}&type=${type}`, 'GET');
            await renderItems(results, resultsArea, 'mediaCard', {
                 isSearchResult: true,
                 cardClass: 'result-card',
                 placeholder: 'No results found.'
             });
        } catch (error) {
            // Error handled by apiRequest
             await renderItems([], resultsArea, 'mediaCard', {
                 isSearchResult: true,
                 cardClass: 'result-card',
                 placeholder: 'Search failed.'
             });
        } finally {
            showSpinner('searchSpinner', false);
            resultsArea.classList.remove('loading');
        }
    }

    // Handle Login
    async function handleLogin(event) {
         event.preventDefault();
         const form = event.target;
         const username = form.username.value.trim();
         const password = form.password.value.trim();
         const errorEl = form.querySelector('#loginError') || form.querySelector('.form-error'); // General error element
         errorEl?.classList.add('hidden');

         if (!username || !password) {
            if(errorEl){ errorEl.textContent = 'Username and password required.'; errorEl.classList.remove('hidden'); }
             return;
         }

         try {
             showSpinner('loginSpinner', true); // Assuming spinner ID
             const result = await apiRequest('/auth/login', 'POST', { username, password });
             if (result && result.user) {
                 showStatus('Login successful! Redirecting...', 'success');
                 window.location.href = '/library'; // Redirect
             }
             // Shouldn't reach here if successful due to redirect, but good practice
         } catch (error) {
             const message = error.data?.message || error.message || 'Login failed.';
             if(errorEl){ errorEl.textContent = message; errorEl.classList.remove('hidden'); }
         } finally {
            showSpinner('loginSpinner', false);
         }
    }

    // Handle Registration
    async function handleRegister(event) {
        event.preventDefault();
        const form = event.target;
        const username = form.username.value.trim();
        const password = form.password.value.trim();
        const errorEl = form.querySelector('#registerError') || form.querySelector('.form-error');
        const messageEl = form.querySelector('#registerMessage') || form.querySelector('.form-message');
        errorEl?.classList.add('hidden');
        messageEl?.classList.add('hidden');


        if (!username || !password) {
             if(errorEl){ errorEl.textContent = 'Username and password required.'; errorEl.classList.remove('hidden'); }
             return;
         }
         if (password.length < 6) {
             if(errorEl){ errorEl.textContent = 'Password must be at least 6 characters.'; errorEl.classList.remove('hidden'); }
             return;
         }

         try {
             showSpinner('registerSpinner', true); // Assuming spinner ID
             const result = await apiRequest('/auth/register', 'POST', { username, password });
             if (messageEl) {
                messageEl.textContent = result.message || 'Registration successful! Please login.';
                messageEl.classList.remove('hidden');
             } else {
                 showStatus('Registration successful! Please login.', 'success');
             }
             form.reset(); // Clear form on success
         } catch (error) {
             const message = error.data?.message || error.message || 'Registration failed.';
              if(errorEl){ errorEl.textContent = message; errorEl.classList.remove('hidden'); }
         } finally {
             showSpinner('registerSpinner', false);
         }
    }

    // Handle Logout
    async function handleLogout() {
        try {
            showStatus('Logging out...', 'info');
            await apiRequest('/auth/logout', 'POST');
            showStatus('Logout successful. Redirecting...', 'success');
            window.location.href = '/'; // Redirect to home
        } catch (error) {
            // Error already shown by apiRequest
            showStatus('Logout failed.', 'error');
        }
    }

     // Helper to get valid statuses based on media type (client-side)
     function getValidStatuses(mediaType) {
        switch (mediaType?.toLowerCase()) {
            case 'movie':
            case 'series': return ['to watch', 'watching', 'watched'];
            case 'book': return ['to read', 'reading', 'read'];
            case 'video game': return ['to play', 'playing', 'played'];
            default: return ['to watch', 'watching', 'watched', 'to read', 'reading', 'read', 'to play', 'playing', 'played']; // Default or fallback
        }
    }

    // --- Initialization ---
    function initialize() {
        // Global Listeners
        logoutBtn?.addEventListener('click', handleLogout);

        // Use event delegation on main content area for dynamic elements
        mainContent?.addEventListener('click', handleMainContentClick);

        // Modal Listeners (delegated or direct)
        infoModal?.addEventListener('click', handleInfoModalClick);
        infoModal?.addEventListener('submit', (event) => { // Handle form submission inside modal
            if (event.target.id === 'itemForm') {
                handleItemFormSubmit(event);
            }
        });

        deleteConfirmModal?.addEventListener('click', (event) => {
            if (event.target.matches('#deleteConfirmBtn')) handleDeleteConfirm();
            if (event.target.matches('#deleteCancelBtn') || event.target.matches('#deleteModalCloseBtn') || event.target === deleteConfirmModal) {
                 closeModal(deleteConfirmModal);
                 itemToDeleteId = null; // Clear ID on cancel/close
            }
        });


        // Page Specific Initializations / Listeners
        if (searchForm) {
            searchForm.addEventListener('submit', handleSearch);
        }

        if (libraryControls) {
            // Use event delegation or listen to specific inputs for filtering
            libraryControls.addEventListener('change', fetchLibrary); // Fetch on any filter change
            libraryControls.addEventListener('input', (e) => { // Handle input for range filters if needed (debounced?)
                if (e.target.type === 'number') {
                     fetchLibrary(); // Basic fetch on number input change
                     // Add debounce here if API calls become too frequent
                }
            });
             libraryControls.querySelector('#getLibraryBtn')?.addEventListener('click', fetchLibrary); // Refresh button

            // Initial library load on library page
            if (window.location.pathname === '/library') {
                fetchLibrary();
            }
        }

        if (loginForm) {
            loginForm.addEventListener('submit', handleLogin);
        }
        if (registerForm) {
            registerForm.addEventListener('submit', handleRegister);
        }

        console.log('MediaTracker Initialized.');
    }

    // Wait for DOM content to be loaded before initializing
    document.addEventListener('DOMContentLoaded', initialize);

})();
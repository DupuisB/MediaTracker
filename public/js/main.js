// public/js/main.js

// --- IIFE to encapsulate code ---
(function() {
    // --- Configuration ---
    const API_BASE_URL = '/api'; // Relative URL

    // --- State ---
    let compiledTemplates = {}; // Cache for compiled Handlebars templates

    // --- DOM Elements (Cache elements present on load) ---
    const resultsArea = document.getElementById('resultsArea');
    const statusMessage = document.getElementById('statusMessage');
    const responseArea = document.getElementById('responseArea');
    const statusSection = document.getElementById('statusSection'); // To hide/show
    const logoutBtn = document.getElementById('logoutBtn');

    // Elements potentially added/removed or specific to pages
    const getSearchForm = () => document.getElementById('searchForm');
    const getLibraryControls = () => document.getElementById('libraryControls');
    const getResultsArea = () => document.getElementById('resultsArea');
    const getLoginForm = () => document.getElementById('loginForm');
    const getRegisterForm = () => document.getElementById('registerForm');
    const getAddItemModal = () => document.getElementById('addItemModal');
    const getModalContentArea = () => document.getElementById('modalContentArea');
    const getInfoModal = () => document.getElementById('infoModal');
    const getModalOverlay = () => document.getElementById('infoModal');
    
    // --- Handlebars Setup & Helpers ---
    // Register helpers needed by mediaCard.hbs, addItemModal.hbs etc.
    // These are simple examples, use a library like Moment.js/date-fns for robust date formatting
    Handlebars.registerHelper('formatYear', function(dateString) {
        return dateString ? new Date(dateString).getFullYear() : '';
    });
     Handlebars.registerHelper('formatDate', function(dateString) {
        return dateString ? new Date(dateString).toLocaleDateString() : '';
    });
    Handlebars.registerHelper('join', function(arr, separator) {
        return Array.isArray(arr) ? arr.join(separator) : '';
    });
    Handlebars.registerHelper('truncate', function(str, len) {
        if (str && str.length > len) {
            return str.substring(0, len) + '...';
        }
        return str;
    });
    Handlebars.registerHelper('classify', function(str) {
        // Basic helper to create CSS class from status (e.g., "to watch" -> "to-watch")
         return typeof str === 'string' ? str.replace(/\s+/g, '-').toLowerCase() : '';
    });
     Handlebars.registerHelper('capitalize', function(str) {
         return typeof str === 'string' ? str.charAt(0).toUpperCase() + str.slice(1) : '';
    });
    // Add to Handlebars helpers registration in main.js
    Handlebars.registerHelper('defaultIfEmpty', function(value1, value2) {
        return value1 || value2 || '';
    });
    // Register a custom helper to check equality
    Handlebars.registerHelper('eq', function(arg1, arg2) {
        return arg1 === arg2;
    });


    // Function to fetch and compile a Handlebars template (with caching)
    async function getTemplate(templateName) {
        if (compiledTemplates[templateName]) {
            return compiledTemplates[templateName];
        }
        try {
            // Use the /templates/:templateName route we created
            const response = await fetch(`/templates/${templateName}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch template: ${templateName} (${response.status})`);
            }
            const templateString = await response.text();
            compiledTemplates[templateName] = Handlebars.compile(templateString);
            return compiledTemplates[templateName];
        } catch (error) {
            console.error(`Error getting template ${templateName}:`, error);
            displayStatus(`Error loading template ${templateName}.`, true);
            return null; // Indicate failure
        }
    }

    // --- Helper Functions ---
    function displayStatus(message, isError = false, isSuccess = false) {
        if (!statusMessage) return; // Element might not exist on all pages
        statusMessage.textContent = `Status: ${message}`;
        statusMessage.className = isError ? 'error' : (isSuccess ? 'success' : '');
        statusSection?.classList.remove('hidden'); // Show status section on message
        console.log(message);
    }

    function displayResponse(data) {
         if (!responseArea) return;
        try {
            responseArea.textContent = JSON.stringify(data, null, 2);
        } catch (e) {
            responseArea.textContent = String(data);
        }
    }

    function showSpinner(spinnerId) {
        document.getElementById(spinnerId)?.classList.remove('hidden');
    }
    function hideSpinner(spinnerId) {
        document.getElementById(spinnerId)?.classList.add('hidden');
    }


    // --- API Request Function (Handles Cookies Automatically) ---
    async function makeApiRequest(endpoint, method = 'GET', body = null) {
        displayStatus('Sending request...');
        showSpinner(endpoint.includes('library') ? 'librarySpinner' : 'searchSpinner'); // Show relevant spinner
        const url = `${API_BASE_URL}${endpoint}`;
        const options = {
            method: method,
            headers: {} // No Authorization header needed, cookies handled by browser
        };

        if (body) {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(body);
        }

        try {
            const response = await fetch(url, options);
            let responseData;

            // Handle different success statuses
             if (response.status === 204) { // No Content (e.g., DELETE)
                responseData = { message: 'Operation successful.' }; // Create success data
            } else if (response.ok) { // 200, 201
                responseData = await response.json();
            } else { // Handle HTTP errors (4xx, 5xx)
                 responseData = await response.json().catch(() => ({ message: `HTTP error ${response.status}` })); // Try to parse error JSON
                 const errorMessage = responseData?.message || `Request failed with status: ${response.status}`;
                 throw new Error(errorMessage); // Throw error to be caught below
            }

            displayResponse(responseData);
            displayStatus(`${method} ${endpoint} - Success!`, false, true); // Mark as success
            return responseData;

        } catch (error) {
            console.error('API Request Error:', error);
            const errorMsg = error.message || 'An unknown API error occurred.';
            displayStatus(`Error: ${errorMsg}`, true);
            displayResponse({ error: errorMsg }); // Show error in response area
            // Specific handling for auth errors (redirect to login)
            if (error.message.includes('Access denied') || error.message.includes('expired') || error.message.includes('Invalid token')) {
                 // Wait a moment for user to see message, then redirect
                 setTimeout(() => {
                    window.location.href = '/login'; // Redirect to login page
                 }, 1500);
            }
            return null; // Indicate failure
        } finally {
             hideSpinner(endpoint.includes('library') ? 'librarySpinner' : 'searchSpinner'); // Hide spinner
        }
    }

     // --- REFINED: renderResults to add data to card ---
     async function renderResults(items, targetElement, templateName, cardClass, placeholderText) {
        if (!targetElement) return;
        targetElement.innerHTML = ''; // Clear previous
        targetElement.classList.remove('loading');

        const template = await getTemplate(templateName); // Use mediaCard template
        if (!template) {
            targetElement.innerHTML = `<p class="placeholder-text error">Error loading display template.</p>`;
            return;
        }

        // Render items one by one to attach data easily
        if (!items || items.length === 0) {
             targetElement.innerHTML = `<p class="placeholder-text">${placeholderText}</p>`;
             return;
        }

        items.forEach(item => {
             const itemForTemplate = {
                ...item,
                // Ensure consistent naming
                apiDescription: item.description || item.apiDescription || '',
                mediaType: item.type || item.mediaType,
             };

            const html = template({ // Render single item
                items: [itemForTemplate], // Pass as array for the #each block
                cardClass: cardClass,
                isSearchResult: cardClass === 'result-card'
             });

            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html.trim(); // Render into temporary div
            const cardElement = tempDiv.firstChild; // Get the rendered card element

            if (cardElement) {
                // Attach the full original item data to the card element
                cardElement.dataset.itemData = JSON.stringify(item); // <<< Store data here
                targetElement.appendChild(cardElement); // Add card to the results area
            }
        });

        attachCardListeners(targetElement); // Attach listeners after all cards are added
    }

    // --- NEW: Function to attach listeners to cards ---
    function attachCardListeners(parentElement) {
        parentElement.querySelectorAll('.result-card, .library-card').forEach(card => {
            // Store item data directly on the card element
            const button = card.querySelector('.add-to-library-btn, .edit-library-item-btn'); // Find a button to get initial data string
            if (button) {
                // Find the corresponding item data using mediaId or id
                const item = JSON.parse(button.closest('.result-card, .library-card').querySelector('.add-to-library-btn, .edit-library-item-btn,[data-id]')?.closest('.result-card, .library-card')?.dataset.itemData || '{}'); // Need a better way to get data back if button isn't the source

                // Let's refine renderResults to add data directly to card
            }


            card.addEventListener('click', handleCardClick);
            // Prevent card click if a button inside was clicked
            card.querySelectorAll('button, a, details, summary, input, select, textarea').forEach(interactiveElement => {
                interactiveElement.addEventListener('click', (event) => {
                    event.stopPropagation(); // Stop click from bubbling up to the card
                });
            });
        });
    }
   
    // --- Event Handlers ---
    async function handleLogout(event) {
        event.preventDefault();
        const result = await makeApiRequest('/auth/logout', 'POST');
        if (result) {
            displayStatus('Logout successful. Redirecting...', false, true);
            // Redirect to home page after logout
            window.location.href = '/';
        }
    }

    async function handleRegister(event) {
        event.preventDefault();
        const form = event.target;
        const username = form.username.value.trim();
        const password = form.password.value.trim();
        // Get elements reliably
        const errorEl = document.getElementById('registerError');
        const messageEl = document.getElementById('registerMessage');
    
        // Hide messages initially IF elements exist
        if(errorEl) errorEl.classList.add('hidden');
        if(messageEl) messageEl.classList.add('hidden');
    
        // --- Validation ---
        if (!username || !password) return displayStatus('Username and password required.', true);
        if (password.length < 6) {
            if (errorEl) { // Check if element exists before setting text
                errorEl.textContent = 'Password must be at least 6 characters.';
                errorEl.classList.remove('hidden');
            } else {
                 displayStatus('Password must be at least 6 characters.', true); // Fallback status
            }
            return;
        }
    
        // --- API Call ---
        const result = await makeApiRequest('/auth/register', 'POST', { username, password });
    
        // --- Handle Response ---
        if (result) {
            if (messageEl) { // Check if element exists
                messageEl.textContent = result.message || `User ${username} registered! Please login.`;
                messageEl.classList.remove('hidden');
            } else {
                displayStatus(result.message || `User ${username} registered! Please login.`, false, true); // Fallback
            }
            form.reset();
        } else {
             // Display error from status or response
             const apiErrorMsg = statusMessage.textContent.includes('Error:')
                               ? statusMessage.textContent.replace('Status: Error: ', '')
                               : 'Registration failed. Please try again.';
             if (errorEl) { // Check if element exists
                 errorEl.textContent = apiErrorMsg;
                 errorEl.classList.remove('hidden');
             } else {
                 displayStatus(apiErrorMsg, true); // Fallback
             }
        }
    }
    
    async function handleLogin(event) {
        event.preventDefault();
        const form = event.target;
        const username = form.username.value.trim();
        const password = form.password.value.trim();
        const errorEl = document.getElementById('loginError');
        errorEl?.classList.add('hidden');

        if (!username || !password) return displayStatus('Username and password required.', true);

        const result = await makeApiRequest('/auth/login', 'POST', { username, password });
        if (result && result.user) {
            displayStatus('Login successful! Redirecting...', false, true);
            // Redirect to library page after successful login
            window.location.href = '/library';
        } else {
            errorEl.textContent = statusMessage.textContent.replace('Status: Error: ',''); // Display API error
            errorEl.classList.remove('hidden');
        }
    }

    async function handleSearch(event) {
        event.preventDefault();
        const form = event.target;
        const query = form.querySelector('#searchQuery').value.trim();
        const type = form.querySelector('#searchType').value;
        const resultsTarget = getResultsArea();

        if (!query) return displayStatus('Search query required.', true);
        if (!resultsTarget) return; // Should be on library page

        resultsTarget.classList.add('loading');
        resultsTarget.innerHTML = '<p class="placeholder-text">Searching...</p>';

        const results = await makeApiRequest(`/search?query=${encodeURIComponent(query)}&type=${type}`, 'GET');

        if (results !== null) {
            renderResults(results, resultsTarget, 'mediaCard', 'result-card', 'No results found.');
        } else {
            renderResults([], resultsTarget, 'mediaCard', 'result-card', 'Failed to fetch search results.');
        }
    }

    // --- NEW: Handle click on a media card (not buttons inside) ---
    function handleCardClick(event) {
        const card = event.currentTarget; // The card element itself
        const itemDataString = card.dataset.itemData;
        if (!itemDataString) {
            console.error('Could not find item data on clicked card.');
            return;
        }
        try {
            const item = JSON.parse(itemDataString);
            console.log('Card clicked, item data:', item);
                // Determine if it's a library item or search result
            const isLibrary = card.classList.contains('library-card');
            openDetailsModal(item, isLibrary);
        } catch (e) {
                console.error('Failed to parse item data from card:', e);
        }
    }
    
    async function fetchLibrary() {
        const resultsTarget = getResultsArea();
        if (!resultsTarget) return; // Not on library page

        resultsTarget.classList.add('loading');
        resultsTarget.innerHTML = '<p class="placeholder-text">Loading library...</p>';

        // Build query string from filters
        const controls = getLibraryControls();
        let queryParams = [];
        if(controls){
             const mediaType = controls.querySelector('#filterMediaType').value;
             const status = controls.querySelector('#filterStatus').value;
             const minRating = controls.querySelector('#filterMinRating').value;
             const maxRating = controls.querySelector('#filterMaxRating').value;
             if (mediaType) queryParams.push(`mediaType=${mediaType}`);
             if (status) queryParams.push(`userStatus=${status}`);
             if (minRating) queryParams.push(`minRating=${minRating}`);
             if (maxRating) queryParams.push(`maxRating=${maxRating}`);
        }
        const queryString = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';

        const items = await makeApiRequest(`/library${queryString}`, 'GET');
        if (items !== null) {
            renderResults(items, resultsTarget, 'mediaCard', 'library-card', 'Your library is empty.');
        } else {
             renderResults([], resultsTarget, 'mediaCard', 'library-card', 'Could not load library.');
        }
    }

    // --- Modal Handling ---
    async function openAddItemModal(data) {
        const modal = getAddItemModal();
        const contentArea = getModalContentArea();
        if (!modal || !contentArea) return;

        contentArea.innerHTML = 'Loading...'; // Placeholder while template loads
        modal.classList.remove('hidden'); // Show modal structure immediately

        const template = await getTemplate('addItemModal');
        if (!template) {
            contentArea.innerHTML = '<p class="error">Error loading modal content.</p>';
            return;
        }

        console.log(data.mediaType); // Debugging line
        console.log(getValidStatuses(data.mediaType)); // Debugging line
        // Prepare data for the modal template
        const templateData = {
            itemTitle: data.title,
            mediaId: data.mediaId,
            mediaType: data.mediaType,
            imageUrl: data.imageUrl,
            apiDescription: data.apiDescription,
            validStatuses: getValidStatuses(data.mediaType)
        };

        contentArea.innerHTML = template(templateData);

        // Add specific listeners for the newly added modal elements
        contentArea.querySelector('#addItemForm')?.addEventListener('submit', handleAddItemSubmit);
        contentArea.querySelector('#modalCloseBtn')?.addEventListener('click', closeAddItemModal);
        contentArea.querySelector('#modalCancelBtn')?.addEventListener('click', closeAddItemModal);
    }

    // --- NEW: Open Details Modal ---
    async function openDetailsModal(item, isLibraryItem) {
        const modal = getInfoModal(); // Target the generic modal overlay
        const contentArea = modal?.querySelector('#modalContentArea'); // Target content area
        if (!modal || !contentArea) return;

        contentArea.innerHTML = 'Loading details...';
        modal.classList.remove('hidden'); // Show modal overlay

        const template = await getTemplate('mediaDetailsModal');
        if (!template) {
             contentArea.innerHTML = '<p class="error">Error loading details template.</p>';
             return;
        }

        // Prepare data for the details template
        const templateData = {
            item: {
                ...item,
                // Ensure consistent naming used by the template
                mediaType: item.type || item.mediaType,
                apiDescription: item.description || item.apiDescription || ''
            },
            isLibraryItem: isLibraryItem
        };

        contentArea.innerHTML = template(templateData);

        // Add listeners for elements INSIDE the details modal
        contentArea.querySelector('#modalCloseBtn')?.addEventListener('click', closeInfoModal);
        contentArea.querySelector('#modalCancelBtn')?.addEventListener('click', closeInfoModal); // Close button

        // Re-attach handlers for action buttons IF they exist in this modal
        contentArea.querySelector('.add-to-library-btn')?.addEventListener('click', handleOpenAddItemModalFromDetails); // Special handler needed
        contentArea.querySelector('.edit-library-item-btn')?.addEventListener('click', handleEditLibraryItem);
        contentArea.querySelector('.delete-library-item-btn')?.addEventListener('click', handleDeleteLibraryItem);
    }

    // --- NEW: Close Generic Info Modal ---
    function closeInfoModal() {
        const modal = getInfoModal();
        modal?.classList.add('hidden');
        const contentArea = modal?.querySelector('#modalContentArea');
        if(contentArea) contentArea.innerHTML = ''; // Clear content
    }


    // --- NEW: Handler to open ADD modal from DETAILS modal ---
    function handleOpenAddItemModalFromDetails(event) {
        const button = event.target.closest('.add-to-library-btn');
        if (!button) return;
         // Data is already on the button from the details template rendering
        const itemData = {
            mediaId: button.dataset.mediaId,
            mediaType: button.dataset.mediaType,
            title: button.dataset.title,
            imageUrl: button.dataset.imageUrl,
            apiDescription: button.dataset.apiDescription,
        };
         closeInfoModal(); // Close the details modal first
         // Short delay to allow closing animation
         setTimeout(() => {
             openAddItemModal(itemData); // Now open the add item modal
         }, 100); // Adjust delay if needed
    }

     function closeAddItemModal() {
        const modal = getAddItemModal();
        modal?.classList.add('hidden');
        const contentArea = getModalContentArea();
        if(contentArea) contentArea.innerHTML = ''; // Clear content
    }

    async function handleOpenModalClick(event) {
        const button = event.target.closest('.add-to-library-btn'); // Find button even if icon inside is clicked
        if (!button) return;

        const itemData = {
            mediaId: button.dataset.mediaId,
            mediaType: button.dataset.mediaType,
            title: button.dataset.title,
            imageUrl: button.dataset.imageUrl,
            apiDescription: button.dataset.apiDescription,
        };
        openAddItemModal(itemData);
    }

     async function handleAddItemSubmit(event) {
        event.preventDefault();
        const form = event.target;
        const modalError = form.querySelector('#modalError');
        modalError?.classList.add('hidden');

        const userStatus = form.querySelector('#modalUserStatus').value;
        const userRatingInput = form.querySelector('#modalUserRating').value;
        const userDescription = form.querySelector('#modalUserDescription').value.trim();

        const mediaId = form.querySelector('#modalMediaId').value;
        const mediaType = form.querySelector('#modalMediaType').value;
        const title = form.querySelector('#modalTitleData').value;
        const imageUrl = form.querySelector('#modalImageUrlData').value;
        const apiDescription = form.querySelector('#modalApiDescriptionData').value;

        let userRating = null;
        if (userRatingInput) {
            userRating = parseInt(userRatingInput, 10);
            if (isNaN(userRating) || userRating < 1 || userRating > 20) {
                modalError.textContent = 'Rating must be between 1 and 20.';
                modalError.classList.remove('hidden');
                return;
            }
        }
        // Construct payload for API
        const payload = {
            mediaId, mediaType, title, imageUrl, apiDescription, // Core data
            userStatus, // User input
            ...(userRating !== null && { userRating }), // Optional user input
            ...(userDescription && { userDescription }) // Optional user input
        };

        const result = await makeApiRequest('/library', 'POST', payload);

        if (result) {
            displayStatus(`"${title}" added to library!`, false, true);
            closeAddItemModal();
            fetchLibrary();
        } else {
             if(modalError){
                 modalError.textContent = statusMessage.textContent.replace('Status: Error: ', '');
                 modalError.classList.remove('hidden');
             }
        }
    }

    // --- Edit/Delete Handlers (Keep prompt-based for brevity, or upgrade later) ---
    async function handleEditLibraryItem(event) {
        const button = event.target.closest('.edit-library-item-btn');
        if (!button) return;
        const itemId = button.dataset.id;
        closeInfoModal();
        // In a real app, you'd fetch the item details first to pre-fill prompts
        // and know the mediaType to validate status.
        // For simplicity, we'll ask for everything again.

        const userStatus = prompt(`Enter new status (e.g., watched, reading, playing) or leave blank for no change:`);
        const userRatingInput = prompt(`Enter new rating (1-20) or leave blank for no change:`);
        const userDescription = prompt(`Enter new description or leave blank for no change:`);

        const updateData = {};
        if (userStatus) updateData.userStatus = userStatus.trim().toLowerCase(); // Basic validation needed based on type!
        if (userRatingInput) {
            const rating = parseInt(userRatingInput, 10);
             if (!isNaN(rating) && rating >= 1 && rating <= 20) {
                updateData.userRating = rating;
             } else {
                 return displayStatus('Invalid rating entered.', true);
             }
        }
        // Allow setting description to empty string if user enters something then clears it?
        // Current prompt returns null if cancelled, empty string if OK'd with no text.
        if (userDescription !== null) { // Check if prompt wasn't cancelled
             updateData.userDescription = userDescription.trim();
        }


        if (Object.keys(updateData).length === 0) {
             return displayStatus('No changes entered.');
        }

         // ** Crucial: Backend needs to validate status based on item's mediaType **
         // Frontend can't easily do this without fetching item first.

        const result = await makeApiRequest(`/library/${itemId}`, 'PUT', updateData, true);
        if (result) {
            displayStatus(`Library item ${itemId} updated.`);
            fetchLibrary(); // Refresh view
        }
     }


    async function handleDeleteLibraryItem(event) {
         const button = event.target.closest('.delete-library-item-btn');
        if (!button) return;
        const itemId = button.dataset.id;
        closeInfoModal();
        if (!confirm(`Are you sure you want to delete library item ${itemId}?`)) return;

        const result = await makeApiRequest(`/library/${itemId}`, 'DELETE');
        if (result) {
            displayStatus(`Library item ${itemId} deleted.`, false, true);
            fetchLibrary(); // Refresh view
        }
    }

     // --- Helper to get valid statuses (no changes) ---
     function getValidStatuses(mediaType) {
        switch (mediaType) {
            case 'movie':
            case 'series': return ['to watch', 'watching', 'watched'];
            case 'book': return ['to read', 'reading', 'read'];
            case 'video game': return ['to play', 'playing', 'played'];
            default: return [];
        }
    }

    // --- Initialize Page ---
    function initializePage() {
        console.log('Initializing page...');

        // Global Listeners
        logoutBtn?.addEventListener('click', handleLogout);
        getAddItemModal()?.addEventListener('click', (event) => { // Close modal on overlay click
            if (event.target === getAddItemModal()) closeAddItemModal();
        });

        // Page Specific Listeners
        const pathname = window.location.pathname;

        if (pathname === '/login') {
            getLoginForm()?.addEventListener('submit', handleLogin);
            getRegisterForm()?.addEventListener('submit', handleRegister);
        } else if (pathname === '/library') {
            getSearchForm()?.addEventListener('submit', handleSearch);
            const controls = getLibraryControls();
            if (controls) {
                controls.querySelector('#getLibraryBtn')?.addEventListener('click', fetchLibrary);
                controls.querySelector('#filterMediaType')?.addEventListener('change', fetchLibrary);
                controls.querySelector('#filterStatus')?.addEventListener('change', fetchLibrary);
                controls.querySelector('#filterMinRating')?.addEventListener('input', fetchLibrary); // Use input for faster feedback? Debounce?
                controls.querySelector('#filterMaxRating')?.addEventListener('input', fetchLibrary);
            }

            // Event delegation for dynamic results area content
            const resultsTarget = getResultsArea();
            resultsTarget?.addEventListener('click', handleOpenModalClick);
            resultsTarget?.addEventListener('click', handleEditLibraryItem);
            resultsTarget?.addEventListener('click', handleDeleteLibraryItem);

            // Initial library load
            fetchLibrary();
        }
    }

    // --- Run Initialization ---
    initializePage();

})(); // End IIFE
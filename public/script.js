document.addEventListener('DOMContentLoaded', () => {
    // --- Configuration ---
    const API_BASE_URL = '/api'; // Relative URL since frontend is served by backend

    // --- State ---
    let jwtToken = localStorage.getItem('jwtToken') || null;

    // --- DOM Elements ---
    const authStatusDiv = document.getElementById('authStatus');
    const authUsernameSpan = authStatusDiv.querySelector('span');
    const logoutBtn = document.getElementById('logoutBtn');
    const authSection = document.getElementById('authSection');
    const loggedInSection = document.getElementById('loggedInContent');

    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const searchForm = document.getElementById('searchForm');

    const resultsArea = document.getElementById('resultsArea');
    const statusMessage = document.getElementById('statusMessage');
    const responseArea = document.getElementById('responseArea');

    const getLibraryBtn = document.getElementById('getLibraryBtn');
    const filterMediaTypeSelect = document.getElementById('filterMediaType');
    const filterStatusSelect = document.getElementById('filterStatus');
    const filterMinRatingInput = document.getElementById('filterMinRating');
    const filterMaxRatingInput = document.getElementById('filterMaxRating');

    const addItemModal = document.getElementById('addItemModal');
    const modalCloseBtn = document.getElementById('modalCloseBtn');
    const modalCancelBtn = document.getElementById('modalCancelBtn');
    const addItemForm = document.getElementById('addItemForm');
    const modalTitle = document.getElementById('modalTitle');
    const modalUserStatusSelect = document.getElementById('modalUserStatus');
    const modalUserRatingInput = document.getElementById('modalUserRating');
    const modalUserDescription = document.getElementById('modalUserDescription');
    const modalError = document.getElementById('modalError');
    
    // Hidden inputs for data passing
    const modalMediaIdInput = document.getElementById('modalMediaId');
    const modalMediaTypeInput = document.getElementById('modalMediaType');
    const modalTitleDataInput = document.getElementById('modalTitleData');
    const modalImageUrlDataInput = document.getElementById('modalImageUrlData');
    const modalApiDescriptionDataInput = document.getElementById('modalApiDescriptionData');


    // --- Helper Functions ---
    function displayStatus(message, isError = false) {
        statusMessage.textContent = `Status: ${message}`;
        statusMessage.className = isError ? 'error' : '';
        console.log(message);
    }

    function displayResponse(data) {
        try {
            responseArea.textContent = JSON.stringify(data, null, 2);
        } catch (e) {
            responseArea.textContent = data;
        }
    }

    function updateLoginStatus() {
        const username = localStorage.getItem('username'); // Store username on login
        if (jwtToken && username) {
            authUsernameSpan.textContent = `Logged in as ${username}`;
            logoutBtn.classList.remove('hidden');
            authSection.classList.add('hidden');
            loggedInSection.classList.remove('hidden');
        } else {
            authUsernameSpan.textContent = 'Not logged in';
            logoutBtn.classList.add('hidden');
            authSection.classList.remove('hidden');
            loggedInSection.classList.add('hidden');
            jwtToken = null; // Ensure token is cleared if username is missing
            localStorage.removeItem('jwtToken');
            localStorage.removeItem('username');
            clearResults(); // Clear results on logout
        }
    }

    function clearResults() {
        resultsArea.innerHTML = `<p class="placeholder-text">Search for media or view your library.</p>`;
    }

    async function makeApiRequest(endpoint, method = 'GET', body = null, requireAuth = true) {
        displayStatus('Sending request...');
        const url = `${API_BASE_URL}${endpoint}`;
        const options = {
            method: method,
            headers: {}
        };

        if (requireAuth) {
            if (!jwtToken) {
                displayStatus('Error: Authentication required. Please login.', true);
                updateLoginStatus(); // Force UI update if token missing
                return null;
            }
            options.headers['Authorization'] = `Bearer ${jwtToken}`;
        }

        if (body) {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(body);
        }

        try {
            const response = await fetch(url, options);
            let responseData;
            // Handle potential 204 No Content for DELETE
            if (response.status === 204) {
                responseData = { message: 'Operation successful (No Content).' } // Create dummy data for consistency
            } else {
                responseData = await response.json(); // Assume JSON for other responses
            }


            displayResponse(responseData); // Display response first

            if (!response.ok) {
                 // Handle expired token specifically
                if (response.status === 401 && responseData.message?.includes('expired')) {
                    displayStatus('Session expired. Please login again.', true);
                    handleLogout(); // Log the user out
                    return null;
                 }
                const errorMessage = responseData?.message || `HTTP error! Status: ${response.status}`;
                throw new Error(errorMessage);
            }

            displayStatus(`${method} ${endpoint} - Success!`);
            return responseData;

        } catch (error) {
            console.error('API Request Error:', error);
            displayStatus(`Error: ${error.message}`, true);
            // Display error details if available from parsed response, otherwise just the error message
            displayResponse(error.response || { error: error.message });
            return null;
        }
    }

    // --- Rendering Functions ---
    function renderSearchResults(results) {
        resultsArea.innerHTML = ''; // Clear previous results
        if (!results || results.length === 0) {
            resultsArea.innerHTML = '<p class="placeholder-text">No results found.</p>';
            return;
        }

        results.forEach(item => {
            const card = document.createElement('div');
            card.className = 'result-card';
            // Store ALL relevant data in data-* attributes
            card.innerHTML = `
                <img src="${item.imageUrl || './placeholder.png'}" alt="${item.title || 'No Title'}" class="card-image ${!item.imageUrl ? 'no-image' : ''}" onerror="this.onerror=null; this.src='./placeholder.png';">
                <div class="card-content">
                    <h3 class="card-title">${item.title || 'N/A'}</h3>
                    <p class="card-meta">
                        <span>${item.type ? item.type.charAt(0).toUpperCase() + item.type.slice(1) : 'N/A'}</span>
                        ${item.releaseDate ? `<span>Released: ${item.releaseDate.split('-')[0]}</span>` : ''}
                        ${item.rating ? `<span>API Rating: ${item.rating}/20</span>` : ''}
                        ${item.authors ? `<span>Author(s): ${item.authors.join(', ')}</span>` : ''}
                    </p>
                    <p class="card-description">${item.description || 'No description available.'}</p>
                    <div class="card-actions">
                        <button class="btn btn-primary btn-small add-to-library-btn"
                                data-media-id="${item.id}"
                                data-media-type="${item.type}"
                                data-title="${item.title || ''}"
                                data-image-url="${item.imageUrl || ''}"
                                data-api-description="${item.description || ''}"
                                >Add to Library</button>
                    </div>
                </div>
            `;
            resultsArea.appendChild(card);
        });
    }

    function renderLibraryItems(items) {
        resultsArea.innerHTML = ''; // Clear previous results
        if (!items || items.length === 0) {
            resultsArea.innerHTML = '<p class="placeholder-text">Your library is empty. Add items from search results!</p>';
            return;
        }

        items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'library-card';
            // NOW use the stored title and imageUrl
            card.innerHTML = `
                 <img src="${item.imageUrl || './placeholder.png'}" alt="${item.title || 'No Title'}" class="card-image ${!item.imageUrl ? 'no-image' : ''}" onerror="this.onerror=null; this.src='./placeholder.png';">
                <div class="card-content">
                    <h3 class="card-title">${item.title || `Item ${item.mediaId}`} (${item.mediaType})</h3>
                    <p class="card-meta">
                        <span>Status: <strong>${item.userStatus || 'N/A'}</strong></span>
                        ${item.userRating !== null ? `<span>My Rating: ${item.userRating}/20</span>` : ''}
                        <span>Added: ${new Date(item.addedAt).toLocaleDateString()}</span>
                        ${item.watchedAt ? `<span>Completed: ${new Date(item.watchedAt).toLocaleDateString()}</span>` : ''}
                    </p>
                    <p class="card-description"><strong>My Notes:</strong> ${item.userDescription || 'None'}</p>
                    ${item.apiDescription ? `<details class="api-desc-details"><summary>Original Description</summary><p>${item.apiDescription}</p></details>` : ''}
                    <div class="card-actions">
                         <button class="btn btn-secondary btn-small edit-library-item-btn" data-id="${item.id}">Edit</button>
                         <button class="btn btn-danger btn-small delete-library-item-btn" data-id="${item.id}">Delete</button>
                    </div>
                </div>
            `;
            resultsArea.appendChild(card);
        });
    }

         // --- Modal Handling Functions ---
         function openAddItemModal(data) {
            // Populate hidden fields
            modalMediaIdInput.value = data.mediaId;
            modalMediaTypeInput.value = data.mediaType;
            modalTitleDataInput.value = data.title;
            modalImageUrlDataInput.value = data.imageUrl;
            modalApiDescriptionDataInput.value = data.apiDescription;
    
            // Set visible title
            modalTitle.textContent = `Add "${data.title}"`;
    
            // Populate status dropdown
            populateStatusDropdown(modalUserStatusSelect, data.mediaType);
    
            // Reset form fields & error
            addItemForm.reset();
            modalError.classList.add('hidden');
            modalError.textContent = '';
    
            // Show modal
            addItemModal.classList.remove('hidden');
        }
    
        function closeAddItemModal() {
            addItemModal.classList.add('hidden');
            // Optional: Clear fields again on close just in case
             addItemForm.reset();
             modalError.classList.add('hidden');
             modalError.textContent = '';
        }
    
        function populateStatusDropdown(selectElement, mediaType) {
            selectElement.innerHTML = ''; // Clear existing
            const statuses = getValidStatuses(mediaType);
            if (!statuses.length) {
                selectElement.disabled = true;
                selectElement.innerHTML = '<option>Invalid Type</option>';
                return;
            }
            selectElement.disabled = false;
            statuses.forEach(status => {
                const option = document.createElement('option');
                option.value = status;
                option.textContent = status.charAt(0).toUpperCase() + status.slice(1);
                selectElement.appendChild(option);
            });
        }
    
    // --- Event Handlers ---
    function handleLogout() {
        jwtToken = null;
        localStorage.removeItem('jwtToken');
        localStorage.removeItem('username');
        updateLoginStatus();
        displayStatus('Logged out successfully.');
    }

    async function handleRegister(event) {
        event.preventDefault();
        const username = document.getElementById('regUsername').value.trim();
        const password = document.getElementById('regPassword').value.trim();
        if (!username || !password) return displayStatus('Username and password required.', true);
        if (password.length < 6) return displayStatus('Password must be at least 6 characters.', true);

        const result = await makeApiRequest('/auth/register', 'POST', { username, password }, false);
        if (result) {
            displayStatus(`User ${result.username} registered! Please login.`);
            registerForm.reset();
            // Optionally switch to login tab/focus login fields
        }
    }

    async function handleLogin(event) {
        event.preventDefault();
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value.trim();
        if (!username || !password) return displayStatus('Username and password required.', true);

        const result = await makeApiRequest('/auth/login', 'POST', { username, password }, false);
        if (result && result.token) {
            jwtToken = result.token;
            localStorage.setItem('jwtToken', jwtToken);
            localStorage.setItem('username', result.user.username); // Store username
            updateLoginStatus();
            displayStatus('Login successful!');
            loginForm.reset();
            // Automatically fetch library after login?
            fetchLibrary();
        }
    }

    async function handleSearch(event) {
        event.preventDefault();
        const query = document.getElementById('searchQuery').value.trim();
        const type = document.getElementById('searchType').value;
        if (!query) return displayStatus('Search query required.', true);

        const results = await makeApiRequest(`/search?query=${encodeURIComponent(query)}&type=${type}`, 'GET', null, false); // Search doesn't require auth
        if (results !== null) { // Check for null in case of API errors
            renderSearchResults(results);
        } else {
             resultsArea.innerHTML = '<p class="placeholder-text">Failed to fetch search results.</p>';
        }
    }

    async function fetchLibrary() {
        let queryParams = [];
        if (filterMediaTypeSelect.value) queryParams.push(`mediaType=${filterMediaTypeSelect.value}`);
        if (filterStatusSelect.value) queryParams.push(`userStatus=${filterStatusSelect.value}`);
        if (filterMinRatingInput.value) queryParams.push(`minRating=${filterMinRatingInput.value}`);
        if (filterMaxRatingInput.value) queryParams.push(`maxRating=${filterMaxRatingInput.value}`);
        const queryString = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';

        const items = await makeApiRequest(`/library${queryString}`, 'GET', null, true);
        if (items !== null) {
             renderLibraryItems(items);
        } else {
            // Error handled by makeApiRequest, maybe clear view or show specific library error message
             resultsArea.innerHTML = '<p class="placeholder-text">Could not load library. Please try again.</p>';
        }
    }

    async function handleAddToLibrary(event) {
        if (!event.target.classList.contains('add-to-library-btn')) return;

        const button = event.target;
        const mediaId = button.dataset.mediaId;
        const mediaType = button.dataset.mediaType;
        const title = button.dataset.title; // Get title for prompts

        // Simple prompts for required info (replace with modal/form for better UX)
        const validStatuses = getValidStatuses(mediaType);
        if (!validStatuses.length) return displayStatus('Invalid media type for adding.', true);

        const userStatus = prompt(`Enter status for "${title}" (${validStatuses.join('/')}):`, validStatuses[0]);
        if (!userStatus || !validStatuses.includes(userStatus.toLowerCase())) {
            return displayStatus('Valid status required to add item.', true);
        }

        const userRatingInput = prompt(`Enter your rating for "${title}" (1-20, optional):`);
        const userRating = userRatingInput ? parseInt(userRatingInput, 10) : null;
        if (userRating !== null && (isNaN(userRating) || userRating < 1 || userRating > 20)) {
             return displayStatus('Invalid rating. Must be between 1 and 20.', true);
        }

        const userDescription = prompt(`Enter personal notes/description for "${title}" (optional):`);

        const itemData = {
            mediaType,
            mediaId,
            userStatus: userStatus.toLowerCase(),
            ...(userRating !== null && { userRating }), // Only include if valid number provided
            ...(userDescription && { userDescription }) // Only include if not empty
        };

        const result = await makeApiRequest('/library', 'POST', itemData, true);
        if (result) {
             displayStatus(`"${title}" added to library!`);
             // Optionally refresh library view
             fetchLibrary();
        }
    }

     async function handleEditLibraryItem(event) {
        if (!event.target.classList.contains('edit-library-item-btn')) return;

        const itemId = event.target.dataset.id;
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
        if (!event.target.classList.contains('delete-library-item-btn')) return;

        const itemId = event.target.dataset.id;
        if (!confirm(`Are you sure you want to delete library item ${itemId}?`)) {
            return;
        }

        const result = await makeApiRequest(`/library/${itemId}`, 'DELETE', null, true);
        // NOTE: makeApiRequest now handles 204 No Content, so result should be non-null on success
        if (result) {
            displayStatus(`Library item ${itemId} deleted.`);
            fetchLibrary(); // Refresh view
        }
    }

    // Helper to get valid statuses based on type (for prompts)
    function getValidStatuses(mediaType) {
        switch (mediaType) {
            case 'movie': case 'series': return ['to watch', 'watching', 'watched'];
            case 'book': return ['to read', 'reading', 'read'];
            case 'video game': return ['to play', 'playing', 'played'];
            default: return [];
        }
    }

    function handleOpenModalClick(event) {
        if (!event.target.classList.contains('add-to-library-btn')) return;

        const button = event.target;
        // Retrieve all data needed for the modal and the API call
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
        event.preventDefault(); // Prevent default form submission
        modalError.classList.add('hidden'); // Hide previous error

        // Get user input from modal
        const userStatus = modalUserStatusSelect.value;
        const userRatingInput = modalUserRatingInput.value;
        const userDescription = modalUserDescription.value.trim();

        // Get media data from hidden fields
        const mediaId = modalMediaIdInput.value;
        const mediaType = modalMediaTypeInput.value;
        const title = modalTitleDataInput.value;
        const imageUrl = modalImageUrlDataInput.value;
        const apiDescription = modalApiDescriptionDataInput.value;

        // Basic validation
        if (!userStatus) {
             modalError.textContent = 'Please select a status.';
             modalError.classList.remove('hidden');
             return;
        }
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

        const result = await makeApiRequest('/library', 'POST', payload, true);

        if (result) {
            displayStatus(`"${title}" added to library!`);
            closeAddItemModal();
            fetchLibrary(); // Refresh library view
        } else {
             // makeApiRequest should have displayed the error status,
             // but we can add a specific message in the modal too.
             const errorMessage = statusMessage.textContent.replace('Status: Error: ', ''); // Get error from global status
             modalError.textContent = `Failed to add item: ${errorMessage}`;
             modalError.classList.remove('hidden');
        }
    }

    // Modal listeners
    modalCloseBtn.addEventListener('click', closeAddItemModal);
    modalCancelBtn.addEventListener('click', closeAddItemModal);
    addItemForm.addEventListener('submit', handleAddItemSubmit);
    // Close modal if overlay is clicked
    addItemModal.addEventListener('click', (event) => {
        if (event.target === addItemModal) { // Check if click is on the overlay itself
            closeAddItemModal();
        }
    });

    // --- Attach Event Listeners ---
    logoutBtn.addEventListener('click', handleLogout);
    registerForm.addEventListener('submit', handleRegister);
    loginForm.addEventListener('submit', handleLogin);
    searchForm.addEventListener('submit', handleSearch);

    // Library listeners
    getLibraryBtn.addEventListener('click', fetchLibrary);
    filterMediaTypeSelect.addEventListener('change', fetchLibrary);
    filterStatusSelect.addEventListener('change', fetchLibrary);
    filterMinRatingInput.addEventListener('change', fetchLibrary); // Could debounce this
    filterMaxRatingInput.addEventListener('change', fetchLibrary);  // Could debounce this

    // Use event delegation for dynamically added buttons in results area
    resultsArea.addEventListener('click', handleAddToLibrary);
    resultsArea.addEventListener('click', handleEditLibraryItem);
    resultsArea.addEventListener('click', handleDeleteLibraryItem);

    // Update event delegation for opening the modal
    resultsArea.removeEventListener('click', handleAddToLibrary); // Remove old prompt handler
    resultsArea.addEventListener('click', handleOpenModalClick); // Add new modal handler
    resultsArea.addEventListener('click', handleEditLibraryItem); // Keep edit handler
    resultsArea.addEventListener('click', handleDeleteLibraryItem); // Keep delete handler
    

    // --- Initial Load ---
    updateLoginStatus();
    if (jwtToken) {
        fetchLibrary(); // Fetch library if user is already logged in
    }
});
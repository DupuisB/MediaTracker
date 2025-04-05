// public/js/main.js
(function () {
    'use strict';

    // --- Constants ---
    const API_BASE_URL = '/api';
    const TEMPLATE_BASE_URL = '/templates'; // URL for fetching partials

    // --- DOM Elements (Cached where possible) ---
    const body = document.body;
    const logoutBtn = document.getElementById('logoutBtn');

    // Modals
    const formModal = document.getElementById('formModal');
    const deleteConfirmModal = document.getElementById('deleteConfirmModal');

    // --- State ---
    let compiledTemplates = {}; // Cache for fetched Handlebars templates
    let itemToDelete = { id: null, type: null }; // Store ID and type (library/list/listItem) for delete confirmation
    let swiperInstances = []; // To manage Swiper carousels

    // --- Handlebars Setup & Helpers ---
    if (window.Handlebars) {
        // Register helpers (ensure these match server-side helpers)
        const helpers = {
            eq: (v1, v2) => v1 === v2,
            json: (context) => JSON.stringify(context),
            currentYear: () => new Date().getFullYear(),
            capitalize: (str) => (typeof str === 'string' && str.length > 0) ? str.charAt(0).toUpperCase() + str.slice(1) : str,
            formatYear: (dateValue) => { // Handle number or string date
                if (!dateValue) return '';
                if (typeof dateValue === 'number') return dateValue.toString(); // Assume it's already a year
                try {
                    const year = new Date(dateValue).getFullYear();
                    return isNaN(year) ? dateValue.match(/\d{4}/)?.[0] || '' : year;
                } catch {
                    return dateValue.match(/\d{4}/)?.[0] || ''; // Return original or YYYY if not parsable
                }
            },
            formatDate: (dateString) => dateString ? new Date(dateString).toLocaleDateString() : '',
            classify: (str) => typeof str === 'string' ? str.replace(/\s+/g, '-').toLowerCase() : '',
            defaultIfEmpty: (value, defaultValue) => value ?? defaultValue ?? '', // Use ?? for better null/undefined handling
            join: (arr, separator) => Array.isArray(arr) ? arr.join(separator) : '',
            truncate: (str, len) => (str && str.length > len) ? str.substring(0, len) + '...' : str,
            statusOutlineClass: (status) => { // Example implementation
                switch (status?.toLowerCase()) {
                    case 'completed': return 'outline-green';
                    case 'watching': case 'reading': case 'playing': return 'outline-blue';
                    case 'planned': return 'outline-red';
                    case 'paused': return 'outline-yellow';
                    case 'dropped': return 'outline-grey';
                    default: return '';
                }
            },
            renderStars: (rating, maxRating = 10) => {
                let starsHtml = '';
                const filledStars = Math.round(parseFloat(rating)); // Ensure number and round
                const safeMaxRating = parseInt(maxRating, 10) || 10;
                if (isNaN(filledStars)) return ''; // Return empty if rating is invalid

                for (let i = 1; i <= safeMaxRating; i++) {
                    starsHtml += `<span class="star ${i <= filledStars ? 'filled' : ''}">★</span>`;
                }
                return new Handlebars.SafeString(starsHtml); // Return SafeString
            },
             isOwner: (resourceOwnerId, loggedInUserId) => resourceOwnerId === loggedInUserId,
            // Add any other client-side specific helpers if needed
        };
        Object.keys(helpers).forEach(key => Handlebars.registerHelper(key, helpers[key]));

         // Helper to quickly generate a list for partials expecting arrays
         Handlebars.registerHelper('list', function() {
            return Array.from(arguments).slice(0, -1); // Exclude Handlebars options object
        });
    } else {
        console.warn('Handlebars runtime not found. Client-side templates may not work.');
    }

    // --- Utility Functions ---
    function showStatusMessage(elementId, message, type = 'info', duration = 3000) {
        const el = document.getElementById(elementId);
        if (!el) {
             // Fallback to global status if specific element not found
             const globalStatus = document.getElementById('globalStatus');
             if(globalStatus) {
                 globalStatus.textContent = message;
                 globalStatus.className = `status-message ${type}`;
                 globalStatus.classList.remove('hidden');
                 if (duration) {
                     setTimeout(() => globalStatus.classList.add('hidden'), duration);
                 }
             } else {
                 console.warn(`Status element #${elementId} not found.`);
             }
             return;
        }
        el.textContent = message;
        el.className = `status-message ${type}`; // Use classes for styling
        el.classList.remove('hidden');
        // Ensure empty messages are hidden immediately
        if (!message) {
             el.classList.add('hidden');
             return;
        }
        if (duration) {
            setTimeout(() => el.classList.add('hidden'), duration);
        }
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
                'Accept': 'application/json'
                // Cookies are sent automatically
            },
        };
        if (body) {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(body);
        }

        try {
            console.log(`API Request: ${method} ${url}`, body ? 'with body' : ''); // Log request start
            const response = await fetch(url, options);
            console.log(`API Response Status: ${response.status} for ${method} ${url}`); // Log response status

            // Handle 204 No Content specifically
            if (response.status === 204) {
                console.log('API Response: 204 No Content');
                return {}; // Return empty object for success
            }

            const responseData = await response.json();
             console.log(`API Response Data for ${method} ${url}:`, responseData); // Log response data

            if (!response.ok) {
                 const error = new Error(responseData.message || `HTTP error ${response.status}`);
                 error.status = response.status;
                 error.data = responseData;
                 throw error;
            }
            return responseData;
        } catch (error) {
            console.error(`API Request Error (${method} ${url}):`, error);
            const message = error.data?.message || error.message || 'An unknown API error occurred.';
             showStatusMessage('globalStatus', message, 'error', 5000); // Display error globally

            // Handle critical auth errors
            if (error.status === 401) {
                 showStatusMessage('globalStatus', 'Authentication error. Redirecting to login...', 'error', 5000);
                 setTimeout(() => { window.location.href = '/login?errorMessage=Session expired. Please login again.'; }, 1500);
            }
            throw error; // Re-throw for calling function to handle locally
        }
    }

     // Function to fetch and compile Handlebars template
    async function getTemplate(templateName) {
        if (compiledTemplates[templateName]) {
            return compiledTemplates[templateName];
        }
        try {
            // Use the server route to fetch partials
            const response = await fetch(`${TEMPLATE_BASE_URL}/${templateName}`); // Fetch WITHOUT .hbs extension now based on viewRoutes change
            if (!response.ok) {
                throw new Error(`Failed to fetch template: ${templateName} (${response.status})`);
            }
            const templateString = await response.text();
            if (!window.Handlebars) throw new Error("Handlebars runtime missing");
            compiledTemplates[templateName] = Handlebars.compile(templateString);
            return compiledTemplates[templateName];
        } catch (error) {
            console.error(`Error loading template ${templateName}:`, error);
            showStatusMessage('globalStatus', `Error loading UI template ${templateName}.`, 'error');
            return null;
        }
    }

    // --- Modal Handling ---
    function openModal(modalElement, contentHTML = '', modalClass = '') {
        if (!modalElement) return;
        const contentArea = modalElement.querySelector('.modal-content-area') || modalElement.querySelector('#modalContentArea');
         if (contentArea && contentHTML) {
             contentArea.innerHTML = contentHTML;
         }
         // Clear previous specific classes before adding new one
         modalElement.className = modalElement.className.replace(/modal-[\w-]+/g, '');
         if (modalClass) modalElement.classList.add(modalClass);

        modalElement.classList.remove('hidden');
        body.classList.add('modal-open'); // Prevent background scrolling
    }

    function closeModal(modalElement) {
        if (!modalElement) return;
        modalElement.classList.add('hidden');
        modalElement.className = modalElement.className.replace(/modal-[\w-]+/g, ''); // Remove specific modal classes
         const contentArea = modalElement.querySelector('.modal-content-area') || modalElement.querySelector('#modalContentArea');
         if (contentArea) {
             contentArea.innerHTML = ''; // Clear content
         }
          body.classList.remove('modal-open');
    }

    // --- Swiper Initialization ---
    function initSwipers() {
        // Destroy existing instances first
        swiperInstances.forEach(swiper => swiper.destroy(true, true));
        swiperInstances = [];

        // Initialize all carousels on the page
        document.querySelectorAll('.swiper').forEach(element => {
             const config = {
                loop: false,
                slidesPerView: 'auto',
                spaceBetween: 15,
                 navigation: {
                    nextEl: element.querySelector('.swiper-button-next'),
                    prevEl: element.querySelector('.swiper-button-prev'),
                },
                 pagination: {
                    el: element.querySelector('.swiper-pagination'),
                    clickable: true,
                },
                // Default breakpoints for media/list carousels
                 breakpoints: {
                    600: { slidesPerView: 3, spaceBetween: 15 },
                    800: { slidesPerView: 4, spaceBetween: 20 },
                    1024: { slidesPerView: 5, spaceBetween: 20 },
                    1200: { slidesPerView: 6, spaceBetween: 25 },
                 },
            };

            // Specific config for cast
            if (element.classList.contains('cast-swiper')) {
                 config.slidesPerView = 3; // Start mobile with more cast visible
                 config.breakpoints = {
                    640: { slidesPerView: 4, spaceBetween: 15 },
                    768: { slidesPerView: 5, spaceBetween: 15 },
                    1024: { slidesPerView: 7, spaceBetween: 20 },
                 };
            }

            try {
                 const swiper = new Swiper(element, config);
                 swiperInstances.push(swiper);
            } catch (e) {
                console.error("Failed to initialize Swiper for element:", element, e);
            }
        });
         // console.log("Swipers Initialized:", swiperInstances.length);
    }


     // --- Specific Action Handlers ---

     // Add/Edit Library Item (uses Modal)
     async function openLibraryItemFormModal(mode = 'add', itemData = {}) {
         const template = await getTemplate('itemFormModal');
         if (!template || !formModal) return;

         const isAddMode = mode === 'add';
         const context = {
             mode: mode,
             modalTitle: isAddMode ? `Add "${itemData.title}" to Library` : `Edit "${itemData.title}"`,
             submitButtonText: isAddMode ? 'Add to Library' : 'Save Changes',
             item: {
                 ...itemData,
                 libraryItemId: isAddMode ? null : itemData.id, // Use DB id for edit
             }
         };
         openModal(formModal, template(context), 'modal-library-item');
     }

     // Handle Library Item Form Submission (from Modal)
     async function handleLibraryItemFormSubmit(event) {
        event.preventDefault();
        const form = event.target;
        if (form.id !== 'libraryItemForm') return;

        const mode = form.dataset.mode;
        const libraryItemId = form.dataset.libraryItemId || form.dataset.itemId; // Get DB ID for edits (check both dataset attributes)
        const modalErrorEl = form.querySelector('.modal-error-message');
        modalErrorEl?.classList.add('hidden');
        showSpinner('modalSpinner', true);

        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        const payload = {
            ...(mode === 'add' && {
                mediaType: data.mediaType,
                mediaId: data.mediaId,
                title: data.title,
                imageUrl: data.imageUrl,
                releaseYear: data.releaseYear
            }),
            userStatus: data.userStatus,
            userRating: data.userRating || null,
            isFavorite: data.isFavorite === 'true',
            userNotes: data.userNotes,
        };

        try {
            let result;
            let message = '';
            if (mode === 'add') {
                result = await apiRequest('/library', 'POST', payload);
                message = `"${result.title}" added to library!`;
                 if (document.querySelector('.media-detail-page')) {
                    updateInteractionControls(result); // Update controls if on detail page
                }
            } else { // mode === 'edit'
                 if (!libraryItemId) throw new Error("Cannot edit item without library ID.");
                result = await apiRequest(`/library/${libraryItemId}`, 'PUT', payload);
                 message = `"${result.title}" updated in library!`;
                  if (document.querySelector('.media-detail-page')) {
                    updateInteractionControls(result);
                 }
            }
            showStatusMessage('globalStatus', message, 'success');
            closeModal(formModal);

            // Reload if on a page that needs updated lists (Home, Profile)
            if (window.location.pathname === '/' || window.location.pathname.startsWith('/profile')) {
                 setTimeout(() => window.location.reload(), 500); // Short delay before reload
            }


        } catch (error) {
            const message = error.data?.message || error.message || 'Operation failed.';
            if (modalErrorEl) {
                modalErrorEl.textContent = message;
                modalErrorEl.classList.remove('hidden');
            } else {
                 showStatusMessage('globalStatus', message, 'error');
            }
        } finally {
             showSpinner('modalSpinner', false);
        }
     }

     // Remove Item From Library Confirmation Setup
     function handleRemoveFromLibrary(libraryItemId, title) {
        if (!libraryItemId) {
            console.error("Remove failed: libraryItemId is missing.");
            showStatusMessage('interactionStatus', 'Error: Cannot identify item to remove.', 'error');
            return;
        }
        console.log(`Setting up removal for Library Item ID: ${libraryItemId}, Title: ${title}`); // Debug log
        itemToDelete = { id: libraryItemId, type: 'library', title: title };
        const messageEl = deleteConfirmModal?.querySelector('#deleteConfirmMessage');
        if (messageEl) {
            messageEl.textContent = `Are you sure you want to remove "${title}" from your library?`;
        }
        openModal(deleteConfirmModal);
    }



    // Update Interaction Controls on Detail Page (after Add/Update/Remove)
    function updateInteractionControls(libraryItemData = null) {
        const controls = document.querySelector('.user-interaction-controls');
        if (!controls) return;

        const isAdded = !!libraryItemData; // Item exists in library
        console.log(`Updating controls. Is Added: ${isAdded}`, libraryItemData); // Debug log

        controls.dataset.libraryItemId = isAdded ? libraryItemData.id : '';

        const statusSelect = controls.querySelector('#detailStatusSelect');
        const ratingInput = controls.querySelector('#detailRatingInput');
        const favoriteToggle = controls.querySelector('#detailFavoriteToggle');
        const notesInput = controls.querySelector('#detailNotesInput');
        const addButton = controls.querySelector('.add-to-library-btn');
        const updateButton = controls.querySelector('button[type="submit"]'); // Assumes submit is update
        const removeButton = controls.querySelector('.remove-from-library-btn');

        // **Always keep controls enabled now for pre-add editing**
        // Only disable if explicitly needed, perhaps after removal? For now, keep enabled.
        // [statusSelect, ratingInput, favoriteToggle, notesInput].forEach(el => { if(el) el.disabled = !isAdded; });

        if (isAdded) {
            // Populate values
            statusSelect.value = libraryItemData.userStatus || 'planned';
            ratingInput.value = libraryItemData.userRating || '';
            favoriteToggle.checked = libraryItemData.isFavorite || false;
            notesInput.value = libraryItemData.userNotes || '';
        } else {
            // Clear values when removed (or not added)
            statusSelect.value = 'planned'; // Default to planned
            ratingInput.value = '';
            favoriteToggle.checked = false;
            notesInput.value = '';
        }

        // Toggle button visibility
        addButton?.classList.toggle('hidden', isAdded);
        updateButton?.classList.toggle('hidden', !isAdded);
        removeButton?.classList.toggle('hidden', !isAdded);

        // Clear any previous status message in the interaction area
        showStatusMessage('interactionStatus', '', 'info', 0);
    }


    // Handle interaction form submission (UPDATE) on Detail Page
    async function handleInteractionFormSubmit(event) {
        event.preventDefault();
        const form = event.target;
        if (form.id !== 'mediaInteractionForm') return;

        const controls = form.closest('.user-interaction-controls');
        const libraryItemId = controls?.dataset.libraryItemId;

        // This function is ONLY for updates, not adds
        if (!libraryItemId) {
            console.error("Update aborted: library item ID is missing. Was item added first?");
            showStatusMessage('interactionStatus', 'Error: Item must be added before updating.', 'error');
            return;
        }

        showSpinner('interactionSpinner', true);
        showStatusMessage('interactionStatus', '', 'info', 0);

        const formData = new FormData(form);
        const payload = {
           userStatus: formData.get('userStatus'),
           userRating: formData.get('userRating') || null,
           isFavorite: formData.get('isFavorite') === 'true',
           userNotes: formData.get('userNotes'),
       };

       try {
            const result = await apiRequest(`/library/${libraryItemId}`, 'PUT', payload);
            showStatusMessage('interactionStatus', 'Library item updated!', 'success', 2000);
            // Update controls with the latest data returned from API
            updateInteractionControls(result);
       } catch (error) {
            const message = error.data?.message || error.message || 'Failed to update library item.';
            showStatusMessage('interactionStatus', message, 'error', 4000);
       } finally {
            showSpinner('interactionSpinner', false);
       }
   }

    // Handle "Add to Library" button click on Detail Page (Refactored)
    async function handleAddToLibraryClick(event) {
        const button = event.target;
        const controls = button.closest('.user-interaction-controls');
        const form = controls?.querySelector('#mediaInteractionForm');
        const { mediaType, mediaId } = controls.dataset;

        // --- Validation ---
        const statusSelect = controls.querySelector('#detailStatusSelect');
        if (!statusSelect || !statusSelect.value) {
            showStatusMessage('interactionStatus', 'Status is required to add item.', 'error', 4000);
            statusSelect?.focus(); // Focus the status dropdown
            return; // Stop the process
        }

        showSpinner('interactionSpinner', true);
        showStatusMessage('interactionStatus', 'Adding...', 'info', 0);

        try {
            // Get core details stored on the controls/form element (add these in viewRoutes/hbs)
            const title = controls.dataset.title;
            const imageUrl = controls.dataset.imageUrl;
            const releaseYear = controls.dataset.releaseYear;

            if (!title || !mediaType || !mediaId) {
                 throw new Error("Missing core media details (title, type, id) needed to add.");
            }

            // Get current interaction values from the form controls
            const formData = new FormData(form);
            const payload = {
                mediaType: mediaType,
                mediaId: mediaId,
                title: title,
                imageUrl: imageUrl || null, // Handle potentially missing image
                releaseYear: releaseYear || null, // Handle potentially missing year
                // Use values directly from the form
                userStatus: formData.get('userStatus'), // Already validated above
                userRating: formData.get('userRating') || null,
                isFavorite: formData.get('isFavorite') === 'true',
                userNotes: formData.get('userNotes') || '',
            };

            const result = await apiRequest('/library', 'POST', payload);
            showStatusMessage('interactionStatus', 'Added to library!', 'success', 2000);
            updateInteractionControls(result); // Update controls to reflect added state

        } catch (error) {
             const message = error.data?.message || error.message || 'Failed to add item.';
             showStatusMessage('interactionStatus', message, 'error', 4000);
        } finally {
             showSpinner('interactionSpinner', false);
        }
   }

     // Handle Profile Privacy Form Submission
    async function handlePrivacyFormSubmit(event) {
        event.preventDefault();
        const form = event.target;
        if (form.id !== 'privacyForm') return;
        const saveButton = form.querySelector('button[type="submit"]');
        saveButton.disabled = true; // Prevent double submit
        showStatusMessage('privacyStatus', 'Saving...', 'info', 0);

        const formData = new FormData(form);
        const payload = { profilePrivacy: formData.get('profilePrivacy') };
        try {
            await apiRequest('/profile/me', 'PUT', payload);
            showStatusMessage('privacyStatus', 'Privacy updated!', 'success');
        } catch (error) {
             const message = error.data?.message || error.message || 'Failed to update privacy.';
             showStatusMessage('privacyStatus', message, 'error');
        } finally {
             saveButton.disabled = false;
        }
    }

    // Handle List Creation (Show Modal)
    async function handleCreateListClick() {
         // Using getTemplate might be overkill for a simple form, but good for consistency
         // const template = await getTemplate('listFormModal'); // If you create such a partial
         // if (!template) return;
         // const context = { mode: 'create', modalTitle: 'Create New List', submitButtonText: 'Create List', list: {} };
         // openModal(formModal, template(context), 'modal-list-form');

         // Or simpler inline HTML:
         const formHTML = `
            <button class="modal-close-btn" aria-label="Close">×</button>
            <h2>Create New List</h2>
            <form id="listForm" data-mode="create">
                <div class="form-group"> <label for="listTitle">List Title:</label> <input type="text" id="listTitle" name="title" required> </div>
                <div class="form-group"> <label for="listDescription">Description (Optional):</label> <textarea id="listDescription" name="description" rows="3"></textarea> </div>
                <div class="form-group"> <label for="listIsPublic">Visibility:</label> <select id="listIsPublic" name="isPublic"><option value="false">Private</option><option value="true">Public</option></select> </div>
                <div class="form-group"> <label for="listCoverImageUrl">Cover Image URL (Optional):</label> <input type="url" id="listCoverImageUrl" name="coverImageUrl"> </div>
                <div class="modal-actions"> <button type="button" class="btn btn-secondary modal-cancel-btn">Cancel</button> <button type="submit" class="btn btn-primary">Create List</button> <div id="modalSpinner" class="spinner hidden"></div> </div>
                <p class="modal-error-message hidden"></p>
            </form>
         `;
         openModal(formModal, formHTML, 'modal-list-form');
    }

    // Handle List Edit (Show Modal with prefilled data)
    async function handleEditListClick(event) {
         const button = event.target.closest('.edit-list-btn');
         const listId = button?.dataset.listId;
         if (!listId) return;

         openModal(formModal, '<div class="spinner"></div> Loading list details...', 'modal-list-form'); // Show loading state

          try {
             const listData = await apiRequest(`/lists/${listId}`); // Fetch list data
             // const template = await getTemplate('listFormModal'); // Use template if exists
             // const context = { mode: 'edit', modalTitle: 'Edit List', submitButtonText: 'Save Changes', list: listData };
             // const formHTML = template(context);

             // Simple inline HTML version:
             const formHTML = `
                <button class="modal-close-btn" aria-label="Close">×</button>
                <h2>Edit List</h2>
                <form id="listForm" data-mode="edit" data-list-id="${listId}">
                    <div class="form-group"><label for="listTitle">List Title:</label><input type="text" id="listTitle" name="title" required value="${listData.title || ''}"></div>
                    <div class="form-group"><label for="listDescription">Description (Optional):</label><textarea id="listDescription" name="description" rows="3">${listData.description || ''}</textarea></div>
                    <div class="form-group"><label for="listIsPublic">Visibility:</label><select id="listIsPublic" name="isPublic"><option value="false" ${!listData.isPublic ? 'selected' : ''}>Private</option><option value="true" ${listData.isPublic ? 'selected' : ''}>Public</option></select></div>
                    <div class="form-group"><label for="listCoverImageUrl">Cover Image URL (Optional):</label><input type="url" id="listCoverImageUrl" name="coverImageUrl" value="${listData.coverImageUrl || ''}"></div>
                    <div class="modal-actions"><button type="button" class="btn btn-secondary modal-cancel-btn">Cancel</button><button type="submit" class="btn btn-primary">Save Changes</button><div id="modalSpinner" class="spinner hidden"></div></div>
                    <p class="modal-error-message hidden"></p>
                </form>
             `;

              const contentArea = formModal.querySelector('#modalContentArea');
              if(contentArea) contentArea.innerHTML = formHTML;
              else closeModal(formModal); // Close if content area isn't found

          } catch (error) {
               const message = error.data?.message || error.message || 'Failed to load list data.';
                const contentArea = formModal.querySelector('#modalContentArea');
                if(contentArea) contentArea.innerHTML = `<p class="error-message">${message}</p><button class="modal-close-btn" aria-label="Close">×</button>`;
                else showStatusMessage('globalStatus', message, 'error'); // Fallback if modal isn't open/valid
          }
    }


     // Handle List Form Submission (Create/Edit)
     async function handleListFormSubmit(event) {
         event.preventDefault();
         const form = event.target;
         if (form.id !== 'listForm') return;

         const mode = form.dataset.mode;
         const listId = form.dataset.listId; // Only for edit mode
         const modalErrorEl = form.querySelector('.modal-error-message');
         modalErrorEl?.classList.add('hidden');
         showSpinner('modalSpinner', true);

         const formData = new FormData(form);
         const payload = Object.fromEntries(formData.entries());
         payload.isPublic = payload.isPublic === 'true';

         try {
             let result;
             let message = '';
             if (mode === 'create') {
                 result = await apiRequest('/lists', 'POST', payload);
                 message = `List "${result.title}" created!`;
             } else { // mode === 'edit'
                  if (!listId) throw new Error("Missing list ID for edit.");
                 result = await apiRequest(`/lists/${listId}`, 'PUT', payload);
                 message = `List "${result.title}" updated!`;
             }
              showStatusMessage('globalStatus', message, 'success');
              closeModal(formModal);
              // Reload overview page for simplicity
              if (window.location.pathname === '/lists') {
                 setTimeout(() => window.location.reload(), 500);
              }

         } catch (error) {
            const message = error.data?.message || error.message || 'Operation failed.';
            if (modalErrorEl) {
                modalErrorEl.textContent = message;
                modalErrorEl.classList.remove('hidden');
            } else {
                 showStatusMessage('globalStatus', message, 'error');
            }
         } finally {
              showSpinner('modalSpinner', false);
         }
     }

    // Handle Delete List Confirmation
    function handleDeleteListClick(event) {
        const button = event.target.closest('.delete-list-btn');
        const listId = button?.dataset.listId;
        const listTitle = button?.dataset.listTitle || 'this list';
        if (!listId) return;

        itemToDelete = { id: listId, type: 'list', title: listTitle };
        const messageEl = deleteConfirmModal?.querySelector('#deleteConfirmMessage');
        if (messageEl) {
            messageEl.textContent = `Are you sure you want to delete the list "${listTitle}"? This cannot be undone.`;
        }
        openModal(deleteConfirmModal);
    }

     // Handle Add Item to List Form Submission
     async function handleAddToListFormSubmit(event) {
         event.preventDefault();
         const form = event.target;
         if (form.id !== 'addToListForm') return;

         const statusEl = form.querySelector('#addItemStatus');
         statusEl.textContent = 'Adding...';
         statusEl.className = 'status-message info';
         statusEl.classList.remove('hidden');

         const formData = new FormData(form);
         const listId = formData.get('listId');
         const payload = {
            libraryItemId: formData.get('libraryItemId'),
            userComment: formData.get('userComment')
         };

         if(!payload.libraryItemId) {
             statusEl.textContent = 'Library Item ID is required.';
             statusEl.className = 'status-message error';
             return;
         }


         try {
             const result = await apiRequest(`/lists/${listId}/items`, 'POST', payload);
             statusEl.textContent = `"${result.title}" added to list!`;
             statusEl.className = 'status-message success';
              form.reset(); // Clear form
              // Reload page for simplicity for now
              setTimeout(() => window.location.reload(), 1500);
         } catch (error) {
             const message = error.data?.message || error.message || 'Failed to add item.';
             statusEl.textContent = message;
              statusEl.className = 'status-message error';
         } finally {
              // Hide status message after delay?
              setTimeout(() => statusEl.classList.add('hidden'), 5000);
         }
     }

     // Handle Remove Item from List Click
     function handleRemoveListItemClick(event) {
          const button = event.target.closest('.remove-list-item-btn');
          const listItemRow = button?.closest('.list-item-row');
          // Get listId from the parent section/container, assuming it's set there
          const listId = listItemRow?.closest('.list-items-section')?.dataset.listId || document.body.dataset.listId; // Check body dataset as fallback
          const listItemId = listItemRow?.dataset.listItemId;
          const itemTitle = listItemRow?.querySelector('.col-title a')?.textContent || 'this item';

          if (!listId || !listItemId) {
              console.error("Could not determine listId or listItemId for removal.");
              showStatusMessage('globalStatus', 'Error: Could not identify item to remove.', 'error');
              return;
          }

          itemToDelete = { id: listItemId, type: 'listItem', title: itemTitle, listId: listId };
          const messageEl = deleteConfirmModal?.querySelector('#deleteConfirmMessage');
          if (messageEl) {
              messageEl.textContent = `Are you sure you want to remove "${itemTitle}" from this list?`;
          }
          openModal(deleteConfirmModal);
     }

     // Handle Edit List Item Comment Click
     function handleEditListItemCommentClick(event) {
        const button = event.target.closest('.edit-list-item-comment-btn');
        const listItemRow = button?.closest('.list-item-row');
        const editForm = listItemRow?.querySelector('.edit-comment-form');
        const commentDisplay = listItemRow?.querySelector('.col-comment');

        if (!listItemRow || !editForm || !commentDisplay) return;

        // Hide other edit forms in the table first
         listItemRow.closest('.list-items-table')?.querySelectorAll('.edit-comment-form:not(.hidden)')
             .forEach(form => handleCancelEditListItemCommentClick({ target: form.querySelector('.cancel-edit-comment-btn') }));


        commentDisplay.classList.add('hidden');
        editForm.classList.remove('hidden');
        button.classList.add('hidden');
        listItemRow.querySelector('.remove-list-item-btn')?.classList.add('hidden');
        editForm.querySelector('input[name="userComment"]')?.focus();
     }

      // Handle Cancel Edit List Item Comment Click
     function handleCancelEditListItemCommentClick(event) {
         const button = event.target.closest('.cancel-edit-comment-btn') || event.target.closest('.edit-comment-form'); // Allow triggering from form itself
         const listItemRow = button?.closest('.list-item-row');
         const editForm = listItemRow?.querySelector('.edit-comment-form');
         const commentDisplay = listItemRow?.querySelector('.col-comment');

         if (!listItemRow || !editForm || !commentDisplay) return;

         editForm.classList.add('hidden');
         commentDisplay.classList.remove('hidden');
         listItemRow.querySelector('.edit-list-item-comment-btn')?.classList.remove('hidden');
         listItemRow.querySelector('.remove-list-item-btn')?.classList.remove('hidden');
     }


     // Handle List Item Comment Form Submission
     async function handleListItemCommentFormSubmit(event) {
        event.preventDefault();
        const form = event.target;
        if (!form.classList.contains('edit-comment-form')) return;

        const listItemRow = form.closest('.list-item-row');
        // Get listId from the parent section/container
        const listId = listItemRow?.closest('.list-items-section')?.dataset.listId || document.body.dataset.listId;
        const listItemId = listItemRow?.dataset.listItemId;
        const commentInput = form.querySelector('input[name="userComment"]');
        const commentDisplay = listItemRow?.querySelector('.col-comment');
        const originalComment = commentDisplay?.textContent;

        if (!listId || !listItemId || !commentInput || !commentDisplay) return;

        const payload = { userComment: commentInput.value };
        commentDisplay.textContent = 'Saving...';
        commentDisplay.classList.remove('hidden'); // Make sure display is visible while saving
        form.classList.add('hidden'); // Hide form while saving

        try {
            const result = await apiRequest(`/lists/${listId}/items/${listItemId}`, 'PUT', payload);
            commentDisplay.textContent = result.userComment || '---';
            // Reset view (show buttons etc)
            handleCancelEditListItemCommentClick({ target: form }); // Pass form to reset its row
         } catch (error) {
             const message = error.data?.message || error.message || 'Failed to save comment.';
             console.error("Comment save error:", message);
             commentDisplay.textContent = originalComment;
             alert(`Error: ${message}`); // Simple alert
             handleCancelEditListItemCommentClick({ target: form });
         }
     }



    // Handle Delete Confirmation Logic
    async function handleDeleteConfirm() {
        if (!itemToDelete.id || !itemToDelete.type) return;

        const { id, type, listId } = itemToDelete;
        let apiUrl = '';
        let successMessage = '';
        let elementToRemoveSelector = null;

        showSpinner('deleteSpinner', true);
        const confirmBtn = deleteConfirmModal?.querySelector('#deleteConfirmBtn');
        if(confirmBtn) confirmBtn.disabled = true;

        try {
            switch(type) {
                case 'library':
                    apiUrl = `/library/${id}`;
                    successMessage = 'Item removed from library.';
                     if (document.querySelector('.media-detail-page')) {
                         updateInteractionControls(null); // Pass null to reset controls
                     }
                    break;
                case 'list':
                    apiUrl = `/lists/${id}`;
                    successMessage = 'List deleted successfully.';
                    elementToRemoveSelector = `.list-summary-row[data-list-id="${id}"]`;
                    break;
                case 'listItem':
                    if (!listId) throw new Error("Missing listId for listItem deletion");
                    apiUrl = `/lists/${listId}/items/${id}`;
                    successMessage = 'Item removed from list.';
                    elementToRemoveSelector = `.list-item-row[data-list-item-id="${id}"]`;
                    break;
                default:
                     throw new Error("Invalid delete type");
            }

            await apiRequest(apiUrl, 'DELETE');
            showStatusMessage('globalStatus', successMessage, 'success');
            closeModal(deleteConfirmModal);

            if (elementToRemoveSelector) {
                document.querySelector(elementToRemoveSelector)?.remove();
            }

            // Reload if on profile page after deleting library item (simplest way to update carousels)
            if (type === 'library' && window.location.pathname.startsWith('/profile')) {
                 setTimeout(() => window.location.reload(), 500);
            }

        } catch (error) {
             const message = error.data?.message || error.message || 'Deletion failed.';
             showStatusMessage('globalStatus', message, 'error');
             closeModal(deleteConfirmModal);
        } finally {
            itemToDelete = { id: null, type: null }; // Reset
            showSpinner('deleteSpinner', false);
            if(confirmBtn) confirmBtn.disabled = false;
        }
    }

    // --- Global Event Listeners ---
    function setupGlobalListeners() {
         // Logout Button
        logoutBtn?.addEventListener('click', async () => {
            try {
                showStatusMessage('globalStatus', 'Logging out...', 'info', 0);
                await apiRequest('/auth/logout', 'POST');
                showStatusMessage('globalStatus', 'Logout successful. Redirecting...', 'success');
                window.location.href = '/login';
            } catch (error) {
                 showStatusMessage('globalStatus', 'Logout failed.', 'error');
            }
        });

         // Modal generic close/cancel buttons
        formModal?.addEventListener('click', (event) => {
            if (event.target.matches('.modal-close-btn') || event.target.matches('.modal-cancel-btn') || event.target === formModal) {
                closeModal(formModal);
            }
        });
         deleteConfirmModal?.addEventListener('click', (event) => {
             if (event.target.matches('.modal-close-btn') || event.target.matches('.modal-cancel-btn') || event.target === deleteConfirmModal) {
                 closeModal(deleteConfirmModal);
                 itemToDelete = { id: null, type: null }; // Reset on cancel
             } else if (event.target.matches('#deleteConfirmBtn')) {
                 handleDeleteConfirm();
             }
         });

         // Modal Form Submissions (Delegated)
         formModal?.addEventListener('submit', (event) => {
             if (event.target.id === 'libraryItemForm') {
                 handleLibraryItemFormSubmit(event);
             } else if (event.target.id === 'listForm') {
                 handleListFormSubmit(event);
             }
         });

         // Add global status message area if needed (keep this)
         if (!document.getElementById('globalStatus')) {
            const statusDiv = document.createElement('div');
            statusDiv.id = 'globalStatus';
            statusDiv.className = 'status-message hidden';
            statusDiv.setAttribute('aria-live', 'polite');
            document.body.appendChild(statusDiv);
        }

    }

     // --- Page Specific Initializations / Listeners ---
     function initializePage() {
         const path = window.location.pathname;
         const pathParts = path.split('/').filter(p => p); // Filter out empty parts

         // Initialize Swipers on relevant pages
         if (path === '/' || path.startsWith('/profile') || path.startsWith('/media/')) {
             initSwipers();
         }

         // Homepage specific listeners
         if (path === '/') {
             document.querySelector('.horizontal-nav')?.addEventListener('click', (event) => {
                 if (event.target.matches('.nav-item')) {
                     const filter = event.target.dataset.filter;
                     console.log("Homepage Filter selected:", filter); // Implement filtering logic here
                     document.querySelectorAll('.horizontal-nav .nav-item').forEach(el => el.classList.remove('active'));
                     event.target.classList.add('active');
                 }
             });
         }

         // Login Page Listeners
         if (path === '/login') {
            const loginForm = document.getElementById('loginForm');
            const registerForm = document.getElementById('registerForm');

            if (loginForm) {
                console.log("Attaching listener to login form");
                loginForm.addEventListener('submit', handleLogin);
            } else {
                 console.log("Login form not found on page /login");
            }
            if (registerForm) {
                console.log("Attaching listener to register form");
                registerForm.addEventListener('submit', handleRegister);
            } else {
                 console.log("Register form not found on page /login");
            }
         }

         // Media Detail Page listeners
         if (path.startsWith('/media/') && pathParts.length === 3) {
            const controls = document.querySelector('.user-interaction-controls');
            if (controls) {
                // Attach form submit listener (handles UPDATE)
                const interactionForm = controls.querySelector('#mediaInteractionForm');
                interactionForm?.addEventListener('submit', handleInteractionFormSubmit);

                // Attach delegated click listener to controls container
                controls.addEventListener('click', (event) => {
                     // Handle ADD button click
                     if (event.target.matches('.add-to-library-btn')) {
                         console.log("Add to Library button clicked"); // Debug log
                         handleAddToLibraryClick(event);
                     }
                     // Handle REMOVE button click
                     else if (event.target.matches('.remove-from-library-btn')) {
                          const libraryItemId = controls.dataset.libraryItemId;
                          const title = controls.dataset.title || 'this item'; // Get title from dataset
                          console.log(`Remove button clicked, libraryItemId: ${libraryItemId}`); // Debug log
                          if (libraryItemId) {
                              handleRemoveFromLibrary(libraryItemId, title);
                          } else {
                              console.error("Remove button clicked, but libraryItemId is missing from dataset.");
                              showStatusMessage('interactionStatus', 'Error: Cannot identify item to remove.', 'error');
                          }
                     }
                });
                
            } else {
                 console.log("User interaction controls not found on media detail page.");
            }
        }

          // Profile Page listeners
          if (path.startsWith('/profile')) {
             const privacyForm = document.getElementById('privacyForm');
             privacyForm?.addEventListener('submit', handlePrivacyFormSubmit);
         }

         // Lists Overview Page listeners
         if (path === '/lists') {
             const createBtn = document.getElementById('createListBtn');
             createBtn?.addEventListener('click', handleCreateListClick);

             const listsContainer = document.querySelector('.lists-container');
             listsContainer?.addEventListener('click', (event) => {
                  if (event.target.closest('.edit-list-btn')) {
                      handleEditListClick(event);
                  } else if (event.target.closest('.delete-list-btn')) {
                      handleDeleteListClick(event);
                  }
             });
         }

         // List Detail Page listeners
         if (path.startsWith('/lists/') && pathParts.length === 2) { // Check for /lists/:id pattern
             const listDetailContainer = document.querySelector('.list-detail-page');
             const listId = pathParts[1]; // Get listId from URL
             // Set listId on relevant containers if needed for context
             document.body.dataset.listId = listId;
             document.querySelector('.list-items-section')?.setAttribute('data-list-id', listId);


             listDetailContainer?.addEventListener('submit', (event) => {
                 if (event.target.id === 'addToListForm') {
                    handleAddToListFormSubmit(event);
                 } else if (event.target.classList.contains('edit-comment-form')) {
                    handleListItemCommentFormSubmit(event);
                 }
             });

             listDetailContainer?.addEventListener('click', (event) => {
                 if (event.target.closest('.edit-list-btn')) {
                     handleEditListClick(event);
                 } else if (event.target.closest('.delete-list-btn')) {
                     handleDeleteListClick(event);
                 } else if (event.target.closest('.remove-list-item-btn')) {
                     handleRemoveListItemClick(event);
                 } else if (event.target.closest('.edit-list-item-comment-btn')) {
                     handleEditListItemCommentClick(event);
                 } else if (event.target.closest('.cancel-edit-comment-btn')) {
                      handleCancelEditListItemCommentClick(event);
                 }
             });
         }
     }

     // --- Login Handler ---
     async function handleLogin(event) {
        event.preventDefault(); // Prevent default GET submission
        console.log("handleLogin executed");
        const form = event.target;
        const username = form.username.value.trim();
        const password = form.password.value.trim();
        // --- Select specific elements by ID ---
        const errorEl = document.getElementById('loginError');
        const submitButton = form.querySelector('button[type="submit"]');
        const spinnerId = 'loginSpinner';

        // --- Clear previous error ---
        if (errorEl) {
            errorEl.textContent = '';
            errorEl.classList.add('hidden');
        }
        if (submitButton) submitButton.disabled = true;
        showSpinner(spinnerId, true);

        // Basic client-side validation
        if (!username || !password) {
           if(errorEl){ errorEl.textContent = 'Username and password required.'; errorEl.classList.remove('hidden'); }
           if (submitButton) submitButton.disabled = false;
           showSpinner(spinnerId, false);
           return;
        }

        try {
            // Attempt API call
            const result = await apiRequest('/auth/login', 'POST', { username, password });
            if (result && result.user) {
                // Don't show message here, just redirect
                // showStatusMessage('globalStatus', 'Login successful! Redirecting...', 'success', 2000);
                window.location.href = '/'; // Redirect to homepage
            } else {
                // This case might indicate an unexpected successful response without user data
                throw new Error("Login response missing user data.");
            }
        } catch (error) {
            // Display API or network errors in the dedicated login error area
            const message = error.data?.message || error.message || 'Login failed. Please check your credentials.';
            if(errorEl){
                errorEl.textContent = message;
                errorEl.classList.remove('hidden');
            }
            else { showStatusMessage('globalStatus', message, 'error'); } // Fallback
            if (submitButton) submitButton.disabled = false; // Re-enable button on error
            showSpinner(spinnerId, false);
        }
        // Note: No 'finally' needed here as success causes redirect, error handles spinner/button
    }

    // --- Registration Handler ---
    async function handleRegister(event) {
        event.preventDefault(); // Prevent default GET submission
        console.log("handleRegister executed");
        const form = event.target;
        const username = form.username.value.trim();
        const password = form.password.value.trim();
        // --- Select specific elements by ID ---
        const errorEl = document.getElementById('registerError');
        const messageEl = document.getElementById('registerMessage');
        const submitButton = form.querySelector('button[type="submit"]');
        const spinnerId = 'registerSpinner';

        // --- Clear previous messages ---
        if (errorEl) {
           errorEl.textContent = '';
           errorEl.classList.add('hidden');
        }
        if (messageEl) {
           messageEl.textContent = '';
           messageEl.classList.add('hidden');
        }
        if (submitButton) submitButton.disabled = true;
        showSpinner(spinnerId, true);

        // Basic client-side validation
        if (!username || !password) {
             if(errorEl){ errorEl.textContent = 'Username and password required.'; errorEl.classList.remove('hidden'); }
              if (submitButton) submitButton.disabled = false;
              showSpinner(spinnerId, false);
             return;
         }
         if (password.length < 6) {
             if(errorEl){ errorEl.textContent = 'Password must be at least 6 characters.'; errorEl.classList.remove('hidden'); }
              if (submitButton) submitButton.disabled = false;
              showSpinner(spinnerId, false);
             return;
         }

         try {
             // Attempt API call
             const result = await apiRequest('/auth/register', 'POST', { username, password });
             const successMsg = result.message || 'Registration successful! Please login.';
             if (messageEl) {
                // Display success message in the dedicated registration message area
                messageEl.textContent = successMsg;
                messageEl.className = 'form-message success'; // Ensure correct class
                messageEl.classList.remove('hidden');
             } else {
                 showStatusMessage('globalStatus', successMsg, 'success'); // Fallback
             }
             form.reset(); // Clear form on success
         } catch (error) {
             // Display API or network errors in the dedicated registration error area
             const message = error.data?.message || error.message || 'Registration failed.';
              if(errorEl){
                  errorEl.textContent = message;
                  errorEl.classList.remove('hidden');
              }
              else { showStatusMessage('globalStatus', message, 'error'); } // Fallback
         } finally {
             // Always re-enable button and hide spinner
             if (submitButton) submitButton.disabled = false;
             showSpinner(spinnerId, false);
         }
    }

    // --- Initialization ---
    function initialize() {
        setupGlobalListeners();
        initializePage(); // Setup page-specific listeners and elements
        console.log('MediaTracker Initialized (v2.1).');
    }

    // Wait for DOM content and run initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize(); // DOMContentLoaded already fired
    }

})();
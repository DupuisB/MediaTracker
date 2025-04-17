// public/js/modules/libraryHandlers.js
import { apiRequest } from './api.js';
import { showStatusMessage, showSpinner, openModal, closeModal, setupDeleteConfirmation, formModal } from './ui.js';
import { getTemplate } from './templates.js';

/**
 * Updates the interaction controls UI on the media detail page.
 * @param {object|null} libraryItemData - The library item data, or null if removed.
 */
function updateInteractionControls(libraryItemData = null) {
    const controls = document.querySelector('.user-interaction-controls');
    if (!controls) return;
    const isAdded = !!libraryItemData;
    // console.log(`Updating controls. Is Added: ${isAdded}`, libraryItemData);

    controls.dataset.libraryItemId = isAdded ? libraryItemData.id : '';
    const statusSelect = controls.querySelector('#detailStatusSelect');
    const ratingInput = controls.querySelector('#detailRatingInput');
    const favoriteToggle = controls.querySelector('#detailFavoriteToggle');
    const notesInput = controls.querySelector('#detailNotesInput');
    const addButton = controls.querySelector('.add-to-library-btn');
    const updateButton = controls.querySelector('button[type="submit"]');
    const removeButton = controls.querySelector('.remove-from-library-btn');

    if (isAdded) {
        statusSelect.value = libraryItemData.userStatus || 'planned';
        ratingInput.value = libraryItemData.userRating || '';
        favoriteToggle.checked = libraryItemData.isFavorite || false;
        notesInput.value = libraryItemData.userNotes || '';
    } else {
        statusSelect.value = 'planned';
        ratingInput.value = '';
        favoriteToggle.checked = false;
        notesInput.value = '';
    }
    addButton?.classList.toggle('hidden', isAdded);
    updateButton?.classList.toggle('hidden', !isAdded);
    removeButton?.classList.toggle('hidden', !isAdded);
    showStatusMessage('interactionStatus', '', 'info', 0); // Clear status
}


/**
 * Opens the modal to add or edit a library item.
 * @param {'add'|'edit'} mode - The mode ('add' or 'edit').
 * @param {object} itemData - Data for the item (from search result or existing library item).
 */
async function openLibraryItemFormModal(mode = 'add', itemData = {}) {
    const template = await getTemplate('itemFormModal');
    if (!template || !formModal) {
        showStatusMessage('globalStatus','Failed to load item form.', 'error');
        return;
    }
    const isAddMode = mode === 'add';
    const context = {
        mode: mode,
        modalTitle: isAddMode ? `Add "${itemData.title}" to Library` : `Edit "${itemData.title}"`,
        submitButtonText: isAddMode ? 'Add to Library' : 'Save Changes',
        item: { ...itemData, libraryItemId: isAddMode ? null : itemData.id }
    };
    openModal(formModal, template(context), 'modal-library-item');
}

/**
 * Handles submission of the library item add/edit form (modal).
 * @param {Event} event - The form submission event.
 */
async function handleLibraryItemFormSubmit(event) {
    event.preventDefault();
    const form = event.target;
    if (form.id !== 'libraryItemForm') return;

    const mode = form.dataset.mode;
    const libraryItemId = form.dataset.libraryItemId || form.dataset.itemId;
    const modalErrorEl = form.querySelector('.modal-error-message');
    modalErrorEl?.classList.add('hidden');
    showSpinner('modalSpinner', true);

    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    const payload = {
        ...(mode === 'add' && {
            mediaType: data.mediaType, mediaId: data.mediaId, title: data.title,
            imageUrl: data.imageUrl, releaseYear: data.releaseYear
        }),
        userStatus: data.userStatus, userRating: data.userRating || null,
        isFavorite: data.isFavorite === 'true', userNotes: data.userNotes,
    };

    try {
        let result; let message = '';
        if (mode === 'add') {
            result = await apiRequest('/library', 'POST', payload);
            message = `"${result.title}" added to library!`;
            if (document.querySelector('.media-detail-page')) updateInteractionControls(result);
        } else {
            if (!libraryItemId) throw new Error("Cannot edit item without library ID.");
            result = await apiRequest(`/library/${libraryItemId}`, 'PUT', payload);
            message = `"${result.title}" updated in library!`;
            if (document.querySelector('.media-detail-page')) updateInteractionControls(result);
        }
        showStatusMessage('globalStatus', message, 'success');
        closeModal(formModal);
        if (window.location.pathname === '/' || window.location.pathname.startsWith('/profile')) {
            setTimeout(() => window.location.reload(), 500);
        }
    } catch (error) {
        const errMsg = error.data?.message || error.message || 'Operation failed.';
        if (modalErrorEl) { modalErrorEl.textContent = errMsg; modalErrorEl.classList.remove('hidden'); }
        else { showStatusMessage('globalStatus', errMsg, 'error'); }
    } finally {
        showSpinner('modalSpinner', false);
    }
}

/**
 * Handles the form submission for updating interactions on the media detail page.
 * @param {Event} event - The form submission event.
 */
async function handleInteractionFormSubmit(event) {
    event.preventDefault();
    const form = event.target;
    if (form.id !== 'mediaInteractionForm') return;

    const controls = form.closest('.user-interaction-controls');
    const libraryItemId = controls?.dataset.libraryItemId;

    if (!libraryItemId) {
        showStatusMessage('interactionStatus', 'Error: Item must be added before updating.', 'error');
        return;
    }

    showSpinner('interactionSpinner', true);
    showStatusMessage('interactionStatus', '', 'info', 0);

    const formData = new FormData(form);
    const payload = {
       userStatus: formData.get('userStatus'), userRating: formData.get('userRating') || null,
       isFavorite: formData.get('isFavorite') === 'true', userNotes: formData.get('userNotes'),
   };

   try {
        const result = await apiRequest(`/library/${libraryItemId}`, 'PUT', payload);
        showStatusMessage('interactionStatus', 'Library item updated!', 'success', 2000);
        updateInteractionControls(result); // Update with latest data
   } catch (error) {
        const message = error.data?.message || error.message || 'Failed to update.';
        showStatusMessage('interactionStatus', message, 'error', 4000);
   } finally {
        showSpinner('interactionSpinner', false);
   }
}

/**
 * Handles the click on the "Add to Library" button on the media detail page.
 * @param {Event} event - The click event.
 */
async function handleAddToLibraryClick(event) {
    const button = event.target;
    const controls = button.closest('.user-interaction-controls');
    const form = controls?.querySelector('#mediaInteractionForm');
    const { mediaType, mediaId, title, imageUrl, releaseYear } = controls.dataset; // Get core details

    const statusSelect = controls.querySelector('#detailStatusSelect');
    if (!statusSelect || !statusSelect.value) {
        showStatusMessage('interactionStatus', 'Status is required to add item.', 'error', 4000);
        statusSelect?.focus();
        return;
    }

    if (!title || !mediaType || !mediaId) {
        showStatusMessage('interactionStatus', "Error: Missing core media details.", 'error');
        console.error("Missing core details from dataset:", controls.dataset);
        return;
     }


    showSpinner('interactionSpinner', true);
    showStatusMessage('interactionStatus', 'Adding...', 'info', 0);

    try {
        const formData = new FormData(form); // Get interaction values from form
        const payload = {
            mediaType, mediaId, title, imageUrl: imageUrl || null, releaseYear: releaseYear || null,
            userStatus: formData.get('userStatus'), userRating: formData.get('userRating') || null,
            isFavorite: formData.get('isFavorite') === 'true', userNotes: formData.get('userNotes') || '',
        };
        const result = await apiRequest('/library', 'POST', payload);
        showStatusMessage('interactionStatus', 'Added to library!', 'success', 2000);
        updateInteractionControls(result);
    } catch (error) {
         const message = error.data?.message || error.message || 'Failed to add item.';
         showStatusMessage('interactionStatus', message, 'error', 4000);
    } finally {
         showSpinner('interactionSpinner', false);
    }
}

/**
 * Sets up event listeners specific to the media detail page.
 */
function initMediaDetailInteraction() {
    const controls = document.querySelector('.user-interaction-controls');
    if (controls) {
        const interactionForm = controls.querySelector('#mediaInteractionForm');
        interactionForm?.addEventListener('submit', handleInteractionFormSubmit); // Handles UPDATE

        controls.addEventListener('click', (event) => {
             if (event.target.matches('.add-to-library-btn')) { // Handles ADD
                 handleAddToLibraryClick(event);
             } else if (event.target.matches('.remove-from-library-btn')) { // Sets up REMOVE confirm
                  const libraryItemId = controls.dataset.libraryItemId;
                  const title = controls.dataset.title || 'this item';
                  if (libraryItemId) {
                      setupDeleteConfirmation({ id: libraryItemId, type: 'library', title: title });
                  } else {
                      console.error("Remove click failed: libraryItemId missing.");
                      showStatusMessage('interactionStatus', 'Error: Cannot identify item to remove.', 'error');
                  }
             }
        });
    }
}


export {
    openLibraryItemFormModal,
    handleLibraryItemFormSubmit,
    initMediaDetailInteraction,
    updateInteractionControls
};
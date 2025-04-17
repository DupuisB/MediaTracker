// public/js/modules/ui.js
import { apiRequest } from './api.js'; // Import apiRequest for delete action
import { updateInteractionControls } from './libraryHandlers.js'; // Import to reset controls after library delete

const body = document.body;
// Keep track of modals needed by UI functions
const formModal = document.getElementById('formModal');
const deleteConfirmModal = document.getElementById('deleteConfirmModal');

// State for delete confirmation
let itemToDelete = { id: null, type: null, title: null, listId: null };

/**
 * Shows or hides a spinner element.
 * @param {string} spinnerId - The ID of the spinner element.
 * @param {boolean} [show=true] - Whether to show or hide the spinner.
 */
function showSpinner(spinnerId, show = true) {
    document.getElementById(spinnerId)?.classList.toggle('hidden', !show);
}

/**
 * Displays a status message in a designated element.
 * @param {string} elementId - The ID of the status message element.
 * @param {string} message - The message text.
 * @param {'info'|'success'|'error'|'warning'} [type='info'] - Message type for styling.
 * @param {number|null} [duration=3000] - Auto-hide duration in ms (null to persist).
 */
function showStatusMessage(elementId, message, type = 'info', duration = 3000) {
    const el = document.getElementById(elementId);
    const globalStatus = document.getElementById('globalStatus'); // Fallback

    const targetEl = el || globalStatus; // Use specific element or fallback to global

    if (!targetEl) {
        console.warn(`Status element not found: #${elementId} or #globalStatus`);
        return;
    }

    targetEl.textContent = message;
    targetEl.className = `status-message ${type}`; // Base class + type class
    targetEl.classList.remove('hidden');

    if (!message) { // Hide immediately if message is empty
        targetEl.classList.add('hidden');
        return;
    }
    if (duration !== null && duration > 0) { // Check for positive duration
        setTimeout(() => targetEl.classList.add('hidden'), duration);
    }
}

/**
 * Opens a modal dialog.
 * @param {HTMLElement} modalElement - The modal overlay element.
 * @param {string} [contentHTML=''] - HTML content to inject into the modal's content area.
 * @param {string} [modalClass=''] - An optional specific class to add to the modal overlay.
 */
function openModal(modalElement, contentHTML = '', modalClass = '') {
    if (!modalElement) return;
    const contentArea = modalElement.querySelector('.modal-content-area') || modalElement.querySelector('#modalContentArea');
    if (contentArea && contentHTML) {
        contentArea.innerHTML = contentHTML;
    }
    modalElement.className = modalElement.className.replace(/modal-[\w-]+/g, ''); // Clear old specific classes
    if (modalClass) modalElement.classList.add(modalClass);
    modalElement.classList.remove('hidden');
    body.classList.add('modal-open');
}

/**
 * Closes a modal dialog.
 * @param {HTMLElement} modalElement - The modal overlay element.
 */
function closeModal(modalElement) {
    if (!modalElement) return;
    modalElement.classList.add('hidden');
    modalElement.className = modalElement.className.replace(/modal-[\w-]+/g, ''); // Remove specific class
    const contentArea = modalElement.querySelector('.modal-content-area') || modalElement.querySelector('#modalContentArea');
    if (contentArea) {
        contentArea.innerHTML = ''; // Clear content
    }
    body.classList.remove('modal-open');
}

/**
 * Sets up the delete confirmation modal.
 * @param {object} options - Details of the item to delete.
 * @param {number|string} options.id - The ID of the item.
 * @param {'library'|'list'|'listItem'} options.type - The type of item.
 * @param {string} [options.title='this item'] - Display name of the item.
 * @param {number|string} [options.listId] - The list ID (required if type is 'listItem').
 */
function setupDeleteConfirmation({ id, type, title = 'this item', listId = null }) {
    if (!id || !type) {
        console.error("Delete setup failed: id and type are required.");
        return;
    }
    if (type === 'listItem' && !listId) {
        console.error("Delete setup failed: listId is required for listItem deletion.");
        return;
    }

    itemToDelete = { id, type, title, listId };
    console.log("Setting up delete confirmation:", itemToDelete); // Debug

    const messageEl = deleteConfirmModal?.querySelector('#deleteConfirmMessage');
    if (messageEl) {
        let message = `Are you sure you want to delete "${title}"?`;
        if (type === 'list') message += ' This cannot be undone.';
        if (type === 'listItem') message = `Are you sure you want to remove "${title}" from this list?`;
        messageEl.textContent = message;
    } else {
        console.error("Delete confirmation message element not found.");
    }
    openModal(deleteConfirmModal);
}

/**
 * Handles the actual deletion after confirmation.
 */
async function handleDeleteConfirm() {
    if (!itemToDelete.id || !itemToDelete.type) {
         console.error("Delete aborted: itemToDelete state is invalid", itemToDelete);
         closeModal(deleteConfirmModal);
         return;
    }

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
                     updateInteractionControls(null); // Reset controls on detail page
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

        if (type === 'library' && window.location.pathname.startsWith('/profile')) {
             setTimeout(() => window.location.reload(), 500);
        }

    } catch (error) {
         const message = error.data?.message || error.message || 'Deletion failed.';
         showStatusMessage('globalStatus', message, 'error');
         closeModal(deleteConfirmModal);
    } finally {
        itemToDelete = { id: null, type: null, title: null, listId: null }; // Reset state
        showSpinner('deleteSpinner', false);
        if(confirmBtn) confirmBtn.disabled = false;
    }
}


export {
    showSpinner,
    showStatusMessage,
    openModal,
    closeModal,
    setupDeleteConfirmation,
    handleDeleteConfirm,
    formModal,
    deleteConfirmModal
};
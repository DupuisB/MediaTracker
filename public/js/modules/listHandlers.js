// public/js/modules/profileHandlers.js
import { apiRequest } from './api.js';
import { showStatusMessage } from './ui.js';

/**
 * Handles submission of the profile privacy form.
 * @param {Event} event - The form submission event.
 */
async function handlePrivacyFormSubmit(event) {
    event.preventDefault();
    const form = event.target;
    if (form.id !== 'privacyForm') return;
    const saveButton = form.querySelector('button[type="submit"]');
    saveButton.disabled = true;
    showStatusMessage('privacyStatus', 'Saving...', 'info', 0);

    const formData = new FormData(form);
    const payload = { profilePrivacy: formData.get('profilePrivacy') };
    try {
        await apiRequest('/profile/me', 'PUT', payload);
        showStatusMessage('privacyStatus', 'Privacy updated!', 'success');
    } catch (error) {
         const message = error.data?.message || error.message || 'Failed.';
         showStatusMessage('privacyStatus', `Update failed: ${message}`, 'error');
    } finally {
         saveButton.disabled = false;
    }
}

/**
 * Initializes event listeners specific to the profile page.
 */
function initProfileInteractions() {
    const privacyForm = document.getElementById('privacyForm');
    privacyForm?.addEventListener('submit', handlePrivacyFormSubmit);
}

export { initProfileInteractions };
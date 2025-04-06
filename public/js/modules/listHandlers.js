// public/js/modules/listHandlers.js
import { apiRequest } from './api.js';
import { showStatusMessage, showSpinner, openModal, closeModal, setupDeleteConfirmation, formModal } from './ui.js';
// No template needed here as forms are built with strings currently

/**
 * Handles clicking the "Create New List" button.
 */
function handleCreateListClick() {
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

/**
 * Handles clicking the "Edit List" button. Fetches list data and shows modal.
 * @param {Event} event - The click event.
 */
async function handleEditListClick(event) {
    const button = event.target.closest('.edit-list-btn');
    const listId = button?.dataset.listId;
    if (!listId) return;

    openModal(formModal, '<div class="spinner"></div> Loading list details...', 'modal-list-form');

     try {
        const listData = await apiRequest(`/lists/${listId}`);
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
         else closeModal(formModal);
     } catch (error) {
          const message = error.data?.message || error.message || 'Failed to load list data.';
           const contentArea = formModal.querySelector('#modalContentArea');
           if(contentArea) contentArea.innerHTML = `<p class="error-message">${message}</p><button class="modal-close-btn" aria-label="Close">×</button>`;
           else showStatusMessage('globalStatus', message, 'error');
     }
}

/**
 * Handles submission of the list create/edit form.
 * @param {Event} event - The form submission event.
 */
async function handleListFormSubmit(event) {
    event.preventDefault();
    const form = event.target;
    if (form.id !== 'listForm') return;

    const mode = form.dataset.mode;
    const listId = form.dataset.listId;
    const modalErrorEl = form.querySelector('.modal-error-message');
    modalErrorEl?.classList.add('hidden');
    showSpinner('modalSpinner', true);

    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());
    payload.isPublic = payload.isPublic === 'true';

    try {
        let result; let message = '';
        if (mode === 'create') {
            result = await apiRequest('/lists', 'POST', payload);
            message = `List "${result.title}" created!`;
        } else {
             if (!listId) throw new Error("Missing list ID for edit.");
            result = await apiRequest(`/lists/${listId}`, 'PUT', payload);
            message = `List "${result.title}" updated!`;
        }
         showStatusMessage('globalStatus', message, 'success');
         closeModal(formModal);
         if (window.location.pathname === '/lists') { // Reload only on overview page
            setTimeout(() => window.location.reload(), 500);
         } else if (window.location.pathname.startsWith('/lists/')) { // Or update detail page title?
             document.querySelector('.list-info h1').textContent = result.title || 'Untitled List';
             // Update other details if necessary
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
 * Handles clicking the "Delete List" button.
 * @param {Event} event - The click event.
 */
function handleDeleteListClick(event) {
    const button = event.target.closest('.delete-list-btn');
    const listId = button?.dataset.listId;
    const listTitle = button?.dataset.listTitle || 'this list';
    if (!listId) return;
    setupDeleteConfirmation({ id: listId, type: 'list', title: listTitle });
}

/**
 * Handles submission of the "Add Item to List" form.
 * @param {Event} event - The form submission event.
 */
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
         form.reset();
         setTimeout(() => window.location.reload(), 1500); // Reload detail page
    } catch (error) {
        const message = error.data?.message || error.message || 'Failed to add item.';
        statusEl.textContent = message;
         statusEl.className = 'status-message error';
    } finally {
         setTimeout(() => statusEl.classList.add('hidden'), 5000);
    }
}

/**
 * Handles clicking the "Remove Item from List" button.
 * @param {Event} event - The click event.
 */
function handleRemoveListItemClick(event) {
     const button = event.target.closest('.remove-list-item-btn');
     const listItemRow = button?.closest('.list-item-row');
     const listId = listItemRow?.closest('.list-items-section')?.dataset.listId || document.body.dataset.listId;
     const listItemId = listItemRow?.dataset.listItemId;
     const itemTitle = listItemRow?.querySelector('.col-title a')?.textContent || 'this item';

     if (!listId || !listItemId) {
         console.error("Could not determine listId or listItemId for removal.");
         showStatusMessage('globalStatus', 'Error: Could not identify item to remove.', 'error');
         return;
     }
     setupDeleteConfirmation({ id: listItemId, type: 'listItem', title: itemTitle, listId: listId });
}

/**
 * Shows the edit comment form for a list item.
 * @param {Event} event - The click event.
 */
function handleEditListItemCommentClick(event) {
   const button = event.target.closest('.edit-list-item-comment-btn');
   const listItemRow = button?.closest('.list-item-row');
   const editForm = listItemRow?.querySelector('.edit-comment-form');
   const commentDisplay = listItemRow?.querySelector('.col-comment');
   if (!listItemRow || !editForm || !commentDisplay) return;

   // Hide other open forms
   listItemRow.closest('.list-items-table')?.querySelectorAll('.edit-comment-form:not(.hidden)')
       .forEach(form => handleCancelEditListItemCommentClick({ target: form.querySelector('.cancel-edit-comment-btn') }));

   commentDisplay.classList.add('hidden');
   editForm.classList.remove('hidden');
   button.classList.add('hidden');
   listItemRow.querySelector('.remove-list-item-btn')?.classList.add('hidden');
   editForm.querySelector('input[name="userComment"]')?.focus();
}

/**
 * Hides the edit comment form for a list item.
 * @param {Event} event - The click event.
 */
function handleCancelEditListItemCommentClick(event) {
    const button = event.target.closest('.cancel-edit-comment-btn') || event.target.closest('.edit-comment-form');
    const listItemRow = button?.closest('.list-item-row');
    const editForm = listItemRow?.querySelector('.edit-comment-form');
    const commentDisplay = listItemRow?.querySelector('.col-comment');
    if (!listItemRow || !editForm || !commentDisplay) return;

    editForm.classList.add('hidden');
    commentDisplay.classList.remove('hidden');
    listItemRow.querySelector('.edit-list-item-comment-btn')?.classList.remove('hidden');
    listItemRow.querySelector('.remove-list-item-btn')?.classList.remove('hidden');
}

/**
* Handles submission of the edit comment form for a list item.
* @param {Event} event - The form submission event.
*/
async function handleListItemCommentFormSubmit(event) {
   event.preventDefault();
   const form = event.target;
   if (!form.classList.contains('edit-comment-form')) return;

   const listItemRow = form.closest('.list-item-row');
   const listId = listItemRow?.closest('.list-items-section')?.dataset.listId || document.body.dataset.listId;
   const listItemId = listItemRow?.dataset.listItemId;
   const commentInput = form.querySelector('input[name="userComment"]');
   const commentDisplay = listItemRow?.querySelector('.col-comment');
   const originalComment = commentDisplay?.textContent; // Preserve original in case of error

   if (!listId || !listItemId || !commentInput || !commentDisplay) return;

   const payload = { userComment: commentInput.value };
   commentDisplay.textContent = 'Saving...';
   commentDisplay.classList.remove('hidden');
   form.classList.add('hidden');

   try {
       const result = await apiRequest(`/lists/${listId}/items/${listItemId}`, 'PUT', payload);
       commentDisplay.textContent = result.userComment || '---';
       handleCancelEditListItemCommentClick({ target: form });
    } catch (error) {
        const message = error.data?.message || error.message || 'Failed to save comment.';
        console.error("Comment save error:", message);
        commentDisplay.textContent = originalComment; // Revert on error
        alert(`Error: ${message}`);
        handleCancelEditListItemCommentClick({ target: form });
    }
}

/**
 * Initializes event listeners for list overview and detail pages.
 */
function initListInteractions() {
    const createListBtn = document.getElementById('createListBtn'); // Overview page
    const listsContainer = document.querySelector('.lists-container'); // Overview page
    const listDetailContainer = document.querySelector('.list-detail-page'); // Detail page

    // Overview Page
    if (createListBtn) {
        createListBtn.addEventListener('click', handleCreateListClick);
    }
    if (listsContainer) {
        listsContainer.addEventListener('click', (event) => {
             if (event.target.closest('.edit-list-btn')) handleEditListClick(event);
             else if (event.target.closest('.delete-list-btn')) handleDeleteListClick(event);
        });
    }

    // Detail Page
    if (listDetailContainer) {
        // Set listId on body/section for context if needed by handlers
        const pathParts = window.location.pathname.split('/').filter(p => p);
        if (pathParts[0] === 'lists' && pathParts[1]) {
            document.body.dataset.listId = pathParts[1];
            listDetailContainer.querySelector('.list-items-section')?.setAttribute('data-list-id', pathParts[1]);
        }

        listDetailContainer.addEventListener('submit', (event) => {
            if (event.target.id === 'addToListForm') handleAddToListFormSubmit(event);
            else if (event.target.classList.contains('edit-comment-form')) handleListItemCommentFormSubmit(event);
        });

        listDetailContainer.addEventListener('click', (event) => {
            if (event.target.closest('.edit-list-btn')) handleEditListClick(event);
            else if (event.target.closest('.delete-list-btn')) handleDeleteListClick(event);
            else if (event.target.closest('.remove-list-item-btn')) handleRemoveListItemClick(event);
            else if (event.target.closest('.edit-list-item-comment-btn')) handleEditListItemCommentClick(event);
            else if (event.target.closest('.cancel-edit-comment-btn')) handleCancelEditListItemCommentClick(event);
        });
    }
}

export { initListInteractions, handleListFormSubmit, handleCreateListClick, handleEditListClick, handleDeleteListClick, handleAddToListFormSubmit, handleRemoveListItemClick, handleEditListItemCommentClick, handleCancelEditListItemCommentClick, handleListItemCommentFormSubmit };
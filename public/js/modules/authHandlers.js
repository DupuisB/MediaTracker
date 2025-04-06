// public/js/modules/authHandlers.js
import { apiRequest } from './api.js';
import { showStatusMessage, showSpinner } from './ui.js';

/**
 * Handles the login form submission.
 * @param {Event} event - The form submission event.
 */
async function handleLogin(event) {
    event.preventDefault();
    const form = event.target;
    const username = form.username.value.trim();
    const password = form.password.value.trim();
    const errorEl = document.getElementById('loginError');
    const submitButton = form.querySelector('button[type="submit"]');
    const spinnerId = 'loginSpinner';

    if (errorEl) { errorEl.textContent = ''; errorEl.classList.add('hidden'); }
    if (submitButton) submitButton.disabled = true;
    showSpinner(spinnerId, true);

    if (!username || !password) {
       if(errorEl){ errorEl.textContent = 'Username and password required.'; errorEl.classList.remove('hidden'); }
       if (submitButton) submitButton.disabled = false;
       showSpinner(spinnerId, false);
       return;
    }

    try {
        const result = await apiRequest('/auth/login', 'POST', { username, password });
        if (result && result.user) {
            window.location.href = '/'; // Redirect on success
        } else {
            throw new Error("Login response missing user data.");
        }
    } catch (error) {
        const message = error.data?.message || error.message || 'Login failed.';
        if(errorEl){ errorEl.textContent = message; errorEl.classList.remove('hidden'); }
        else { showStatusMessage('globalStatus', message, 'error'); }
        if (submitButton) submitButton.disabled = false;
        showSpinner(spinnerId, false);
    }
}

/**
 * Handles the registration form submission.
 * @param {Event} event - The form submission event.
 */
async function handleRegister(event) {
    event.preventDefault();
    console.log("handleRegister executed");
    const form = event.target;
    const username = form.username.value.trim();
    const password = form.password.value.trim();
    const errorEl = document.getElementById('registerError');
    const messageEl = document.getElementById('registerMessage');
    const submitButton = form.querySelector('button[type="submit"]');
    const spinnerId = 'registerSpinner';

    if (errorEl) { errorEl.textContent = ''; errorEl.classList.add('hidden'); }
    if (messageEl) { messageEl.textContent = ''; messageEl.classList.add('hidden'); }
    if (submitButton) submitButton.disabled = true;
    showSpinner(spinnerId, true);

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
         const result = await apiRequest('/auth/register', 'POST', { username, password });
         const successMsg = result.message || 'Registration successful! Please login.';
         if (messageEl) {
            messageEl.textContent = successMsg;
            messageEl.className = 'form-message success';
            messageEl.classList.remove('hidden');
         } else {
             showStatusMessage('globalStatus', successMsg, 'success');
         }
         form.reset();
     } catch (error) {
         const message = error.data?.message || error.message || 'Registration failed.';
          if(errorEl){ errorEl.textContent = message; errorEl.classList.remove('hidden'); }
          else { showStatusMessage('globalStatus', message, 'error'); }
     } finally {
         if (submitButton) submitButton.disabled = false;
         showSpinner(spinnerId, false);
     }
}

/**
 * Handles the logout button click.
 */
async function handleLogout() {
    try {
        showStatusMessage('globalStatus', 'Logging out...', 'info', 0);
        await apiRequest('/auth/logout', 'POST');
        showStatusMessage('globalStatus', 'Logout successful. Redirecting...', 'success', 1500);
        setTimeout(() => { window.location.href = '/login'; }, 1500);
    } catch (error) {
         showStatusMessage('globalStatus', 'Logout failed.', 'error');
    }
}

/**
 * Initializes authentication related event listeners.
 */
function initAuthListeners() {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const logoutBtn = document.getElementById('logoutBtn');

    if (loginForm) {
        console.log("Attaching listener to login form");
        loginForm.addEventListener('submit', handleLogin);
    }
    if (registerForm) {
        console.log("Attaching listener to register form");
        registerForm.addEventListener('submit', handleRegister);
    }
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
}

export { initAuthListeners };
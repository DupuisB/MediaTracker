// public/js/modules/api.js
import { showStatusMessage } from './ui.js'; // Import necessary UI functions

const API_BASE_URL = '/api';

/**
 * Makes an API request.
 * @param {string} endpoint - The API endpoint (e.g., '/auth/login').
 * @param {string} [method='GET'] - HTTP method.
 * @param {object|null} [body=null] - Request body for POST/PUT.
 * @returns {Promise<object>} - The JSON response data.
 * @throws {Error} - Throws an error if the request fails or response is not ok.
 */
async function apiRequest(endpoint, method = 'GET', body = null) {
    const url = `${API_BASE_URL}${endpoint}`;
    const options = {
        method,
        headers: {
            'Accept': 'application/json'
            // Cookies are sent automatically by the browser
        },
    };
    if (body && (method === 'POST' || method === 'PUT' || method === 'DELETE')) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
    }

    try {
        // console.log(`API Request: ${method} ${url}`, body ? 'with body' : '');
        const response = await fetch(url, options);
        // console.log(`API Response Status: ${response.status} for ${method} ${url}`);

        if (response.status === 204) { // Handle No Content
            // console.log('API Response: 204 No Content');
            return {};
        }

        // Check if response is JSON before parsing
        const contentType = response.headers.get("content-type");
        let responseData;
        if (contentType && contentType.indexOf("application/json") !== -1) {
            responseData = await response.json();
        } else {
             // Handle non-JSON responses if necessary, or assume error
             if(!response.ok) {
                 const text = await response.text();
                 throw new Error(text || `HTTP error ${response.status}`);
             } else {
                 responseData = {}; // Or handle text response appropriately
             }
        }

        // console.log(`API Response Data for ${method} ${url}:`, responseData);

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
        showStatusMessage('globalStatus', message, 'error', 5000); // Show error globally

        throw error; // Re-throw for calling function
    }
}

export { apiRequest };
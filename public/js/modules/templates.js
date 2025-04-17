// public/js/modules/templates.js
import { showStatusMessage } from './ui.js';

const TEMPLATE_BASE_URL = '/templates'; // URL for fetching partials
let compiledTemplates = {}; // Cache

function setupHandlebarsHelpers() {
    if (!window.Handlebars) {
        console.warn('Handlebars runtime not found. Cannot register helpers.');
        return;
    }
    // Register helpers
    const helpers = {
        eq: (v1, v2) => v1 === v2,
        json: (context) => JSON.stringify(context),
        currentYear: () => new Date().getFullYear(),
        capitalize: (str) => (typeof str === 'string' && str.length > 0) ? str.charAt(0).toUpperCase() + str.slice(1) : str,
        formatYear: (dateValue) => {
            if (!dateValue) return '';
            if (typeof dateValue === 'number') return dateValue.toString();
            try {
                const year = new Date(dateValue).getFullYear();
                return isNaN(year) ? dateValue.match(/\d{4}/)?.[0] || '' : year;
            } catch { return dateValue.match(/\d{4}/)?.[0] || ''; }
        },
        formatDate: (dateString) => dateString ? new Date(dateString).toLocaleDateString() : '',
        classify: (str) => typeof str === 'string' ? str.replace(/\s+/g, '-').toLowerCase() : '',
        defaultIfEmpty: (value, defaultValue) => value ?? defaultValue ?? '',
        join: (arr, separator) => Array.isArray(arr) ? arr.join(separator) : '',
        truncate: (str, len) => (str && str.length > len) ? str.substring(0, len) + '...' : str,
        statusOutlineClass: (status) => {
            switch (status?.toLowerCase()) {
                case 'completed': return 'outline-green';
                case 'watching': case 'reading': case 'playing': return 'outline-blue';
                case 'planned': return 'outline-red';
                case 'paused': return 'outline-yellow';
                case 'dropped': return 'outline-grey';
                default: return '';
            }
        },
        isOwner: (resourceOwnerId, loggedInUserId) => resourceOwnerId === loggedInUserId,
        list: function() { return Array.from(arguments).slice(0, -1); }
    };
    Object.keys(helpers).forEach(key => Handlebars.registerHelper(key, helpers[key]));
    console.log("Handlebars helpers registered.");
}

/**
 * Fetches and compiles a Handlebars template.
 * @param {string} templateName - The name of the partial (e.g., 'itemFormModal').
 * @returns {Promise<Function|null>} Compiled Handlebars template function or null on error.
 */
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
        showStatusMessage('globalStatus', `Error loading UI template ${templateName}.`, 'error');
        return null;
    }
}

export { setupHandlebarsHelpers, getTemplate };
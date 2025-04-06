// public/js/modules/homepageHandlers.js
import { apiRequest } from './api.js';
import { getTemplate } from './templates.js';
import { initSwipers } from './swiperSetup.js'; // Import Swiper setup

const tabContainer = document.querySelector('.homepage-tabs');
const contentArea = document.querySelector('.tab-content-area');
let templates = {}; // Cache for Handlebars partials

async function loadTemplates() {
    // Pre-load necessary templates
    templates.mediaCard = await getTemplate('mediaCard');
    // Add others if needed
}

function renderContent(type, data) {
    const panel = contentArea.querySelector(`.tab-content[data-type="${type}"]`);
    if (!panel) return;

    if (!templates.mediaCard) {
        console.error("Media card template not loaded.");
        panel.innerHTML = '<p class="error-message">Error rendering content.</p>';
        return;
    }
    if (!data || !data.hottest || !data.recommendations) {
         panel.innerHTML = `<p class="placeholder-text">Could not load data for ${type}.</p>`;
         return;
    }

    // Using the same data for Hottest and Recommendations as requested
    let hottestHtml = '';
    if (data.hottest.length > 0) {
        hottestHtml = `
            <section class="media-carousel-section">
                <h2 class="section-title">🔥 Hottest ${capitalize(type)}</h2>
                <div class="swiper media-swiper">
                    <div class="swiper-wrapper">
                        ${data.hottest.map(item => `<div class="swiper-slide">${templates.mediaCard({ items: [item] })}</div>`).join('')}
                    </div>
                    <div class="swiper-button-prev"></div>
                    <div class="swiper-button-next"></div>
                </div>
            </section>
        `;
    } else {
         hottestHtml = `<p class="placeholder-text">No hottest ${type} found.</p>`;
    }


    let recommendationsHtml = '';
     if (data.recommendations.length > 0) {
         recommendationsHtml = `
            <section class="media-carousel-section">
                <h2 class="section-title">✨ Recommended ${capitalize(type)}</h2>
                <div class="swiper media-swiper">
                    <div class="swiper-wrapper">
                         ${data.recommendations.map(item => `<div class="swiper-slide">${templates.mediaCard({ items: [item] })}</div>`).join('')}
                    </div>
                    <div class="swiper-button-prev"></div>
                    <div class="swiper-button-next"></div>
                </div>
            </section>
        `;
     } else {
         recommendationsHtml = `<p class="placeholder-text">No recommended ${type} found.</p>`;
     }


    panel.innerHTML = hottestHtml + recommendationsHtml; // Combine sections

    // Re-initialize swipers AFTER new content is added
    initSwipers();
}

async function fetchHomepageData(type) {
    const panel = contentArea.querySelector(`.tab-content[data-type="${type}"]`);
    if (!panel || panel.dataset.loaded === 'true') return; // Already loaded or panel missing

    panel.innerHTML = `<div class="loading-placeholder">Loading ${capitalize(type)}... <div class="spinner"></div></div>`; // Show loader

    try {
        const data = await apiRequest(`/homepage-data?type=${type}`);
        renderContent(type, data);
        panel.dataset.loaded = 'true'; // Mark as loaded
    } catch (error) {
        console.error(`Failed to fetch homepage data for ${type}:`, error);
        panel.innerHTML = `<p class="error-message">Could not load ${type} data. ${error.message || ''}</p>`;
        panel.dataset.loaded = 'error'; // Mark as failed
    }
}

function handleTabClick(event) {
    const targetTab = event.target.closest('.nav-item');
    if (!targetTab || !tabContainer.contains(targetTab)) return;

    const type = targetTab.dataset.type;
    if (!type) return;

    // Update tab active state
    tabContainer.querySelectorAll('.nav-item').forEach(tab => tab.classList.remove('active'));
    targetTab.classList.add('active');

    // Hide all content panels
    contentArea.querySelectorAll('.tab-content').forEach(panel => panel.classList.add('hidden'));

    // Show the target panel
    const targetPanel = contentArea.querySelector(`.tab-content[data-type="${type}"]`);
    if (targetPanel) {
        targetPanel.classList.remove('hidden');
        // Fetch data if it hasn't been loaded yet
        if (targetPanel.dataset.loaded !== 'true' && targetPanel.dataset.loaded !== 'error') {
             fetchHomepageData(type);
        }
    } else {
        console.warn(`Content panel not found for type: ${type}`);
    }
}

function capitalize(str) {
     if (typeof str !== 'string' || str.length === 0) return str;
     // Handle "video game" specifically
     if (str === 'video game') return 'Video Games';
     return str.charAt(0).toUpperCase() + str.slice(1);
}


async function initHomepageTabs() {
    if (!tabContainer || !contentArea) return; // Don't run if elements aren't present
    console.log("Initializing homepage tabs...");
    await loadTemplates(); // Load Handlebars partials first
    tabContainer.addEventListener('click', handleTabClick);
    // Ensure initial Swipers (for server-rendered content) are initialized by main.js
}

export { initHomepageTabs };
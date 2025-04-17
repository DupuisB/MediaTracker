# MediaTracker Project Documentation

## Table of Contents

- [MediaTracker Project Documentation](#mediatracker-project-documentation)
  - [Table of Contents](#table-of-contents)
  - [1. Introduction \& Overview](#1-introduction--overview)
  - [2. Project Architecture](#2-project-architecture)
  - [3. Backend Details](#3-backend-details)
    - [3.1. Server Setup (`server.js`)](#31-server-setup-serverjs)
    - [3.2. Authentication (`auth.js`)](#32-authentication-authjs)
    - [3.3. Database (`database.js`)](#33-database-databasejs)
    - [3.4. Routing](#34-routing)
  - [4. Frontend Details](#4-frontend-details)
    - [4.1. Structure (`public/`)](#41-structure-public)
    - [4.2. Templating (`views/`)](#42-templating-views)
    - [4.3. Client-Side JavaScript (`public/js/`)](#43-client-side-javascript-publicjs)
  - [5. Design, UI \& UX Choices](#5-design-ui--ux-choices)
    - [5.1. Visual Design \& Styling](#51-visual-design--styling)
    - [5.2. User Interface (UI) Elements](#52-user-interface-ui-elements)
    - [5.3. User Experience (UX) Choices](#53-user-experience-ux-choices)
  - [6. Accessibility (A11Y) Choices](#6-accessibility-a11y-choices)
  - [7. Running the Project](#7-running-the-project)
  - [8. Potential Future Improvements](#8-potential-future-improvements)
## 1. Introduction & Overview

MediaTracker is a web application designed to help users track and manage their consumption of various media types, including movies, TV series, books, and video games. Users can register, log in, search for media items across different external APIs (TMDB, Google Books, IGDB), add items to their personal library, track their status (planned, watching, completed, etc.), assign ratings, add notes, and organize items into custom lists.

The application is built using a Node.js backend with the Express framework, utilizing SQLite for data persistence. The frontend is rendered using Handlebars, enhanced with client-side JavaScript for dynamic interactions.

**Core Technologies:**

*   **Backend:** Node.js, Express.js
*   **Database:** SQLite3
*   **Templating:** Handlebars.js (via `express-handlebars`)
*   **Authentication:** JSON Web Tokens (JWT) stored in HttpOnly Cookies, bcrypt for password hashing
*   **API Interaction (Backend):** Axios (for calling TMDB, Google Books, IGDB)
*   **Frontend JS:** Vanilla JavaScript (ES Modules), Handlebars Runtime, Swiper.js
*   **Styling:** CSS3 (structured using a modular approach)
*   **Development:** Nodemon

## 2. Project Architecture

The project follows a standard Model-View-Controller (MVC)-inspired pattern, although not strictly enforced, with clear separation of concerns:

*   **`/` (Root):** Contains core server setup (`server.js`), database initialization (`database.js`), authentication logic (`auth.js`), configuration (`.env`, `package.json`), and the SQLite database file (`watchlist.db`).
*   **`public/`:** Holds all static assets served directly to the client.
    *   `css/`: Contains structured CSS files (base styles, components, layout, page-specific, utilities).
    *   `js/`: Contains client-side JavaScript, organized into modules (`modules/`) for better maintainability (`api.js` for API calls, `ui.js` for UI interactions, specific handlers like `authHandlers.js`, `libraryHandlers.js`, etc.). `main.js` acts as the entry point.
    *   `images/`: Stores static image assets like placeholders.
*   **`routes/`:** Defines the application's routing.
    *   `viewRoutes.js`: Handles routes that render HTML pages using Handlebars templates. It often fetches data by calling the application's own API endpoints.
    *   `api/`: Contains sub-routers for different API functionalities (authentication, search, media details, library management, lists, profile management, homepage data).
*   **`views/`:** Contains Handlebars templates.
    *   `layouts/`: Main page layouts (`main.hbs`, `auth.hbs`).
    *   `partials/`: Reusable UI components (header, footer, cards, forms, modals, list rows, etc.).
    *   Root-level `.hbs` files: Templates for specific pages (home, login, mediaDetail, etc.).

## 3. Backend Details

### 3.1. Server Setup (`server.js`)

*   Initializes the Express application.
*   Loads environment variables using `dotenv`.
*   Configures middleware:
    *   `cors`: For handling Cross-Origin Resource Sharing (configured for the app's own origin).
    *   `express.json`, `express.urlencoded`: For parsing request bodies.
    *   `cookie-parser`: For handling JWT cookies.
    *   `express.static`: For serving files from the `public/` directory.
*   Sets up the `express-handlebars` view engine, defining layouts, partials directories, and numerous **custom helpers** (e.g., `eq`, `formatDate`, `statusOutlineClass`, `isOwner`, `capitalize`) which are crucial for rendering logic within templates.
*   Mounts the different route handlers (`viewRoutes`, API routes).
*   Includes error handling middleware (404 and general error handlers).
*   Starts the server and includes graceful shutdown logic (`SIGINT`) to close the database connection properly.

### 3.2. Authentication (`auth.js`)

*   Uses `bcrypt` for securely hashing passwords (`hashPassword`, `comparePassword`).
*   Employs JSON Web Tokens (JWT) for session management.
*   Stores JWTs in `httpOnly`, `secure` (in production), `lax` SameSite cookies (`setAuthCookie`, `clearAuthCookie`) for improved security against XSS.
*   Provides middleware:
    *   `verifyToken`: Protects API routes by checking for a valid JWT in cookies. Attaches `req.userId` and `req.user`.
    *   `checkAuthStatus`: Checks for a valid token on *all* view routes and makes user information (`res.locals.user`) available to templates, allowing conditional rendering based on login status. Doesn't block access if the token is invalid/missing.
    *   `requireLogin`: Protects specific view routes by redirecting unauthenticated users to the login page.

### 3.3. Database (`database.js`)

*   Uses `sqlite3` driver in verbose mode.
*   Connects to the `watchlist.db` file.
*   Wraps core `db` methods (`get`, `all`, `run`) with `util.promisify` (and a custom wrapper for `run`) to enable `async/await` usage, improving code readability. Includes basic error handling for common DB errors like UNIQUE constraints.
*   `initializeDatabaseV2()` function:
    *   Defines the database schema using `CREATE TABLE IF NOT EXISTS` for safe, idempotent initialization.
    *   **Schema:**
        *   `users`: Stores user credentials, profile info (image URL, privacy setting), and timestamps. `username` is unique.
        *   `library_items`: The core table linking users to media items. Stores basic media info (ID from external API, type, title, image, year), user interaction data (status, rating [0-20 scale using `REAL`], notes, favorite flag), and timestamps. `UNIQUE(userId, mediaType, mediaId)` prevents duplicates per user.
        *   `user_lists`: Stores metadata for user-created custom lists (title, description, visibility, cover image).
        *   `user_list_items`: Links items from `library_items` to `user_lists`, allowing items to be in multiple lists. Includes list-specific comments. `UNIQUE(listId, libraryItemId)` prevents adding the same library item twice to the same list.
    *   Uses `FOREIGN KEY` constraints with `ON DELETE CASCADE` where appropriate (e.g., deleting a user removes their library items and lists; deleting a list removes its list items).
    *   Creates indexes (`idx_library_user_status`, `idx_library_user_favorite`) for faster querying.
    *   Defines triggers (`update_library_item_timestamp`, `update_user_list_timestamp`) to automatically update the `updatedAt` column on relevant table updates.

### 3.4. Routing

*   **View Routes (`viewRoutes.js`):** Responsible for rendering the HTML pages presented to the user.
    *   Often act as a "Backend-for-Frontend" by fetching data from the application's own API endpoints using `axios` and passing it to Handlebars templates for server-side rendering.
    *   Handles logic for different pages like the homepage (fetching initial tab data, watchlist), media details (combining external API data with user library data), search results, user profiles (fetching profile data, stats, recent items), and list views.
    *   Includes permission checks (e.g., preventing access to private lists/profiles).
    *   Provides an endpoint (`/templates/:templateName`) to serve specific Handlebars partials needed for client-side rendering/updates.
*   **API Routes (`routes/api/*.js`):** Handle data operations and interactions with external services.
    *   `authRoutes.js`: Handles user registration, login, and logout.
    *   `searchRoutes.js`: Proxies search requests to external APIs (TMDB, Google Books, IGDB) based on the `type` parameter, standardizing the results format.
    *   `detailsRoutes.js`: Fetches detailed information for a specific media item from the relevant external API, standardizing the response structure. Includes logic for fetching related data like credits, trailers, banners.
    *   `libraryRoutes.js`: Manages the user's personal media library (`library_items` table). Handles adding, updating, deleting, and retrieving library items with filtering and sorting capabilities. Provides an endpoint for library statistics.
    *   `listRoutes.js`: Manages user-created custom lists (`user_lists`, `user_list_items`). Handles CRUD operations for lists and list items (including adding/removing items and updating comments).
    *   `profileRoutes.js`: Handles fetching user profile information (combining user data and library stats) and updating profile settings (privacy, image URL).
    *   `homepageDataRoutes.js`: Provides data for the dynamic tabs on the homepage (fetching "popular" items from external APIs).
    *   `igdbAuthHelper.js`: Contains logic for authenticating with the Twitch API to get an access token for IGDB API calls, including caching the token. Also includes a helper (`convertRatingTo10`) which was likely intended for standardizing API ratings but seems unused or possibly applied differently in the final data structures. *Correction: The 0-20 user rating scale seems independent of this helper.*

## 4. Frontend Details

### 4.1. Structure (`public/`)

*   Static assets are well-organized into `css`, `js`, and `images`.
*   The CSS uses a modular structure (see Design section).
*   JavaScript is modularized, promoting code reuse and separation of concerns.

### 4.2. Templating (`views/`)

*   Handlebars is used for server-side rendering (`viewRoutes.js`).
*   Extensive use of **partials** (`views/partials/`) like `header.hbs`, `footer.hbs`, `mediaCard.hbs`, `itemFormModal.hbs`, `userInteractionControls.hbs`, `listSummaryRow.hbs`, `listItemRow.hbs` promotes UI consistency and maintainability.
*   Layouts (`views/layouts/`) define the main HTML structure (`main.hbs`) and potentially specialized ones (`auth.hbs`).
*   Templates utilize the custom Handlebars helpers defined in `server.js` for conditional logic, formatting, and generating CSS classes.
*   Data attributes (`data-media-id`, `data-list-id`, `data-type`, etc.) are used frequently in templates to facilitate JavaScript interactions.
*   Some partials are also fetched and compiled on the **client-side** (`templates.js`, `/templates/:templateName` route) to dynamically update the UI without full page reloads (e.g., opening a form modal).

### 4.3. Client-Side JavaScript (`public/js/`)

*   **Entry Point (`main.js`):** Initializes the application, sets up global event listeners (e.g., for modals), initializes page-specific functionality based on the URL path, and coordinates the loading of other modules.
*   **Modules (`modules/`):**
    *   `api.js`: Centralizes `fetch` calls to the backend API. Handles request/response logic, basic error display (`showStatusMessage`), and automatic redirection on critical auth errors (401).
    *   `ui.js`: Provides reusable UI functions for common patterns: showing/hiding spinners, displaying status messages (globally or targeted), opening/closing modals, and managing the delete confirmation flow. Crucial for consistent UX feedback.
    *   `templates.js`: Manages fetching, compiling (using the Handlebars runtime loaded via CDN), and caching Handlebars partials needed for client-side UI updates. Also registers client-side versions of the Handlebars helpers.
    *   `swiperSetup.js`: Initializes and configures Swiper.js carousels found on the page, including responsive breakpoints.
    *   `authHandlers.js`: Handles login, registration, and logout interactions initiated from the UI (e.g., form submissions). Uses `api.js` and `ui.js`.
    *   `homepageHandlers.js`: Manages the tabbed interface on the homepage, dynamically loading content for different media types via `api.js` and rendering it using client-side templates (`templates.js`). Shows loading states.
    *   `libraryHandlers.js`: Handles user interactions related to their library, primarily on the media detail page (add/update/remove via `userInteractionControls.hbs`) and potentially through modals (`itemFormModal.hbs`). Updates the UI state based on API responses.
    *   `listHandlers.js`: Manages all interactions related to custom lists: creating/editing/deleting lists (often via modals), adding/removing items from lists (on the list detail page), and editing item comments inline. Uses confirmation modals for destructive actions.
    *   `profileHandlers.js`: Handles interactions specific to the user profile page, such as updating privacy settings.

## 5. Design, UI & UX Choices

### 5.1. Visual Design & Styling

*   **Consistency:** A core principle, achieved through:
    *   **CSS Variables (`_variables.css`):** Centralizes colors, fonts, spacing, shadows, border-radius, transitions, etc. This makes global style changes easy and ensures a consistent look and feel.
    *   **Modular CSS Structure:** Dividing CSS into `base`, `components`, `layout`, `pages`, and `utils` promotes organization and reusability. Files like `_buttons.css`, `_card.css`, `_forms.css` define the look of common elements.
*   **Clean & Modern Aesthetic:** The chosen variables (light grey background, white cards, blue primary color, subtle shadows) are for a clean, modern design.
*   **Component-Based Styling:** Styles are often scoped to components (e.g., `.media-card`, `.modal-content`, `.btn`), aligning with the partial-based Handlebars structure.
*   **Visual Feedback:**
    *   **Status Outlines (`_card.css`, `statusOutlineClass` helper):** Media cards have colored outlines based on their library status (e.g., green for completed, blue for watching), providing immediate visual cues.
    *   **Tags (`_tags.css`):** Used for visually categorizing media types and statuses with distinct colors/styles.
    *   **Hover & Focus States:** Defined for interactive elements like buttons and links (`a:hover`, `.btn:hover`, `.btn:focus-visible`) improve usability. Form inputs also have distinct focus styles (`_forms.css`).

### 5.2. User Interface (UI) Elements

*   **Header (`_header.css`, `header.hbs`):** Sticky header provides persistent navigation and search access. Includes logo, a prominent search bar, and user navigation (profile link/icon, login/logout buttons). Responsive adjustments hide logo text and rearrange elements on smaller screens.
*   **Cards (`_card.css`, `mediaCard.hbs`, `listCard` styles):** Used extensively for displaying media items and lists in grids and carousels. Designed for clarity with image, title, subtitle/year. Media cards include optional status indicators/outlines.
*   **Forms (`_forms.css`, form partials):** Consistently styled forms for login, registration, library item details, list creation/editing, etc. Clear labels, input styling, and validation feedback (error messages).
*   **Buttons (`_buttons.css`):** Standardized button styles (primary, secondary, danger, small) ensure consistent calls to action. Icons are sometimes used within buttons.
*   **Modals (`_modal.css`, `ui.js`, modal partials):** Used for actions requiring focused user input (adding/editing library items, creating/editing lists) and confirmations (delete actions). Include overlay, clear close buttons, and dedicated content areas.
*   **Carousels (`_swiper.css`, `swiperSetup.js`):** Swiper.js is used for horizontally scrollable lists of media items or lists (homepage, profile page, media details), providing a space-efficient way to display related content. Include navigation buttons and pagination.
*   **Tabs (`_navigation.css`, `homepageHandlers.js`):** Horizontal tab navigation is used on the homepage to switch between media types, dynamically loading content.
*   **Status Messages (`_base.css`, `ui.js`):** Standardized feedback messages (success, error, info) displayed globally or within specific components (forms, modals) to inform the user of action results.
*   **Spinners (`_spinner.css`, `ui.js`):** Loading indicators used during asynchronous operations (API calls, form submissions) to provide feedback that the system is working.
*   **Tables (`_listRow.css`):** Used on the List Detail page to display items in a structured format. Includes responsive design to stack columns on smaller screens.

### 5.3. User Experience (UX) Choices

*   **Clear Authentication Flow:** Separate Login/Register forms (`login.hbs`), redirects for logged-in users, clear logout functionality. User status is consistently reflected in the UI (`res.locals.user`, header changes).
*   **Seamless Navigation:** Sticky header, clear links, and logical page structure.
*   **Efficient Browsing:** Carousels and grids allow users to browse many items quickly. Tabs on the homepage allow filtering content by media type.
*   **In-Context Actions:**
    *   Media Detail page allows adding/editing/removing the item directly from the library using `userInteractionControls.hbs`.
    *   List Detail page allows adding/removing items and editing comments inline.
*   **Dynamic Updates:** Client-side JavaScript fetches data and updates sections of the page (homepage tabs, modals) without requiring full page reloads, creating a smoother, more app-like feel.
*   **Feedback & State Management:**
    *   Loading states (spinners, placeholder text like "Loading...") are shown during data fetching (`homepageHandlers.js`, `ui.js`).
    *   Success and error messages (`showStatusMessage` in `ui.js`) provide immediate feedback after actions. Form validation errors are displayed near the relevant fields.
    *   UI elements update to reflect state changes (e.g., add/update buttons swapping on the media detail page via `updateInteractionControls`).
*   **Confirmation for Destructive Actions:** Modals (`deleteConfirmModal` in `ui.js`) are used to confirm deletions (library items, lists, list items), preventing accidental data loss.
*   **Profile Customization:** Users can control their profile's visibility (public/private).
*   **Error Handling:** Graceful handling of API errors (displaying messages in the UI), 404 pages, and general server errors. API calls handle specific statuses (401, 404, 409).
*   **Responsive Design:** The UI adapts to different screen sizes, ensuring usability on desktops, tablets, and mobile devices (evident in CSS media queries and Swiper breakpoints).

## 6. Accessibility (A11Y) Choices

Accessibility has been considered in several areas, though a full audit would be recommended:

*   **Semantic HTML:** (Inferred) The use of Handlebars partials for components like headers, nav, forms likely encourages the use of appropriate HTML5 tags (`<header>`, `<nav>`, `<main>`, `<button>`, `<label>`, etc.).
*   **Keyboard Navigation:** Standard interactive elements (links, buttons, form inputs) should be keyboard accessible by default. Defined focus styles (`:focus-visible` in `_buttons.css`, input focus styles in `_forms.css`) provide visual indication for keyboard users.
*   **Screen Reader Support:**
    *   `.sr-only` class (`_helpers.css`) is available to provide text for screen readers while hiding it visually (e.g., for filter labels).
    *   `aria-label` attributes are used on some elements like modal close buttons and potentially icon-only buttons (`header.hbs`).
    *   `aria-live` is used on status message containers (`loginForm.hbs`, `registerForm.hbs`, potentially added by `ui.js`) to announce feedback to screen reader users.
    *   Form inputs have associated `<label>` elements (`_forms.css` structure, templates).
    *   Image `alt` attributes are present in templates, though some rely on dynamic titles (`{{title}} Poster`) and placeholders have generic alt text. `onerror` handlers provide fallbacks for broken images.
*   **Color Contrast:** Design tokens in `_variables.css` aim for readable text (e.g., `--color-text-base: #333` on `--color-bg-body: #f8f9fa`), but specific component combinations (e.g., tag colors) should be manually checked against WCAG guidelines.
*   **Reduced Motion:** A `prefers-reduced-motion: reduce` media query is included in `_reset.css` to disable or reduce animations and transitions for users who prefer it.
*   **Modals:** Modals have clear `aria-label`ed close buttons. *Consideration: Ensure focus is properly trapped within the modal when open and returned to the triggering element on close.*
*   **Forms:** Explicit labels, appropriate input types (`type="search"`, `type="number"`), and client-side validation hints (`required`, `minlength`) improve form accessibility. Error messages (`aria-live`) announce issues.

## 7. Running the Project

1.  **Prerequisites:** Node.js and npm installed.
2.  **Clone/Download:** Get the project code.
3.  **Install Dependencies:** Navigate to the project root in your terminal and run:
    ```bash
    npm install
    ```
4.  **Environment Variables:** Create a `.env` file in the project root with the required variables (`PORT`, `JWT_SECRET`, `TMDB_API_KEY`, `GOOGLE_BOOKS_API_KEY`, `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET`).

    ```dotenv
    PORT=3001
    JWT_SECRET=your_super_secret_jwt_key_here
    NODE_ENV=development # or production

    # External API Keys (Get these from the respective services)
    TMDB_API_KEY=YOUR_TMDB_API_KEY
    GOOGLE_BOOKS_API_KEY=YOUR_GOOGLE_BOOKS_API_KEY # Optional but recommended
    IGDB_CLIENT_ID=YOUR_IGDB_CLIENT_ID
    IGDB_CLIENT_SECRET=YOUR_IGDB_CLIENT_SECRET
    ```
5.  **Run in Development:** For development with automatic restarting on file changes (using Nodemon):
    ```bash
    npm run dev
    ```
6.  **Run in Production:** For a standard production start:
    ```bash
    npm start
    ```
7.  **Access:** Open your web browser and navigate to `http://localhost:PORT` (e.g., `http://localhost:3001`).

## 8. Potential Future Improvements

*   **Testing:** Implement unit, integration, and end-to-end tests.
*   **Lists:** Finalize the basic lists functions (add, edit, ...) as they do not work at the moment.
*   **Pagination:** Add pagination for library views, search results, and lists with many items.
*   **Advanced Search/Filtering:** More granular filtering options within the library/search.
*   **Accessibility Audit:** Conduct a thorough A11Y audit using tools and manual testing (especially color contrast and focus management in modals/dynamic components).
*   **Image Uploads:** Allow users to upload custom profile pictures or list covers instead of just URLs.
*   **Social Features:** Friend system, activity feeds, sharing lists.
*   **Performance Optimization:** Create our own database instead of relying on API calls.

## 5. Key File Explanations

### 5.1. Backend (`/`, `routes/`, `auth.js`, `database.js`)

*   **`server.js`**:
    *   Sets up the Express application.
    *   Configures middleware (CORS, JSON parsing, URL encoding, cookie parsing, static files).
    *   Sets up the Handlebars view engine with custom helpers.
    *   Mounts API routes (`/api/*`) and view routes (`/`).
    *   Includes global `checkAuthStatus` middleware to make user info available to views.
    *   Defines global error handling middleware (404, general errors).
    *   Starts the HTTP server.
*   **`database.js`**:
    *   Establishes connection to the SQLite database (`watchlist_v2.db`).
    *   Uses `util.promisify` to create Promise-based versions of `db.get`, `db.all`.
    *   Provides a custom `db.runAsync` wrapper for `INSERT`, `UPDATE`, `DELETE` returning `{ lastID, changes }` on success.
    *   `initializeDatabaseV2`: Defines and creates the necessary tables (`users`, `library_items`, `user_lists`, `user_list_items`) and indexes **IF THEY DO NOT EXIST**. This makes it safe to run on startup. Includes triggers for `updatedAt` timestamps.
*   **`auth.js`**:
    *   Handles core authentication logic decoupled from Express routes.
    *   `hashPassword`, `comparePassword`: Uses `bcrypt` for secure password handling.
    *   `generateToken`, `setAuthCookie`, `clearAuthCookie`: Manages JWT creation and setting/clearing `httpOnly` cookies.
    *   `verifyToken` (Middleware): Protects API routes by checking for a valid JWT in cookies. Attaches `req.userId` and `req.user` if valid. Returns 401 for invalid/missing tokens.
    *   `checkAuthStatus` (Middleware): Checks for a valid token on *all* requests (including views). Attaches `res.locals.user` ({ id, username }) if logged in, making user data available to Handlebars templates. Does *not* block requests if not logged in.
    *   `requireLogin` (Middleware): Protects view routes. Redirects to `/login` if `res.locals.user` is not set (i.e., user is not logged in).
*   **`routes/viewRoutes.js`**:
    *   Defines routes that render HTML pages using Handlebars templates (`res.render`).
    *   Often fetches data needed for the page by making `axios` requests to its *own* API endpoints (`/api/*`), passing along the user's cookies for authentication. This pattern keeps data fetching logic centralized in the API routes.
    *   Uses `requireLogin` middleware for pages that require authentication.
    *   Includes a route (`/templates/:templateName`) to serve specific Handlebars partials for client-side rendering.
*   **`routes/api/`**:
    *   Contains all API endpoint definitions, grouped by resource type.
    *   These routes typically interact with the database (`database.js`) and authentication (`auth.js`).
    *   They return JSON data.
    *   Protected routes use the `verifyToken` middleware.
    *   `authRoutes.js`: Handles `/api/auth/register`, `/login`, `/logout`.
    *   `searchRoutes.js`: Handles `/api/search?type=<type>&query=<q>`; proxies requests to external APIs (TMDB, Google Books, IGDB).
    *   `detailsRoutes.js`: Handles `/api/details/<type>/<id>`; fetches detailed info from external APIs, including banner/trailer data.
    *   `libraryRoutes.js`: Handles `/api/library` CRUD operations for the user's personal media library (`library_items` table). Includes filtering, sorting, and stats endpoints.
    *   `listRoutes.js`: Handles `/api/lists` CRUD operations for user-created lists (`user_lists`, `user_list_items` tables).
    *   `profileRoutes.js`: Handles `/api/profile` endpoints for fetching user profile data (combining user info and library stats) and updating profile settings.
    *   `homepageDataRoutes.js`: Handles `/api/homepage-data?type=<type>`; fetches popular/recommended items from external APIs for the homepage tabs.
    *   `igdbAuthHelper.js`: Contains logic specific to authenticating with the Twitch/IGDB API and caching the token. Also includes the `convertRatingTo10` helper.

### 5.2. Frontend (`public/`)

*   **`public/js/main.js`**:
    *   Main entry point for client-side JavaScript (using ES Modules).
    *   Initializes other modules (`initAuthListeners`, `initSwipers`, etc.).
    *   Sets up global event listeners, particularly for modals (close buttons, form submissions).
    *   Determines the current page path and calls page-specific initialization functions (e.g., `initMediaDetailInteraction` on media detail pages).
    *   Handles the search results page navigation tabs.
*   **`public/js/modules/api.js`**:
    *   Provides a centralized `apiRequest` function using `fetch` for making calls to the backend API (`/api/*`).
    *   Handles setting headers, sending JSON bodies, and basic error handling (showing global status messages, redirecting on 401).
*   **`public/js/modules/ui.js`**:
    *   Contains reusable UI manipulation functions:
        *   `showSpinner`, `showStatusMessage`: Control loading indicators and feedback messages.
        *   `openModal`, `closeModal`: Manage modal dialog visibility and content.
        *   `setupDeleteConfirmation`, `handleDeleteConfirm`: Encapsulates the logic for the delete confirmation modal, including making the API call for deletion.
*   **`public/js/modules/templates.js`**:
    *   `setupHandlebarsHelpers`: Registers Handlebars helpers for client-side use (must match server-side helpers).
    *   `getTemplate`: Fetches specific Handlebars partials (like `itemFormModal.hbs`) from the server (`/templates/:templateName`) and compiles them for client-side rendering (e.g., inside modals).
*   **`public/js/modules/swiperSetup.js`**:
    *   Initializes all Swiper.js carousels found on the page with appropriate configurations based on CSS classes (`.media-swiper`, `.cast-swiper`, etc.). Handles destroying old instances before re-initializing.
*   **`public/js/modules/*Handlers.js`**:
    *   These files contain the specific logic for different application features:
        *   `authHandlers.js`: Handles login/register form submissions and logout button clicks.
        *   `libraryHandlers.js`: Handles interactions on the media detail page (add/update/remove from library via `userInteractionControls`) and the add/edit library item modal form (`itemFormModal`). Includes `updateInteractionControls` to reflect library status changes on the UI.
        *   `listHandlers.js`: Handles creating, editing, deleting lists, and adding/removing/editing items within a list (both overview and detail pages). Manages list-related modals and forms.
        *   `profileHandlers.js`: Handles interactions specific to the profile page, like updating privacy settings.
        *   `homepageHandlers.js`: Manages the tabbed interface on the homepage, dynamically loading content for different media types via API calls.
*   **`public/css/`**:
    *   Contains all stylesheets, organized using a modular approach (Base, Layout, Components, Pages, Utils).
    *   `style.css` imports all other CSS files.
    *   `_variables.css` defines CSS custom properties (variables) for consistent theming (colors, fonts, spacing).
    *   Component files (`_buttons.css`, `_card.css`, etc.) style reusable UI elements.
    *   Page files (`_home.css`, `_profile.css`, etc.) provide styles specific to certain pages.

### 5.3. Views (`views/`)

*   **`views/layouts/main.hbs`**: The main HTML structure used for most pages. Includes header, footer, main content area (`{{{body}}}`), global modal structures, and script tags (Handlebars runtime, Swiper, `main.js`).
*   **`views/layouts/auth.hbs`**: A potentially simpler layout used for login/register pages, perhaps omitting the main header/footer.
*   **`views/partials/`**: Contains reusable chunks of HTML/Handlebars templates:
    *   `header.hbs`, `footer.hbs`: Site header and footer.
    *   `mediaCard.hbs`: Renders a single media item card (used in grids, carousels).
    *   `listSummaryRow.hbs`: Renders a row summarizing a list on the overview page.
    *   `listItemRow.hbs`: Renders a row for an item within a list detail page table.
    *   `userInteractionControls.hbs`: The form/controls section on the media detail page for adding/updating library status, rating, etc.
    *   `itemFormModal.hbs`: The content for the modal used to add/edit library items.
    *   `loginForm.hbs`, `registerForm.hbs`: The login and registration forms.
*   **`views/*.hbs`**: Templates for individual pages (e.g., `home.hbs`, `mediaDetail.hbs`, `userProfile.hbs`). These use the layouts and include partials to build the final HTML sent to the browser. They receive data passed from `viewRoutes.js`.

## 6. Setup and Running

1.  **Clone:** `git clone <repository-url>`
2.  **Install Dependencies:** `cd MediaTracker && npm install`
3.  **Environment Variables:** Create a `.env` file in the root directory and add the following (replace placeholders):
    ```dotenv
    PORT=3001
    JWT_SECRET=your_strong_jwt_secret_key_here # Replace with a strong, random key
    NODE_ENV=development # or production

    # API Keys (Required for search/details)
    TMDB_API_KEY=your_tmdb_api_key
    GOOGLE_BOOKS_API_KEY=your_google_books_api_key # Optional, but needed for book search/details
    IGDB_CLIENT_ID=your_igdb_client_id
    IGDB_CLIENT_SECRET=your_igdb_client_secret
    ```
4.  **Database:** The `database.js` file will automatically create `watchlist_v2.db` if it doesn't exist when the application starts.
5.  **Run in Development:** `npm run dev` (uses Nodemon for auto-restarting)
6.  **Run in Production:** `npm start`
7.  **Access:** Open `http://localhost:3001` (or the configured PORT) in your browser.

## 7. Key Concepts & Architecture

*   **MVC-like Pattern:** The application follows a structure similar to Model-View-Controller.
    *   **Model:** `database.js` and database interactions within API routes represent the data layer.
    *   **View:** Handlebars templates (`views/`) are responsible for presentation.
    *   **Controller:** Express routes (`routes/`) handle incoming requests, interact with the model (database/APIs), and select the view to render or data to return.
*   **API-Driven Views:** View routes (`viewRoutes.js`) often act as clients to the application's own API (`/api/*`) to fetch data needed for server-side rendering. This promotes separation of concerns.
*   **Client-Side Enhancement:** Vanilla JS modules enhance the user experience by handling form submissions via AJAX (`api.js`), updating the DOM dynamically (`ui.js`, `*Handlers.js`), managing modals, and initializing libraries like Swiper.js.
*   **Stateless Authentication:** JWTs are used for authentication. The server doesn't store session state; validity is checked via the token signature and expiry. Tokens are stored securely in `httpOnly` cookies.
*   **Modular Design:** Both backend (routes, auth, db) and frontend (JS modules, CSS components) code is organized into modules for better maintainability and reusability.
*   **Database Schema (V2):** The schema supports users, their library items (with detailed tracking), custom lists, and the relationship between lists and library items. Foreign keys with `ON DELETE CASCADE` simplify data management when users or lists are deleted.

This documentation should provide a solid foundation for understanding the MediaTracker application's structure and functionality.
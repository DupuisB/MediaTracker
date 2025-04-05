Okay, here is a categorical breakdown of the Media Tracking App design.

**I. Global Components & Styles**

1.  **Header Component:**
    *   **Presence:** Appears consistently at the top of most main screens.
    *   **Elements:**
        *   Website logo. Position: Top-left.
        *   Search Input Component labeled "Search". Position: Center. Functionality: Initiates search flow.
        *   Icon User Profile. Position: Top-right. Functionality: Navigates to the User's profile.
    *   **Styling:** Needs consistent height, background, and element spacing across screens.

2.  **Media Item Card Component:**
    *   **Usage:** Represents individual media items (movies, books, etc.) in lists and grids (Homepage, Search Results, Profile lists, etc.).
    *   **Elements:**
        *   Cover art/poster, with title, author and year of release below.
    *   **Layout:** Typically used in horizontal `RecyclerView`s or `GridView`s.
    *   **Styling:** Needs consistent dimensions, spacing, and text styles across all instances. The outline can be one of 3 colors (green, blue, red) to indicate wether the media has already been consumed, is being consumed, or is planned to be consumed.
    *   **Interactions:** Clicking the card navigates to the `MediaDetailScreen` for that item.

**II. Screens & Feature Breakdown**

1.  **`HomepageScreen` (Main Dashboard)**
    *   **Purpose:** Initial landing screen for browsing and discovery.
    *   **Layout:** `HeaderComponent` at top, followed by vertically stacked sections.
    *   **Elements:**
        *   `HorizontalNavigationBar` (or Tabs) below Header: Contains buttons/tabs (we will change them to icons later on) for "Movie", "Serie", "Book", "Video Game". Functionality: Filters content below or navigates to category-specific views.
        *   "Hottest" Section: `TextView` header, `RecyclerView` (horizontal) using `MediaItemCardComponent`. For now, cards are placeholder as the backend is not ready. Displays the most popular items.
        *   "In your watch list" Section: `TextView` header, `RecyclerView` (horizontal) using `MediaItemCardComponent`. Displays items marked by the user for later consumption.
        *   "Recommendation" Section: `TextView` header, `RecyclerView` (horizontal) using `MediaItemCardComponent`. For now, cards are placeholder as the backend is not ready. Displays items recommended for the user based on their profile.
    *   **Interactions:**
        *   Clicking a `MediaItemCardComponent`: Navigate to `MediaDetailScreen` with the corresponding media ID.
        *   Using `HeaderComponent` Search: Navigate to `SearchResultsScreen`.
        *   Clicking Profile Icon: Navigate to `UserProfileScreen`.
        *   Clicking Navigation Bar items: Filter content shown or navigate (requires clarification).

2.  **`MediaDetailScreen`**
    *   **Purpose:** Display detailed information about a single media item.
    *   **Layout:** `HeaderComponent` at top, followed by a vertically scrollable view.
    *   **Elements:**
        *   `ImageView` for large media picture/poster.
        *   `TextView` for Title.
        *   `TextView` for Subtitle.
        *   `TextView` for Description (multi-line).
        *   Metadata Section (Vertical list or Key-Value pairs):
            *   `TextView` labels: "Author", "Realisator", "Scenario", "Date".
            *   `TextView` values for the corresponding data.
            *   `RatingComponent` for "Average Note" (IMDB for movies, etc.).
            *   `UserRatingStatusComponent` (Stars): Represents the *current user's* status/rating. Annotation breakdown:
                *   Needs to reflect states: "Watching", "Watched", "Daily Review" (needs clarification - maybe just "Rated"?).
                *   Display state for 0 stars: Show avatars/count of "Friends who have watched".
        *   "Related Series" Section: `TextView` header, `RecyclerView` (horizontal) using `MediaItemCardComponent`.
        *   "Character/Cast" Section: `TextView` header, `RecyclerView` (horizontal) displaying small `ImageView` (person's picture) and `TextView` (person's name).
        *   `ReviewSection` (integrated within the scrollable view, see below). For now, cards are placeholder as the backend is not ready.
    *   **Interactions:**
        *   Clicking items in "Related Series": Navigate to another `MediaDetailScreen`.
        *   Interacting with `UserRatingStatusComponent`: Allow user to set their rating/status for this media item.

3.  **`SearchResultsScreen`**
    *   **Purpose:** Display results after using the global search bar.
    *   **Layout:** `HeaderComponent` at top, followed by categorized results.
    *   **Elements:**
        *   `TextView` indicating the search query: "Searched: '[Title]'".
        *   Categorized Sections (e.g., "Movies", "Books", "Games"):
            *   Each section has a `TextView` header for the category name.
            *   Each section uses a `GridView` or `RecyclerView` (with grid layout manager) displaying `MediaItemCardComponent`s relevant to the category and search query.
        *   Pagination/Load More Indicator (placeholder circle with plus shown). Functionality: Load subsequent results.
    *   **Interactions:**
        *   Clicking a `MediaItemCardComponent`: Navigate to `MediaDetailScreen`.
        *   Clicking "Load More": Fetch and display next page of results for relevant categories.


4.  **`UserProfileScreen`**
    *   **Purpose:** Display a user's profile information and activity.
    *   **Layout:** `HeaderComponent` at top, followed by profile details and activity lists.
    *   **Elements:**
        *   `ImageView` for Profile Picture.
        *   `TextView` for Name.
        *   Stats Section (Key-Value pairs or list):
            *   "Average score": `TextView` displaying user's average rating given.
            *   "Nb vues": `TextView` displaying count of media items consumed.
            *   Other stats indicated by "? : ..." - clarify required stats.
        *   `Switch` or `TextView` indicating "Public / private" profile visibility status. Functionality: Allow user to toggle (if it's their own profile).
        *   `Button` "Add friend". Functionality: Send friend request (visibility/state depends on relationship with viewed profile).
        *   "Last seen" Section: `TextView` header, `RecyclerView` (horizontal) using `MediaItemCardComponent` showing recently interacted media.
        *   "Favorite" Section: `TextView` header, `RecyclerView` (horizontal) using `MediaItemCardComponent` showing user's favorited media.
        *   "Public list" Section: `TextView` header, `RecyclerView` (horizontal) using `MediaItemCardComponent` (or a specific List Card component?) showing user's public lists.
    *   **Interactions:**
        *   Clicking items in "Last seen", "Favorite": Navigate to `MediaDetailScreen`.
        *   Clicking items in "Public list": Navigate to `ListDetailScreen`.
        *   Clicking "Add friend": Initiate friend request workflow.
        *   (Implicit) Navigation to `UserListsOverviewScreen` might exist (e.g., via a "View All Lists" button or dedicated tab if this screen used tabs).

5.  **`UserListsOverviewScreen`**
    *   **Purpose:** Display all lists created or accessible by the user.
    *   **Layout:** `HeaderComponent` at top, potentially Tabs, followed by list summaries.
    *   **Elements:**
        *   `TabNavigator` (Optional, implied by structure): With tabs like "All", "Shared Lists", "Personal Lists".
        *   List Display Area: `RecyclerView` (vertical) displaying summary rows for each list.
        *   List Summary Row Component:
            *   `CheckBox` (Purpose unclear - Selection? Action trigger?).
            *   `TextView` for List Title.
            *   `TextView` for "Nb items" (item count in the list).
            *   `TextView` for List Description.
            *   `TextView` for "Note" (Unclear meaning - average list item rating? User note on the list itself?).
    *   **Interactions:**
        *   Clicking a List Summary Row: Navigate to `ListDetailScreen` with the corresponding List ID.
        *   Using Tabs: Filter the lists displayed.
        *   Interacting with Checkbox: Define required action.

6.  **`ListDetailScreen`**
    *   **Purpose:** Display the contents and details of a specific user-created list.
    *   **Layout:** `HeaderComponent` at top, followed by list details and items.
    *   **Elements:**
        *   `ImageView` for List Cover Picture (optional, placeholder shown).
        *   `TextView` for List Title.
        *   `TextView` for List Description.
        *   Sharing Information Section:
            *   `TextView` label: "Shared with:".
            *   `ImageView` icons representing users/groups shared with OR `TextView` indicating "public / private" status.
        *   List Items Table/`RecyclerView`: Displays media items within the list using rows.
        *   List Item Row Component:
            *   `CheckBox` (Purpose unclear - Mark as seen from list? Select for action?).
            *   `TextView` for Media Item Title.
            *   `TextView` for "Added" (Date added to list?).
            *   `TextView` for "Comment" (User's specific comment for this item *in this list*).
            *   `TextView` for "Seen" (Progress indicator, e.g., "2/24" for series, potentially text like "Finished").
            *   `TextView` for "Note" (User's rating/note for this item *in this list*, e.g., "2/5").
    *   **Interactions:**
        *   Clicking a Media Item Title in the row: Navigate to `MediaDetailScreen`.
        *   Interacting with Checkbox: Define required action.
        *   (Implicit) Editing capabilities for list items (comment, note, progress) if it's the user's own list.
        *   (Implicit) Functionality to manage sharing settings.

**III. Inferred Data Models**

Based on the UI, the following data structures (or database tables/collections) are likely required:

*   **Media:** id, type (movie, book...), title, subtitle, description, coverImageUrl, releaseDate, author, director, screenwriter, averageRating, characters[personId], relatedMedia[mediaId]...
*   **User:** id, name, profileImageUrl, averageScoreGiven, countMediaViewed, privacySetting, friends[userId], lists[listId], favorites[mediaId]...
*   **Person:** id, name, dateOfBirth, birthplace, description, imageUrl, associatedMedia[mediaId]...
*   **Review:** id, mediaId, userId, ratingType (good/bad or score), content, timestamp...
*   **UserMediaInteraction:** userId, mediaId, status (watching, watched, planned), userRating, addedToWatchlistTimestamp... (This captures user-specific state per media item).
*   **UserList:** id, ownerUserId, title, description, coverImageUrl, shareStatus (public, private), sharedWith[userId]...
*   **UserListItem:** id, listId, mediaId, dateAdded, userComment, progressStatus (e.g., "2/24", "Finished"), userRatingInList...

**IV. Key User Flows (Summary)**

1.  **Discovery & Viewing:** Homepage -> Media Detail -> (Related Media/Person Detail/Reviews)
2.  **Search:** Any Screen -> Search Results -> Media Detail
3.  **Profile Management:** Header Icon -> User Profile -> (View Activity/Lists)
4.  **List Management:** User Profile -> User Lists Overview -> List Detail -> (View Media Item Detail)
5.  **Social Interaction:** Media Detail (Friend Activity) / User Profile (Add Friend) / List Detail (Sharing)
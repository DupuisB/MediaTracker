# Watchlist & Media Library Backend Documentation

This document details the backend design for the Watchlist & Media Library app. The backend is built using **Node.js**, **Express.js**, and **SQLite**. It supports user authentication, external media search, and a personal media library with full CRUD (Create, Read, Update, Delete) operations.

---

## Table of Contents

- [Watchlist \& Media Library Backend Documentation](#watchlist--media-library-backend-documentation)
  - [Table of Contents](#table-of-contents)
  - [Features](#features)
  - [Tech Stack](#tech-stack)
  - [Database Schema](#database-schema)
    - [Users Table](#users-table)
    - [Library Items Table](#library-items-table)
  - [Authentication](#authentication)
  - [API Endpoints](#api-endpoints)
    - [User Authentication](#user-authentication)
      - [**Register a New User**](#register-a-new-user)
      - [**Login User**](#login-user)
    - [Media Search](#media-search)
      - [**Search Media**](#search-media)
    - [User Media Library](#user-media-library)
      - [**Get All Library Items**](#get-all-library-items)
      - [**Add a Media Item to the Library**](#add-a-media-item-to-the-library)
      - [**Edit a Library Item**](#edit-a-library-item)
      - [**Delete a Library Item**](#delete-a-library-item)

---

## Features

- **User Login/Registration**: Users can create accounts and log in.
- **Media Search**: Query third-party APIs (e.g., TMDB, IGDB, Goodreads) to retrieve media data such as title, description, author, image, genres, and ratings.
- **Media Library**: Users can add searched media to their personal library with a custom description, rating, and status.
- **CRUD Operations**: Users can view, edit, and delete items in their media library.
- **Filtering**: The library can be filtered by media type (movie, series, book, video game), user status (to watch/read/play, watching/reading/playing, watched/read/played), and user rating (from 1 to 20).

---

## Tech Stack

This tech stack is meant to be simple, as the developer is a begginer only experienced with the most classic tools.
The goal is to keep the backend lightweight (only a few files) and easy to maintain.

- **Backend Framework**: Node.js with Express.js
- **Database**: SQLite (file-based, local storage)
- **Middleware**: 
  - `cors` for handling cross-origin requests
  - `express.json()` for JSON payloads
- **Authentication**:
  - JSON Web Tokens (JWT) for managing user sessions
  - `bcrypt` for password hashing

---

## Database Schema

### Users Table

| Column         | Type      | Description                                |
| -------------- | --------- | ------------------------------------------ |
| `id`           | INTEGER   | Primary Key (auto-increment)               |
| `username`     | TEXT      | Unique username                            |
| `passwordHash` | TEXT      | Hashed password                            |
| `createdAt`    | DATETIME  | Timestamp of account creation              |

### Library Items Table

| Column          | Type      | Description                                                             |
| --------------- | --------- | ----------------------------------------------------------------------- |
| `id`            | INTEGER   | Primary Key (auto-increment)                                            |
| `userId`        | INTEGER   | Foreign Key – references `users(id)`                                    |
| `mediaType`     | TEXT      | Type of media: "movie", "series", "book", or "video game"               |
| `mediaId`       | TEXT      | Unique ID from the third-party API source                               |
| `userDescription` | TEXT    | Custom description or notes provided by the user                        |
| `userRating`    | INTEGER   | User rating (e.g., on a scale from 1 to 20)                             |
| `userStatus`    | TEXT      | Status: "to watch/read/play", "watching/reading/playing", "watched/read/played" |
| `addedAt`       | DATETIME  | Timestamp when the media was added to the library                       |
| `updatedAt`     | DATETIME  | Timestamp when the media was last updated                                |
| `watchedAt`    | DATETIME  | Timestamp when the media was marked as watched/read/played               |

*Note: You may add additional columns (e.g., timestamps for updates) as needed.*

---

## Authentication

For user authentication, consider the following approach:

1. **User Registration** (`POST /api/auth/register`):
   - Accepts a `username` and `password`.
   - Hash the password using `bcrypt` and store it in the `users` table.
2. **User Login** (`POST /api/auth/login`):
   - Verify the username and password.
   - On success, generate a JWT token that the client will use for subsequent requests.
3. **Protected Routes**:
   - All endpoints that manage a user's media library should verify the JWT token.
   - Middleware can be used to decode the token and attach the `userId` to the request object.

---

## API Endpoints

### User Authentication

#### **Register a New User**

- **Endpoint:** `POST /api/auth/register`
- **Request Body:**
  ```json
  {
      "username": "exampleUser",
      "password": "securePassword"
  }
  ```
- **Response:**
  - **Success:** Status 201 with user information (excluding the password)
  - **Failure:** Status 400 or 500 with an error message

---

#### **Login User**

- **Endpoint:** `POST /api/auth/login`
- **Request Body:**
  ```json
  {
      "username": "exampleUser",
      "password": "securePassword"
  }
  ```
- **Response:**
  - **Success:** Status 200 with a JWT token
  - **Failure:** Status 401 (Unauthorized) with an error message

---

### Media Search

The app will delegate media searches to third-party APIs. Create a proxy route if needed to avoid exposing API keys.

#### **Search Media**

- **Endpoint:** `GET /api/search`
- **Query Parameters:**
  - `query`: Search term (required)
  - `type`: Media type (optional – e.g., movie, series, book, video game)
- **Description:**
  - The backend receives the search request, determines which third-party API to call based on the media type, and returns the results.
- **Response:**
  - An array of media objects containing details like title, description, author, image, genres, and ratings.

*Note: third-party API(s) used (TMDB, IGDB, Google Books for now)*

---

### User Media Library

All endpoints below require the user to be authenticated. The `userId` from the JWT should be used to associate library items with the correct user.

#### **Get All Library Items**

- **Endpoint:** `GET /api/library`
- **Query Parameters (optional for filtering):**
  - `mediaType` (e.g., movie, series, book, video game)
  - `userStatus` (e.g., to watch/read/play, watching/reading/playing, watched/read/played)
  - `minRating` and/or `maxRating` (filter by user rating)
- **Response:**
  - An array of media items from the user’s library.

---

#### **Add a Media Item to the Library**

- **Endpoint:** `POST /api/library`
- **Request Body:**
  ```json
  {
      "mediaType": "movie",
      "mediaId": "12345",
      "userDescription": "Must watch!",
      "userRating": 18,
      "userStatus": "to watch"
  }
  ```
- **Response:**
  - On success, returns the newly created library item with its unique ID and timestamp.

---

#### **Edit a Library Item**

- **Endpoint:** `PUT /api/library/:id`
- **URL Parameter:**
  - `id`: The unique identifier of the library item.
- **Request Body:**
  ```json
  {
      "userDescription": "Updated notes or description",
      "userRating": 20,
      "userStatus": "watched"
  }
  ```
- **Response:**
  - Returns the updated library item details.

---

#### **Delete a Library Item**

- **Endpoint:** `DELETE /api/library/:id`
- **URL Parameter:**
  - `id`: The unique identifier of the library item.
- **Response:**
  - A success message confirming deletion.

---
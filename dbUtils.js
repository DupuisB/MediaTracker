// dbUtils.js
const db = require('./database'); // Assuming database.js exports the db connection

/**
 * Promisified version of db.get
 * @param {string} sql SQL query with placeholders
 * @param {Array} params Parameters for the SQL query
 * @returns {Promise<object|undefined>} Resolves with the row object or undefined if not found
 */
function get(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) {
                console.error('DB Get Error:', err.message);
                return reject(new Error(`Database error: ${err.message}`));
            }
            resolve(row);
        });
    });
}

/**
 * Promisified version of db.all
 * @param {string} sql SQL query with placeholders
 * @param {Array} params Parameters for the SQL query
 * @returns {Promise<Array<object>>} Resolves with an array of row objects
 */
function all(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) {
                console.error('DB All Error:', err.message);
                return reject(new Error(`Database error: ${err.message}`));
            }
            resolve(rows);
        });
    });
}

/**
 * Promisified version of db.run
 * @param {string} sql SQL query with placeholders
 * @param {Array} params Parameters for the SQL query
 * @returns {Promise<{lastID: number, changes: number}>} Resolves with an object containing lastID and changes
 */
function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        // Use function() to access this.lastID and this.changes
        db.run(sql, params, function (err) {
            if (err) {
                console.error('DB Run Error:', err.message);
                // Handle specific errors if needed, e.g., UNIQUE constraint
                if (err.message.includes('UNIQUE constraint failed')) {
                    return reject(new Error('UNIQUE constraint failed. Item might already exist.'));
                }
                return reject(new Error(`Database error: ${err.message}`));
            }
            resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

module.exports = {
    get,
    all,
    run
};
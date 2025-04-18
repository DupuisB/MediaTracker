const db = require('database'); // Assurez-vous que ce chemin est correct

async function searchUsers(query) {
    try {
        // Exemple de requête SQL pour rechercher des utilisateurs par nom d'utilisateur
        const users = await db.allAsync(
            "SELECT id, username, profileImageUrl FROM users WHERE username LIKE ?",
            [`%${query}%`]
        );
        return users;
    } catch (error) {
        console.error("Error searching users:", error);
        throw error;
    }
}

module.exports = { searchUsers };
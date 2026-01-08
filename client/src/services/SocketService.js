import { io } from "https://cdn.socket.io/4.7.4/socket.io.esm.min.js";

class SocketService {
    constructor() {
        this.socket = null;
    }

    /**
     * Connecte le joueur au serveur temps réel
     * @param {string} userId - L'ID MongoDB de l'utilisateur
     */
   connect(userId) {
        this.userId = userId;
        if (this.socket && this.socket.connected) {
            // Déjà connecté ? On ré-identifie au cas où
            this.socket.emit("identify", userId);
            return this.socket;
        }

        this.socket = io("http://localhost:3000");

        this.socket.on("connect", () => {
            console.log("✅ Socket connecté ID:", this.socket.id);
            this.socket.emit("identify", this.userId);
        });

        this.socket.on("reconnect", () => {
            this.socket.emit("identify", this.userId);
        });

        return this.socket;
    }
    /**
     * Retourne l'instance actuelle du socket
     */
    getSocket() {
        return this.socket;
    }

    /**
     * Déconnecte proprement le socket
     */
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }
}

// Export d'une instance unique (Singleton)
export const socketService = new SocketService();
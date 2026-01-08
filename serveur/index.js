require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const passport = require('passport');
const { Server } = require('socket.io');
const User = require('./models/User');
const socialRoutes = require('./routes/social');

const app = express();

// --- CONFIGURATION ---
require('./config/passport')(passport);
app.use(passport.initialize());
app.use(express.json());
app.use(cors());

// --- MONGODB ---
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/rummy_tunisien')
    .then(() => console.log("✨ MongoDB Connecté"))
    .catch(err => console.log("❌ Erreur DB:", err));

// --- SOCKET.IO SETUP ---
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.set('socketio', io);

// --- GESTION DES LOBBIES ---
const activeLobbies = {};

// Fonction utilitaire pour réinitialiser un joueur seul
function resetPlayerToPrivateLobby(socket) {
    const userId = socket.userId?.toString();
    if (!userId) return;

    const newLobbyId = `lobby_${userId}`;
    activeLobbies[newLobbyId] = {
        id: newLobbyId,
        players: [{ id: userId, username: socket.username || "Joueur", isHost: true }],
        hostId: userId
    };

    socket.join(newLobbyId);
    socket.emit('update_lobby', {
        players: activeLobbies[newLobbyId].players,
        lobbyId: newLobbyId,
        hostId: userId
    });
    console.log(`🏠 ${socket.username} est maintenant dans son lobby privé.`);
}

// Fonction centralisée pour sortir d'un lobby
const executeLobbyExit = (socket) => {
    const userId = socket.userId?.toString();
    if (!userId) return;

    // 1. On récupère les IDs des lobbies, en mettant les "table_" en priorité pour la recherche
    const lobbyIds = Object.keys(activeLobbies).sort((a, b) => b.startsWith('table_') - a.startsWith('table_'));

    for (const lobbyId of lobbyIds) {
        const lobby = activeLobbies[lobbyId];
        const playerIndex = lobby.players.findIndex(p => p.id.toString() === userId);

        if (playerIndex !== -1) {
            console.log(`🚪 Sortie de ${socket.username} du lobby ${lobbyId}`);

            const otherPlayers = lobby.players.filter(p => p.id.toString() !== userId);

            // --- CAS A : LE LOBBY DEVIENT VIDE ---
            if (otherPlayers.length === 0) {
                console.log(`🗑️ Fermeture du lobby vide : ${lobbyId}`);
                delete activeLobbies[lobbyId];
            }

            // --- CAS B : IL RESTE 1 SEUL JOUEUR (DISSOLUTION DUO) ---
            else if (otherPlayers.length === 1 && lobbyId.startsWith('table_')) {
                const survivor = otherPlayers[0];
                console.log(`📢 Dissolution : Retour en solo pour ${survivor.username}`);

                // On informe le dernier joueur qu'il doit quitter la table
                io.to(lobbyId).emit('lobby_dissolved');

                // On supprime la table de la mémoire
                delete activeLobbies[lobbyId];
            }

            // --- CAS C : IL RESTE PLUSIEURS JOUEURS (MIGRATION HOST) ---
            else {
                // On retire le joueur de la liste
                lobby.players.splice(playerIndex, 1);

                // Si celui qui part était le Host, on transfère la couronne
                if (lobby.hostId.toString() === userId) {
                    const newHost = otherPlayers[0]; // Le prochain sur la liste
                    lobby.hostId = newHost.id.toString();

                    // On met à jour l'état interne des joueurs
                    lobby.players = lobby.players.map(p => ({
                        ...p,
                        isHost: p.id.toString() === lobby.hostId
                    }));

                    console.log(`👑 MIGRATION : Nouveau Host de ${lobbyId} est ${newHost.username}`);
                }

                // On informe tout le monde du changement de composition
                io.to(lobbyId).emit('update_lobby', {
                    players: lobby.players,
                    hostId: lobby.hostId
                });
            }

            // Une fois le joueur traité, on sort de la boucle
            break;
        }
    }

    // Enfin, on s'assure que le joueur qui sort est remis dans son propre lobby privé (solo)
    const privateLobbyId = `lobby_${userId}`;
    activeLobbies[privateLobbyId] = {
        id: privateLobbyId,
        hostId: userId,
        players: [{ id: userId, username: socket.username, isHost: true }]
    };
    socket.join(privateLobbyId);
    console.log(`🏠 ${socket.username} est maintenant dans son lobby privé.`);
};

// --- LOGIQUE TEMPS RÉEL ---
io.on('connection', (socket) => {
    console.log("🔌 Nouveau client connecté :", socket.id);

    socket.on('identify', async (userId) => {
        try {
            // 1. Sécurité : vérifier que l'ID est valide
            if (!userId || userId === "null" || userId === "undefined") return;

            socket.userId = userId;
            // 2. Création du canal personnel (VITAL pour l'approche directe)
            socket.join(userId.toString());

            const user = await User.findById(userId);
            if (user) {
                socket.username = user.username;

                // 3. Mise à jour du statut en une seule fois
                await User.findByIdAndUpdate(userId, {
                    socketId: socket.id,
                    isOnline: true
                });

                console.log(`👤 Utilisateur ${user.username} identifié (Canal perso : ${userId})`);

                // 4. On le remet dans son lobby privé par défaut
                resetPlayerToPrivateLobby(socket);
            }
        } catch (err) {
            console.error("Erreur identification:", err);
        }
    });

    socket.on('invite_to_game', async (data) => {
        const { toId, fromName } = data;
        const fromId = socket.userId?.toString();
        if (!fromId) return;

        // --- LOGIQUE DE DÉTECTION DE LOBBY ---
        // On cherche si le socket est déjà dans une "table_" existante
        let currentLobbyId = null;
        for (const [id, lobby] of Object.entries(activeLobbies)) {
            if (id.startsWith('table_') && lobby.players.some(p => p.id.toString() === fromId)) {
                currentLobbyId = id;
                break;
            }
        }

        // Si on n'est pas dans une table, on crée l'ID par défaut
        const lobbyId = currentLobbyId || `table_${fromId}`;

        // Initialisation du lobby si nécessaire
        if (!activeLobbies[lobbyId]) {
            activeLobbies[lobbyId] = {
                id: lobbyId,
                hostId: fromId,
                players: [{ id: fromId, username: fromName, isHost: true }]
            };
        }

        // On s'assure que le host est bien dans la room Socket.io
        socket.join(lobbyId);

        // On envoie l'invitation à la room personnelle du destinataire
        io.to(toId.toString()).emit('receive_game_invitation', {
            lobbyId: lobbyId,
            fromName: fromName,
            fromId: fromId,
            type: 'GAME_INVITE'
        });

        // On rafraîchit l'UI du demandeur
        socket.emit('update_lobby', {
            players: activeLobbies[lobbyId].players,
            hostId: activeLobbies[lobbyId].hostId
        });

        console.log(`📩 [INVITE] ${fromName} invite ${toId} dans le lobby : ${lobbyId}`);
    });

    socket.on('accept_game_invite', async (data) => {
        const { lobbyId, username } = data;
        const guestId = socket.userId.toString();

        // On récupère le HostId réel depuis l'objet lobby ou depuis l'ID du lobby
        let lobby = activeLobbies[lobbyId];

        // Si le lobby n'existe pas encore (cas rare), on l'initialise
        if (!lobby) {
            console.log(`⚠️ Lobby ${lobbyId} non trouvé, création à la volée...`);
            const extractedHostId = lobbyId.replace('table_', '');
            activeLobbies[lobbyId] = {
                id: lobbyId,
                players: [],
                hostId: extractedHostId
            };
            lobby = activeLobbies[lobbyId];
        }

        console.log(`✅ ${username} rejoint ${lobbyId}`);

        // 1. Nettoyage des lobbies privés (solo)
        delete activeLobbies[`lobby_${guestId}`];

        // 2. Gestion du Host s'il n'est pas encore dans la liste des joueurs
        const hostId = lobby.hostId.toString();
        const isHostAlreadyIn = lobby.players.find(p => p.id.toString() === hostId);

        if (!isHostAlreadyIn) {
            const hostSocket = [...io.sockets.sockets.values()].find(s => s.userId?.toString() === hostId);
            if (hostSocket) {
                hostSocket.leave(`lobby_${hostId}`);
                hostSocket.join(lobbyId);
                lobby.players.push({
                    id: hostId,
                    username: hostSocket.username || "Host",
                    isHost: true
                });
            }
        }

        // 3. Déplacer l'invité
        socket.leave(`lobby_${guestId}`);
        socket.join(lobbyId);

        // 4. Ajouter l'invité à la liste des joueurs (sécurité doublon)
        const alreadyIn = lobby.players.find(p => p.id.toString() === guestId);
        if (!alreadyIn) {
            lobby.players.push({
                id: guestId,
                username: username,
                isHost: (guestId === hostId) // Il est host seulement si son ID matche
            });
        }

        // 5. Envoi de l'update à TOUTE la table (Host + Invités)
        io.to(lobbyId).emit('update_lobby', {
            players: lobby.players,
            hostId: lobby.hostId
        });
    });

    socket.on('leave_lobby', () => {
        executeLobbyExit(socket);
        // Après être sorti de la table, on lui recrée son espace solo
        resetPlayerToPrivateLobby(socket);
    });

    socket.on('disconnect', async () => {
        if (socket.userId) {
            executeLobbyExit(socket);
            try {
                await User.findByIdAndUpdate(socket.userId, { isOnline: false, socketId: null });
                console.log(`🔌 Déconnexion de ${socket.username}`);
            } catch (err) {
                console.error("Erreur disconnect DB:", err);
            }
        }
    })
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/social', socialRoutes);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Serveur sur port ${PORT}`));
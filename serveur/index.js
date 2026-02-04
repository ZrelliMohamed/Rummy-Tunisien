require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const passport = require('passport');
const { Server } = require('socket.io');
const User = require('./models/User');
const socialRoutes = require('./routes/social');
const { toggleReady, canStartConfig, getDefaultSettings } = require('./logic/LobbyManager');
const { handleGameEvents } = require('./logic/GameManager');
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
/**
 * Réinitialise un joueur dans son propre lobby "table_" par défaut
 */
function resetPlayerToPrivateLobby(socket) {
    const userId = socket.userId?.toString();
    if (!userId) return;
    // HARMONISATION : On utilise toujours "table_"
    const newLobbyId = `table_${userId}`; 
    activeLobbies[newLobbyId] = {
        id: newLobbyId,
        players: [{ id: userId, username: socket.username || "Joueur", isHost: true }],
        hostId: userId,
        status: 'waiting',
        settings: getDefaultSettings()
    };
    socket.join(newLobbyId);
    socket.emit('update_lobby', {
        players: activeLobbies[newLobbyId].players,
        lobbyId: newLobbyId,
        hostId: userId
    });
}
/**
 * Gère la sortie d'un joueur d'un lobby
 */
const executeLobbyExit = (socket) => {
    const userId = socket.userId?.toString();
    if (!userId) return;
    const lobbyIds = Object.keys(activeLobbies);
    for (const lobbyId of lobbyIds) {
        const lobby = activeLobbies[lobbyId];
        const playerIndex = lobby.players.findIndex(p => p.id.toString() === userId);
        if (playerIndex !== -1) {
            const otherPlayers = lobby.players.filter(p => p.id.toString() !== userId);
            if (otherPlayers.length === 0) {
                delete activeLobbies[lobbyId];
            }
            else if (otherPlayers.length === 1 && lobbyId.startsWith('table_')) {
                io.to(lobbyId).emit('lobby_dissolved');
                delete activeLobbies[lobbyId];
            }
            else {
                lobby.players.splice(playerIndex, 1);
                if (lobby.hostId.toString() === userId) {
                    const newHost = otherPlayers[0];
                    lobby.hostId = newHost.id.toString();
                    lobby.players = lobby.players.map(p => ({
                        ...p,
                        isHost: p.id.toString() === lobby.hostId,
                        isReady: p.id.toString() === lobby.hostId ? false : p.isReady
                    }));
                }
                if (lobby.status === 'configuring' || lobby.status === 'playing') {
                    lobby.status = 'waiting';
                    io.to(lobbyId).emit('lobby_status_changed', { status: 'waiting' });
                }
                io.to(lobbyId).emit('update_lobby', {
                    players: lobby.players,
                    hostId: lobby.hostId,
                    canStart: canStartConfig(lobby)
                });
            }
            break;
        }
    }
    // Retour au lobby privé systématique
    const privateLobbyId = `table_${userId}`;
    activeLobbies[privateLobbyId] = {
        id: privateLobbyId,
        hostId: userId,
        players: [{ id: userId, username: socket.username, isHost: true }],
        status: 'waiting'
    };
    socket.join(privateLobbyId);
};
// --- LOGIQUE TEMPS RÉEL ---
io.on('connection', (socket) => {
    socket.on('identify', async (userId) => {
        try {
            if (!userId || userId === "null" || userId === "undefined") return;
            socket.userId = userId;
            socket.join(userId.toString());

            const user = await User.findById(userId);
            if (user) {
                socket.username = user.username;
                await User.findByIdAndUpdate(userId, { socketId: socket.id, isOnline: true });
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
        // On vérifie si le host a déjà une table active
        const lobbyId = `table_${fromId}`;
        if (!activeLobbies[lobbyId]) {
            activeLobbies[lobbyId] = {
                id: lobbyId,
                hostId: fromId,
                players: [{ id: fromId, username: fromName, isHost: true }],
                status: 'waiting',
                settings: getDefaultSettings()
            };
        }
        socket.join(lobbyId);
        io.to(toId.toString()).emit('receive_game_invitation', {
            lobbyId: lobbyId,
            fromName: fromName,
            fromId: fromId,
            type: 'GAME_INVITE'
        });
        socket.emit('update_lobby', {
            players: activeLobbies[lobbyId].players,
            hostId: activeLobbies[lobbyId].hostId,
            canStart: canStartConfig(activeLobbies[lobbyId])
        });
    });
    socket.on('accept_game_invite', async (data) => {
        const { lobbyId, username } = data;
        let lobby = activeLobbies[lobbyId];
        const guestId = socket.userId.toString();
        if (lobby && (lobby.status === 'configuring' || lobby.status === 'playing')) {
            return socket.emit('error_message', { message: "Partie déjà en cours." });
        }
        // Nettoyage de l'ancienne table du joueur qui accepte
        delete activeLobbies[`table_${guestId}`];
        socket.leave(`table_${guestId}`);
        socket.join(lobbyId);
        if (lobby) {
            if (!lobby.players.find(p => p.id.toString() === guestId)) {
                lobby.players.push({ id: guestId, username: username, isHost: false, isReady: false });
            }
            io.to(lobbyId).emit('update_lobby', {
                players: lobby.players,
                hostId: lobby.hostId,
                canStart: canStartConfig(lobby)
            });
        }
    });
    socket.on('toggle_ready', () => {
        const userId = socket.userId?.toString();
        const lobby = Object.values(activeLobbies).find(l => l.players.some(p => p.id.toString() === userId));
        if (lobby && lobby.status === 'waiting') {
            toggleReady(lobby, userId);
            io.to(lobby.id).emit('update_lobby', {
                players: lobby.players,
                hostId: lobby.hostId,
                canStart: canStartConfig(lobby),
                status: lobby.status
            });
        }
    });
    socket.on('start_configuring', () => {
        const userId = socket.userId?.toString();
        const lobbyId = `table_${userId}`;
        const lobby = activeLobbies[lobbyId];
        if (lobby && canStartConfig(lobby)) {
            lobby.status = 'configuring';
            io.to(lobbyId).emit('lobby_status_changed', {
                status: 'configuring',
                settings: lobby.settings || getDefaultSettings()
            });
        }
    });
    socket.on('cancel_configuration', () => {
        const userId = socket.userId?.toString();
        const lobbyId = `table_${userId}`;
        const lobby = activeLobbies[lobbyId];
        if (lobby && lobby.status === 'configuring') {
            lobby.status = 'waiting';
            io.to(lobbyId).emit('lobby_status_changed', { status: 'waiting' });
            io.to(lobbyId).emit('configuration_cancelled'); 
            io.to(lobbyId).emit('update_lobby', {
                players: lobby.players,
                hostId: lobby.hostId,
                canStart: canStartConfig(lobby),
                status: lobby.status
            });
        }
    });
    socket.on('confirm_game_start', (finalSettings) => {
        const userId = socket.userId?.toString();
        const lobbyId = `table_${userId}`;
        const lobby = activeLobbies[lobbyId];
        if (lobby && lobby.status === 'configuring') {
            lobby.settings = { ...getDefaultSettings(), ...finalSettings };
            lobby.status = 'playing';
            console.log(`🚀 [GAME START] Room ${lobbyId} -> Mode Jeu`);
            io.to(lobbyId).emit('game_started', {
                settings: lobby.settings,
                players: lobby.players,
                seating: finalSettings.seating 
            });
        }
    });
    // --- Import des événements de jeu (Deck, cartes, etc.) ---
    handleGameEvents(socket, io, activeLobbies);
    socket.on('leave_lobby', () => { 
        executeLobbyExit(socket); 
    });
    socket.on('disconnect', async () => { 
        if (socket.userId) { 
            executeLobbyExit(socket); 
            await User.findByIdAndUpdate(socket.userId, { isOnline: false }); 
        } 
    });
});
app.use('/api/auth', require('./routes/auth'));
app.use('/api/social', socialRoutes);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Serveur Rummy sur port ${PORT}`));
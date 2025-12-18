// ============================================
// server/index.js
// Serveur de jeu - Rummy Tunisien
// ============================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

// Importation de la logique de jeu validée hier
const { createDeck, shuffle, dealCards, validateAndScore } = require('./logic/gameLogic');

const app = express();
const server = http.createServer(app);

// Configuration de Socket.io avec CORS pour autoriser la connexion du client Phaser
const io = new Server(server, {
    cors: {
        origin: "*", // En développement, on autorise tout
        methods: ["GET", "POST"]
    }
});

// L'ÉTAT DU JEU (La mémoire du serveur)
let gameState = {
    players: {},       // Liste des joueurs connectés { socketId: { id, name, hand, hasOpened, points } }
    deck: [],          // Cartes de la pioche
    discardPile: [],   // Cartes de la défausse
    currentTurn: null, // ID (socket.id) du joueur qui doit jouer
    gameStarted: false
};

// --- FONCTIONS UTILITAIRES ---

/**
 * Mélange la défausse et la remet dans le deck quand la pioche est vide
 */
function recycleDiscardPile() {
    if (gameState.discardPile.length <= 1) return;

    // On garde la dernière carte jetée pour la laisser visible
    const lastCard = gameState.discardPile.pop();
    
    // On mélange le reste pour créer un nouveau deck
    gameState.deck = shuffle([...gameState.discardPile]);
    
    // On vide l'ancienne défausse et on y remet la carte de référence
    gameState.discardPile = [lastCard];
    
    console.log(`♻️ Défausse recyclée. Nouveau deck : ${gameState.deck.length} cartes.`);
}

// --- GESTION DES CONNEXIONS SOCKET.IO ---

io.on('connection', (socket) => {
    console.log(`🔌 Nouveau joueur connecté : ${socket.id}`);

    // [ACTION] : Un joueur rejoint le lobby
    socket.on('joinGame', (playerName) => {
        if (Object.keys(gameState.players).length < 4) {
            gameState.players[socket.id] = {
                id: socket.id,
                name: playerName || "Anonyme",
                hand: [],
                hasOpened: false,
                points: 0
            };
            console.log(`📝 ${playerName} a rejoint la partie.`);
            
            // On informe tout le monde du nouvel arrivant
            io.emit('playerJoined', Object.values(gameState.players));
        }
    });

    // [ACTION] : Lancer la partie
    socket.on('startGame', () => {
        const playerIds = Object.keys(gameState.players);
        if (playerIds.length < 2) return; // Il faut au moins 2 joueurs

        // 1. Initialisation du Deck
        gameState.deck = shuffle(createDeck());
        
        // 2. Distribution (14 cartes chacun, 15 pour le premier)
        const distribution = dealCards(gameState.deck, playerIds.length);
        
        playerIds.forEach((id, index) => {
            gameState.players[id].hand = distribution.hands[index];
            // Envoi de la main en privé au joueur concerné
            io.to(id).emit('yourHand', gameState.players[id].hand);
        });

        // 3. Mise à jour des piles
        gameState.deck = distribution.remainingDeck;
        gameState.discardPile = [gameState.deck.pop()]; // Première carte visible
        
        // 4. État global
        gameState.gameStarted = true;
        gameState.currentTurn = playerIds[0]; // Le premier joueur commence

        // 5. Signal de départ à tous les joueurs
        io.emit('gameUpdate', {
            discardPile: gameState.discardPile,
            currentTurn: gameState.currentTurn,
            playerNames: Object.values(gameState.players).map(p => p.name),
            deckCount: gameState.deck.length
        });
    });

    // [ACTION] : Piocher une carte
    socket.on('drawCard', () => {
        const player = gameState.players[socket.id];
        if (!player || !gameState.gameStarted) return;
        if (gameState.currentTurn !== socket.id) return socket.emit('error', "Ce n'est pas votre tour !");

        // Recyclage automatique si nécessaire
        if (gameState.deck.length === 0) recycleDiscardPile();

        const card = gameState.deck.pop();
        player.hand.push(card);

        // On envoie la carte au joueur et on prévient les autres du deck
        socket.emit('cardDrawn', card);
        io.emit('deckUpdate', { deckCount: gameState.deck.length });
    });

    // [ACTION] : Jeter une carte (Fin de tour)
    socket.on('discardCard', (cardId) => {
        const player = gameState.players[socket.id];
        if (!player || gameState.currentTurn !== socket.id) return;

        const cardIndex = player.hand.findIndex(c => c.id === cardId);
        if (cardIndex === -1) return;

        // Retrait de la main et ajout à la défausse
        const discardedCard = player.hand.splice(cardIndex, 1)[0];
        gameState.discardPile.push(discardedCard);

        // Changement de tour (Joueur suivant)
        const playerIds = Object.keys(gameState.players);
        const currentIndex = playerIds.indexOf(socket.id);
        const nextIndex = (currentIndex + 1) % playerIds.length;
        gameState.currentTurn = playerIds[nextIndex];

        // Mise à jour visuelle pour tous
        io.emit('gameUpdate', {
            discardPile: gameState.discardPile,
            currentTurn: gameState.currentTurn
        });
        
        // Mise à jour de la main du joueur
        socket.emit('yourHand', player.hand);
    });

    // [ACTION] : Poser des combinaisons (Ouvrir / Mélanger)
    socket.on('meldCards', (melds) => {
        const player = gameState.players[socket.id];
        if (!player || gameState.currentTurn !== socket.id) return;

        let totalScore = 0;
        let allMeldsValid = true;

        // Validation de chaque groupe via notre cerveau logic/gameLogic.js
        melds.forEach(meld => {
            const result = validateAndScore(meld);
            if (result.isValid) {
                totalScore += result.score;
            } else {
                allMeldsValid = false;
            }
        });

        if (!allMeldsValid) {
            return socket.emit('error', "Une de vos combinaisons est invalide.");
        }

        // Vérification de la règle des 51 points (Première pose)
        if (!player.hasOpened && totalScore < 51) {
            return socket.emit('error', `Besoin de 51 points minimum. Score actuel : ${totalScore}`);
        }

        // Si OK, on retire définitivement les cartes de la main du joueur
        melds.forEach(meld => {
            meld.forEach(cardInMeld => {
                const index = player.hand.findIndex(c => c.id === cardInMeld.id);
                if (index !== -1) player.hand.splice(index, 1);
            });
        });

        player.hasOpened = true;
        player.points += totalScore;

        // On affiche les cartes sur la table pour tout le monde
        io.emit('cardsMelded', {
            playerName: player.name,
            melds: melds,
            playerScore: player.points
        });

        // Mise à jour de la main privée du joueur
        socket.emit('yourHand', player.hand);
    });

    // [ACTION] : Déconnexion
    socket.on('disconnect', () => {
        console.log(`❌ Joueur déconnecté : ${socket.id}`);
        delete gameState.players[socket.id];
        // On actualise la liste des joueurs pour les autres
        io.emit('playerJoined', Object.values(gameState.players));
    });
});

// Lancement du serveur
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`
    ==========================================
    ✅ SERVEUR DE RAMI TUNISIEN LANCÉ !
    🚀 Adresse : http://localhost:${PORT}
    ==========================================
    `);
});
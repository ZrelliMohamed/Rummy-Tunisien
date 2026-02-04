// logic/LobbyManager.js

const canStartConfig = (lobby) => {
    if (!lobby || !lobby.players) return false;

    // --- LOGIQUE CORRIGÉE ---
    // On n'autorise la configuration que s'il y a AU MOINS 2 joueurs.
    // (Même pour tes tests, il vaut mieux ouvrir deux onglets de navigateur)
    const hasEnoughPlayers = lobby.players.length >= 2; 

    // Si on est seul, on bloque le bouton (évite le bug du bouton orange vide)
    if (lobby.players.length < 2) return false;

    // Tous les invités doivent être Ready
    const guests = lobby.players.filter(p => p.id.toString() !== lobby.hostId.toString());
    const allGuestsReady = guests.every(p => p.isReady === true);

    return hasEnoughPlayers && allGuestsReady;
};

const toggleReady = (lobby, userId) => {
    const player = lobby.players.find(p => p.id.toString() === userId.toString());
    if (player && !player.isHost) { // Un host n'a pas besoin d'être "Ready", il est le maître du jeu
        player.isReady = !player.isReady;
    }
};

const getDefaultSettings = () => ({
    gameMode: 'standard',
    teamMode: '1v1v1v1',
    isPrivate: true,
    maxPlayers: 4,
    rules: {
        downScore: 51,
        targetScore: 501,
        jokerPenalty: true,
        canCut: true,          // Permet ou non de brûler 1, 2, 3 cartes
        canMoveJoker: true     // Permet ou non de déplacer le joker
    },
    seating: {}
});

module.exports = { canStartConfig, toggleReady, getDefaultSettings };
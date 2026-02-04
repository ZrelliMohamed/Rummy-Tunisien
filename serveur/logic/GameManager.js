// logic/GameManager.js



/**

* Mélange un tableau selon l'algorithme de Fisher-Yates

*/

function shuffle(array) {

    for (let i = array.length - 1; i > 0; i--) {

        const j = Math.floor(Math.random() * (i + 1));

        [array[i], array[j]] = [array[j], array[i]];

    }

    return array;

}



/**

* Crée un deck complet de 108 cartes (2 jeux de 52 + 4 Jokers)

*/

function createFullDeck() {

    const suits = ['clubs', 'diamonds', 'hearts', 'spades'];

    const values = ['ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king'];

    const backFrames = ['Back Blue 1.png', 'Back Red 1.png'];

    let deck = [];



    for (let i = 0; i < 2; i++) {

        const back = backFrames[i];

        suits.forEach(suit => {

            values.forEach((value, index) => {

                deck.push({

                    id: `${value}_of_${suit}_${i}`,

                    frontFrame: `${value}_of_${suit}.png`,

                    backFrame: back,

                    suit: suit,

                    rank: index + 1

                });

            });

        });



        // Ajout des Jokers (2 par jeu)

        const jokerFrame = (i === 0) ? 'black_joker.png' : 'red_joker.png';

        for (let j = 0; j < 2; j++) {

            deck.push({

                id: `joker_${i}_${j}`,

                frontFrame: jokerFrame,

                backFrame: back,

                suit: 'joker',

                rank: -1

            });

        }

    }

    // On mélange et on assigne un index fixe pour la synchronisation client/serveur

    return shuffle(deck).map((card, idx) => ({ ...card, index: idx }));

}



/**

* Détermine le donneur (Dealer) et le coupeur (Cutter)

*/

function determineDealer(lobby, io) {

    const colorOrder = { 'joker': 0, 'clubs': 1, 'diamonds': 2, 'hearts': 3, 'spades': 4 };

    let results = Object.entries(lobby.drawResults).map(([userId, card]) => ({ userId, card }));



    results.sort((a, b) => {

        // Le rang le plus bas (Joker = -1) gagne la donne

        if (a.card.rank !== b.card.rank) return a.card.rank - b.card.rank;

        return colorOrder[a.card.suit] - colorOrder[b.card.suit];

    });



    const dealerId = results[0].userId;

    lobby.dealerId = dealerId;



    const playerIds = lobby.players.map(p => (p.id || p._id).toString());

    const dealerIndex = playerIds.indexOf(dealerId);



    // Le coupeur est à gauche du donneur

    const cutterIndex = (dealerIndex + 1) % playerIds.length;

    lobby.cutterId = playerIds[cutterIndex];



    lobby.status = 'cutting_deck';



    io.to(lobby.id).emit('reveal_draw_results', {

        results,

        dealerId,

        cutterId: lobby.cutterId,

        rules: lobby.settings?.rules || {},

        fullDeck: lobby.drawDeck

    });

}



/**

* Gestionnaire principal des événements de jeu

*/

const handleGameEvents = (socket, io, activeLobbies) => {



    const getLobby = () => {

        const userId = socket.userId?.toString();

        return Object.values(activeLobbies).find(l =>

            l.players.some(p => (p.id || p._id).toString() === userId)

        );

    };



    // --- PHASE INITIALE : REJOINDRE LA SCÈNE ---

    socket.on('player_joined_game_scene', () => {

        const lobby = getLobby();

        if (!lobby) return;



        socket.join(lobby.id);



        if (!lobby.readyPlayers) lobby.readyPlayers = new Set();

        lobby.readyPlayers.add(socket.userId.toString());



        if (lobby.readyPlayers.size === lobby.players.length) {

            lobby.status = 'drawing_dealer';

            lobby.drawDeck = createFullDeck();

            lobby.drawResults = {};



            // Envoi sécurisé (on ne montre pas les faces avant)

            const secureDeck = lobby.drawDeck.map(c => ({

                index: c.index,

                backFrame: c.backFrame

            }));

            io.to(lobby.id).emit('start_draw_phase', { deck: secureDeck });

        }

    });

    // --- DANS GameManager.js ---



    // AJOUTE CE LISTENER :
   socket.on('finalize_joker_position', () => {
    const lobby = getLobby();
    if (!lobby || lobby.cutterId !== socket.userId.toString()) return;

    // On change le statut AVANT d'émettre pour éviter des actions concurrentes
    lobby.status = 'burning_cards';

    if (lobby.settings?.rules?.canMoveJoker !== false) {
        // Informe tout le monde de ranger le Joker (x: -120)
        io.to(lobby.id).emit('joker_finalized_animation');
    } else {
        io.to(lobby.id).emit('joker_position_fixed_no_anim');
    }
});



    // MODIFIE 'finalize_burn' :

    // --- DANS GameManager.js ---

    socket.on('finalize_burn', (data) => {
    const lobby = getLobby();
    if (!lobby || lobby.cutterId !== socket.userId.toString()) return;

    // Sécurité : Si la règle interdit de brûler, on force le count à 0
    let burnedCount = data.count || 0;
    if (lobby.settings?.rules?.canCut === false) {
        burnedCount = 0;
    }

    // Traitement des cartes brûlées
    if (burnedCount > 0 && lobby.distributeDeck.length >= burnedCount) {
        const burnedCards = lobby.distributeDeck.splice(0, burnedCount);

        // Insertion aléatoire dans le sideDeck (Pile B) pour ne pas tricher
        burnedCards.forEach(card => {
            const randomIndex = Math.floor(Math.random() * lobby.sideDeck.length);
            lobby.sideDeck.splice(randomIndex, 0, card);
        });
        console.log(`[Lobby ${lobby.id}] ${burnedCount} cartes brûlées.`);
    }

    // Passage à l'état final : Prêt pour la donne
    lobby.status = 'ready_to_deal';

    io.to(lobby.id).emit('start_dealing', {
        distributeCount: lobby.distributeDeck.length,
        sideCount: lobby.sideDeck.length
    });
});



    // --- PHASE DE TIRAGE (DEALER DRAW) ---

    socket.on('pick_draw_card', (data) => {

        const lobby = getLobby();

        const userId = socket.userId?.toString();

        if (!lobby || lobby.status !== 'drawing_dealer' || lobby.drawResults[userId]) return;



        // On lie le choix au deck généré côté serveur

        lobby.drawResults[userId] = lobby.drawDeck.find(c => c.index === data.cardIndex);



        io.to(lobby.id).emit('player_picked_card', { userId, cardIndex: data.cardIndex });



        if (Object.keys(lobby.drawResults).length === lobby.players.length) {

            determineDealer(lobby, io);

        }

    });



    // --- PHASE DE COUPE (SYNC VISUELLE) ---

    socket.on('sync_cut_selection', (data) => {

        const lobby = getLobby();

        if (!lobby || lobby.cutterId !== socket.userId.toString()) return;

        // On diffuse la position de la "main" du coupeur aux autres joueurs

        socket.to(lobby.id).emit('hand_moved', data);

    });



    // Finalisation de l'extraction (séparation en deux piles)

    socket.on('finalize_extraction', (data) => {

        const lobby = getLobby();

        if (!lobby || lobby.cutterId !== socket.userId.toString()) return;



        const { startPercent, endPercent } = data;

        const deck = lobby.drawDeck;



        const startIdx = Math.floor(startPercent * deck.length);

        const endIdx = Math.floor(endPercent * deck.length);



        // Pile à distribuer (Pile A) et Pile de côté (Pile B)

        lobby.distributeDeck = deck.slice(startIdx, endIdx);

        lobby.sideDeck = [...deck.slice(0, startIdx), ...deck.slice(endIdx)];



        lobby.status = 'adjusting_joker';

        io.to(lobby.id).emit('extraction_completed');

    });



    socket.on('card_burned_sync', (data) => {

        const lobby = getLobby();

        if (!lobby || lobby.cutterId !== socket.userId.toString()) return;

        socket.to(lobby.id).emit('card_burned_visual', data);

    });



    // --- PHASE JOKER (DÉPLACEMENT) ---

    socket.on('move_joker_in_deck', (data) => {
        const lobby = getLobby();
        if (!lobby || lobby.status !== 'adjusting_joker') return;

        // VERROU DE RÈGLE : Si le déplacement du joker est désactivé
        if (lobby.settings?.rules?.canMoveJoker === false) {
            console.log("Action refusée : canMoveJoker est désactivé");
            return;
        }

        const { newIndex } = data;
        const deckB = lobby.sideDeck;
        const oldIndex = deckB.findIndex(c => c.suit === 'joker');

        if (oldIndex !== -1) {
            const [joker] = deckB.splice(oldIndex, 1);
            const safeIndex = Math.max(0, Math.min(newIndex, deckB.length));
            deckB.splice(safeIndex, 0, joker);

            socket.to(lobby.id).emit('joker_repositioned', { newIndex: safeIndex });
        }
    });


    // --- FINALISATION ET BRÛLAGE ---

   



  socket.on('trigger_burn_animation', (data) => {
    const lobby = getLobby();
    if (!lobby || lobby.cutterId !== socket.userId.toString()) return;

    // Sécurité règle
    if (lobby.settings?.rules?.canCut === false) return;

    // On diffuse l'animation à tout le monde
    io.to(lobby.id).emit('animate_burned_cards', { cardIndices: data.cardIndices });
});

};



module.exports = { handleGameEvents };
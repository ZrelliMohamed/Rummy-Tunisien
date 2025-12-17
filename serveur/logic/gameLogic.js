// ============================================
// server/logic/gameLogic.js
// Logique du Rummy Tunisien
// ============================================

const SUITS = ['S', 'H', 'D', 'C']; // Spades (Pique), Hearts (Coeur), Diamonds (Carreau), Clubs (Trèfle)
const RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

/**
 * Calcule la valeur de point d'un rang donné
 * @param {number} rank - Le rang de la carte (1 à 13)
 * @param {boolean} isLowAce - Si vrai, l'As vaut 1, sinon il vaut 10
 */
function getCardValue(rank, isLowAce = false) {
    if (rank === 1) return isLowAce ? 1 : 10;
    if (rank >= 10) return 10;
    return rank;
}

// ============================================
// 1. Initialisation et Distribution
// ============================================

function createDeck() {
    let deck = [];
    let idCounter = 0;

    // Création des 2 jeux de 52 cartes
    for (let i = 0; i < 2; i++) {
        for (let suit of SUITS) {
            for (let rank of RANKS) {
                deck.push({
                    id: idCounter++,
                    suit: suit,
                    rank: rank,
                    value: getCardValue(rank, false), // Valeur par défaut (As = 10)
                    isJoker: false
                });
            }
        }
    }

    // Ajout des 4 Jokers
    for (let j = 0; j < 4; j++) {
        deck.push({
            id: idCounter++,
            suit: 'Joker',
            rank: 0,
            value: 0,
            isJoker: true
        });
    }
    return deck;
}

function shuffle(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

function dealCards(deck, numPlayers) {
    let hands = [];
    for (let i = 0; i < numPlayers; i++) {
        hands.push(deck.splice(0, 14));
    }
    // Le premier joueur prend la 15ème carte
    hands[0].push(deck.splice(0, 1)[0]);

    return { hands, remainingDeck: deck };
}

// ============================================
// 2. Logique de Validation et Score
// ============================================

function validateAndScore(meld) {
    if (meld.length < 3) return { isValid: false, score: 0 };

    const jokers = meld.filter(c => c.isJoker);
    const realCards = meld.filter(c => !c.isJoker);

    if (realCards.length === 0) return { isValid: false, score: 0 };

    // --- TEST BRELAN / CARRÉ ---
    const isSet = realCards.every(c => c.rank === realCards[0].rank) &&
                  new Set(realCards.map(c => c.suit)).size === realCards.length;

    if (isSet && meld.length <= 4) {
        const rank = realCards[0].rank;
        const val = getCardValue(rank, false); // Dans un set, l'As vaut 10
        return { isValid: true, score: val * meld.length, type: 'set' };
    }

    // --- TEST SUITE ---
    return validateSequence(meld, realCards, jokers);
}

function validateSequence(meld, realCards, jokers) {
    const suit = realCards[0].suit;
    if (!realCards.every(c => c.suit === suit)) return { isValid: false, score: 0 };

    // On teste deux possibilités pour l'As (Bas: A-2-3 ou Haut: Q-K-A)
    let resLow = checkSeq(realCards, jokers, false); // As = 1
    let resHigh = checkSeq(realCards, jokers, true);  // As = 14 (10 pts)

    if (resHigh.isValid && (!resLow.isValid || resHigh.score > resLow.score)) {
        return resHigh;
    }
    return resLow.isValid ? resLow : { isValid: false, score: 0 };
}

function checkSeq(realCards, jokers, aceHigh) {
    let tempCards = realCards.map(c => ({
        ...c,
        tempRank: (c.rank === 1 && aceHigh) ? 14 : c.rank
    }));

    tempCards.sort((a, b) => a.tempRank - b.tempRank);

    // Vérifier les doublons et l'espace pour les jokers
    let neededJokers = 0;
    for (let i = 0; i < tempCards.length - 1; i++) {
        let diff = tempCards[i + 1].tempRank - tempCards[i].tempRank;
        if (diff === 0) return { isValid: false };
        neededJokers += (diff - 1);
    }

    if (neededJokers > jokers.length) return { isValid: false };

    // Calcul du score
    let totalScore = 0;
    let currentJokers = jokers.length;

    // Score des cartes réelles
    tempCards.forEach(c => { totalScore += getCardValue(c.rank, !aceHigh); });

    // Score des jokers comblant les trous
    for (let i = 0; i < tempCards.length - 1; i++) {
        let diff = tempCards[i + 1].tempRank - tempCards[i].tempRank;
        for (let j = 1; j < diff; j++) {
            let virtualRank = tempCards[i].tempRank + j;
            let r = (virtualRank === 14) ? 1 : virtualRank;
            totalScore += getCardValue(r, !aceHigh);
            currentJokers--;
        }
    }

    // Placer les jokers restants aux extrémités (Automatisme)
    let lowEnd = tempCards[0].tempRank;
    let highEnd = tempCards[tempCards.length - 1].tempRank;

    while (currentJokers > 0) {
        if (highEnd < 14) {
            highEnd++;
            let r = (highEnd === 14) ? 1 : highEnd;
            totalScore += getCardValue(r, !aceHigh);
        } else if (lowEnd > 1) {
            lowEnd--;
            totalScore += getCardValue(lowEnd, !aceHigh);
        } else {
            return { isValid: false };
        }
        currentJokers--;
    }

    return { isValid: true, score: totalScore, type: 'sequence' };
}

// Export pour le serveur Node.js
module.exports = {
    createDeck,
    shuffle,
    dealCards,
    validateAndScore
};



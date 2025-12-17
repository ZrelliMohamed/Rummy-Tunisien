// server/testLogic.js contains tests for the game logic functions in gameLogic.js 
const { validateAndScore } = require('./logic/gameLogic');

// Simulation de cartes pour les tests
const cards = {
    h7: { suit: 'H', rank: 7, isJoker: false },
    h8: { suit: 'H', rank: 8, isJoker: false },
    h9: { suit: 'H', rank: 9, isJoker: false },
    h1: { suit: 'H', rank: 1, isJoker: false }, // As de Coeur
    h12: { suit: 'H', rank: 12, isJoker: false }, // Dame de Coeur
    h13: { suit: 'H', rank: 13, isJoker: false }, // Roi de Coeur
    s8: { suit: 'S', rank: 8, isJoker: false },
    d8: { suit: 'D', rank: 8, isJoker: false },
    joker: { suit: 'Joker', rank: 0, isJoker: true }
};

console.log("=== TEST DU MOTEUR DE JEU RAMI TUNISIEN ===\n");

// TEST 1 : Suite simple (7-8-9)
const test1 = validateAndScore([cards.h7, cards.h8, cards.h9]);
console.log("Test 1 (7-8-9 Coeur) :", test1.isValid ? `VALIDE (${test1.score} pts)` : "INVALIDE");

// TEST 2 : Brelan avec Joker (8-8-Joker)
const test2 = validateAndScore([cards.s8, cards.d8, cards.joker]);
console.log("Test 2 (8-8-Joker) :", test2.isValid ? `VALIDE (${test2.score} pts)` : "INVALIDE");

// TEST 3 : Suite avec As de fin (Q-K-A)
const test3 = validateAndScore([cards.h12, cards.h13, cards.h1]);
console.log("Test 3 (Q-K-A Coeur) :", test3.isValid ? `VALIDE (${test3.score} pts)` : "INVALIDE");

// TEST 4 : Suite avec As de début (A-Joker-3)
// Note: on simule un 3 de coeur manquant pour le test
const h3 = { suit: 'H', rank: 3, isJoker: false };
const test4 = validateAndScore([cards.h1, cards.joker, h3]);
console.log("Test 4 (As-Joker-3 Coeur) :", test4.isValid ? `VALIDE (${test4.score} pts)` : "INVALIDE");

// TEST 5 : Tentative de triche (Couleurs mélangées dans une suite)
const test5 = validateAndScore([cards.h7, cards.s8, cards.h9]);
console.log("Test 5 (Mélange Coeur/Pique) :", test5.isValid ? "VALIDE (Erreur !)" : "INVALIDE (Correct)");
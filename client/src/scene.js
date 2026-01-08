import Phaser from 'phaser';
import { io } from "socket.io-client";
export class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
        this.hand = [];
        this.gameDeck = [];
        this.tableGroups = [];
        this.pendingGroups = [];
        this.hasDrawn = false;
        this.isPlayerOpen = false; // Nouveau : pour savoir si on peut poser sur la table
        this.totalValidatedScore = 0;
        this.lastOpeningScore = 50;
        this.discardPile = [];
        this.mustOpenThisTour = false;
        this.justPickedCard = null;
        this.openingScoreThisTurn = 0; // Score accumulé durant le tour d'ouverture
        this.tempHandState = null
        this.allCardsRegistry = {}; // Notre "banque de données"
    }

    preload() {
        this.load.atlas('cards', 'assets/cards.png', 'assets/cards.json');
        this.load.atlas('backs', 'assets/cards.back.png', 'assets/cards.back.json');
    }

    create() {
        this.socket = io('http://localhost:3000');
        this.startBtn = this.add.text(600, 400, "LANCER LA PARTIE", { fontSize: '32px', fill: '#00ff00' })
            .setOrigin(0.5).setInteractive({ useHandCursor: true });
        // Dans scene.js
        this.socket.emit('joinGame', 'Joueur_' + Math.floor(Math.random() * 1000));
        this.socket.on('playerJoined', (players) => {
            console.log("Liste des joueurs à jour :", players);
        });
        // Ajoutez ce log pour voir si le serveur confirme votre présence
        this.socket.on('playerJoined', (players) => {
            console.log("Liste des joueurs à jour :", players);
        });

        // Dans create() de scene.js

        this.startBtn.on('pointerdown', () => {
            // On envoie juste l'ordre, on ne cache pas encore le bouton ici
            this.socket.emit('startGame');
        });

        // Écouter la mise à jour globale
        this.socket.on('gameUpdate', (data) => {
            if (data.gameStarted) {
                // Si le serveur dit que le jeu a commencé, TOUT LE MONDE cache le bouton
                this.startBtn.setVisible(false);
                console.log("Le jeu a commencé, bouton supprimé pour tous.");
            }
        });
        this.cameras.main.setBackgroundColor('#2d5e32');
        // this.initializeGameDeck();
        this.socket.on('sync_contract', (data) => {
            // Le serveur envoie le score exact à battre
            this.lastOpeningScore = data.lastScore;
            this.updateScoreDisplay(); // Met à jour l'affichage "ENCHÈRE À BATTRE"
        });

        // Demander à rejoindre la partie
        this.socket.emit('joinGame', 'TonPseudo');

        // Écouter la distribution des cartes
        // Dans scene.js (create)
        this.socket.on('yourHand', (serverHand) => {
            console.log("💎 Cartes reçues :", serverHand);

            // Nettoyer l'écran s'il y avait déjà des cartes
            this.hand.forEach(c => c.destroy());
            this.hand = [];

            // Créer les cartes visuelles
            serverHand.forEach(cardData => {
                // Dans ta boucle de création de cartes :
                this.allCardsRegistry[cardData.id] = {
                    rank: cardData.rank,
                    suit: cardData.suit,
                    isJoker: cardData.isJoker,
                    texture: this.getTextureFromData(cardData) // On stocke même la texture !
                };
                this.addCardToHand(cardData);
            });

            // Les aligner proprement en bas de l'écran
            this.arrangeCards();
        });

        this.scoreInfo = this.add.text(20, 20, `CONTRAT: ${this.lastOpeningScore + 1}`, {
            fontSize: '24px',
            fill: '#ffffff',
            fontStyle: 'bold',
            backgroundColor: 'rgba(0,0,0,0.5)',
            padding: { x: 10, y: 5 }
        }).setDepth(2000);

        this.actionButton = this.add.container(600, 780).setVisible(false).setDepth(2000);
        this.btnBg = this.add.rectangle(0, 0, 300, 50, 0xffffff, 0.1).setStrokeStyle(2, 0xffffff);

        this.btnTxt = this.add.text(0, 0, "", { fontSize: '18px', fill: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
        this.btnBg.on('pointerdown', () => {
            const currentText = this.btnTxt.text;

            if (currentText.includes("VALIDER GROUPE")) {
                this.validateCurrentGroup();
            }
            else if (currentText.includes("OUVRIR LE JEU")) {
                // ... le code socket.emit que je t'ai donné ...
                const groupsToSend = this.pendingGroups.map(group =>
                    group.map(card => card.serverId)
                );
                this.socket.emit('try_open', {
                    groups: groupsToSend,
                    totalScore: this.totalValidatedScore
                });
            }
        });
        this.actionButton.add([this.btnBg, this.btnTxt]);
        this.btnBg.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.handleAction());

        this.cancelButton = this.add.text(950, 780, "ANNULER TOUT", { fontSize: '14px', fill: '#ff6666', fontStyle: 'bold' })
            .setOrigin(0.5).setInteractive({ useHandCursor: true }).setVisible(false).setDepth(2000);
        this.cancelButton.on('pointerdown', () => this.cancelPreparation());

        // this.updateDeckVisual();
        // for (let i = 0; i < 14; i++) { this.drawCard(true); }
        // this.arrangeCards(true);

        this.socket.on('open_refused', (message) => {
            alert(message); // On affiche la raison (ex: "Score insuffisant")

            // On appelle TA fonction de secours que tu as déjà codée
            if (typeof this.cancelPreparation === 'function') {
                this.cancelPreparation();
            } else {
                // Si elle n'est pas encore définie, on force le reset visuel :
                this.pendingGroups = [];
                this.totalValidatedScore = 0;
                this.hand.forEach(card => {
                    card.isFrozen = false;
                    card.isSelected = false;
                    card.setTint(0xffffff); // On enlève le gris
                });
                this.arrangeCards();
                this.refreshAssistant();
            }
        });
        // À mettre dans ton create() ou là où tu gères tes sockets
        this.socket.on('open_success', (data) => {
            console.log("✅ Ouverture réussie !", data);

            // 1. On récupère tous les IDs des cartes qui sont dans les groupes posés
            // 'this.pendingGroups' contient les objets cartes que l'on vient d'envoyer
            const idsToRemove = this.pendingGroups.flat().map(card => card.serverId || card.id);

            // 2. On nettoie la main physique du client
            this.removeCardsFromClient(idsToRemove);

            // 3. On met à jour l'état du joueur
            this.isPlayerOpen = true;
            this.lastOpeningScore = data.score;

            // 4. On rafraîchit l'affichage
            this.arrangeCards();
            this.updateScoreDisplay();
        });

        this.socket.on('table_update', (data) => {
            console.log(`Mise à jour table par ${data.playerName}`);

            // On enregistre le nouveau score à battre (contrat)
            this.contractToBeat = data.contractToBeat;

            // On dessine les nouveaux groupes sur la table
            // data.newGroups est un tableau de tableaux d'IDs : [[ID1, ID2, ID3], [ID4, ID5, ID6]]
            this.renderTableGroups(data.newGroups);

            // On met à jour ton assistant pour afficher le nouveau score à battre
            this.refreshAssistant();
        });
        this.renderTableGroups = (groups) => {
            // 1. Nettoyage
            if (this.tableCards) this.tableCards.forEach(c => c.destroy());
            this.tableCards = [];

            // Paramètres alignés sur ton code original (Source A.txt)
            const startX = 150;     // Position X de départ 
            const groupY = 180;     // Hauteur fixe pour la table 
            const groupSpacing = 230; // Espace entre chaque groupe (au lieu de 120) 
            const cardSpacing = 30;  // Décalage entre les cartes d'un groupe 

            groups.forEach((groupIDs, groupIndex) => {
                groupIDs.forEach((id, cardIndex) => {
                    const cardData = this.getCardInfoById(id);
                    const texture = this.getTextureFromData(cardData);

                    // CALCUL DES COORDONNÉES (Identique à ton refreshTableVisuals local)
                    const x = startX + (groupIndex * groupSpacing) + (cardIndex * cardSpacing);
                    const y = groupY; // On garde Y fixe pour une ligne droite 

                    const card = this.add.image(x, y, 'cards', texture).setScale(0.18);

                    // Gestion de la profondeur pour éviter que les cartes se cachent mal
                    card.setDepth(100 + (groupIndex * 10) + cardIndex);

                    // On rend la carte interactive (Optionnel mais recommandé pour le vol de joker)
                    card.setInteractive().on('pointerdown', () => this.handleTableCardClick(card, groupIndex));

                    this.tableCards.push(card);
                });
            });
        };

        this.socket.on('init_game', (data) => {
    // data.fullDeckConfig contient tous les objets {id, texture, rank, suit, isJoker}
    this.allCardsRegistry = data.fullDeckConfig;
});

    }
    syncTableWithServer(allGroups) {
        // Nettoyer les anciennes images de la table pour éviter l'accumulation
        this.tableGroups.flat().forEach(c => { if (c.destroy) c.destroy(); });

        this.tableGroups = allGroups.map(groupData => {
            return groupData.map(cardData => {
                // Créer une nouvelle image pour la table
                const texture = this.getTextureFromData(cardData);
                const card = this.add.image(0, 0, 'cards', texture).setScale(0.18);

                card.serverId = cardData.id;
                card.suit = this.mapSuit(cardData.suit);
                card.cardValue = cardData.rank;

                return card;
            });
        });

        this.refreshTableVisuals(); // Lance les tweens de placement sur la table
    }
    validateCurrentGroup() {
        const selected = this.hand.filter(c => c.isSelected);
        const points = this.getLivePoints(selected);

        selected.forEach(c => {
            c.isSelected = false;
            c.isFrozen = true; // On gèle la carte
            c.setTint(0x888888); // On la grise
        });

        this.pendingGroups.push([...selected]); // On l'ajoute aux groupes prêts
        this.hand = this.hand.filter(c => !c.isSelected); // On l'enlève de la main active
        this.totalValidatedScore += points;

        this.arrangeCards();
        this.refreshAssistant();
    }
    // À mettre au même niveau que tes fonctions arrangeCards() ou checkGroupType()
    refreshAssistant() {
        // 1. On récupère les cartes que le joueur vient de sélectionner
        const selected = this.hand.filter(c => c.isSelected);

        // 2. On utilise TES fonctions de validation (Morceau 3)
        const type = this.checkGroupType(selected);
        const points = this.getLivePoints(selected);

        // 3. MISE À JOUR DE L'INTERFACE
        if (selected.length > 0) {
            if (type !== 'invalid') {
                // Si c'est valide, on propose de valider le groupe
                this.btnTxt.setText(`VALIDER GROUPE (+${points} pts)`);
                this.btnBg.setFillStyle(0x27ae60); // On met le bouton en vert
            } else {
                this.btnTxt.setText("COMBINAISON INVALIDE");
                this.btnBg.setFillStyle(0xc0392b); // On met le bouton en rouge
            }
        } else {
            // Si aucune carte n'est sélectionnée, on affiche le score total préparé
            // ou le bouton OUVRIR si le score est suffisant
            if (this.totalValidatedScore > 0) {
                this.btnTxt.setText(`OUVRIR LE JEU (${this.totalValidatedScore} pts)`);
                this.btnBg.setFillStyle(0x2980b9);
            } else {
                this.btnTxt.setText("SÉLECTIONNEZ 3 CARTES");
                this.btnBg.setFillStyle(0x7f8c8d);
            }
        }
    }
    // Dans scene.js
    addCardToHand(cardData) {
        // 1. Dictionnaires de correspondance avec cards.json
        const suitMap = {
            'S': 'spades',
            'H': 'hearts',
            'D': 'diamonds',
            'C': 'clubs',
            'Joker': 'joker'
        };

        const rankMap = {
            1: 'ace',
            11: 'jack',
            12: 'queen',
            13: 'king'
        };

        let fileName;

        // 2. Construction du nom du fichier
        if (cardData.isJoker) {
            // Dans ton JSON, c'est "red_joker.png" ou "black_joker.png" ? 
            // Vérifie bien, j'utilise red_joker.png par défaut.
            fileName = 'red_joker.png';
        } else {
            // Si rank est 1, 11, 12, 13, on prend le nom (ace, jack...), sinon le chiffre
            const rankName = rankMap[cardData.rank] || cardData.rank;
            const suitName = suitMap[cardData.suit];
            fileName = `${rankName}_of_${suitName}.png`;
        }

        // 3. Création de l'image (au centre pour l'animation)
        const card = this.add.image(600, 400, 'cards', fileName).setScale(0.22);

        // 4. Stockage des données pour la logique
        card.serverId = cardData.id; // L'ID unique du serveur
        card.suit = suitMap[cardData.suit];
        card.cardValue = (cardData.rank === 1) ? 14 : (cardData.rank === 0 ? 0 : cardData.rank);
        card.isJoker = cardData.isJoker;
        card.isSelected = false;
        card.isFrozen = false;

        // 5. Activation des interactions
        this.setupCardEvents(card);

        // 6. Ajout à la main locale
        this.hand.push(card);

        return card;
    }

    // --- LOGIQUE DE POSITIONNEMENT (Ta logique originale) ---
    drawFromDeck() {
      if (this.hasDrawn) return;
    
    // On demande au serveur de nous donner une carte
    this.socket.emit('draw_card', { from: 'deck' });
    }
    drawFromDiscard() {
        if (this.hasDrawn || this.discardPile.length === 0) return;
        console.log("--- NOUVEAU TOUR (PIoche Défausse) ---");
        console.log("Carte récupérée :", this.discardPile[this.discardPile.length - 1].cardName);
        const card = this.discardPile.pop();
        this.justPickedCard = card;
        this.hasDrawn = true;

        // Réinitialisation de la carte pour la main
        card.setScale(0.22);
        card.isFrozen = false;
        card.isSelected = false;
        card.clearTint();
        card.setDepth(2000); // La mettre au dessus pendant le mouvement
        card.removeAllListeners();
        this.setupCardEvents(card);

        if (!this.isPlayerOpen) {
            this.mustOpenThisTour = true;
        }

        this.hand.push(card);
        this.refreshDiscardVisual();
        this.arrangeCards(); // Replacer tout le monde proprement
        this.updateScoreDisplay();
        if (!this.isPlayerOpen) {
            this.mustOpenThisTour = true;
            console.log("🔒 VERROU ACTIVÉ : Le joueur DOIT ouvrir ce tour-ci.");
        }
    }
    reorderHandWithSelection(forceAutoSort = false) {
        const selected = this.hand.filter(c => c.isSelected);
        if (selected.length < 3) return;

        // On récupère la meilleure validation possible
        const check = this.checkSelection();

        if (check && check.isValid && check.orderedCards) {
            const remaining = this.hand.filter(c => !c.isSelected);

            // On calcule la position moyenne actuelle pour savoir où "ranger" le bloc
            const sumIndices = selected.reduce((acc, c) => acc + this.hand.indexOf(c), 0);
            const avgIndex = Math.round(sumIndices / selected.length);

            const newHand = [...remaining];
            const insertAt = Phaser.Math.Clamp(
                avgIndex - Math.floor(check.orderedCards.length / 2),
                0,
                remaining.length
            );

            // Insertion du bloc ordonné par l'IA ou le joueur
            newHand.splice(insertAt, 0, ...check.orderedCards);
            this.hand = newHand;
            this.currentSelectionPoints = check.points;
        }
    }
    reconcileSelection() {
        const check = this.checkSelection();
        if (check.isValid) {
            this.currentSelectionPoints = check.points;
        } else {
            this.currentSelectionPoints = 0;
        }
        this.updateScoreDisplay();
    }
    // --- VALIDATION (Inchangée) ---

    checkSelection() {
        const selected = this.hand.filter(c => c.isSelected);
        if (selected.length < 3) return { isValid: false, points: 0 };

        // --- ÉTAPE 1 : TESTER LA SUITE ---
        // On teste d'abord l'ordre ACTUEL (Liberté du joueur)
        let suite = this.validateSequence(selected, false); // false = ne pas forcer le tri

        // Si invalide et qu'on a exactement 3 cartes, ou si le joueur a fait n'importe quoi
        if (!suite.isValid) {
            suite = this.validateSequence(selected, true); // true = l'IA propose un tri
        }

        if (suite.isValid) return suite;

        // --- ÉTAPE 2 : TESTER LE BRELAN ---
        const set = this.validateSet(selected);
        if (set.isValid) return set;

        return { isValid: false, points: 0 };
    }
    validateSet(selection) {
        const normals = selection.filter(c => !c.isJoker && c.suit !== 'joker');
        const jokers = selection.filter(c => c.isJoker || c.suit === 'joker');

        // Règle : Max 1 Joker dans un Brelan/Carré
        if (selection.length < 3 || selection.length > 4 || jokers.length > 1) return { isValid: false };

        const val = normals[0].cardValue;
        if (!normals.every(c => c.cardValue === val)) return { isValid: false };

        // Couleurs différentes
        const suits = new Set(normals.map(c => c.suit));
        if (suits.size !== normals.length) return { isValid: false };

        let cardPts = (val === 1 || val >= 10) ? 10 : val;
        return {
            isValid: true,
            type: "BRELAN",
            points: selection.length * cardPts,
            orderedCards: selection // On respecte TOUJOURS l'ordre du joueur ici
        };
    }

    // Petite fonction utilitaire pour les points de la suite (Rami Tunisien)
    calculateSequencePoints(sortedNormals, numJokers, hasLow) {
        let total = 0;
        // On détermine la valeur de la carte la plus basse de la suite
        // (en tenant compte des jokers qui pourraient être placés AVANT la première carte normale)
        let firstVal = (sortedNormals[0].cardValue === 1 && !hasLow) ? 14 : sortedNormals[0].cardValue;

        // Pour simplifier : on additionne les valeurs des cartes normales 
        // et on ajoute les valeurs théoriques des jokers
        let normalSum = sortedNormals.reduce((sum, c) => {
            let v = getV(c); // utilise la même logique que plus haut
            return sum + (v >= 10 ? 10 : v);
        }, 0);

        // On calcule les points des jokers (méthode rapide pour le Rami)
        // On estime la valeur moyenne ou on complète la suite
        let totalCards = sortedNormals.length + numJokers;
        let sequenceSum = 0;
        let currentV = firstVal;

        // On simule la suite pour avoir les points exacts
        for (let i = 0; i < totalCards; i++) {
            let val = firstVal + i;
            if (val > 14) val = 14; // Sécurité
            sequenceSum += (val >= 10) ? 10 : val;
        }

        return sequenceSum;
    }
    validateSequence(selection, forceAutoSort = false) {
        const normals = selection.filter(c => !c.isJoker && c.suit !== 'joker');
        const jokers = selection.filter(c => c.isJoker || c.suit === 'joker');
        if (jokers.length > 2 || normals.length === 0) return { isValid: false };

        const suit = normals[0].suit;
        if (!normals.every(c => c.suit === suit)) return { isValid: false };

        // 1. On teste l'ordre ACTUEL (Liberté du joueur)
        let bestManual = this.getBestPointsFromScenarios(selection, [1, 14]);

        // 2. Si l'ordre manuel est invalide OU qu'on force le tri (nouveau clic)
        if (!bestManual.isValid || forceAutoSort) {
            return this.findBestAutoOrder(selection);
        }

        return bestManual;
    }

    checkOrderStrict(cards, asValue) {
        const getV = (c) => (c.cardValue === 1) ? asValue : c.cardValue;
        const firstNormalIdx = cards.findIndex(c => !c.isJoker && c.suit !== 'joker');
        const startVal = getV(cards[firstNormalIdx]) - firstNormalIdx;

        let points = 0;
        for (let i = 0; i < cards.length; i++) {
            let expectedV = startVal + i;
            if (expectedV < 1 || expectedV > 14) return { isValid: false };
            if (!cards[i].isJoker && cards[i].suit !== 'joker' && getV(cards[i]) !== expectedV) return { isValid: false };

            // Calcul Rule 51
            points += (expectedV === 1) ? 1 : (expectedV >= 10 ? 10 : expectedV);
        }
        return { isValid: true, type: "SUITE", points, orderedCards: cards };
    }

    handleDragEnd(card) {
        const selected = this.hand.filter(c => c.isSelected);

        if (selected.length >= 3) {
            const check = this.checkSelection(); // Lance validateSequence ou validateSet

            if (!check.isValid) {
                // ÉCHEC : On revient à l'état précédent (Annulation)
                console.log("Mouvement invalide : Retour à la position précédente");
                this.hand = [...this.tempHandState];
            } else {
                // SUCCÈS : On accepte le nouvel ordre et on met à jour les points
                this.currentSelectionPoints = check.points;
                // Si c'était un brelan ou une suite de 3, on peut forcer le regroupement
                this.reorderHandWithSelection(check);
            }
        }

        this.tempHandState = null;
        this.arrangeCards(); // Animation fluide
    }
    // Si le joueur met n'importe quoi, l'IA essaie de trouver la meilleure suite possible
    findBestAutoOrder(selection) {
        const normals = selection.filter(c => !c.isJoker && c.suit !== 'joker');
        const jokers = selection.filter(c => c.isJoker || c.suit === 'joker');

        // 1. On teste les deux potentiels de l'As (1 et 14)
        let bestScenarios = [1, 14].map(asVal => {
            const getV = (c) => (c.cardValue === 1) ? asVal : c.cardValue;
            const sortedNormals = [...normals].sort((a, b) => getV(a) - getV(b));

            // Calcul des trous entre les cartes triées
            let gaps = [];
            for (let i = 0; i < sortedNormals.length - 1; i++) {
                let diff = getV(sortedNormals[i + 1]) - getV(sortedNormals[i]);
                if (diff <= 0) return { isValid: false }; // Doublon
                if (diff > 1) gaps.push({ index: i, count: diff - 1 });
            }

            const totalGaps = gaps.reduce((sum, g) => sum + g.count, 0);

            // Si on a assez de Jokers pour boucher les trous
            if (totalGaps <= jokers.length) {
                let result = [];
                let remainingJokers = [...jokers];

                // On construit la suite en insérant les jokers dans les trous
                for (let i = 0; i < sortedNormals.length; i++) {
                    result.push(sortedNormals[i]);
                    if (i < sortedNormals.length - 1) {
                        let gap = gaps.find(g => g.index === i);
                        if (gap) {
                            for (let j = 0; j < gap.count; j++) result.push(remainingJokers.shift());
                        }
                    }
                }

                // S'il reste des jokers, on les met aux extrémités (Option B)
                while (remainingJokers.length > 0) {
                    let topV = getV(result[result.length - 1]);
                    let botV = getV(result[0]);
                    if (topV < 14) result.push(remainingJokers.shift());
                    else if (botV > 1) result.unshift(remainingJokers.shift());
                    else break;
                }

                if (result.length === selection.length) {
                    return { isValid: true, orderedCards: result, points: this.calculateSmartScore(result, asVal === 1) };
                }
            }
            return { isValid: false };
        });

        const final = bestScenarios.filter(s => s.isValid).sort((a, b) => b.points - a.points)[0];
        return final || { isValid: false };
    }

    calculateSmartScore(orderedCards, isAsLow) {
        let total = 0;

        // On trouve la base pour calculer les valeurs théoriques
        const firstNormalIdx = orderedCards.findIndex(c => c.suit !== 'joker' && !c.isJoker);
        const firstNormal = orderedCards[firstNormalIdx];

        // Déterminer la valeur numérique de la première carte réelle
        const baseVal = (firstNormal.cardValue === 1 && !isAsLow) ? 14 : firstNormal.cardValue;

        // Calculer le point de départ de la suite (l'index 0)
        const startVal = baseVal - firstNormalIdx;

        console.log("--- ANALYSE DE LA COMBINAISON ---");
        console.log("As considéré comme :", isAsLow ? "PETIT (1)" : "GRAND (14)");

        orderedCards.forEach((card, i) => {
            let logicalVal = startVal + i;

            // On traduit logicalVal en nom de carte pour le log
            let cardName = logicalVal;
            if (logicalVal === 1 || logicalVal === 14) cardName = "AS";
            if (logicalVal === 11) cardName = "VALET";
            if (logicalVal === 12) cardName = "DAME";
            if (logicalVal === 13) cardName = "ROI";

            if (card.suit === 'joker' || card.isJoker) {
                console.log(`> JOKER à la position ${i} prend la valeur : ${cardName}`);
            } else {
                console.log(`> Carte ${card.suit} à la position ${i} vaut : ${cardName}`);
            }

            // Calcul des points (Règle 51)
            if (logicalVal === 1) total += 1;
            else if (logicalVal >= 10) total += 10;
            else total += logicalVal;
        });

        console.log("TOTAL POINTS DU GROUPE :", total);
        console.log("---------------------------------");

        return total;
    }
    calculateSequenceScore(sortedNormals, numJokers, hasLow) {
        // On trouve la valeur de départ théorique de la suite
        let firstVal = (sortedNormals[0].cardValue === 1 && !hasLow) ? 14 : sortedNormals[0].cardValue;

        // Si des jokers sont placés au début (avant la première carte normale)
        // On essaie de caler la suite le plus bas possible ou selon la logique de la main
        // Pour le calcul standard : on part de la première normale

        let totalScore = 0;
        let currentV = firstVal;
        let cardsCount = sortedNormals.length + numJokers;

        for (let i = 0; i < cardsCount; i++) {
            let val = currentV + i;
            if (val > 14) val = 14; // Sécurité pour ne pas dépasser l'As haut

            // Règle Tunisienne : Figures et As = 10, le reste = valeur nominale
            // Exception : As dans une petite suite (1,2,3) = 1 point selon les variantes
            if (val === 1 && hasLow) {
                totalScore += 1;
            } else if (val >= 10 || val === 1) {
                totalScore += 10;
            } else {
                totalScore += val;
            }
        }
        return totalScore;
    }
    // --- NOUVEAU : INTERACTION AVEC LA TABLE (VOL JOKER / AJOUT) ---

    determineJokerValue(group, jokerCard) {
        const idx = group.indexOf(jokerCard);
        const normals = group.filter(c => c.suit !== 'joker');
        const isBrelan = normals.every(c => c.cardValue === normals[0].cardValue);

        if (isBrelan) {
            const missingSuit = ['spades', 'hearts', 'diamonds', 'clubs'].find(s => !normals.map(c => c.suit).includes(s));
            return { value: normals[0].cardValue, suit: missingSuit };
        } else {
            const firstN = group.find(c => c.suit !== 'joker');
            const hasLow = normals.some(c => c.cardValue <= 3);
            const getV = (c) => (c.cardName.includes('ace') && hasLow) ? 1 : c.cardValue;
            let val = getV(firstN) - (group.indexOf(firstN) - idx);
            return { value: (val === 1 && !hasLow) ? 14 : val, suit: firstN.suit };
        }
    }

    handleTableCardClick(clickedCard, groupIndex) {
        const selected = this.hand.filter(c => c.isSelected);
        if (!this.isPlayerOpen || selected.length === 0) return;

        let group = this.tableGroups[groupIndex];

        // 1. VOL DE JOKER (Inchangé, reste prioritaire)
        if (clickedCard.suit === 'joker' && selected.length === 1) {
            const myCard = selected[0];
            const needed = this.determineJokerValue(group, clickedCard);
            if (myCard.cardValue === needed.value && myCard.suit === needed.suit) {
                const jokerIndex = group.indexOf(clickedCard);
                group[jokerIndex] = myCard;
                this.hand = this.hand.filter(c => c !== myCard);
                myCard.isFrozen = true; myCard.isSelected = false; myCard.disableInteractive();
                clickedCard.isFrozen = false; clickedCard.isSelected = false;
                clickedCard.clearTint(); clickedCard.setScale(0.22);
                clickedCard.removeAllListeners();
                this.setupCardEvents(clickedCard);
                this.hand.push(clickedCard);
                this.refreshTableVisuals(); this.arrangeCards(); this.updateScoreDisplay();
                return;
            }
        }

        // 2. AJOUT FLEXIBLE (Ex: 3-4-5 sur table + Joker et 7 en main)
        let combined = [...group, ...selected];
        const normals = combined.filter(c => c.suit !== 'joker');
        const jokers = combined.filter(c => c.suit === 'joker');

        // On vérifie si c'est un Brelan/Carré
        const isBrelan = normals.every(c => c.cardValue === normals[0].cardValue) &&
            new Set(normals.map(s => s.suit)).size === normals.length &&
            combined.length <= 4;

        if (isBrelan) {
            this.finalizeTableAdd(groupIndex, combined, selected);
            return;
        }

        // --- LOGIQUE DE SUITE FLEXIBLE ---
        // On trie les cartes normales par valeur
        const hasLow = normals.some(c => c.cardValue <= 3);
        const getV = (c) => (c.cardName.includes('ace') && hasLow) ? 1 : c.cardValue;
        normals.sort((a, b) => getV(a) - getV(b));

        let finalSequence = [];
        let jokerCount = jokers.length;
        let possible = true;

        // On commence la séquence avec la première carte normale
        finalSequence.push(normals[0]);

        for (let i = 0; i < normals.length - 1; i++) {
            let current = getV(normals[i]);
            let next = getV(normals[i + 1]);
            let gap = next - current - 1;

            if (gap === 0) {
                finalSequence.push(normals[i + 1]);
            } else if (gap > 0 && gap <= jokerCount) {
                // On comble le trou (gap) avec les Jokers disponibles
                for (let j = 0; j < gap; j++) {
                    finalSequence.push(jokers.shift());
                    jokerCount--;
                }
                finalSequence.push(normals[i + 1]);
            } else {
                possible = false;
                break;
            }
        }

        // S'il reste des jokers, on les met à la fin ou au début
        while (jokerCount > 0) {
            let lastVal = getV(finalSequence[finalSequence.length - 1]);
            if (lastVal < 14) finalSequence.push(jokers.shift());
            else finalSequence.unshift(jokers.shift());
            jokerCount--;
        }

        if (possible && finalSequence.length >= 3) {
            this.finalizeTableAdd(groupIndex, finalSequence, selected);
        } else {
            console.log("Impossible de former une suite, même avec le Joker.");
        }
    }

    // Fonction utilitaire pour éviter de répéter le code de fin
    finalizeTableAdd(groupIndex, newGroup, selectedFromHand) {
        this.tableGroups[groupIndex] = newGroup;
        this.hand = this.hand.filter(c => !selectedFromHand.includes(c));
        selectedFromHand.forEach(c => {
            c.isFrozen = true;
            c.isSelected = false;
            c.clearTint();
            c.disableInteractive();
        });
        this.refreshTableVisuals();
        this.arrangeCards();
        this.updateScoreDisplay();
    }
    // --- ACTIONS DU JOUEUR ---
    handleAction() {
        const selected = this.hand.filter(c => c.isSelected);
        if (selected.length === 1 && !this.hasDrawn) return;
        // if (selected.length === 0 && this.pendingGroups.length > 0 && !this.hasDrawn) {
        //     alert("Vous devez piocher une carte avant de poser sur la table.");
        //     return;
        // }
        // ==========================================
        // CAS A : JETER (Fin du tour)
        // ==========================================
        if (selected.length === 1 && this.hasDrawn) {
            if (this.mustOpenThisTour && !this.isPlayerOpen) {
                alert(`Contrat non rempli ! Vous devez ouvrir pour valider votre pioche à la défausse.`);
                return;
            }

            // --- SCELLEMENT DU CONTRAT ---
            // Si le joueur a posé des cartes ce tour-ci (ouverture ou ajout)
            if (this.openingScoreThisTurn > 0) {
                this.lastOpeningScore = this.openingScoreThisTurn;
                this.openingScoreThisTurn = 0; // Reset pour le prochain tour
                console.log(`🏁 FIN DU TOUR : Score d'ouverture scellé.`);
                console.log(`Nouveau contrat à battre pour le prochain : ${this.lastOpeningScore + 1}`);
            }

            this.discardCard(selected[0]);
            return;
        }

        // ==========================================
        // CAS B : VALIDER UN GROUPE (Mise en attente en gris)
        // ==========================================
        if (selected.length >= 3) {
            const check = this.checkSelection();
            if (check.isValid) {
                selected.forEach(c => {
                    c.isFrozen = true;
                    c.isSelected = false;
                    c.setTint(0x888888);
                    c.disableInteractive();
                });

                this.pendingGroups.push([...selected]);
                this.totalValidatedScore += check.points;

                // Déplacement visuel à gauche
                this.hand = this.hand.filter(c => !selected.includes(c));
                this.hand.unshift(...selected);

                this.arrangeCards();
                this.updateScoreDisplay();

                console.log(`✅ Groupe Validé : ${check.type} (${check.points} pts)`);
                // Calcul du score cible dynamique
                let scoreCible = this.lastOpeningScore + 1;
                console.log(`📈 Score cumulé en attente : ${this.totalValidatedScore + (this.openingScoreThisTurn || 0)} / Contrat : ${scoreCible}`);
            } else {
                alert("Combinaison invalide !");
            }
        }

        // ==========================================
        // CAS C : POSER SUR LA TABLE (Ouverture ou Ajout)
        // ==========================================
        else if (selected.length === 0 && this.pendingGroups.length > 0) {
            const payload = this.prepareOpenPayload();
            this.btnTxt.setText("VÉRIFICATION...");

            // ON NE FAIT RIEN D'AUTRE ICI. 
            // On ne vide pas pendingGroups, on n'ajoute rien à tableGroups.
            this.socket.emit('try_open', payload);
        }
    }
    removeCardsFromClient(serverIdsList) {
        if (!serverIdsList) return;

        // 1. Détruire visuellement les cartes
        serverIdsList.forEach(id => {
            const cardObj = this.hand.find(c => c.serverId === id);
            if (cardObj) {
                cardObj.destroy();
            }
        });

        // 2. Nettoyer le tableau de la main
        this.hand = this.hand.filter(c => {
            // On ne garde que les cartes qui existent encore ET qui ne sont pas dans la liste supprimée
            return c.scene !== undefined && !serverIdsList.includes(c.serverId);
        });

        // 3. Reset des états de préparation
        this.pendingGroups = [];
        this.totalValidatedScore = 0;

        this.arrangeCards(); // Aligner proprement les cartes restantes
    }
    refreshTableVisuals() {
        this.tableGroups.forEach((group, gIdx) => {
            group.forEach((card, cIdx) => {
                // Important : On rend les cartes de la table cliquables pour le prochain vol/ajout
                card.setInteractive().removeAllListeners('pointerdown');
                card.on('pointerdown', () => this.handleTableCardClick(card, gIdx));

                this.tweens.add({
                    targets: card,
                    x: 150 + (gIdx * 230) + (cIdx * 30),
                    y: 180,
                    scale: 0.18, // Taille réduite sur la table
                    rotation: 0,
                    duration: 600
                });
                card.setDepth(100 + cIdx);
                card.setTint(0xffffff); // Remettre la couleur normale
            });
        });
    }

    // --- SYSTÈME DE BASE (Inchangé) ---

    setupCardEvents(card) {
        card.setInteractive({ draggable: true });

        card.on('pointerdown', (p) => {
            card.downX = p.x;
            card.downY = p.y;
            // On mémorise l'état avant toute action pour pouvoir annuler
            this.oldHandState = [...this.hand];
        });

        card.on('dragstart', () => {
            if (card.isFrozen) return;
            // On confirme la sauvegarde de l'état juste avant le début du mouvement
            this.oldHandState = [...this.hand];
        });

        card.on('drag', (p) => {
            if (card.isFrozen) return;

            const oldIdx = this.hand.indexOf(card);
            const newIdx = Phaser.Math.Clamp(Math.floor(p.x / (1200 / this.hand.length)), 0, this.hand.length - 1);

            if (oldIdx !== newIdx && !this.hand[newIdx].isFrozen) {
                this.hand.splice(oldIdx, 1);
                this.hand.splice(newIdx, 0, card);

                // --- AJOUT TEMPS RÉEL ---
                if (card.isSelected) {
                    const selected = this.hand.filter(c => c.isSelected);
                    const livePoints = this.getLivePoints(selected);

                    if (livePoints > 0) {
                        this.btnTxt.setText(`VALIDER (${livePoints} pts)`);
                    } else {
                        this.btnTxt.setText("COMBINAISON INVALIDE");
                    }
                }
                // -------------------------

                this.arrangeCards();
            }
        });

        card.on('dragend', () => {
            if (card.isFrozen) return;

            const selected = this.hand.filter(c => c.isSelected);

            // Si la carte déplacée fait partie d'une sélection de 3+ cartes
            if (card.isSelected && selected.length >= 3) {
                const check = this.checkSelection(); // Vérifie l'ordre actuel SANS forcer le tri

                if (!check.isValid) {
                    // ANNULATION : Le mouvement a cassé la suite/brelan
                    console.log("Mouvement invalide, retour à la place...");
                    this.hand = [...this.oldHandState];
                } else {
                    // VALIDÉ : On accepte l'ordre et on regroupe proprement
                    this.reorderHandWithSelection(false); // false = ne pas forcer le tri auto
                }
            }
            this.arrangeCards();
        });

        card.on('pointerup', (p) => {
            if (card.isFrozen) return;

            // Détection clic (mouvement < 5px)
            if (Phaser.Math.Distance.Between(card.downX, card.downY, p.x, p.y) < 5) {
                card.isSelected = !card.isSelected;
                card.isSelected ? card.setTint(0xcccccc) : card.clearTint();

                // On ne tente de réordonner QUE si on vient de sélectionner une carte 
                // et qu'on a un groupe potentiel (3+)
                const selectedCount = this.hand.filter(c => c.isSelected).length;
                if (card.isSelected && selectedCount >= 3) {
                    this.reorderHandWithSelection(true); // Tri auto
                }

                this.reconcileSelection();
                this.arrangeCards(); // Animation fluide
            }
        });
    }
    getBestPointsFromScenarios(selection, scenarios) {
        let bestResult = { isValid: false, points: 0, orderedCards: selection };

        scenarios.forEach(asValue => {
            // On teste l'ordre ACTUEL tel quel, mais en changeant la valeur de l'As
            const result = this.checkOrderStrict(selection, asValue);

            if (result.isValid) {
                if (result.points > bestResult.points) {
                    bestResult = result;
                }
            }
        });

        return bestResult;
    }
    arrangeCards(immediate = false) {
        const centerX = 600, centerY = 1250, radius = 720;
        const angleStep = Math.min(0.07, (Math.PI / 2.4) / this.hand.length);
        const startAngle = -(angleStep * (this.hand.length - 1)) / 2;
        this.hand.forEach((card, i) => {
            const angle = startAngle + (i * angleStep);
            const x = centerX + Math.sin(angle) * radius;
            const y = (centerY - Math.cos(angle) * radius) - (card.isSelected ? 60 : 0);
            card.setDepth(i + 10);
            if (immediate) { card.setPosition(x, y); card.setRotation(angle); }
            else { this.tweens.add({ targets: card, x, y, rotation: angle, duration: 250, ease: 'Cubic.easeOut' }); }
        });
    }

    drawCard(immediate = false) {
        // 1. SÉCURITÉS
        // On ne pioche pas si on a déjà pioché (sauf pour la distribution initiale 'immediate')
        if (this.hasDrawn && !immediate) return;
        if (this.gameDeck.length === 0) {
            alert("Le deck est vide !");
            return;
        }

        // 2. RÉCUPÉRATION DES DONNÉES
        const cardData = this.gameDeck.pop();

        // 3. CRÉATION VISUELLE (On part du deck)
        // Position du deck : 350, 250
        const card = this.add.image(400, 250, 'backs', 'Back Blue 1.png').setScale(0.22);

        // 4. ASSIGNATION DES PROPRIÉTÉS
        card.faceName = cardData.face;
        card.isFrozen = false;
        card.isSelected = false;
        this.assignCardData(card, card.faceName);
        this.setupCardEvents(card);

        if (immediate) {
            // Pour la distribution de début de partie
            card.setTexture('cards', card.faceName);
            this.hand.push(card);
            // On ne met pas hasDrawn à true ici car c'est la donne
        } else {
            // Pour la pioche normale durant le tour
            this.hasDrawn = true; // Verrouille les autres pioches (Deck et Défausse)

            // On ajoute à la main avant l'animation pour que l'index soit correct
            this.hand.push(card);

            // Animation de déplacement
            this.tweens.add({
                targets: card,
                x: 600,
                y: 700,
                duration: 400,
                ease: 'Cubic.easeOut',
                onComplete: () => {
                    // On retourne la carte une fois arrivée
                    card.setTexture('cards', card.faceName);
                    this.arrangeCards();
                    this.updateScoreDisplay();
                }
            });
        }
    }

    assignCardData(card, cardData) {
        card.serverId = cardData.id;
        card.isJoker = cardData.isJoker;
        card.suit = cardData.suit; // 'S', 'H', 'D', 'C' ou 'joker'

        // On harmonise la valeur numérique pour tes fonctions de calcul (getLivePoints)
        // Le serveur envoie rank: 1 pour l'As. Ta logique utilise 14 pour l'As haut.
        if (cardData.isJoker) {
            card.cardValue = 0;
        } else {
            card.cardValue = (cardData.rank === 1) ? 14 : cardData.rank;
        }

        // On stocke le nom de la texture pour Phaser
        card.faceName = cardData.texture;
    }

    updateDeckVisual() {
        if (this.deckImage) return;

        // On le décale bien à gauche
        this.deckImage = this.add.image(400, 250, 'backs', 'Back Blue 1.png')
            .setScale(0.22)
            .setInteractive({ useHandCursor: true });

        this.deckImage.on('pointerdown', (pointer, localX, localY, event) => {
            if (event) event.stopPropagation(); // Empêche le clic de traverser vers ce qu'il y a derrière

            if (!this.hasDrawn) {
                console.log("Clic détecté sur DECK");
                this.drawCard();
            }
        });
    }

    // initializeGameDeck() {
    //     const suits = ['spades', 'hearts', 'diamonds', 'clubs'];
    //     const values = ['ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king'];
    //     suits.forEach(s => values.forEach(v => this.gameDeck.push({ face: `${v}_of_${s}.png` })));
    //     this.gameDeck.push({ face: 'red_joker.png' }, { face: 'black_joker.png' });
    //     Phaser.Utils.Array.Shuffle(this.gameDeck);
    // }

    discardCard(card) {
        // RÈGLE JOKER : Interdit de jeter sauf pour finir
        if (card.suit === 'joker' && this.hand.length > 1) { // Correction du > 0 en > 1
            alert("Interdit : Le Joker ne peut être jeté que pour fermer la manche.");
            card.isSelected = false; card.clearTint();
            return;
        }

        // RÈGLE REJET : Interdit de rejeter la carte ramassée à l'instant
        if (card === this.justPickedCard) {
            alert("Interdit : Vous ne pouvez pas rejeter la carte ramassée ce tour-ci.");
            card.isSelected = false; card.clearTint();
            return;
        }

        // --- LA CORRECTION EST ICI ---
        // On retire la carte du tableau de la main avant de faire quoi que ce soit d'autre
        this.hand = this.hand.filter(c => c !== card);

        // Scellement de l'enchère
        if (this.openingScoreThisTurn > 0) {
            this.lastOpeningScore = this.openingScoreThisTurn;
            this.openingScoreThisTurn = 0;
        }

        // Nettoyage des flags de fin de tour
        this.mustOpenThisTour = false;
        this.justPickedCard = null;
        this.hasDrawn = false;

        // Préparation visuelle pour la pile
        card.isSelected = false;
        card.isFrozen = true;
        card.clearTint();
        card.disableInteractive();
        card.setScale(0.18);
        card.setDepth(this.discardPile.length);

        this.discardPile.push(card);

        // Animation vers la défausse
        this.tweens.add({
            targets: card,
            x: 800,
            y: 250,
            duration: 300,
            onComplete: () => {
                this.refreshDiscardVisual();
                if (this.hand.length === 0) {
                    this.handleEndOfRound();
                }
            }
        });

        // On range le reste de la main (la carte jetée n'y est plus, donc elle ne reviendra pas)
        this.arrangeCards();
        this.updateScoreDisplay();
        console.log(`🗑 Fin de tour : Carte jetée -> ${card.cardName}`);
    }

    cancelPreparation() {
        if (this.justPickedCard && this.mustOpenThisTour) {
            const card = this.justPickedCard;
            this.hand = this.hand.filter(c => c !== card);
            this.discardPile.push(card);
            this.mustOpenThisTour = false;
            this.justPickedCard = null;
            this.hasDrawn = false; // On redonne le droit de piocher au deck
            this.refreshDiscardVisual();
        }

        this.pendingGroups.forEach(group => {
            group.forEach(c => {
                c.isFrozen = false; c.setTint(0xffffff); c.setInteractive();
            });
        });
        this.pendingGroups = [];
        this.totalValidatedScore = 0;
        this.arrangeCards();
        this.updateScoreDisplay();
    }
    refreshDiscardVisual() {
        this.discardPile.forEach((card, index) => {
            card.removeAllListeners();

            // Position fixe pour la défausse, bien à droite du deck
            const targetX = 800;
            const targetY = 250;

            card.setPosition(targetX, targetY);
            card.setScale(0.22); // Même échelle que le deck pour la cohérence

            if (index === this.discardPile.length - 1) {
                card.setInteractive({ useHandCursor: true });
                card.on('pointerdown', (pointer) => {
                    // DANS refreshDiscardVisual
                    if (index === this.discardPile.length - 1) {
                        card.setInteractive({ useHandCursor: true });
                        // On ajoute 'event' en 4ème paramètre
                        card.on('pointerdown', (pointer, localX, localY, event) => {
                            // CECI EST LA LIGNE MAGIQUE
                            if (event) event.stopPropagation();

                            if (!this.hasDrawn) {
                                console.log("Clic détecté sur DÉFAUSSE");
                                this.drawFromDiscard();
                            }
                        });
                    }
                });
            } else {
                card.disableInteractive();
            }
        });
    }
    updateScoreDisplay() {
        const selected = this.hand.filter(c => c.isSelected);
        const hasPending = this.pendingGroups.length > 0;
        const scoreCible = this.lastOpeningScore + 1;

        // 1. Visibilité du bouton "ANNULER"
        const hasContract = this.mustOpenThisTour && !this.isPlayerOpen;
        this.cancelButton.setVisible(hasPending || hasContract);

        // 2. Gestion du bouton d'action principal
        this.actionButton.setVisible(true);

        if (selected.length === 0) {
            if (hasPending) {
                // REGLE : Bloquer la pose si pas de pioche
                if (!this.hasDrawn) {
                    this.btnTxt.setText("PIOCHEZ POUR POSER");
                }
                else if (this.isPlayerOpen) {
                    this.btnTxt.setText("POSER SUR LA TABLE");
                } else {
                    if (this.totalValidatedScore >= scoreCible) {
                        this.btnTxt.setText(`OUVRIR LE JEU (${this.totalValidatedScore} pts)`);
                    } else {
                        this.btnTxt.setText(`BESOIN DE ${scoreCible} PTS`);
                    }
                }
            } else {
                this.actionButton.setVisible(false);
            }
        }
        else if (selected.length === 1) {
            // REGLE : Bloquer le jet si pas de pioche
            if (!this.hasDrawn) {
                this.btnTxt.setText("PIOCHEZ D'ABORD");
            } else if (this.mustOpenThisTour && !this.isPlayerOpen) {
                this.btnTxt.setText("OUVERTURE REQUISE");
            } else {
                this.btnTxt.setText("JETER LA CARTE");
            }
        }
        else {
            // VALIDATION : Toujours autorisée pour préparer le tour
            const res = this.checkSelection();
            this.btnTxt.setText(res.isValid ? `VALIDER (${res.points} pts)` : "COMBINAISON INVALIDE");
        }

        // 3. Mise à jour du bandeau d'information (Haut à gauche)
        if (this.isPlayerOpen) {
            this.scoreInfo.setText(`✅ JEU OUVERT | CONTRAT ACTUEL : ${scoreCible}`);
            this.scoreInfo.setFill('#00ff00');
        } else {
            if (this.mustOpenThisTour) {
                this.scoreInfo.setText(`⚠ CONTRAT OBLIGATOIRE : ${scoreCible} ⚠\nACTUEL : ${this.totalValidatedScore}`);
                this.scoreInfo.setFill('#ff4444');
            } else {
                this.scoreInfo.setText(`ENCHÈRE À BATTRE : ${scoreCible}\nACTUEL : ${this.totalValidatedScore}`);

                if (this.totalValidatedScore >= scoreCible) {
                    this.scoreInfo.setFill('#00ff00');
                } else {
                    this.scoreInfo.setFill('#ffffff');
                }
            }
        }
    }
    calculateHandScore(hand, hasOpened) {
        // Si le joueur n'a pas ouvert : forfait de 100 points
        if (!hasOpened) return 100;

        // Si le joueur a ouvert, on compte les cartes restantes
        return hand.reduce((total, card) => {
            if (card.suit === 'joker') {
                return total + 20; // Joker = 20 pts
            }

            // Pour les cartes normales
            // As (14), Roi (13), Dame (12), Valet (11), 10
            if (card.cardValue >= 10) {
                return total + 10; // Figures et As = 10 pts
            }

            // Cartes de 2 à 9 = Valeur nominale
            return total + card.cardValue;
        }, 0);
    }
    handleEndOfRound() {
        console.log("🏆 MANCHE TERMINÉE !");

        // Le gagnant (ici le joueur)
        const winnerScore = -10;

        // Simulation pour les adversaires (en attendant le mode serveur/IA)
        // Imaginons un adversaire qui n'a pas ouvert et un autre qui a ouvert
        const scorePlayer = winnerScore;

        // Affichage d'un panneau de score simple
        const overlay = this.add.rectangle(600, 400, 400, 300, 0x000000, 0.8).setDepth(5000);
        const resultText = this.add.text(600, 400,
            `RÉSULTATS\n\n` +
            `VOUS : ${scorePlayer} pts (GAGNÉ)\n` +
            `ADVERSAIRE 1 : 100 pts (NON OUVERT)\n` +
            `ADVERSAIRE 2 : 45 pts (OUVERT)`,
            { fontSize: '22px', fill: '#ffffff', align: 'center' }
        ).setOrigin(0.5).setDepth(5001);

        // Bouton pour rejouer
        const restartBtn = this.add.text(600, 520, "NOUVELLE MANCHE", {
            fontSize: '20px',
            fill: '#00ff00',
            backgroundColor: '#111',
            padding: { x: 10, y: 5 }
        })
            .setOrigin(0.5)
            .setDepth(5001)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => this.scene.restart());
    }
 getCardInfoById = (id) => {
    if (this.allCardsRegistry[id]) {
        return this.allCardsRegistry[id];
    }
    return { texture: 'Back Blue 1.png' }; // Sécurité
};
    checkGroupType(group) {
        if (group.length < 3) return 'invalid';

        const nonJokers = group.filter(c => !c.isJoker);
        const numJokers = group.length - nonJokers.length;

        if (nonJokers.length === 0) return 'invalid';

        // --- TEST DU BRELAN ---
        const firstValue = nonJokers[0].cardValue;
        const allSameValue = nonJokers.every(c => c.cardValue === firstValue);
        if (allSameValue) {
            const suits = new Set(nonJokers.map(c => c.suit));
            if (suits.size === nonJokers.length) return 'set';
        }

        // --- TEST DE LA SUITE ---
        const suit = nonJokers[0].suit;
        if (nonJokers.every(c => c.suit === suit)) {
            // On teste les deux positions possibles de l'As (1 ou 14)
            const checkSequence = (isAsLow) => {
                const getV = (c) => (c.cardValue === 14 && isAsLow) ? 1 : c.cardValue;
                const sortedNormals = [...nonJokers].sort((a, b) => getV(a) - getV(b));

                let gaps = 0;
                for (let i = 0; i < sortedNormals.length - 1; i++) {
                    let diff = getV(sortedNormals[i + 1]) - getV(sortedNormals[i]);
                    if (diff === 0) return false; // Doublon
                    gaps += (diff - 1);
                }
                return gaps <= numJokers;
            };

            // Si c'est une suite avec As=1 OU As=14, c'est valide
            if (checkSequence(true) || checkSequence(false)) return 'sequence';
        }

        return 'invalid';
    }
    // Calcule les points d'un groupe en respectant l'ordre VISUEL actuel
    getLivePoints(selection) {
        if (selection.length < 3) return 0;

        // On regarde si c'est un Brelan (toutes les cartes normales ont la même valeur)
        const normals = selection.filter(c => !c.isJoker && c.suit !== 'joker');
        if (normals.length === 0) return 0;

        const isBrelan = normals.every(c => c.cardValue === normals[0].cardValue);

        if (isBrelan) {
            const val = normals[0].cardValue;
            const ptsPerCard = (val === 1 || val >= 10) ? 10 : val;
            return selection.length * ptsPerCard;
        }

        // Sinon, on teste la Suite (Scénarios As Bas=1 et As Haut=14)
        const scoreAs = (asValue) => {
            const getV = (c) => (c.cardValue === 1 || (c.cardValue === 14 && asValue === 1)) ? asValue : c.cardValue;

            // On trouve la première carte normale pour caler la suite
            const firstNormalIdx = selection.findIndex(c => !c.isJoker && c.suit !== 'joker');
            const startVal = getV(selection[firstNormalIdx]) - firstNormalIdx;

            let totalPoints = 0;
            for (let i = 0; i < selection.length; i++) {
                let logicalVal = startVal + i;
                if (logicalVal < 1 || logicalVal > 14) return 0; // Suite impossible

                // Si c'est une carte normale, elle doit correspondre à la valeur logique
                if (!selection[i].isJoker && selection[i].suit !== 'joker' && getV(selection[i]) !== logicalVal) return 0;

                // Règle 51 : Calcul des points
                if (logicalVal === 1) totalPoints += 1;
                else if (logicalVal === 14) totalPoints += 11; // L'As haut vaut 11 au 51
                else if (logicalVal >= 10) totalPoints += 10;
                else totalPoints += logicalVal;
            }
            return totalPoints;
        };

        return Math.max(scoreAs(1), scoreAs(14));
    }
    prepareOpenPayload() {
        console.log("Tentative d'ouverture avec les groupes :", this.pendingGroups);
        const groupsIds = this.pendingGroups.map(group => group.map(card => card.serverId));

        // Vérification : si un ID est undefined, l'ouverture échouera côté serveur
        if (groupsIds.flat().includes(undefined)) {
            console.error("ERREUR : Certaines cartes n'ont pas de serverId !");
        }

        return {
            action: "PLAYER_OPEN",
            groups: groupsIds,
            totalScoreClaimed: this.totalValidatedScore
        };
    }
    getTextureFromData(cardData) {
        if (cardData.isJoker || cardData.rank === 0) return 'red_joker.png';
        const suitMap = { 'S': 'spades', 'H': 'hearts', 'D': 'diamonds', 'C': 'clubs' };

        // Assure-toi que r correspond EXACTEMENT aux noms de fichiers dans ton atlas .json
        const r = cardData.rank;
        const s = suitMap[cardData.suit] || cardData.suit;

        return `${r}_of_${s}.png`;
    }

    mapSuit(serverSuit) {
        const suitMap = { 'S': 'spades', 'H': 'hearts', 'D': 'diamonds', 'C': 'clubs' };
        return suitMap[serverSuit] || serverSuit;
    }
} 
import Phaser from 'phaser';

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
    }

    preload() {
        this.load.atlas('cards', 'assets/cards.png', 'assets/cards.json');
        this.load.atlas('backs', 'assets/cards.back.png', 'assets/cards.back.json');
    }

    create() {
        this.cameras.main.setBackgroundColor('#2d5e32');
        this.initializeGameDeck();

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
        this.actionButton.add([this.btnBg, this.btnTxt]);
        this.btnBg.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.handleAction());

        this.cancelButton = this.add.text(950, 780, "ANNULER TOUT", { fontSize: '14px', fill: '#ff6666', fontStyle: 'bold' })
            .setOrigin(0.5).setInteractive({ useHandCursor: true }).setVisible(false).setDepth(2000);
        this.cancelButton.on('pointerdown', () => this.cancelPreparation());

        this.updateDeckVisual();
        for (let i = 0; i < 14; i++) { this.drawCard(true); }
        this.arrangeCards(true);
    }

    // --- LOGIQUE DE POSITIONNEMENT (Ta logique originale) ---
    drawFromDeck() {
        if (this.hasDrawn) return;
        // ... votre logique de pioche habituelle ...
        this.hasDrawn = true;
        this.updateScoreDisplay();
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

    reorderHandWithSelection() {
        const selected = this.hand.filter(c => c.isSelected);
        if (selected.length < 2) return;

        // 1. On sépare les cartes non sélectionnées et gelées
        const unselected = this.hand.filter(c => !c.isSelected && !c.isFrozen);
        const frozen = this.hand.filter(c => c.isFrozen);

        const jokers = selected.filter(c => c.suit === 'joker');
        const normals = selected.filter(c => c.suit !== 'joker');
        let sortedInternal = [];

        if (normals.length > 0) {
            // --- NOUVEAU : TRI SYSTÉMATIQUE PAR COULEUR ET VALEUR ---
            // On définit l'ordre des couleurs pour le tri visuel
            const suitOrder = { 'hearts': 0, 'diamonds': 1, 'clubs': 2, 'spades': 3 };

            // Fonction pour obtenir la valeur numérique (As = 1 ou 14 selon le contexte)
            const hasLow = normals.some(n => n.cardValue <= 3);
            const getVal = (c) => (c.cardName.includes('ace') && hasLow) ? 1 : (c.cardName.includes('ace') ? 14 : c.cardValue);

            // On trie d'abord par couleur, puis par valeur
            normals.sort((a, b) => {
                if (suitOrder[a.suit] !== suitOrder[b.suit]) {
                    return suitOrder[a.suit] - suitOrder[b.suit];
                }
                return getVal(a) - getVal(b);
            });

            const isSameSuit = normals.every(c => c.suit === normals[0].suit);

            if (isSameSuit && jokers.length > 0) {
                // LOGIQUE DE PLACEMENT INTELLIGENT DU JOKER DANS UNE SUITE
                const joker = jokers[0];
                const firstN = normals[0];
                const lastN = normals[normals.length - 1];

                const idxJ = this.hand.indexOf(joker);
                const idxFirstN = this.hand.indexOf(firstN);
                const idxLastN = this.hand.indexOf(lastN);

                if (idxJ < idxFirstN) {
                    // Le joueur a placé le joker à gauche (Joker-4-5)
                    sortedInternal = [joker, ...normals];
                } else if (idxJ > idxLastN) {
                    // Le joueur a placé le joker à droite (4-5-Joker)
                    sortedInternal = [...normals, joker];
                } else {
                    // Le joker est au milieu : remplissage automatique des trous (gap)
                    let curJ = [...jokers];
                    for (let i = 0; i < normals.length; i++) {
                        sortedInternal.push(normals[i]);
                        if (i < normals.length - 1 && curJ.length > 0) {
                            let gap = getVal(normals[i + 1]) - getVal(normals[i]) - 1;
                            if (gap >= 1) sortedInternal.push(curJ.shift());
                        }
                    }
                    sortedInternal = [...sortedInternal, ...curJ];
                }
            } else {
                // Si plusieurs couleurs ou pas de joker, on utilise juste le tri normals + jokers à la fin
                sortedInternal = [...normals, ...jokers];
            }
        } else {
            sortedInternal = selected;
        }

        // 2. REGROUPEMENT PHYSIQUE : On insère le bloc trié au milieu des cartes libres
        const mid = Math.floor(unselected.length / 2);
        this.hand = [
            ...frozen,
            ...unselected.slice(0, mid),
            ...sortedInternal,
            ...unselected.slice(mid)
        ];

        // 3. MISE À JOUR VISUELLE IMMÉDIATE
        this.arrangeCards();
    }
    reconcileSelection() {
        const selected = this.hand.filter(c => c.isSelected);
        if (selected.length >= 2) {
            const check = this.checkSelection();
            if (!check.isValid && this.oldHandState) { this.hand = [...this.oldHandState]; }
        }
        this.oldHandState = null;
        this.updateScoreDisplay();
        this.arrangeCards();
    }

    // --- VALIDATION (Inchangée) ---

    checkSelection() {
        const selected = this.hand.filter(c => c.isSelected);
        if (selected.length < 3) return { isValid: false };
        const normals = selected.filter(c => c.suit !== 'joker');
        const jokers = selected.filter(c => c.suit === 'joker');
        if (jokers.length > 1 || normals.length === 0) return { isValid: false };
        const firstVal = normals[0].cardValue;
        if (normals.every(c => c.cardValue === firstVal)) {
            const suits = new Set(normals.map(c => c.suit));
            if (suits.size === normals.length && selected.length <= 4) {
                let p = (firstVal >= 10) ? 10 : firstVal;
                return { isValid: true, type: "BRELAN", points: selected.length * p };
            }
        }
        return this.validateSequence(selected);
    }

    validateSequence(selection) {
        const normals = selection.filter(c => c.suit !== 'joker');
        if (normals.length === 0) return { isValid: false };

        const suit = normals[0].suit;
        if (!normals.every(c => c.suit === suit)) return { isValid: false };

        const hasLow = normals.some(c => c.cardValue <= 3);
        const getV = (c) => (c.cardName.includes('ace') && hasLow) ? 1 : (c.cardName.includes('ace') ? 14 : c.cardValue);

        // On identifie la première carte normale pour caler la suite
        let firstNormalIdx = selection.findIndex(c => c.suit !== 'joker');
        let startVal = getV(selection[firstNormalIdx]) - firstNormalIdx;

        let pts = 0;
        for (let i = 0; i < selection.length; i++) {
            let expectedV = startVal + i;
            // Validation de la carte normale à sa position
            if (selection[i].suit !== 'joker' && getV(selection[i]) !== expectedV) return { isValid: false };

            // Validation des limites (As-Roi)
            if (expectedV < 1 || expectedV > 14) return { isValid: false };

            pts += (expectedV === 1) ? 1 : (expectedV >= 10 ? 10 : expectedV);
        }

        return { isValid: true, type: "SUITE", points: pts };
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
        if (selected.length === 0 && this.pendingGroups.length > 0 && !this.hasDrawn) {
            alert("Vous devez piocher une carte avant de poser sur la table.");
            return;
        }
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
            let currentTotalTour = (this.openingScoreThisTurn || 0) + this.totalValidatedScore;
            let scoreCible = this.lastOpeningScore + 1;

            if (!this.isPlayerOpen) {
                console.log("Attempting to Open...");

                // Vérification si le total (déjà posé + en attente) bat le contrat
                if (currentTotalTour < scoreCible) {
                    console.warn(`❌ ÉCHEC OUVERTURE : ${currentTotalTour} n'est pas >= ${scoreCible}`);
                    alert(`Score insuffisant ! Il faut au moins ${scoreCible} points.`);
                    return;
                }

                // --- RÉUSSITE OUVERTURE ---
                this.openingScoreThisTurn = currentTotalTour;
                this.isPlayerOpen = true;
                this.mustOpenThisTour = false;

                // Ton animation de feedback
                this.tweens.add({
                    targets: this.scoreInfo,
                    scale: 1.3,
                    duration: 200,
                    yoyo: true,
                    ease: 'Quad.easeInOut'
                });

                console.log("🚀 OUVERTURE RÉUSSIE !");
                console.log(`Score actuel du tour : ${this.openingScoreThisTurn}`);
            } else {
                // Déjà ouvert, on accumule simplement les points supplémentaires posés dans le même tour
                this.openingScoreThisTurn = currentTotalTour;
                console.log(`➕ AJOUT À LA TABLE : Nouveau total tour : ${this.openingScoreThisTurn}`);
            }

            // Migration physique des cartes vers la table
            this.pendingGroups.forEach(group => {
                group.forEach(c => {
                    c.setTint(0xffffff);
                    c.isFrozen = true;
                });
                this.tableGroups.push(group);
            });

            // Nettoyage de la main et des compteurs temporaires
            this.hand = this.hand.filter(c => !c.isFrozen);
            this.pendingGroups = [];
            this.totalValidatedScore = 0;

            this.refreshTableVisuals();
            this.arrangeCards();
            this.updateScoreDisplay();
        }
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
        card.on('pointerdown', (p) => { card.downX = p.x; card.downY = p.y; });
        card.on('dragstart', () => { if (!card.isFrozen) this.oldHandState = [...this.hand]; });
        card.on('drag', (p) => {
            if (card.isFrozen) return;
            const oldIdx = this.hand.indexOf(card);
            const newIdx = Phaser.Math.Clamp(Math.floor(p.x / (1200 / this.hand.length)), 0, this.hand.length - 1);
            if (oldIdx !== newIdx && !this.hand[newIdx].isFrozen) {
                this.hand.splice(oldIdx, 1); this.hand.splice(newIdx, 0, card);
                this.arrangeCards();
            }
        });
        card.on('dragend', () => { if (!card.isFrozen && card.isSelected) this.reconcileSelection(); });
        card.on('pointerup', (p) => {
            if (card.isFrozen) return;
            if (Phaser.Math.Distance.Between(card.downX, card.downY, p.x, p.y) < 5) {
                card.isSelected = !card.isSelected;
                card.isSelected ? card.setTint(0xcccccc) : card.clearTint();
                if (card.isSelected) {
                    this.oldHandState = [...this.hand];
                    this.reorderHandWithSelection();
                    this.reconcileSelection();
                } else { this.updateScoreDisplay(); }
                this.arrangeCards();
            }
        });
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

    assignCardData(card, name) {
        card.cardName = name;
        if (name.includes('joker')) { card.cardValue = 0; card.suit = 'joker'; }
        else {
            const parts = name.replace('.png', '').split('_of_');
            const valStr = parts[0]; card.suit = parts[1];
            if (valStr === 'ace') card.cardValue = 14;
            else if (valStr === 'jack') card.cardValue = 11;
            else if (valStr === 'queen') card.cardValue = 12;
            else if (valStr === 'king') card.cardValue = 13;
            else card.cardValue = parseInt(valStr);
        }
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

    initializeGameDeck() {
        const suits = ['spades', 'hearts', 'diamonds', 'clubs'];
        const values = ['ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king'];
        suits.forEach(s => values.forEach(v => this.gameDeck.push({ face: `${v}_of_${s}.png` })));
        this.gameDeck.push({ face: 'red_joker.png' }, { face: 'black_joker.png' });
        Phaser.Utils.Array.Shuffle(this.gameDeck);
    }

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
} 
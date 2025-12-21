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
    }

    preload() {
        this.load.atlas('cards', 'assets/cards.png', 'assets/cards.json');
        this.load.atlas('backs', 'assets/cards.back.png', 'assets/cards.back.json');
    }

    create() {
        this.cameras.main.setBackgroundColor('#2d5e32');
        this.initializeGameDeck();

        this.scoreInfo = this.add.text(600, 420, `REQUIS: ${this.lastOpeningScore + 1} | ACTUEL: 0`, {
            fontSize: '22px', fill: '#ffffff', fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(100);

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

    reorderHandWithSelection() {
        const selected = this.hand.filter(c => c.isSelected);
        if (selected.length < 2) return;
        const unselected = this.hand.filter(c => !c.isSelected && !c.isFrozen);
        const frozen = this.hand.filter(c => c.isFrozen);
        const jokers = selected.filter(c => c.suit === 'joker');
        const normals = selected.filter(c => c.suit !== 'joker');
        let sortedInternal = [];

        if (normals.length > 0) {
            const isSameSuit = normals.every(c => c.suit === normals[0].suit);
            const isSameValue = normals.every(c => c.cardValue === normals[0].cardValue);
            if (isSameSuit) {
                const hasLow = normals.some(n => n.cardValue <= 3);
                const getVal = (c) => (c.cardName.includes('ace') && hasLow) ? 1 : (c.cardName.includes('ace') ? 14 : c.cardValue);
                normals.sort((a, b) => getVal(a) - getVal(b));
                let curJ = [...jokers];
                for (let i = 0; i < normals.length; i++) {
                    sortedInternal.push(normals[i]);
                    if (i < normals.length - 1 && curJ.length > 0) {
                        let gap = getVal(normals[i + 1]) - getVal(normals[i]) - 1;
                        if (gap === 1) sortedInternal.push(curJ.shift());
                    }
                }
                sortedInternal = [...sortedInternal, ...curJ];
            } else if (isSameValue) { sortedInternal = [...normals, ...jokers]; }
            else { sortedInternal = selected; }
        } else { sortedInternal = selected; }

        const mid = Math.floor(unselected.length / 2);
        this.hand = [...frozen, ...unselected.slice(0, mid), ...sortedInternal, ...unselected.slice(mid)];
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
        const getV = (c) => (c.cardName.includes('ace') && hasLow) ? 1 : c.cardValue;
        let sorted = [...selection].sort((a, b) => (a.suit === 'joker' || b.suit === 'joker') ? 0 : getV(a) - getV(b));
        let firstN = sorted.find(c => c.suit !== 'joker');
        let startVal = getV(firstN) - sorted.indexOf(firstN);
        let pts = 0;
        for (let i = 0; i < sorted.length; i++) {
            let v = startVal + i;
            if (sorted[i].suit !== 'joker' && getV(sorted[i]) !== v) return { isValid: false };
            if (v < 1 || v > 14) return { isValid: false };
            pts += (v === 1) ? 1 : (v >= 10 ? 10 : v);
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
        let next = getV(normals[i+1]);
        let gap = next - current - 1;

        if (gap === 0) {
            finalSequence.push(normals[i+1]);
        } else if (gap > 0 && gap <= jokerCount) {
            // On comble le trou (gap) avec les Jokers disponibles
            for (let j = 0; j < gap; j++) {
                finalSequence.push(jokers.shift());
                jokerCount--;
            }
            finalSequence.push(normals[i+1]);
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
    
    // 1. JETER LA CARTE
    if (selected.length === 1 && this.hasDrawn) {
        const card = selected[0];
        this.hand = this.hand.filter(c => c !== card);
        this.discardCard(card);
        this.hasDrawn = false;
        this.updateScoreDisplay();
        this.arrangeCards();
        return;
    }

    // 2. VALIDER (Mise en attente à gauche)
    if (selected.length >= 3) {
        const res = this.checkSelection();
        if (res.isValid) {
            // Peu importe si on est déjà ouvert ou non, 
            // on "grise" et on met à gauche pour laisser le choix au joueur
            selected.forEach(c => {
                c.isFrozen = true;
                c.isSelected = false;
                c.setTint(0x888888); // On les grise
                c.disableInteractive();
            });

            this.pendingGroups.push([...selected]);
            this.totalValidatedScore += res.points;

            // Déplacement visuel à GAUCHE
            this.hand = this.hand.filter(c => !selected.includes(c));
            this.hand.unshift(...selected);

            this.updateScoreDisplay();
            this.arrangeCards();
        }
    } 
    // 3. POSER SUR LA TABLE (Action volontaire)
    else if (selected.length === 0 && this.pendingGroups.length > 0) {
        
        // Si le joueur n'est pas encore ouvert, on vérifie le score (51+)
        if (!this.isPlayerOpen && this.totalValidatedScore <= this.lastOpeningScore) {
            console.log("Score insuffisant pour ouvrir !");
            return;
        }

        // Si on arrive ici, c'est que soit il est déjà ouvert, 
        // soit il a assez de points pour ouvrir maintenant.
        this.isPlayerOpen = true; 

        // On envoie tous les groupes en attente sur la table
        this.pendingGroups.forEach(g => {
            g.forEach(c => {
                c.setTint(0xffffff); // On enlève le gris
                // On s'assure qu'ils reçoivent les clics pour le vol de joker/ajout
            });
            this.tableGroups.push(g);
        });

        // On nettoie la main des cartes posées
        this.hand = this.hand.filter(c => !c.isFrozen);
        this.pendingGroups = [];
        this.totalValidatedScore = 0;

        this.refreshTableVisuals();
        this.arrangeCards();
        this.updateScoreDisplay();
        console.log("Combinaisons posées sur la table !");
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
        if (this.gameDeck.length === 0) return;
        const cardData = this.gameDeck.pop();
        const card = this.add.image(400, 250, 'backs', 'Back Blue 1.png').setScale(0.22);
        card.faceName = cardData.face; card.isFrozen = false; card.isSelected = false;
        this.assignCardData(card, card.faceName); this.setupCardEvents(card);
        this.hand.push(card);
        if (immediate) { card.setTexture('cards', card.faceName); }
        else {
            this.tweens.add({
                targets: card, x: 600, y: 700, duration: 500,
                onComplete: () => { card.setTexture('cards', card.faceName); this.hasDrawn = true; this.arrangeCards(); this.updateScoreDisplay(); }
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
        const deck = this.add.image(400, 250, 'backs', 'Back Blue 1.png').setScale(0.22).setInteractive({ useHandCursor: true });
        deck.on('pointerdown', () => { if (!this.hasDrawn) this.drawCard(); });
    }

    initializeGameDeck() {
        const suits = ['spades', 'hearts', 'diamonds', 'clubs'];
        const values = ['ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king'];
        suits.forEach(s => values.forEach(v => this.gameDeck.push({ face: `${v}_of_${s}.png` })));
        this.gameDeck.push({ face: 'red_joker.png' }, { face: 'black_joker.png' });
        Phaser.Utils.Array.Shuffle(this.gameDeck);
    }

    discardCard(card) { this.tweens.add({ targets: card, x: 850, y: 250, scale: 0.18, duration: 300 }); }

    cancelPreparation() {
        this.pendingGroups.forEach(g => g.forEach(c => { c.isFrozen = false; c.clearTint(); c.setInteractive(); }));
        this.pendingGroups = []; this.totalValidatedScore = 0;
        this.updateScoreDisplay(); this.arrangeCards();
    }

    updateScoreDisplay() {
    const selected = this.hand.filter(c => c.isSelected);
    
    // Visibilité du bouton "ANNULER TOUT" (Seulement s'il y a des groupes grisés en attente)
    this.cancelButton.setVisible(this.pendingGroups.length > 0);
    
    // Par défaut, le bouton d'action est visible, on va décider de son contenu
    this.actionButton.setVisible(true);

    if (selected.length === 0) {
        // --- CAS : RIEN N'EST SÉLECTIONNÉ ---
        if (this.pendingGroups.length > 0) {
            if (this.isPlayerOpen) {
                // Le joueur est déjà descendu, il peut poser ses nouveaux groupes
                this.btnTxt.setText("POSER SUR LA TABLE");
            } else if (this.totalValidatedScore > this.lastOpeningScore) {
                // Le joueur n'est pas descendu mais a enfin atteint les 51+ points
                this.btnTxt.setText(`OUVRIR LE JEU (${this.totalValidatedScore} pts)`);
            } else {
                // Pas assez de points pour ouvrir et pas encore ouvert
                this.actionButton.setVisible(false);
            }
        } else {
            // Rien en attente, rien de sélectionné -> On cache le bouton
            this.actionButton.setVisible(false);
        }
    } 
    else if (selected.length === 1) {
        // --- CAS : UNE SEULE CARTE SÉLECTIONNÉE ---
        if (this.hasDrawn) {
            this.btnTxt.setText("JETER LA CARTE");
        } else {
            // On ne peut pas jeter sans avoir pioché
            this.btnTxt.setText("PIOCHEZ D'ABORD");
        }
    } 
    else {
        // --- CAS : PLUSIEURS CARTES SÉLECTIONNÉES ---
        const res = this.checkSelection();
        if (res.isValid) {
            this.btnTxt.setText(`VALIDER (${res.points} pts)`);
        } else {
            this.btnTxt.setText("INVALIDE");
        }
    }

    // Mise à jour du texte d'information (Score requis)
    if (this.isPlayerOpen) {
        this.scoreInfo.setText("JEU OUVERT : VOUS POUVEZ POSTER");
        this.scoreInfo.setFill('#00ff00'); // Vert
    } else {
        const pointsManquants = Math.max(0, (this.lastOpeningScore + 1) - this.totalValidatedScore);
        this.scoreInfo.setText(`REQUIS: ${this.lastOpeningScore + 1} | ACTUEL: ${this.totalValidatedScore}`);
        
        if (this.totalValidatedScore > this.lastOpeningScore) {
            this.scoreInfo.setFill('#00ff00'); // Vert si prêt à ouvrir
        } else {
            this.scoreInfo.setFill('#ffffff'); // Blanc sinon
        }
    }
}
}
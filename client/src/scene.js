import Phaser from 'phaser';

export class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
        this.hand = [];
        this.gameDeck = [];
        this.tableGroups = [];   
        this.pendingGroups = []; 
        this.hasDrawn = false;
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

    // --- REGROUPEMENT INTELLIGENT OPTIMISÉ POUR SUITES HAUTES ---

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
                // Détection intelligente : si on a un 10, J, Q ou K, l'As doit aller à la fin (14)
                // Si on a un 2 ou un 3, l'As va au début (1)
                const hasHigh = normals.some(n => n.cardValue >= 10 && n.cardValue <= 13);
                const hasLow = normals.some(n => n.cardValue >= 2 && n.cardValue <= 5);
                
                const getVal = (c) => {
                    if (c.cardName.includes('ace')) {
                        if (hasHigh && !hasLow) return 14; // Suite haute : As = 14
                        return 1; // Par défaut ou suite basse : As = 1
                    }
                    return c.cardValue;
                };

                normals.sort((a, b) => getVal(a) - getVal(b));
                
                let curJ = [...jokers];
                for (let i = 0; i < normals.length; i++) {
                    sortedInternal.push(normals[i]);
                    if (i < normals.length - 1) {
                        let gap = getVal(normals[i+1]) - getVal(normals[i]) - 1;
                        while (gap > 0 && curJ.length > 0) {
                            sortedInternal.push(curJ.shift());
                            gap--;
                        }
                    }
                }
                sortedInternal = [...sortedInternal, ...curJ];
            } else if (isSameValue) {
                sortedInternal = [...normals, ...jokers];
            } else {
                sortedInternal = selected;
            }
        } else {
            sortedInternal = selected;
        }

        const mid = Math.floor(unselected.length / 2);
        this.hand = [...frozen, ...unselected.slice(0, mid), ...sortedInternal, ...unselected.slice(mid)];
    }

    // --- LOGIQUE DE VALIDATION ---

    checkSelection() {
        const selected = this.hand.filter(c => c.isSelected);
        if (selected.length < 3) return { isValid: false };

        const normals = selected.filter(c => c.suit !== 'joker');
        const jokers = selected.filter(c => c.suit === 'joker');

        if (jokers.length > 1) return { isValid: false };
        if (normals.length === 0) return { isValid: false };

        const firstVal = normals[0].cardValue;
        if (normals.every(c => c.cardValue === firstVal)) {
            const suits = new Set(normals.map(c => c.suit));
            if (suits.size === normals.length && selected.length <= 4) {
                let p = (firstVal >= 10 || firstVal === 14) ? 10 : firstVal;
                return { isValid: true, type: "BRELAN", points: selected.length * p };
            }
        }
        return this.validateSequence(selected);
    }

    validateSequence(selection) {
        const normals = selection.filter(c => c.suit !== 'joker');
        const jokers = selection.filter(c => c.suit === 'joker');

        const suit = normals[0].suit;
        if (!normals.every(c => c.suit === suit)) return { isValid: false };

        const hasLowCards = normals.some(c => c.cardValue <= 3);
        const getV = (c) => (c.cardName.includes('ace') && hasLowCards) ? 1 : c.cardValue;

        const sortedNormals = [...normals].sort((a, b) => getV(a) - getV(b));

        let gapTotal = 0;
        for (let i = 0; i < sortedNormals.length - 1; i++) {
            let diff = getV(sortedNormals[i+1]) - getV(sortedNormals[i]);
            if (diff <= 0) return { isValid: false }; 
            gapTotal += (diff - 1);
        }

        if (gapTotal > jokers.length) return { isValid: false };

        const totalLen = selection.length;
        let firstNormalInSelection = selection.find(c => c.suit !== 'joker');
        let startIndex = selection.indexOf(firstNormalInSelection);
        let startVal = getV(firstNormalInSelection) - startIndex;

        if (startVal < 1 || (startVal + totalLen - 1) > 14) return { isValid: false };

        let pts = 0;
        for (let i = 0; i < totalLen; i++) {
            let v = startVal + i;
            pts += (v >= 10 || v === 1) ? 10 : v;
        }

        return { isValid: true, type: "SUITE", points: pts };
    }

    // --- MOTEUR ET UTILS ---

    assignCardData(card, name) {
        card.cardName = name;
        if (name.includes('joker')) {
            card.cardValue = 0; card.suit = 'joker';
        } else {
            const parts = name.replace('.png', '').split('_of_');
            const valStr = parts[0]; card.suit = parts[1];
            if (valStr === 'ace') card.cardValue = 14; 
            else if (valStr === 'jack') card.cardValue = 11;
            else if (valStr === 'queen') card.cardValue = 12;
            else if (valStr === 'king') card.cardValue = 13;
            else card.cardValue = parseInt(valStr);
        }
    }

    setupCardEvents(card) {
        card.setInteractive({ draggable: true });
        card.on('pointerdown', (p) => { card.downX = p.x; card.downY = p.y; });
        card.on('pointerup', (p) => {
            if (card.isFrozen) return;
            if (Phaser.Math.Distance.Between(card.downX, card.downY, p.x, p.y) < 5) {
                card.isSelected = !card.isSelected;
                card.isSelected ? card.setTint(0xcccccc) : card.clearTint();
                if (card.isSelected) this.reorderHandWithSelection();
                this.updateScoreDisplay();
                this.arrangeCards();
            }
        });
        card.on('drag', (p) => {
            if (card.isFrozen) return;
            const oldIdx = this.hand.indexOf(card);
            const newIdx = Phaser.Math.Clamp(Math.floor(p.x / (1200 / this.hand.length)), 0, this.hand.length-1);
            if (oldIdx !== newIdx && !this.hand[newIdx].isFrozen) {
                this.hand.splice(oldIdx, 1);
                this.hand.splice(newIdx, 0, card);
                this.arrangeCards();
            }
        });
    }

    handleAction() {
        const selected = this.hand.filter(c => c.isSelected);
        if (selected.length === 1 && this.hasDrawn) {
            const card = selected[0];
            this.hand = this.hand.filter(c => c !== card);
            this.discardCard(card);
            this.hasDrawn = false;
            this.updateScoreDisplay();
            this.arrangeCards();
            return;
        }
        if (selected.length >= 3) {
            const res = this.checkSelection();
            if (res.isValid) {
                const sel = this.hand.filter(c => c.isSelected);
                this.pendingGroups.push([...sel]);
                sel.forEach(c => {
                    c.isFrozen = true; c.isSelected = false;
                    c.setTint(0x888888); c.disableInteractive();
                });
                this.totalValidatedScore += res.points;
                this.hand.sort((a, b) => (a.isFrozen === b.isFrozen) ? 0 : a.isFrozen ? -1 : 1);
                this.updateScoreDisplay();
                this.arrangeCards();
            }
            return;
        }
        if (selected.length === 0 && this.totalValidatedScore > this.lastOpeningScore) {
            this.pendingGroups.forEach(g => this.tableGroups.push(g));
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
                this.tweens.add({
                    targets: card, x: 150 + (gIdx * 230) + (cIdx * 30), y: 180,
                    scale: 0.18, rotation: 0, duration: 600
                });
                card.setDepth(100 + cIdx); card.setTint(0xffffff);
            });
        });
    }

    arrangeCards(immediate = false) {
        const centerX = 600, centerY = 1250, radius = 720;
        const angleStep = Math.min(0.07, (Math.PI/2.4) / this.hand.length);
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
        card.faceName = cardData.face;
        card.isFrozen = false;
        this.assignCardData(card, card.faceName);
        this.setupCardEvents(card);
        this.hand.push(card);
        if (immediate) { card.setTexture('cards', card.faceName); }
        else {
            this.tweens.add({
                targets: card, x: 600, y: 700, duration: 500,
                onComplete: () => { card.setTexture('cards', card.faceName); this.hasDrawn = true; this.arrangeCards(); }
            });
        }
    }

    updateScoreDisplay() {
        const selected = this.hand.filter(c => c.isSelected);
        this.cancelButton.setVisible(this.pendingGroups.length > 0);
        this.actionButton.setVisible(true);
        if (selected.length === 0) {
            if (this.totalValidatedScore > this.lastOpeningScore) { this.btnTxt.setText("POSER SUR LA TABLE"); }
            else { this.actionButton.setVisible(false); }
        } else if (selected.length === 1) {
            this.btnTxt.setText(this.hasDrawn ? "JETER LA CARTE" : "PIOCHEZ D'ABORD");
        } else {
            const res = this.checkSelection();
            this.btnTxt.setText(res.isValid ? `VALIDER (${res.points} pts)` : "INVALIDE");
        }
        this.scoreInfo.setText(`REQUIS: ${this.lastOpeningScore + 1} | ACTUEL: ${this.totalValidatedScore}`);
        this.scoreInfo.setFill(this.totalValidatedScore > this.lastOpeningScore ? '#00ff00' : '#ffffff');
    }

    initializeGameDeck() {
        const suits = ['spades', 'hearts', 'diamonds', 'clubs'];
        const values = ['ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king'];
        suits.forEach(s => values.forEach(v => this.gameDeck.push({face: `${v}_of_${s}.png`})));
        this.gameDeck.push({face: 'red_joker.png'}, {face: 'black_joker.png'});
        Phaser.Utils.Array.Shuffle(this.gameDeck);
    }

    updateDeckVisual() {
        const deck = this.add.image(400, 250, 'backs', 'Back Blue 1.png').setScale(0.22).setInteractive();
        deck.on('pointerdown', () => { if (!this.hasDrawn) this.drawCard(); });
    }

    discardCard(card) {
        this.tweens.add({ targets: card, x: 850, y: 250, scale: 0.18, duration: 300 });
    }

    cancelPreparation() {
        this.pendingGroups.forEach(g => g.forEach(c => { c.isFrozen = false; c.clearTint(); c.setInteractive(); }));
        this.pendingGroups = []; this.totalValidatedScore = 0;
        this.updateScoreDisplay(); this.arrangeCards();
    }
}
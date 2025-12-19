import Phaser from 'phaser';

export class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
        this.hand = []; 
        this.isAnyCardDragging = false;
    }

    preload() {
        this.load.atlas('cards', 'assets/cards.png', 'assets/cards.json');
    }

    create() {
        this.cameras.main.setBackgroundColor('#2d5e32');

        // Zone de défausse (Rectangle central)
        this.discardZone = this.add.rectangle(600, 300, 150, 210, 0x000000, 0.2);
        this.discardZone.setStrokeStyle(2, 0xffffff, 0.3);
        this.add.text(540, 180, "DÉFAUSSE", { fontSize: '16px', fill: '#ffffff', alpha: 0.5 });

        // Génération d'une main de 14 cartes
        const cardNames = [
            'ace_of_spades.png', '2_of_spades.png', '3_of_spades.png', 
            '4_of_spades.png', '5_of_spades.png', '6_of_spades.png',
            '7_of_spades.png', '8_of_spades.png', '9_of_spades.png',
            '10_of_spades.png', 'jack_of_spades.png', 'queen_of_spades.png',
            'king_of_spades.png', 'red_joker.png'
        ];

        cardNames.forEach((name) => {
            const card = this.add.image(0, 0, 'cards', name);
            card.setScale(0.25);
            card.setInteractive({ draggable: true });
            this.setupCardEvents(card);
            this.hand.push(card);
        });

        this.arrangeCards(true); // Placement initial immédiat
    }

    arrangeCards(immediate = false) {
        const centerX = 600;
        const centerY = 1100;
        const radius = 550;
        
        // Éventail dynamique : l'angle total s'adapte au nombre de cartes
        const maxAngle = Math.PI / 3; // 60 degrés max
        const angleStep = Math.min(0.08, maxAngle / (this.hand.length));
        const totalAngle = angleStep * (this.hand.length - 1);
        const startAngle = -totalAngle / 2;

        this.hand.forEach((card, i) => {
            if (card.isDragging) return; // On ne touche pas à la carte tenue

            const angle = startAngle + (i * angleStep);
            const x = centerX + Math.sin(angle) * radius;
            const y = centerY - Math.cos(angle) * radius;

            card.setDepth(i);

            if (immediate) {
                card.setPosition(x, y);
                card.setRotation(angle);
            } else {
                // GLISSEMENT FLUIDE : animation très courte pour la réactivité
                this.tweens.add({
                    targets: card,
                    x: x,
                    y: y,
                    rotation: angle,
                    duration: 150, 
                    ease: 'Cubic.easeOut'
                });
            }
        });
    }

    setupCardEvents(card) {
        // HOVER : Uniquement si on ne drag pas
        card.on('pointerover', () => {
            if (!this.isAnyCardDragging) {
                this.tweens.add({ targets: card, y: card.y - 30, duration: 100 });
                card.setDepth(100);
            }
        });

        card.on('pointerout', () => {
            if (!this.isAnyCardDragging) this.arrangeCards();
        });

        // DRAG
        card.on('dragstart', () => {
            this.isAnyCardDragging = true;
            card.isDragging = true;
            card.setRotation(0);
            card.setScale(0.3); // La carte tenue est mise en avant
            card.setDepth(1000);
        });

        card.on('drag', (pointer, dragX, dragY) => {
            card.x = dragX;
            card.y = dragY;

            // LOGIQUE DE SWAP (Échange de place)
            // On calcule l'index théorique selon la position X de la souris
            let newIndex = this.calculateNewIndex(card.x);
            const oldIndex = this.hand.indexOf(card);

            if (newIndex !== oldIndex) {
                // Déplacement dans le tableau
                this.hand.splice(oldIndex, 1);
                this.hand.splice(newIndex, 0, card);
                this.arrangeCards(); // Les autres cartes glissent pour laisser la place
            }
        });

        card.on('dragend', () => {
            this.isAnyCardDragging = false;
            card.isDragging = false;
            card.setScale(0.25);

            const dist = Phaser.Math.Distance.Between(card.x, card.y, this.discardZone.x, this.discardZone.y);

            if (dist < 120) {
                this.hand = this.hand.filter(c => c !== card);
                this.discardCard(card);
            }
            
            this.arrangeCards(); // Remet tout en ordre (resert l'éventail si jetée)
        });
    }

    // Calcule où la carte devrait être dans le tableau selon sa position X
    calculateNewIndex(currentX) {
        // On simplifie : plus X est petit, plus l'index est bas
        // On compare avec les positions X des autres cartes
        let targetIndex = 0;
        for (let i = 0; i < this.hand.length; i++) {
            if (currentX > this.hand[i].x) {
                targetIndex = i;
            }
        }
        return targetIndex;
    }

    discardCard(card) {
        card.disableInteractive();
        this.tweens.add({
            targets: card,
            x: this.discardZone.x + Phaser.Math.Between(-10, 10),
            y: this.discardZone.y + Phaser.Math.Between(-10, 10),
            rotation: Phaser.Math.FloatBetween(-0.3, 0.3),
            duration: 300,
            ease: 'Back.easeIn',
            onComplete: () => card.setDepth(1)
        });
    }
}
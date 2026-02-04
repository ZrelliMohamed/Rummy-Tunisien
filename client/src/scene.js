import Phaser from 'phaser';
import { socketService } from './services/SocketService.js';
export class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
        this.playerContainers = {};
        this.drawCardsGroup = null;
        this.hasSelectedCard = false;
        this.slots = {};
        this.jokerPosText = null;
        this.cutPhase = 'waiting';
        this.stackSprites = [];
        this.currentThickness = 20;
        this.lastTargetIndex = -1;
    }
    init(data) {
        this.user = data.user;
        this.players = data.players;
    }
    preload() {
        this.load.atlas('cards', 'assets/cards.png', 'assets/cards.json');
        this.load.atlas('cards_back', 'assets/backs.png', 'assets/backs.json');
        this.load.image('blue_side', 'assets/menu/BLUE-SIDE.png');
        this.load.image('red_side', 'assets/menu/RED-SIDE.png');
    }
    create() {
        const { width, height } = this.scale;
        this.createTable(width, height);
        this.setupPlayerSlots();
        this.renderPlayers();
        this.setupUI();
        this.setupSocketListeners();
        socketService.getSocket().emit('player_joined_game_scene');
    }
    setupUI() {
        this.statusText = this.add.text(this.scale.width / 2, 50, "EN ATTENTE DES JOUEURS...", {
            fontSize: '22px', fill: '#ffffff', backgroundColor: '#00000055', padding: 10
        }).setOrigin(0.5).setDepth(1000);
    }
    createTable(width, height) {
        this.add.graphics()
            .fillGradientStyle(0x076324, 0x076324, 0x054d1c, 0x054d1c, 1)
            .fillRect(0, 0, width, height);
    }
    setupPlayerSlots() {
        const { width, height } = this.scale;
        this.slots = {
            bottom: { x: width / 2, y: height - 100 },
            left: { x: 150, y: height / 2 },
            top: { x: width / 2, y: 100 },
            right: { x: width - 150, y: height / 2 }
        };
    }
    renderPlayers() {
        const myId = (this.user.id || this.user._id)?.toString();
        const sortedPlayers = [...this.players];
        let attempts = 0;
        while (attempts < sortedPlayers.length) {
            if ((sortedPlayers[0].id || sortedPlayers[0]._id).toString() === myId) break;
            sortedPlayers.push(sortedPlayers.shift());
            attempts++;
        }
        const posKeys = ['bottom', 'left', 'top', 'right'];
        sortedPlayers.forEach((player, i) => {
            const slot = this.slots[posKeys[i]];
            const container = this.add.container(slot.x, slot.y);
            const circle = this.add.graphics().fillStyle(0x222222, 0.8).fillCircle(0, 0, 45).lineStyle(2, 0xffffff).strokeCircle(0, 0, 45);
            const name = this.add.text(0, 60, (player.username || "Joueur").toUpperCase(), { fontSize: '16px', fill: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
            container.add([circle, name]);
            this.playerContainers[(player.id || player._id).toString()] = container;
        });
    }
    // --- ANNOTATIONS DE RÔLE ---
    markRole(userId, label, color) {
        const container = this.playerContainers[userId];
        if (!container) return;
        const badge = this.add.text(0, -65, label, {
            fontSize: '12px', fontStyle: 'bold', fill: '#000', backgroundColor: color, padding: { x: 8, y: 4 }
        }).setOrigin(0.5);
        container.add(badge);
    }
    setupSocketListeners() {
        const socket = socketService.getSocket();
        socket.on('start_draw_phase', (data) => {
            this.statusText.setText("TIREZ UNE CARTE POUR LE DISTRIBUTEUR");
            this.displayRibbonDeck(data.deck);
        });
        socket.on('extraction_completed', () => {
            console.log("Extraction terminée, exécution du merge visuel");
            // On force l'exécution du merge pour marquer les cartes 'inSideDeck'
            this.executeMerge();
        });
        socket.on('joker_position_fixed_no_anim', () => {
            console.log("Joker fixé sans animation (Règle désactivée)");
            // Ici on peut simplement mettre à jour le texte status
            this.statusText.setText("LE JOKER RESTE À SA PLACE.");
        });
        socket.on('player_picked_card', (data) => this.animateCardToPlayer(data.userId, data.cardIndex));
        socket.on('reveal_draw_results', (data) => {
            this.gameRules = data.rules;
            this.revealAllCards(data.results, data.dealerId);
            this.markRole(data.dealerId, "DISTRIBUTEUR", "#f1c40f");
            this.markRole(data.cutterId, "COUPEUR", "#e67e22");
            this.time.delayedCall(3000, () => this.initCutPhase(data));
        });
        socket.on('hand_moved', (data) => {
            if (!this.isCutter) {
                this.currentThickness = data.thickness;
                this.updateCutVisuals(data.y);
            }
        });
        socket.on('joker_repositioned', (data) => {
            if (!this.isCutter) {
                this.syncJokerPosition(data.newIndex);
            }
        });
        // --- Dans setupSocketListeners() ---

        socket.on('joker_finalized_animation', () => {
            console.log("Le placement est validé, on range le joker localement.");
            this.animateJokerInsertion();
        });
        socket.on('animate_burned_cards', (data) => {
            const totalToBurn = data.cardIndices.length;
            data.cardIndices.forEach((idx, i) => {
                const card = this.stackSprites.find(s => s.getData('cardData').index === idx);
                if (card) {
                    const cardData = card.getData('cardData');
                    // --- CALCUL DE LA POSITION CIBLE ---
                    // On centre le groupe de cartes brûlées
                    const spacing = 70; // Espace entre les cartes
                    const startX = card.x + 150; // Décalage de base vers la droite
                    const offsetX = (i - (totalToBurn - 1) / 2) * spacing;
                    this.tweens.add({
                        targets: card,
                        x: startX + offsetX, // Côte à côte
                        y: card.y - 120,     // Un peu plus haut
                        angle: 0,
                        duration: 800,
                        delay: i * 200,
                        ease: 'Power2.easeOut',
                        onStart: () => card.setDepth(2000),
                        onComplete: () => {
                            // --- ANIMATION DE RÉVÉLATION (FLIP) ---
                            this.tweens.add({
                                targets: card,
                                scaleX: 0,
                                duration: 150,
                                onComplete: () => {
                                    card.setTexture('cards', cardData.frontFrame); // RÉDUIRE LA TAILLE ICI
                                    const targetScale = 0.2;
                                    this.tweens.add({
                                        targets: card,
                                        scaleX: targetScale,
                                        scaleY: targetScale,
                                        duration: 150,
                                        onComplete: () => {
                                            // Disparition en fondu après lecture
                                            this.time.delayedCall(1500, () => {
                                                this.tweens.add({ targets: card, alpha: 0, duration: 300 });
                                            });
                                        }
                                    });
                                }
                            });
                        }
                    });
                }
            });
        });
    }
    animateJokerInsertion() {
    const jokerSprite = this.stackSprites.find(s => s.getData('cardData').suit === 'joker');
    if (!jokerSprite) return;

    // On réaligne le Joker avec le paquet de gauche (x: -120)
    this.tweens.add({
        targets: jokerSprite,
        x: -120, 
        duration: 500,
        ease: 'Power2.Out',
        onComplete: () => {
            // Optionnel : Une fois rangé, on s'assure qu'il ne dépasse plus
            // et on peut changer le texte de statut
            this.statusText.setText("JOKER PLACÉ.");
        }
    });
}
    initCutPhase(data) {
        if (this.drawCardsGroup) this.drawCardsGroup.clear(true, true);

        const { width, height } = this.scale;

        const myId = (this.user.id || this.user._id).toString();

        this.isCutter = myId === data.cutterId;



        this.cutPhase = 'selecting'; // Activer la sélection

        this.statusText.setText(this.isCutter ? "COUPER LE PAQUET (SOURIS + MOLETTE)" : "LE COUPEUR PRÉPARE LE JEU...");



        this.deckContainer = this.add.container(width / 2, height / 2);

        this.stackSprites = [];

        const offsetStep = 1.2;

        this.totalH = data.fullDeck.length * offsetStep;



        data.fullDeck.forEach((card, i) => {

            const texture = card.backFrame.includes('Red') ? 'red_side' : 'blue_side';

            const posY = (this.totalH / 2) - (i * offsetStep);

            const sprite = this.add.image(0, posY, texture).setScale(0.5).setDepth(i)

                .setData('originalY', posY).setData('cardData', card);

            this.deckContainer.add(sprite);

            this.stackSprites.push(sprite);

        });



        if (this.isCutter) {

            this.setupCutterControls();

            this.createConfirmButton();

        }

    }



    setupCutterControls() {

        // 1. Molette pour l'épaisseur (Inchangé)

        this.input.on('wheel', (p, obj, dx, dy) => {

            if (this.cutPhase !== 'selecting') return;

            this.currentThickness = Phaser.Math.Clamp(this.currentThickness + (dy > 0 ? -2 : 2), 4, this.totalH - 10);

            this.updateCutVisuals(this.lastY || 0);

            socketService.getSocket().emit('sync_cut_selection', { y: this.lastY || 0, thickness: this.currentThickness });

        });



        // 2. Mouvement de la souris

        // --- DANS setupCutterControls ---
        this.input.on('pointermove', (pointer) => {
            const ly = pointer.y - (this.scale.height / 2);
            this.lastY = ly;

            if (this.cutPhase === 'selecting' && pointer.isDown) {
                this.updateCutVisuals(ly);
                socketService.getSocket().emit('sync_cut_selection', { y: ly, thickness: this.currentThickness });
            }

            // --- PHASE 2 : DÉPLACEMENT DU JOKER ---
            else if (this.cutPhase === 'joker' && pointer.isDown && this.activeJoker) {
                // BLOQUAGE SI RÈGLE FALSE
                if (this.gameRules?.canMoveJoker === false) return;

                const remaining = this.stackSprites.filter(s => s.getData('inSideDeck'));
                const totalCards = remaining.length;
                const deckTop = -(this.totalH / 2);
                const deckBottom = (this.totalH / 2);

                let percentage = Phaser.Math.Percent(ly, deckTop, deckBottom);
                let targetIndex = Math.floor((1 - percentage) * (totalCards - 1));
                targetIndex = Phaser.Math.Clamp(targetIndex, 0, totalCards - 1);

                if (this.lastTargetIndex !== targetIndex) {
                    this.lastTargetIndex = targetIndex;
                    const displayPosition = totalCards - targetIndex;
                    this.updateJokerCounter(displayPosition, totalCards);

                    // Synchronisation avec le serveur
                    socketService.getSocket().emit('move_joker_in_deck', { newIndex: targetIndex });
                    this.syncJokerPosition(targetIndex);
                }
            }
        });

    }





    updateJokerCounter(current, total) {

        if (!this.jokerPosText) {

            this.jokerPosText = this.add.text(this.scale.width / 2, this.scale.height / 2 + 150, "", {

                fontSize: '24px', fill: '#f1c40f', fontStyle: 'bold', backgroundColor: '#00000088', padding: 10

            }).setOrigin(0.5);

        }

        this.jokerPosText.setText(`POSITION DU JOKER : ${current} / ${total}`);

    }



    update(time, delta) {



    }



    updateCutVisuals(y) {

        const top = y - (this.currentThickness / 2);

        const bottom = y + (this.currentThickness / 2);

        this.stackSprites.forEach(s => {

            const sy = s.getData('originalY');

            s.x = (sy >= top && sy <= bottom) ? 45 : 0;

        });

    }



    syncJokerPosition(newIndex) {

        const remaining = this.stackSprites.filter(s => s.getData('inSideDeck'));

        const joker = remaining.find(s => s.getData('cardData').suit === 'joker');

        if (!joker) return;



        Phaser.Utils.Array.MoveTo(remaining, joker, newIndex);



        const step = 1.2;

        const totalH = remaining.length * step;



        // Position Y dynamique

        joker.y = -(totalH / 2) + (newIndex * step);

        joker.x = -160;



        if (newIndex === 0) {

            // --- PHASE PRIORITAIRE ---

            joker.setDepth(1000);

            this.deckContainer.bringToTop(joker);

        } else {

            // --- PHASE DE RÉINSERTION ---

            // On lui redonne son index comme Depth.

            // Ainsi, il repasse derrière les cartes qui ont un index (Depth) plus grand.

            joker.setDepth(-1);

            // On le déplace physiquement au début de la liste du container (index 0 du container)

            this.deckContainer.sendToBack(joker);

        }



        console.log("Position:", newIndex, "Depth actuel:", joker.depth);

    }

    executeMerge() {

        this.stackSprites.sort((a, b) => a.getData('cardData').index - b.getData('cardData').index);

        // On identifie les cartes décalées (selected) et les autres (remaining)

        const selected = this.stackSprites.filter(s => s.x >= 40);

        const remaining = this.stackSprites.filter(s => s.x === 0);



        // CRUCIAL : Tout le monde doit marquer ces cartes pour les retrouver plus tard

        remaining.forEach(s => s.setData('inSideDeck', true));



        // Animation de séparation des deux paquets

        selected.forEach(s => this.tweens.add({ targets: s, x: 180, duration: 500 }));



        const offsetStep = 1.2;

        const totalH = remaining.length * offsetStep;

        remaining.forEach((s, i) => {

            this.tweens.add({

                targets: s,

                x: -120,

                y: (totalH / 2) - (i * offsetStep),

                duration: 500

            });

        });



        // --- DANS executeMerge ---

        this.time.delayedCall(600, () => {
            this.activeJoker = remaining.find(s => s.getData('cardData').suit === 'joker');

            if (this.activeJoker) {
                if (this.gameRules?.canMoveJoker !== false) {
                    // Le Joker sort pour montrer qu'on peut le bouger
                    this.activeJoker.x = -150;
                    this.statusText.setText(this.isCutter ? "GLISSEZ LE JOKER POUR LE PLACER" : "LE COUPEUR PLACE LE JOKER...");
                } else {
                    // Le Joker reste aligné dans le paquet (x: -120)
                    this.activeJoker.x = -120;
                    this.statusText.setText("LE JOKER RESTE À SA PLACE.");

                    // Si c'est le coupeur, on déclenche la validation auto après un court délai
                    if (this.isCutter) {
                        this.time.delayedCall(1000, () => {
                            this.handleValidation();
                        });
                    }
                }
            }
        });

    }



    createConfirmButton() {

        this.confirmBtn = this.add.text(this.scale.width / 2 + 300, this.scale.height / 2, 'VALIDER COUPE', {

            backgroundColor: '#2ecc71', padding: 12, fontSize: '20px', fontStyle: 'bold'

        }).setOrigin(0.5).setInteractive({ useHandCursor: true })

            .on('pointerdown', () => this.handleValidation());

    }

    setupBurningInteraction() {

        // On récupère les cartes du paquet de droite (x === 180)

        // On les trie par Depth pour prendre celles du dessus en premier

        const activeDeck = this.stackSprites

            .filter(s => s.x === 180)

            .sort((a, b) => b.depth - a.depth);



        // On rend les 3 cartes du dessus interactives

        for (let i = 0; i < 3; i++) {

            const card = activeDeck[i];

            if (!card) break;



            card.setInteractive({ useHandCursor: true });

            card.on('pointerdown', () => {

                if (card.getData('isBurned')) return; // Déjà brûlée



                this.burnedCardsCount++;

                card.setData('isBurned', true);



                // Animation visuelle : la carte se décale et change de couleur

                this.tweens.add({

                    targets: card,

                    y: card.y - 30,

                    tint: 0xff4444, // Teinte rouge

                    duration: 250,

                    ease: 'Back.easeOut'

                });



                this.confirmBtn.setText(`CONFIRMER BRÛLAGE (${this.burnedCardsCount})`);



                // On informe les autres joueurs pour qu'ils voient la carte monter

                socketService.getSocket().emit('card_burned_sync', {

                    cardIndex: card.getData('cardData').index

                });

            });

        }

    }
    createBurnButtons() {
        this.burnButtonsGroup = this.add.container(this.scale.width / 2, this.scale.height / 2 + 150);

        // On ajoute 0 à la liste des boutons
        const counts = [0, 1, 2, 3];

        counts.forEach((num, i) => {
            // Calcul pour centrer 4 boutons (espacement de 90px)
            const xPos = (i - 1.5) * 90;

            const isSkip = num === 0;
            const btnText = isSkip ? "SKIP" : `${num}`;
            const btnColor = isSkip ? '#7f8c8d' : '#e74c3c'; // Gris pour Skip, Rouge pour les chiffres

            const btn = this.add.text(xPos, 0, btnText, {
                fontSize: isSkip ? '22px' : '32px',
                backgroundColor: btnColor,
                padding: { x: 20, y: 10 },
                fontStyle: 'bold',
                fill: '#ffffff'
            })
                .setOrigin(0.5)
                .setInteractive({ useHandCursor: true })
                .on('pointerdown', () => {
                    if (isSkip) {
                        this.executeSkipBurn();
                    } else {
                        this.executeBurnAction(num);
                    }
                });

            this.burnButtonsGroup.add(btn);
        });
    }
    executeSkipBurn() {
        if (this.burnButtonsGroup) this.burnButtonsGroup.destroy();
        this.burnedCardsCount = 0;

        this.statusText.setText("AUCUNE CARTE BRÛLÉE. PRÉPARATION...");

        // On envoie directement 0 au serveur
        socketService.getSocket().emit('finalize_burn', { count: 0 });
    }
    executeBurnAction(count) {
        if (this.burnButtonsGroup) this.burnButtonsGroup.destroy();
        this.burnedCardsCount = count;

        const activeDeck = this.stackSprites
            .filter(s => s.x === 180)
            .sort((a, b) => b.depth - a.depth);

        const cardIndices = activeDeck.slice(0, count).map(s => s.getData('cardData').index);

        socketService.getSocket().emit('trigger_burn_animation', { cardIndices });

        this.time.delayedCall(1500, () => {
            socketService.getSocket().emit('finalize_burn', { count: this.burnedCardsCount });
        });
    }



    handleValidation() {
        // --- PHASE 1 : FIN DE L'EXTRACTION (COUPE) ---
        if (this.cutPhase === 'selecting') {
            const startPercent = (this.lastY - (this.currentThickness / 2) + (this.totalH / 2)) / this.totalH;
            const endPercent = (this.lastY + (this.currentThickness / 2) + (this.totalH / 2)) / this.totalH;

            socketService.getSocket().emit('finalize_extraction', {
                startPercent: Phaser.Math.Clamp(startPercent, 0, 1),
                endPercent: Phaser.Math.Clamp(endPercent, 0, 1)
            });

            this.cutPhase = 'joker';

            // GESTION DE LA RÈGLE : DÉPLACEMENT JOKER
            if (this.gameRules?.canMoveJoker === false) {
                console.log("Règle : canMoveJoker est désactivé. Passage automatique...");

                // On cache le bouton pour éviter un double clic manuel pendant l'auto-skip
                if (this.confirmBtn) this.confirmBtn.setVisible(false);

                // Délai pour laisser l'animation de merge se finir proprement (executeMerge)
                this.time.delayedCall(1200, () => {
                    this.handleValidation(); // Rappel automatique pour passer à la phase Joker -> Burn
                });
                return;
            }

            // Si le déplacement est autorisé, on prépare le bouton pour l'étape suivante
            if (this.confirmBtn) {
                this.confirmBtn.setText('CONFIRMER POSITION JOKER');
                this.confirmBtn.setVisible(true);
            }
        }

        // --- PHASE 2 : FIN DU PLACEMENT DU JOKER ---
        else if (this.cutPhase === 'joker') {
            this.cutPhase = 'burning_selection';
            socketService.getSocket().emit('finalize_joker_position');
            // 3. Nettoyage
            if (this.confirmBtn) this.confirmBtn.destroy();
            this.confirmBtn = null;
            if (this.jokerPosText) {
                this.jokerPosText.destroy();
                this.jokerPosText = null;
            }
            // GESTION DE LA RÈGLE : BRÛLAGE (canCut)
            if (this.gameRules?.canCut === false) {
                this.statusText.setText("BRÛLAGE DÉSACTIVÉ. PRÉPARATION DE LA DONNE...");

                if (this.isCutter) {
                    // On informe le serveur qu'on passe directement à la suite avec 0 cartes brûlées
                    this.time.delayedCall(1000, () => {
                        socketService.getSocket().emit('finalize_burn', { count: 0 });
                    });
                }
                return;
            }

            // Si le brûlage est autorisé, on affiche les options
            this.statusText.setText(this.isCutter ?
                "COMBIEN DE CARTES VOULEZ-VOUS BRÛLER ?" :
                "LE COUPEUR DÉCIDE S'IL VEUT BRÛLER DES CARTES...");

            if (this.isCutter) {
                // Un petit délai avant d'afficher les boutons de brûlage pour la fluidité
                this.time.delayedCall(500, () => {
                    this.createBurnButtons();
                });
            }
        }
    }



    // --- DRAW HELPERS ---

    displayRibbonDeck(deckData) {

        const { width, height } = this.scale;

        this.drawCardsGroup = this.add.group();

        const overlap = (width - 600) / (deckData.length - 1);

        deckData.forEach((c, i) => {

            const card = this.add.image(300 + (i * overlap), height / 2, 'cards_back', c.backFrame)

                .setDisplaySize(60, 90).setInteractive({ useHandCursor: true }).setDepth(i);

            card.setData('index', c.index).on('pointerdown', () => {

                if (this.hasSelectedCard) return;

                this.hasSelectedCard = true;

                socketService.getSocket().emit('pick_draw_card', { cardIndex: c.index });

            });

            this.drawCardsGroup.add(card);

        });

    }



    animateCardToPlayer(userId, idx) {

        const card = this.drawCardsGroup?.getChildren().find(c => c.getData('index') === idx);

        const target = this.playerContainers[userId];

        if (card && target) {

            card.disableInteractive();

            this.tweens.add({ targets: card, x: target.x, y: target.y, duration: 600, onUpdate: () => card.setDisplaySize(40, 60) });

        }

    }



    revealAllCards(results, dealerId) {

        results.forEach((res, i) => {

            const img = this.drawCardsGroup?.getChildren().find(c => c.getData('index') === res.card.index);

            if (img) {

                this.tweens.add({

                    targets: img, scaleX: 0, duration: 200, delay: i * 100,

                    onComplete: () => {

                        img.setTexture('cards', res.card.frontFrame).setDisplaySize(45, 65);

                        this.tweens.add({ targets: img, scaleX: img.scaleX, duration: 200 });

                    }

                });

            }

        });

    }

}
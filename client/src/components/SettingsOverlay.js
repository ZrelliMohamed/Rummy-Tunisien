import { socketService } from '../services/SocketService.js'
export class SettingsOverlay {
    constructor(scene, initialSettings) {
        this.scene = scene;
        this.currentStep = 1;
        this.totalSteps = 4;

        this.configData = {
            gameMode: 'standard',
            teamMode: '1v1v1v1',
            rules: {
                downScore: 51,
                targetScore: 501,
                jokerPenalty: true,
                canCut: true,
                canMoveJoker: true
            },
            seating: {}
        };

        this.createOverlay();
        // Initialisation de toutes les étapes
        this.initStep1();
        this.initStep2();
        this.initStep3();
        this.initStep4();
    }

    // Dans le constructeur ou la méthode de création de l'overlay
   createCloseButton() {
        const closeBtn = this.scene.add.text(370, -270, "✖", { 
            fontSize: '28px', fill: '#ff4444', fontStyle: 'bold', backgroundColor: '#1a1a1a', padding: { x: 8, y: 4 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        closeBtn.on('pointerdown', () => this.cancelConfiguration());
        this.container.add(closeBtn);
    }

   cancelConfiguration() {
   console.log("1. [HOST] Clic sur ✖ - Envoi de 'cancel_configuration' au serveur");
    const socket = socketService.getSocket();
    if (socket) {
        socket.emit('cancel_configuration');
    }
    
    this.destroy();
}
    initStep4() {
        const container = this.stepsContainers[4];
        this.selectedPlayer = null; // Pour stocker le premier clic

        // 1. RÉCUPÉRER ET MÉLANGER LES JOUEURS
        const players = this.scene.cards
            .map(c => c.playerData)
            .filter(p => p && (p.id || p._id));

        // Mélange aléatoire initial (Algorithme Fisher-Yates)
        const shuffledPlayers = [...players].sort(() => Math.random() - 0.5);

        // 2. PLACEMENT INITIAL SUR LES SLOTS
        this.playerSlots = [
            { id: 'N', x: 0, y: -140, player: shuffledPlayers[0] },
            { id: 'S', x: 0, y: 140, player: shuffledPlayers[1] },
            { id: 'E', x: 180, y: 0, player: shuffledPlayers[2] },
            { id: 'W', x: -180, y: 0, player: shuffledPlayers[3] }
        ];

        // 3. DESSINER LA TABLE ET LES JOUEURS
        this.renderSeating(container);
    }

    renderSeating(container) {
        // 1. Nettoyer le container
        container.removeAll(true);

        // 2. Le Tapis de jeu
        const table = this.scene.add.circle(0, 0, 100, 0x076324).setStrokeStyle(3, 0xffffff, 0.5);
        container.add(table);

        // 3. AJOUT DE LA FLÈCHE DE SENS (Sens anti-horaire ou horaire selon ta règle)
        // On dessine un arc de cercle avec une pointe de flèche
        const arrowGraphics = this.scene.add.graphics();
        arrowGraphics.lineStyle(4, 0xffffff, 0.6);

        // Dessiner l'arc
        arrowGraphics.beginPath();
        // Arc de 0 à 270 degrés pour laisser une ouverture
        arrowGraphics.arc(0, 0, 40, Phaser.Math.DegToRad(0), Phaser.Math.DegToRad(280), false);
        arrowGraphics.strokePath();

        // Dessiner la pointe de la flèche
        const x = Math.cos(Phaser.Math.DegToRad(280)) * 40;
        const y = Math.sin(Phaser.Math.DegToRad(280)) * 40;

        arrowGraphics.fillStyle(0xffffff, 0.8);
        arrowGraphics.fillTriangle(
            x, y - 10,
            x, y + 10,
            x - 15, y
        );

        container.add(arrowGraphics);

        // Animation de rotation de la flèche pour montrer le "mouvement"
        this.scene.tweens.add({
            targets: arrowGraphics,
            angle: -360, // -360 pour sens anti-horaire, 360 pour horaire
            duration: 8000,
            repeat: -1
        });

        // 4. Texte explicatif au centre
        const directionText = this.scene.add.text(0, 0, "SENS DU JEU", {
            fontSize: '10px', fill: '#ffffff', alpha: 0.6
        }).setOrigin(0.5);
        container.add(directionText);

        // 5. Affichage des slots joueurs (Ton code précédent)
        this.playerSlots.forEach(slot => {
            if (!slot.player) return;

            const pContainer = this.scene.add.container(slot.x, slot.y);
            const isSelected = (this.selectedPlayer === slot);

            const bg = this.scene.add.graphics();
            bg.fillStyle(isSelected ? 0xffcc00 : 0x00ffcc, 1);
            bg.fillRoundedRect(-60, -20, 120, 40, 8);
            if (isSelected) {
                bg.lineStyle(2, 0xffffff, 1).strokeRoundedRect(-60, -20, 120, 40, 8);
            }

            const name = this.scene.add.text(0, 0, slot.player.username.toUpperCase(), {
                fontSize: '12px', fill: '#000', fontStyle: 'bold'
            }).setOrigin(0.5);

            // Afficher la position (N, S, E, W) pour aider
            const posLabel = this.scene.add.text(0, -30, slot.id, { fontSize: '10px', fill: '#aaa' }).setOrigin(0.5);

            pContainer.add([bg, name, posLabel]);
            container.add(pContainer);

            bg.setInteractive(new Phaser.Geom.Rectangle(-60, -20, 120, 40), Phaser.Geom.Rectangle.Contains);
            bg.on('pointerdown', () => this.handlePlayerClick(slot, container));
        });
    }

    handlePlayerClick(clickedSlot, container) {
        if (!this.selectedPlayer) {
            // Premier clic : on sélectionne
            this.selectedPlayer = clickedSlot;
            this.renderSeating(container); // Redessine pour montrer la sélection
        } else {
            if (this.selectedPlayer !== clickedSlot) {
                // Deuxième clic : on échange !
                const tempPlayer = clickedSlot.player;
                clickedSlot.player = this.selectedPlayer.player;
                this.selectedPlayer.player = tempPlayer;

                // On réinitialise la sélection
                this.selectedPlayer = null;
                this.renderSeating(container);

                // Feedback sonore ou visuel optionnel ici
                console.log("🔄 Positions échangées !");
            } else {
                // Clic sur le même : on désélectionne
                this.selectedPlayer = null;
                this.renderSeating(container);
            }
        }
    }

    initStep3() {
    const container = this.stepsContainers[3];
    const centerY = -120; 

    // --- 1. PÉNALITÉ JOKER EN MAIN ---
    this.createOptionRow(
        container, centerY,
        "PÉNALITÉ JOKER EN MAIN",
        "OUI", "NON",
        (val) => { this.configData.rules.jokerPenalty = (val === 0); }
    );

    // --- 2. PRIVILÈGE DE COUPE ---
    // On retire toute logique de dépendance ici
    this.createOptionRow(
        container, centerY + 120,
        "AUTORISER LA COUPE DU PAQUET",
        "OUI", "NON",
        (val) => { this.configData.rules.canCut = (val === 0); }
    );

    // --- 3. DÉPLACEMENT DU JOKER ---
    // On n'utilise plus de container séparé jokerMoveContainer pour l'opacité
    this.createOptionRow(
        container, centerY + 240,
        "DÉPLACEMENT DU JOKER LORS DE LA COUPE",
        "AUTORISÉ", "INTERDIT",
        (val) => { this.configData.rules.canMoveJoker = (val === 0); }
    );
}

    // Fonction utilitaire pour créer une ligne complète (Titre + 2 boutons)
    createOptionRow(container, y, title, label1, label2, onSelect) {
        const txt = this.scene.add.text(0, y - 40, title, {
            fontSize: '18px', fill: '#ffffff', fontStyle: 'bold'
        }).setOrigin(0.5);
        container.add(txt);

        // On réutilise createTogglePair qu'on a codé à l'étape 1
        this.createTogglePair(container, y + 20, label1, label2, onSelect);
    }

   
    initStep2() {
        const container = this.stepsContainers[2];
        const centerY = -80;

        // --- 1. SCORE DE DESCENTE (MELD) ---
        const meldTitle = this.scene.add.text(0, centerY - 70, "SCORE DE DESCENTE (MELD)", {
            fontSize: '20px', fill: '#00ffcc', fontStyle: 'bold'
        }).setOrigin(0.5);
        container.add(meldTitle);

        // Réutilisation de notre fonction Toggle pour 51 / 71
        this.meldButtons = this.createTogglePair(
            container,
            centerY - 10,
            "51 POINTS", "71 POINTS",
            (val) => {
                this.configData.rules.downScore = val === 0 ? 51 : 71;
                console.log("Descente réglée sur :", this.configData.rules.downScore);
            }
        );

        // --- 2. SCORE FINAL DE LA MANCHE ---
        const targetTitle = this.scene.add.text(0, centerY + 80, "SCORE CIBLE POUR GAGNER LA MANCHE", {
            fontSize: '18px', fill: '#ffffff'
        }).setOrigin(0.5);
        container.add(targetTitle);

        // Création de la liste de boutons pour les scores (501 à 1001)
        this.createScoreGrid(container, centerY + 160);
    }

    createScoreGrid(container, y) {
        const scores = [501, 601, 701, 801, 901, 1001];
        const btnWidth = 110;
        const btnHeight = 45;
        const spacingX = 130;
        const spacingY = 60;
        const buttons = [];

        scores.forEach((score, index) => {
            // Calcul de la position en grille (2 lignes de 3 boutons)
            const col = index % 3;
            const row = Math.floor(index / 3);
            const x = (col - 1) * spacingX;
            const currentY = y + (row * spacingY);

            const btn = this.scene.add.container(x, currentY);
            const bg = this.scene.add.graphics();
            const txt = this.scene.add.text(0, 0, score.toString(), {
                fontSize: '18px', fontStyle: 'bold'
            }).setOrigin(0.5);

            btn.add([bg, txt]);
            container.add(btn);

            const updateStyle = (isSelected) => {
                bg.clear();
                if (isSelected) {
                    bg.fillStyle(0x00ffcc, 1);
                    txt.setFill('#000000');
                } else {
                    bg.lineStyle(2, 0x00ffcc, 1);
                    bg.fillStyle(0x000000, 0.5);
                    txt.setFill('#00ffcc');
                }
                bg.fillRoundedRect(-55, -22, 110, 44, 8);
                bg.strokeRoundedRect(-55, -22, 110, 44, 8);
            };

            bg.setInteractive(new Phaser.Geom.Rectangle(-55, -22, 110, 44), Phaser.Geom.Rectangle.Contains)
                .on('pointerdown', () => {
                    buttons.forEach(b => b.update(false)); // Désélectionne tout
                    updateStyle(true); // Sélectionne celui-ci
                    this.configData.rules.targetScore = score;
                    console.log("Score cible :", score);
                });

            btn.update = updateStyle;
            buttons.push(btn);

            // Sélection par défaut (501)
            updateStyle(index === 0);
        });
    }
    initStep1() {
        const container = this.stepsContainers[1];
        const centerY = -50;

        // --- TITRE DE LA SECTION ---
        const sectionTitle = this.scene.add.text(0, centerY - 100, "1. CHOISISSEZ LE MODE DE JEU", {
            fontSize: '22px', fill: '#00ffcc', fontStyle: 'bold'
        }).setOrigin(0.5);
        container.add(sectionTitle);

        // --- SÉLECTION DU TYPE DE MATCH (Standard vs Rapide) ---
        this.matchButtons = this.createTogglePair(
            container,
            centerY - 20,
            "MODE STANDARD", "MODE RAPIDE",
            (val) => {
                this.configData.gameMode = val === 0 ? 'standard' : 'fast';
                console.log("Mode choisi:", this.configData.gameMode);
            }
        );

        // --- SÉLECTION DU FORMAT (1v1v1v1 vs 2v2) ---
        const formatTitle = this.scene.add.text(0, centerY + 60, "2. FORMAT DE LA TABLE", {
            fontSize: '18px', fill: '#ffffff'
        }).setOrigin(0.5);
        container.add(formatTitle);

        this.formatButtons = this.createTogglePair(
            container,
            centerY + 120,
            "1 V 1 V 1 V 1", "2 V 2",
            (val) => {
                this.configData.teamMode = val === 0 ? '1v1v1v1' : '2v2';
                console.log("Format choisi:", this.configData.teamMode);
            }
        );
    }

    // Fonction utilitaire pour créer des boutons de type "Toggle" (Sélection unique)
    createTogglePair(container, y, label1, label2, onSelect) {
        const buttons = [];
        const widths = 250;
        const spacing = 140;

        [label1, label2].forEach((label, index) => {
            const x = index === 0 ? -spacing : spacing;
            const btn = this.scene.add.container(x, y);

            const bg = this.scene.add.graphics();
            const txt = this.scene.add.text(0, 0, label, { fontSize: '16px', fontStyle: 'bold' }).setOrigin(0.5);

            btn.add([bg, txt]);
            container.add(btn);

            const updateStyle = (isSelected) => {
                bg.clear();
                if (isSelected) {
                    bg.fillStyle(0x00ffcc, 1);
                    txt.setFill('#000000');
                } else {
                    bg.lineStyle(2, 0x00ffcc, 1);
                    bg.fillStyle(0x000000, 0.5);
                    txt.setFill('#00ffcc');
                }
                bg.fillRoundedRect(-110, -25, 220, 50, 10);
                bg.strokeRoundedRect(-110, -25, 220, 50, 10);
            };

            bg.setInteractive(new Phaser.Geom.Rectangle(-110, -25, 220, 50), Phaser.Geom.Rectangle.Contains)
                .on('pointerdown', () => {
                    buttons.forEach((b, i) => b.update(i === index));
                    onSelect(index);
                });

            btn.update = updateStyle;
            buttons.push(btn);

            // Sélection par défaut (index 0)
            updateStyle(index === 0);
        });

        return buttons;
    }

   createOverlay() {
        const { width, height } = this.scene.scale;
        this.background = this.scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.8).setInteractive();
        this.container = this.scene.add.container(width / 2, height / 2);

        const panel = this.scene.add.graphics();
        panel.fillStyle(0x1a1a1a, 1);
        panel.lineStyle(3, 0x00ffcc, 1);
        panel.fillRoundedRect(-400, -300, 800, 600, 20);
        panel.strokeRoundedRect(-400, -300, 800, 600, 20);
        this.container.add(panel);

        this.titleText = this.scene.add.text(0, -260, "CONFIGURATION", { fontSize: '28px', fontStyle: 'bold', fill: '#00ffcc' }).setOrigin(0.5);
        this.stepIndicator = this.scene.add.text(0, -220, `Étape 1 / 4`, { fontSize: '18px', fill: '#ffffff' }).setOrigin(0.5);
        this.container.add([this.titleText, this.stepIndicator]);

        this.stepsContainers = [];
        for (let i = 1; i <= this.totalSteps; i++) {
            const stepCont = this.scene.add.container(0, 0);
            stepCont.setVisible(i === 1);
            this.container.add(stepCont);
            this.stepsContainers[i] = stepCont;
        }

        this.createNavigationButtons();
        this.createCloseButton(); // <-- Appelé ici
    }

    createNavigationButtons() {
        // Bouton Précédent
        this.prevBtn = this.createBtn(-150, 250, "PRÉCÉDENT", () => this.prevStep());
        this.prevBtn.setVisible(false); // Caché à l'étape 1

        // Bouton Suivant
        this.nextBtn = this.createBtn(150, 250, "SUIVANT", () => this.nextStep());

        this.container.add([this.prevBtn, this.nextBtn]);
    }

    // Gestion du changement d'étape
   // --- LOG ET ENVOI FINAL ---
nextStep() {
    if (this.currentStep < this.totalSteps) {
        this.goToStep(this.currentStep + 1);
    } else {
        const finalSeating = {};
        this.playerSlots.forEach(slot => {
            if (slot.player) finalSeating[slot.id] = slot.player.id || slot.player._id;
        });
        this.configData.seating = finalSeating;

        console.log("🚀 OBJET FINAL ENVOYÉ AU SERVEUR :", this.configData);
        
        // --- LA CORRECTION EST ICI ---
        // On récupère le socket via le service pour être sûr qu'il existe
        const socket = socketService.getSocket(); 
        if (socket) {
            socket.emit('confirm_game_start', this.configData);
        } else {
            console.error("❌ Socket introuvable !");
        }
        
        this.destroy();
    }
}

    prevStep() {
        if (this.currentStep > 1) {
            this.goToStep(this.currentStep - 1);
        }
    }

    goToStep(stepNumber) {
        this.stepsContainers[this.currentStep].setVisible(false);
        this.currentStep = stepNumber;
        this.stepsContainers[this.currentStep].setVisible(true);
        this.stepIndicator.setText(`Étape ${this.currentStep} / ${this.totalSteps}`);
        this.prevBtn.setVisible(this.currentStep > 1);
        this.nextBtn.list[1].setText(this.currentStep === this.totalSteps ? "LANCER !" : "SUIVANT");
    }

    // Fonction utilitaire pour créer des boutons rapidement
    createBtn(x, y, label, callback) {
        const btn = this.scene.add.container(x, y);
        const bg = this.scene.add.graphics();
        bg.fillStyle(0x00ffcc, 0.2).fillRoundedRect(-80, -20, 160, 40, 8);
        bg.lineStyle(2, 0x00ffcc, 1).strokeRoundedRect(-80, -20, 160, 40, 8);
        const txt = this.scene.add.text(0, 0, label, { fontSize: '16px', fill: '#ffffff' }).setOrigin(0.5);
        btn.add([bg, txt]);
        bg.setInteractive(new Phaser.Geom.Rectangle(-80, -20, 160, 40), Phaser.Geom.Rectangle.Contains)
          .on('pointerdown', callback);
        return btn;
    }

    destroy() {
        this.background.destroy();
        this.container.destroy();
    }
}
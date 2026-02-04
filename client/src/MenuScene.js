import { LobbyCard } from './components/LobbyCard.js';
import { SocialPanel } from './components/SocialPanel.js';
import { socketService } from './services/SocketService.js';
import { SettingsOverlay } from './components/SettingsOverlay.js';

export class MenuScene extends Phaser.Scene {
    constructor() {
        super('MenuScene');
        this.leaveBtn = null;
        this.actionBtn = null;
        this.configBtn = null;
        this.currentHostId = null;
        this.canStartGame = false;
    }

    init(data) {
        const defaultUser = {
            username: "Joueur",
            avatar: null,
            level: 1,
            tokens: 0,
            stats: { rank: 'Débutant', gamesPlayed: 0, wins: 0 },
            selectedCardSkin: 'Back Blue 1.png'
        };

        if (data && data.user) {
            this.user = {
                ...defaultUser,
                ...data.user,
                stats: { ...defaultUser.stats, ...(data.user.stats || {}) }
            };
        } else {
            this.user = defaultUser;
        }
    }

    preload() {
        this.load.image('bg_menu', 'assets/menu/background_dark.jpg');
        this.load.atlas('cards_back', 'assets/cards.back.png', 'assets/cards.back.json');
        this.load.atlas('cards_faces', 'assets/cards.png', 'assets/cards.json');

        if (this.user.avatar && this.user.avatar.startsWith('http')) {
            this.load.image('user_avatar', this.user.avatar);
        }
    }

    create() {
        const { width, height } = this.scale;

        // 1. Fond d'écran
        this.add.image(width / 2, height / 2, 'bg_menu')
            .setDisplaySize(width, height)
            .setAlpha(0.25);

        // 2. Création de l'interface
        this.createTopBar(width);
        this.createLobby(width, height);
        this.createActionButtons(width, height);

        // 3. Initialisation du Panneau Social
        this.socialPanel = new SocialPanel(this);

        const userId = this.user.id || this.user._id;
        if (userId) {
            const socket = socketService.connect(userId);

            if (socket) {
                // DEBUG GLOBAL
                socket.onAny((eventName, ...args) => {
                    console.log(`📡 [SOCKET DEBUG] Reçu: ${eventName}`, args);
                });

                socket.on('configuration_cancelled', () => {
                    console.log("4bis. [CLIENT] Reçu 'configuration_cancelled' spécifique");

                    // 1. Fermer l'overlay si c'est le host (sécurité)
                    if (this.settingsOverlay) {
                        this.settingsOverlay.destroy();
                        this.settingsOverlay = null;
                    }

                    // 2. Supprimer le texte de clignotement chez les invités
                    if (this.waitingText) {
                        this.waitingText.destroy();
                        this.waitingText = null;
                    }

                    // 3. Le serveur va généralement envoyer un 'update_lobby' juste après,
                    // mais on s'assure que l'UI est propre ici.
                });
                // --- NOTIFICATIONS ---
                socket.on('new_friend_request', (data) => {
                    this.socialPanel.addInvitation({ ...data, type: 'FRIEND_REQUEST' });
                    this.triggerNotificationAlert();
                });

                socket.on('receive_game_invitation', (data) => {
                    this.socialPanel.addInvitation({ ...data, type: 'GAME_INVITE' });
                    this.triggerNotificationAlert();
                });

                // --- MISE À JOUR DU LOBBY (Joueurs, Prêt, Boutons) ---
                socket.on('update_lobby', (data) => {
                    const players = data.players;
                    const hostId = data.hostId;
                    const myId = (this.user.id || this.user._id).toString();

                    // ON MISE À JOUR LE STATUT ICI
                    this.lobbyStatus = data.status || 'waiting';

                    if (this.lobbyStatus === 'waiting' && this.waitingText) {
                        this.waitingText.destroy();
                        this.waitingText = null;
                    }

                    if (!players) return;

                    this.currentHostId = hostId;
                    this.canStartGame = data.canStart;

                    this.cards.forEach(card => card.updateData(null));

                    const me = players.find(p => p.id.toString() === myId);
                    if (me) {
                        me.isHost = (me.id.toString() === hostId?.toString());
                        this.cards[1].updateData(me);

                        const others = players.filter(p => p.id.toString() !== myId);
                        const slots = [0, 2, 3];
                        others.forEach((player, index) => {
                            if (slots[index] !== undefined) {
                                player.isHost = (player.id.toString() === hostId?.toString());
                                this.cards[slots[index]].updateData(player);
                            }
                        });
                    }

                    const isHost = (myId === hostId?.toString());
                    const isReady = me ? me.isReady : false;

                    // L'UI va maintenant utiliser this.lobbyStatus pour décider de la visibilité
                    this.updateActionBtnUI(isHost, isReady, data.canStart);
                });

                // --- GESTION DE LA PHASE DE CONFIGURATION (Overlay) ---
                socket.on('lobby_status_changed', (data) => {
                    console.log("4. [CLIENT] Reçu 'lobby_status_changed':", data.status);

                    // MISE À JOUR DU STATUT
                    this.lobbyStatus = data.status;
                    const myId = (this.user.id || this.user._id).toString();
                    const isHost = (this.currentHostId?.toString() === myId);

                    if (data.status === 'configuring') {
                        if (isHost) {
                            if (this.settingsOverlay) this.settingsOverlay.destroy();
                            this.settingsOverlay = new SettingsOverlay(this, data.settings);

                            this.events.once('start_final_game', (finalSettings) => {
                                socket.emit('confirm_game_start', finalSettings);
                            });
                        } else {
                            this.showWaitingMessage();
                        }
                    } else if (data.status === 'waiting') {
                        console.log("5. [CLIENT] Nettoyage de l'interface");
                        if (this.waitingText) {
                            this.waitingText.destroy();
                            this.waitingText = null;
                        }
                        if (this.settingsOverlay) {
                            this.settingsOverlay.destroy();
                            this.settingsOverlay = null;
                        }
                    }

                    // ON FORCE LA MISE À JOUR DES BOUTONS (pour les masquer ou les réafficher)
                    // On récupère l'état ready actuel via la carte du joueur (index 1)
                    const myPlayerData = this.cards[1].playerData;
                    this.updateActionBtnUI(isHost, myPlayerData?.isReady || false, this.canStartGame);
                });

                // --- LANCEMENT OFFICIEL DE LA PARTIE ---
                // --- LANCEMENT OFFICIEL DE LA PARTIE ---
                // --- LANCEMENT OFFICIEL DE LA PARTIE ---
                socket.on('game_started', (gameData) => { // <--- L'argument s'appelle gameData
                    console.log("🚀 [TRANSITION] Signal reçu, basculement vers GameScene");

                    // Nettoyage des éléments du menu
                    if (this.settingsOverlay) this.settingsOverlay.destroy();
                    if (this.waitingText) this.waitingText.destroy();

                    this.cards.forEach(card => {
                        if (card.drawTimer) card.drawTimer.destroy();
                    });

                    // Utilisation de gameData (au lieu de data)
                    this.scene.start('GameScene', {
                        user: this.user,           // On passe l'utilisateur local
                        settings: gameData.settings, // Données reçues du serveur
                        players: gameData.players,   // Liste des joueurs
                        seating: gameData.seating    // Positions à table
                    });
                });

                // --- DISSOLUTION ---
                socket.on('lobby_dissolved', () => {
                    this.cards.forEach((card, index) => {
                        if (index !== 1) card.updateData(null);
                    });
                    socket.emit('leave_lobby');
                    this.currentHostId = this.user.id || this.user._id;
                });

                socket.on('error_msg', (msg) => {
                    console.error("Erreur serveur :", msg);
                });
            }
        }

        // --- NETTOYAGE ---
        this.events.on('shutdown', () => {
            const socket = socketService.getSocket();
            if (socket) {
                socket.off('new_friend_request');
                socket.off('receive_game_invitation');
                socket.off('update_lobby');
                socket.off('lobby_status_changed');
                socket.off('game_started');
                socket.off('lobby_dissolved');
                socket.off('error_msg');
                socket.off('configuration_cancelled');
            }
        });
    }

    createTopBar(width) {
        const barHeight = 80;
        const bar = this.add.graphics();
        bar.fillStyle(0x000000, 0.75);
        bar.fillRect(0, 0, width, barHeight);
        bar.lineStyle(2, 0x00ffcc, 0.3);
        bar.lineBetween(0, barHeight, width, barHeight);

        if (this.textures.exists('user_avatar')) {
            const img = this.add.image(45, 40, 'user_avatar').setDisplaySize(50, 50);
            const mask = this.make.graphics().fillCircle(45, 40, 25).createGeometryMask();
            img.setMask(mask);
        } else {
            this.add.sprite(45, 40, 'cards_back', this.user.selectedCardSkin || 'Back Blue 1.png')
                .setDisplaySize(45, 60);
        }

        this.add.text(85, 22, this.user.username.toUpperCase(), { fontSize: '18px', fontStyle: 'bold', fill: '#ffffff' });
        this.add.text(85, 45, `${this.user.stats.rank} - Niv. ${this.user.level}`, { fontSize: '13px', fill: '#00ffcc' });

        this.add.text(width - 150, 40, `💰 ${this.user.tokens.toLocaleString()}`, {
            fontSize: '20px', fontStyle: 'bold', fill: '#ffcc00'
        }).setOrigin(1, 0.5);

        const logoutBtn = this.add.container(width - 50, 40);
        const btnBg = this.add.graphics();
        btnBg.fillStyle(0xff4444, 0.2).fillCircle(0, 0, 22);
        btnBg.lineStyle(2, 0xff4444, 0.8).strokeCircle(0, 0, 22);
        const btnIcon = this.add.text(0, 0, "🚪", { fontSize: '20px' }).setOrigin(0.5);

        logoutBtn.add([btnBg, btnIcon]);
        btnBg.setInteractive(new Phaser.Geom.Circle(0, 0, 22), Phaser.Geom.Circle.Contains)
            .on('pointerover', () => btnBg.alpha = 1.5)
            .on('pointerout', () => btnBg.alpha = 1)
            .on('pointerdown', () => this.handleLogout());
    }

    createLobby(width, height) {
        const spacing = 220;
        const startX = width / 2 - (spacing * 1.5);
        const centerY = height / 2 + 30;
        this.cards = [];
        const localPlayerIndex = 1;

        for (let i = 0; i < 4; i++) {
            const isLocal = (i === localPlayerIndex);
            const card = new LobbyCard(
                this,
                startX + (i * spacing),
                centerY,
                isLocal,
                isLocal ? this.user : null
            );
            this.cards.push(card);
        }
    }

    triggerNotificationAlert() {
        if (this.socialPanel && !this.socialPanel.isOpen) {
            if (this.socialPanel.tabText) this.socialPanel.tabText.setFill('#ff0000');
            this.tweens.add({
                targets: this.socialPanel.tab,
                x: -48, duration: 100, yoyo: true, repeat: 3
            });
        }
    }

    handleLogout() {
        socketService.disconnect();
        localStorage.clear();
        window.location.href = "/";
    }

    createActionButtons(width, height) {
        // --- BOUTON QUITTER (Haut Gauche) ---
        this.leaveBtn = this.add.container(100, 130);
        const lBg = this.add.graphics();
        lBg.fillStyle(0xff4444, 0.8).fillRoundedRect(-60, -20, 120, 40, 8);
        const lTxt = this.add.text(0, 0, "QUITTER", { fontSize: '14px', fontStyle: 'bold', fill: '#fff' }).setOrigin(0.5);
        this.leaveBtn.add([lBg, lTxt]);
        this.leaveBtn.setVisible(false);
        lBg.setInteractive(new Phaser.Geom.Rectangle(-60, -20, 120, 40), Phaser.Geom.Rectangle.Contains)
            .on('pointerdown', () => socketService.getSocket()?.emit('leave_lobby'));

        // --- BOUTON ACTION (Bas Centre) ---
        this.actionBtn = this.add.container(width / 2, height - 80);
        this.actionBg = this.add.graphics();
        this.actionTxt = this.add.text(0, 0, "PRÊT", { fontSize: '22px', fontStyle: 'bold', fill: '#fff' }).setOrigin(0.5);
        this.actionBtn.add([this.actionBg, this.actionTxt]);

        this.actionBtn.setInteractive(new Phaser.Geom.Rectangle(-110, -30, 220, 60), Phaser.Geom.Rectangle.Contains)
            .on('pointerdown', () => this.handleActionClick());
    }

    updateActionBtnUI(isHost, isReady, canStart) {
        this.actionBg.clear();

        // 1. Compte des joueurs présents
        const activePlayers = this.cards.filter(card => card.playerData !== null).length;

        // 2. VERROUILLAGE : Si configuration en cours et pas Host, on cache tout
        if (this.lobbyStatus === 'configuring' && !isHost) {
            this.actionBtn.setVisible(false);
            this.leaveBtn.setVisible(false);
            return; // On arrête la fonction ici
        }

        // 3. RÉAFFICHAGE : Sinon on s'assure que c'est visible
        this.actionBtn.setVisible(true);
        // Le bouton quitter n'est visible que s'il y a plus d'un joueur
        this.leaveBtn.setVisible(activePlayers > 1);

        if (isHost) {
            this.actionTxt.setText("CONFIGURER");

            // CONDITION CRITIQUE : canStart doit être vrai ET il doit y avoir au moins 2 joueurs
            const isActuallyCliquable = canStart && activePlayers >= 2;

            const color = isActuallyCliquable ? 0xff9900 : 0x555555;
            this.actionBg.fillStyle(color, 1).fillRoundedRect(-110, -30, 220, 60, 12);

            this.actionBtn.setAlpha(isActuallyCliquable ? 1 : 0.5);

            // On met à jour la variable globale pour bloquer le clic aussi
            this.canStartGame = isActuallyCliquable;

        } else {
            // Logique pour les invités
            this.actionTxt.setText(isReady ? "ANNULER" : "PRÊT");
            const color = isReady ? 0xff4444 : 0x00cc66;
            this.actionBg.fillStyle(color, 1).fillRoundedRect(-110, -30, 220, 60, 12);
            this.actionBtn.setAlpha(1);
        }

        this.actionBg.lineStyle(2, 0xffffff, 1).strokeRoundedRect(-110, -30, 220, 60, 12);
    }

    handleActionClick() {
        const socket = socketService.getSocket();
        const isHost = (this.user.id || this.user._id).toString() === this.currentHostId?.toString();

        console.log("🖱️ Clic Action. Host ?", isHost, "CanStartGame ?", this.canStartGame);

        if (isHost) {
            if (this.canStartGame) {
                console.log("📤 Emission: start_configuring");
                socket.emit('start_configuring');
            } else {
                console.log("❌ Action bloquée: canStartGame est false");
            }
        } else {
            socket.emit('toggle_ready');
        }
    }

    showWaitingMessage() {
        if (this.waitingText) this.waitingText.destroy();

        const { width, height } = this.scale;
        this.waitingText = this.add.text(width / 2, height - 150, "Le Host configure la partie...", {
            fontSize: '18px',
            fill: '#00ffcc',
            fontStyle: 'italic'
        }).setOrigin(0.5);

        // Animation de clignotement
        this.tweens.add({
            targets: this.waitingText,
            alpha: 0.3,
            duration: 800,
            yoyo: true,
            repeat: -1
        });
    }
}
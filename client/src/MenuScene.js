import { LobbyCard } from './components/LobbyCard.js';
import { SocialPanel } from './components/SocialPanel.js';
import { socketService } from './services/SocketService.js';

export class MenuScene extends Phaser.Scene {
    constructor() {
        super('MenuScene');
        this.leaveBtn = null;
        this.configBtn = null;
        this.currentHostId = null;
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

                socket.on('new_friend_request', (data) => {
                    this.socialPanel.addInvitation({ ...data, type: 'FRIEND_REQUEST' });
                    this.triggerNotificationAlert();
                });

                socket.on('receive_game_invitation', (data) => {
                    this.socialPanel.addInvitation({ ...data, type: 'GAME_INVITE' });
                    this.triggerNotificationAlert();
                });

                // --- MISE À JOUR DU LOBBY ---
               socket.on('update_lobby', (data) => {
                    const players = data.players || (Array.isArray(data) ? data : null);
                    const hostId = data.hostId || this.currentHostId;
                    const myId = this.user.id || this.user._id;

                    if (!players) return;

                    console.log("--- MISE À JOUR LOBBY ---", players);
                    this.currentHostId = hostId; // Mise à jour globale du chef actuel

                    // 1. Reset visuel de toutes les cartes
                    this.cards.forEach(card => card.updateData(null));

                    // 2. Identifier et placer l'utilisateur local (Moi)
                    const me = players.find(p => p.id.toString() === myId.toString());
                    if (me) {
                        // On vérifie si JE suis le host pour l'icône sur ma carte
                        me.isHost = (me.id.toString() === hostId?.toString());
                        this.cards[1].updateData(me);

                        // 3. Placer les autres joueurs
                        const others = players.filter(p => p.id.toString() !== myId.toString());
                        const slots = [0, 2, 3];

                        others.forEach((player, index) => {
                            if (slots[index] !== undefined && this.cards[slots[index]]) {
                                // On vérifie si CET ami est le host
                                player.isHost = (player.id.toString() === hostId?.toString());
                                this.cards[slots[index]].updateData(player);
                            }
                        });
                    }

                    // 4. Gestion du bouton Quitter
                    // On ne montre le bouton que si on est dans une table (plus de 1 joueur)
                    if (players.length > 1) {
                        this.showLeaveButton();
                    } else {
                        this.hideLeaveButton();
                        this.currentHostId = myId; // Si seul, je suis mon propre host
                    }
                });

                // --- GESTION DE LA DISSOLUTION FORCÉE ---
                socket.on('lobby_dissolved', () => {
                    console.log("💥 Table dissoute, je retourne en solo...");

                    // 1. On vide l'affichage des autres cartes
                    this.cards.forEach((card, index) => {
                        if (index !== 1) card.updateData(null);
                    });

                    // 2. IMPORTANT : On demande au serveur de nous reset proprement
                    socket.emit('leave_lobby');

                    // 3. On remet l'ID du host sur nous-même localement
                    this.currentHostId = this.user.id || this.user._id;
                });

                socket.on('error_msg', (msg) => {
                    console.error("Erreur serveur :", msg);
                });
            }
        }

        this.events.on('shutdown', () => {
            const socket = socketService.getSocket();
            if (socket) {
                socket.off('new_friend_request');
                socket.off('receive_game_invitation');
                socket.off('update_lobby');
                socket.off('lobby_dissolved');
                socket.off('error_msg');
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

    showLeaveButton() {
        if (this.leaveBtn) return;
        const { width, height } = this.scale;

        this.leaveBtn = this.add.container(width / 2, height - 70);
        const bg = this.add.graphics();
        bg.fillStyle(0xff4444, 0.2).fillRoundedRect(-110, -22, 220, 44, 12);
        bg.lineStyle(2, 0xff4444, 0.8).strokeRoundedRect(-110, -22, 220, 44, 12);

        const txt = this.add.text(0, 0, "❌ QUITTER LA TABLE", {
            fontSize: '16px', fill: '#ff4444', fontStyle: 'bold'
        }).setOrigin(0.5);

        this.leaveBtn.add([bg, txt]);

        bg.setInteractive(new Phaser.Geom.Rectangle(-110, -22, 220, 44), Phaser.Geom.Rectangle.Contains)
            .on('pointerover', () => bg.alpha = 1.3)
            .on('pointerout', () => bg.alpha = 1)
            .on('pointerdown', () => {
                const socket = socketService.getSocket();
                if (socket) {
                    socket.emit('leave_lobby');
                    this.hideLeaveButton();
                }
            });
    }

    hideLeaveButton() {
        if (this.leaveBtn) {
            this.leaveBtn.destroy();
            this.leaveBtn = null;
        }
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
}
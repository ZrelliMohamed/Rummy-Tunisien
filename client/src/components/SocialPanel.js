import { socketService } from '../services/SocketService.js';

export class SocialPanel extends Phaser.GameObjects.Container {
    constructor(scene) {
        const { width, height } = scene.scale;
        super(scene, width, 0);

        this.scene = scene;
        this.isOpen = false;
        this.widthPanel = 300;
        this.invitations = [];
        this.friendsList = [];

        // --- 1. DESIGN DU PANNEAU ---
        const bg = scene.add.graphics().fillStyle(0x1a1a1a, 0.98).fillRect(0, 0, this.widthPanel, height);
        bg.lineStyle(2, 0x00ffcc, 1).lineBetween(0, 0, 0, height);
        this.add(bg);

        // --- 2. BOUTON FERMER ---
        const closeBtn = scene.add.text(this.widthPanel - 30, 15, "X", {
            fontSize: '22px', fill: '#ff4444', fontStyle: 'bold'
        }).setInteractive({ useHandCursor: true });
        closeBtn.on('pointerdown', () => this.toggle());
        this.add(closeBtn);

        // --- 3. L'ONGLET ---
        this.tab = scene.add.container(-40, height / 2);
        const tabBg = scene.add.graphics().fillStyle(0x1a1a1a, 1).fillRoundedRect(0, -50, 40, 100, { tl: 10, bl: 10 });
        this.tabText = scene.add.text(10, 0, "AMIS", { fontSize: '14px', fill: '#00ffcc' }).setOrigin(0.5).setAngle(-90);
        this.tab.add([tabBg, this.tabText]);
        this.tab.setSize(40, 100).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.toggle());
        this.add(this.tab);

        // --- 4. LISTE ET RECHERCHE ---
        this.createSearchInput();
        this.listContainer = scene.add.container(0, 120);
        this.add(this.listContainer);

        // --- 5. ZONE DE NOTIFICATION ---
        this.inviteSection = scene.add.container(0, height - 120);
        this.add(this.inviteSection);

        scene.add.existing(this);
    }

    addInvitation(data) {
        // Sécurité : on compare les IDs en string
        const alreadyExists = this.invitations.find(inv => 
            inv.fromId.toString() === data.fromId.toString() && inv.type === data.type
        );
        
        if (!alreadyExists) {
            this.invitations.push(data);
            this.updateInviteUI();
        }
    }

    updateInviteUI = () => {
        this.inviteSection.removeAll(true);
        if (this.invitations.length === 0) return;

        const invite = this.invitations[0];
        const box = this.scene.add.graphics().fillStyle(0x333333).fillRoundedRect(10, 0, 280, 85, 8);
        box.lineStyle(1, 0x00ffcc).strokeRoundedRect(10, 0, 280, 85, 8);

        const label = invite.type === 'GAME_INVITE' ? "VEUT JOUER !" : "DEMANDE D'AMI";
        const txt = this.scene.add.text(25, 12, `${invite.fromName.toUpperCase()}\n${label}`, {
            fontSize: '11px', fill: '#00ffcc', fontStyle: 'bold'
        });

        const acceptBtn = this.scene.add.text(25, 50, "ACCEPTER", {
            fontSize: '11px', fill: '#fff', backgroundColor: '#1a592e', padding: { x: 8, y: 5 }
        }).setInteractive({ useHandCursor: true });

        const declineBtn = this.scene.add.text(130, 50, "REFUSER", {
            fontSize: '11px', fill: '#fff', backgroundColor: '#882222', padding: { x: 8, y: 5 }
        }).setInteractive({ useHandCursor: true });

        acceptBtn.on('pointerdown', () => this.processInvitation(invite, 'accept'));
        declineBtn.on('pointerdown', () => this.processInvitation(invite, 'decline'));

        this.inviteSection.add([box, txt, acceptBtn, declineBtn]);
    }

    async processInvitation(invite, action) {
      if (invite.type === 'GAME_INVITE') {
            if (action === 'accept') {
                const socket = socketService.getSocket();
                if (socket) {
                    console.log("🎮 Rejoint la table:", invite.lobbyId);
                    socket.emit('accept_game_invite', {
                        lobbyId: invite.lobbyId,
                        username: this.scene.user.username
                    });
                    this.toggle(); 
                }
            }
            // Nettoyage précis par lobbyId
            this.invitations = this.invitations.filter(i => i.lobbyId !== invite.lobbyId);
            this.updateInviteUI();
            return;
        }

        // --- DEMANDE D'AMI ---
        try {
            const myId = (this.scene.user.id || this.scene.user._id).toString();
            const resp = await fetch(`http://localhost:3000/api/social/${action}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: myId,
                    friendId: invite.fromId.toString()
                })
            });

            if (resp.ok) {
                this.invitations = this.invitations.filter(i => i.fromId !== invite.fromId);
                this.updateInviteUI();
                if (action === 'accept') this.loadMyFriends();
            }
        } catch (e) { console.error(`Erreur ${action}:`, e); }
    }

    toggle = () => {
        this.isOpen = !this.isOpen;
        const targetX = this.isOpen ? this.scene.scale.width - this.widthPanel : this.scene.scale.width;

        this.scene.tweens.add({
            targets: this,
            x: targetX,
            duration: 300,
            ease: 'Cubic.easeOut',
            onComplete: () => {
                if (this.isOpen) {
                    this.loadMyFriends();
                    this.tabText.setFill('#00ffcc');
                }
            }
        });
    }

    createSearchInput = () => {
        const html = `<input type="text" id="socSearch" placeholder="Chercher un joueur..." style="width:230px; background:#222; color:white; border:1px solid #444; padding:8px; border-radius:5px; outline:none;">`;
        const dom = this.scene.add.dom(this.widthPanel / 2, 75).createFromHTML(html);
        this.add(dom);
        dom.getChildByID('socSearch').addEventListener('keyup', (e) => {
            if (e.key === 'Enter') this.searchUsers(e.target.value);
        });
    }

    loadMyFriends = async () => {
        try {
            const id = (this.scene.user.id || this.scene.user._id).toString();
            const resp = await fetch(`http://localhost:3000/api/social/friends/${id}`);
            const data = await resp.json();
            this.friendsList = data.friends || [];
            this.renderFriendsList(this.friendsList, "MES AMIS");
        } catch (e) { console.error(e); }
    }

    searchUsers = async (query) => {
        if (!query) return;
        try {
            const myId = (this.scene.user.id || this.scene.user._id).toString();
            const resp = await fetch(`http://localhost:3000/api/social/search/${query}`);
            const data = await resp.json();

            const filteredData = data.filter(u => {
                const userId = (u._id || u.id).toString();
                const isMe = userId === myId;
                const isAlreadyFriend = this.friendsList.some(f => (f._id || f.id).toString() === userId);
                return !isMe && !isAlreadyFriend;
            });

            this.renderFriendsList(filteredData, "RÉSULTATS");
        } catch (e) { console.error("Erreur recherche :", e); }
    }

    renderFriendsList = (users, title) => {
        this.listContainer.removeAll(true);
        
        // Titre de la section (MES AMIS ou RÉSULTATS)
        const titleStyle = { fontSize: '11px', fill: '#00ffcc', fontStyle: 'bold' };
        this.listContainer.add(this.scene.add.text(20, -10, title, titleStyle));

        const myId = (this.scene.user.id || this.scene.user._id).toString();
        
        // --- LOGIQUE DE DROIT D'INVITATION ---
        // Je peux inviter si je suis le Host actuel ou si je n'ai pas encore de Host (donc je suis seul)
        const isMeHost = !this.scene.currentHostId || (this.scene.currentHostId.toString() === myId);

        users.forEach((u, i) => {
            const userId = (u._id || u.id).toString();
            const row = this.scene.add.container(0, i * 45 + 20);
            
            // 1. Point de statut (Online/Offline)
            const dotColor = u.isOnline ? 0x00ff00 : 0x666666;
            const dot = this.scene.add.graphics().fillStyle(dotColor).fillCircle(10, 10, 4);
            
            // 2. Nom d'utilisateur
            const nameColor = u.isOnline ? '#ffffff' : '#888888';
            const name = this.scene.add.text(25, 0, u.username, { fontSize: '15px', fill: nameColor });

            // 3. Bouton d'action (+ pour recherche, 🎮 pour amis)
            const btnTxt = title === "RÉSULTATS" ? "+" : "🎮";
            
            // On peut cliquer si : 
            // - C'est une recherche (+) 
            // - OU si c'est un ami, qu'il est ONLINE, et que JE suis le HOST
            const canInteract = title === "RÉSULTATS" || (u.isOnline && isMeHost);
            
            const btnColor = canInteract ? '#00ffcc' : '#444444';
            const btn = this.scene.add.text(250, 0, btnTxt, { 
                fontSize: '18px', 
                fill: btnColor 
            }).setOrigin(0.5);

            if (canInteract) {
                btn.setInteractive({ useHandCursor: true });
                
                btn.on('pointerover', () => btn.setScale(1.2));
                btn.on('pointerout', () => btn.setScale(1));
                
                btn.on('pointerdown', async () => {
                    if (title === "RÉSULTATS") {
                        // Action : Ajouter en ami
                        await this.sendFriendRequest(userId);
                        btn.setText("✔️").disableInteractive().setFill('#00ff00');
                    } else {
                        // Action : Inviter à jouer
                        const socket = socketService.getSocket();
                        if (socket) {
                            console.log(`📤 Envoi invitation à ${u.username}`);
                            socket.emit('invite_to_game', {
                                toId: userId,
                                fromName: this.scene.user.username
                            });
                            // Feedback visuel temporaire
                            btn.setText("⏳").disableInteractive().setFill('#666');
                        }
                    }
                });
            }

            row.add([dot, name, btn]);
            this.listContainer.add(row);
        });
    }

    sendFriendRequest = async (toId) => {
        try {
            const fromId = (this.scene.user.id || this.scene.user._id).toString();
            await fetch('http://localhost:3000/api/social/request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fromId, toId: toId.toString() })
            });
        } catch (e) { console.error(e); }
    }
}
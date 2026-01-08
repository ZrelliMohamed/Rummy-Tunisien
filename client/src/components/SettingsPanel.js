export class SettingsPanel extends Phaser.GameObjects.Container {
    constructor(scene, currentSettings) {
        const { width, height } = scene.scale;
        super(scene, width / 2, height / 2);

        this.scene = scene;
        this.settings = currentSettings || {
            descente: 51,
            pivotJoker: false,
            coupe: false,
            ajoutJoker: false,
            mode: 1,
            order: [] // Liste des IDs des joueurs dans l'ordre
        };

        // 1. Fond sombre et bordure néon
        const bg = scene.add.graphics();
        bg.fillStyle(0x000000, 0.95);
        bg.fillRoundedRect(-250, -300, 500, 600, 15);
        bg.lineStyle(3, 0x00ffcc, 1);
        bg.strokeRoundedRect(-250, -300, 500, 600, 15);
        this.add(bg);

        // 2. Titre
        const title = scene.add.text(0, -270, "CONFIGURATION DE LA TABLE", {
            fontSize: '22px', fontStyle: 'bold', fill: '#00ffcc'
        }).setOrigin(0.5);
        this.add(title);

        this.createControls();
        this.createOrderList();

        // 3. Bouton VALIDER
        const startBtn = scene.add.container(0, 250);
        const btnBg = scene.add.graphics().fillStyle(0x00ffcc, 0.2).fillRoundedRect(-100, -20, 200, 40, 8);
        btnBg.lineStyle(2, 0x00ffcc, 1).strokeRoundedRect(-100, -20, 200, 40, 8);
        const btnTxt = scene.add.text(0, 0, "CONFIRMER ET LANCER", { fontSize: '16px', fill: '#fff' }).setOrigin(0.5);
        startBtn.add([btnBg, btnTxt]);
        
        btnBg.setInteractive(new Phaser.Geom.Rectangle(-100, -20, 200, 40), Phaser.Geom.Rectangle.Contains)
             .on('pointerdown', () => this.applySettings());
        this.add(startBtn);

        scene.add.existing(this);
        this.setDepth(100); // Toujours au dessus
    }

    createControls() {
        let y = -200;
        
        // --- DESCENTE (51 / 71) ---
        this.createOptionGroup("DESCENTE", y, ["51", "71"], (val) => { this.settings.descente = parseInt(val); });
        
        // --- PIVOT JOKER (OUI / NON) ---
        y += 60;
        this.createSwitch("PIVOT JOKER", y, "pivotJoker");

        // --- LA COUPE (OUI / NON) ---
        y += 50;
        this.createSwitch("LA COUPE", y, "coupe");

        // --- AJOUT JOKER (OUI / NON) ---
        y += 50;
        this.createSwitch("AJOUT JOKER", y, "ajoutJoker");

        // --- MODE DE JEU (1 PHASE / 3 PHASES) ---
        y += 60;
        this.createOptionGroup("MODE", y, ["1 PHASE", "3 PHASES"], (val) => { this.settings.mode = val.includes("1") ? 1 : 3; });
    }

    createSwitch(label, y, key) {
        const txt = this.scene.add.text(-220, y, label, { fontSize: '16px', fill: '#fff' });
        const toggleBg = this.scene.add.graphics();
        const drawToggle = () => {
            toggleBg.clear();
            toggleBg.fillStyle(this.settings[key] ? 0x00ffcc : 0x444444);
            toggleBg.fillRoundedRect(150, y - 10, 50, 25, 12);
            toggleBg.fillStyle(0xffffff);
            toggleBg.fillCircle(this.settings[key] ? 190 : 160, y + 2, 10);
        };
        
        toggleBg.setInteractive(new Phaser.Geom.Rectangle(150, y - 10, 50, 25), Phaser.Geom.Rectangle.Contains)
                .on('pointerdown', () => {
                    this.settings[key] = !this.settings[key];
                    drawToggle();
                    this.onSettingChange(label, this.settings[key] ? "OUI" : "NON");
                });
        
        drawToggle();
        this.add([txt, toggleBg]);
    }

    createOptionGroup(label, y, options, callback) {
        this.add(this.scene.add.text(-220, y, label, { fontSize: '16px', fill: '#fff' }));
        options.forEach((opt, i) => {
            const x = 50 + (i * 100);
            const btn = this.scene.add.text(x, y, opt, { 
                fontSize: '14px', backgroundColor: '#333', padding: {x:10, y:5} 
            }).setOrigin(0.5).setInteractive({useHandCursor: true});
            
            btn.on('pointerdown', () => {
                callback(opt);
                this.onSettingChange(label, opt);
            });
            this.add(btn);
        });
    }

    createOrderList() {
        const yBase = 120;
        this.add(this.scene.add.text(-220, yBase - 30, "ORDRE DES JOUEURS (GLISSER POUR CHANGER)", { fontSize: '14px', fill: '#ffcc00' }));
        
        // On récupère les joueurs actuels du lobby
        const players = this.scene.currentLobbyPlayers || [];
        players.forEach((p, i) => {
            const item = this.scene.add.container(-220, yBase + (i * 35));
            const rect = this.scene.add.graphics().fillStyle(0x333333).fillRect(0, 0, 440, 30);
            const name = this.scene.add.text(10, 5, `${i+1}. ${p.username.toUpperCase()}`, { fontSize: '14px' });
            item.add([rect, name]);
            this.add(item);
            
            // Logique de Drag simple à implémenter ici pour réorganiser l'array this.settings.order
        });
    }

    onSettingChange(label, value) {
        // Envoi au serveur pour notifier les invités via le chat/toast
        const socket = this.scene.socket;
        if (socket) {
            socket.emit('update_settings_preview', { message: `Règle modifiée : ${label} -> ${value}` });
        }
    }

    applySettings() {
        this.scene.socket.emit('start_game_with_settings', this.settings);
        this.destroy();
    }
} 
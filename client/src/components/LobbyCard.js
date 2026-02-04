export class LobbyCard extends Phaser.GameObjects.Container {
    constructor(scene, x, y, isOccupied = false, userData = null) {
        super(scene, x, y);
        this.scene = scene;
        this.isOccupied = isOccupied;

        // 1. INITIALISATION DES CALQUES
        this.backLimbs = scene.add.graphics();
        this.frontLimbs = scene.add.graphics();
        this.mouthGraphic = scene.add.graphics();
        this.eyeGraphic = scene.add.graphics();

        // 2. LE CORPS DE LA CARTE
        const frame = isOccupied ? 'Back Blue 1.png' : 'Back Red 1.png';
        this.cardSprite = scene.add.sprite(0, 0, 'cards_back', frame);
        this.cardSprite.setDisplaySize(110, 150);

        // 3. POINTS DE CONTRÔLE
        this.points = {
            handL: { x: -65, y: 50 },
            handR: { x: 65, y: 50 },
            footL: { x: -30, y: 110 },
            footR: { x: 30, y: 110 }
        };

        // 4. ASSEMBLAGE INITIAL
        this.add([this.backLimbs, this.cardSprite, this.eyeGraphic, this.mouthGraphic, this.frontLimbs]);

        // 5. ETAT INITIAL
        if (this.isOccupied && userData) {
            this.activate(userData);
        } else {
            this.deactivate();
        }

        scene.add.existing(this);

        // Boucle de rendu des membres
        this.drawTimer = this.scene.time.addEvent({
            delay: 16,
            callback: () => this.drawMascot(),
            loop: true
        });
        this.hostIcon = scene.add.text(0, -140, "👑", { fontSize: '24px' }).setOrigin(0.5);
        this.hostIcon.setVisible(false);
        this.add(this.hostIcon);
    }

    /**
     * MÉTHODE CLÉ : Met à jour la carte dynamiquement (Transition Douce)
     */
  updateData(userData) {
    this.playerData = userData;
    
    if (userData) {
        // Si la carte était vide, on l'active
        if (!this.isOccupied) {
            this.activate(userData);
        }

        // Mise à jour du nom (au cas où)
        if (this.nameTxt) {
            this.nameTxt.setText(userData.username.toUpperCase());
            // Optionnel : change la couleur du nom si c'est moi
            const myId = this.scene.user.id || this.scene.user._id;
            this.nameTxt.setFill(userData.id.toString() === myId.toString() ? '#00ffff' : '#00ff00');
        }

        // --- GESTION DE LA COURONNE ---
        if (this.hostIcon) {
            this.hostIcon.setVisible(userData.isHost === true);
            
            // Petit effet d'animation sur la couronne pour qu'elle "flotte"
            if (userData.isHost && !this.hostTween) {
                this.hostTween = this.scene.tweens.add({
                    targets: this.hostIcon,
                    y: '-=5',
                    duration: 1000,
                    yoyo: true,
                    repeat: -1
                });
            }
        }
    } else {
        // Si userData est null, on vide la carte
        if (this.isOccupied) {
            this.deactivate();
        }
    }

        if (userData && userData.isReady) {
        if (!this.readyTag) {
            this.readyTag = this.scene.add.text(0, 80, "PRÊT", { 
                backgroundColor: '#00ff00', color: '#000', padding: 4 
            }).setOrigin(0.5);
            this.add(this.readyTag);
        }
        this.readyTag.setVisible(true);
    } else if (this.readyTag) {
        this.readyTag.setVisible(false);
    }




}

    activate(userData) {
        this.isOccupied = true;
        this.cardSprite.setFrame('Back Blue 1.png');

        // Stopper les ZzZ s'ils existent
        if (this.sleepEvent) {
            this.sleepEvent.destroy();
            this.sleepEvent = null;
        }

        // Nom du joueur
        if (!this.nameTxt) {
            this.nameTxt = this.scene.add.text(0, -115, userData.username.toUpperCase(), {
                fontSize: '15px', fill: '#00ff00', fontStyle: 'bold', stroke: '#000', strokeThickness: 4
            }).setOrigin(0.5);
            this.add(this.nameTxt);
        }
        this.nameTxt.setVisible(true);

        // Yeux expressifs
        if (!this.eyeGroup) {
            this.eyeGroup = this.scene.add.container(0, -25);
            this.createExpressiveEyes();
            this.add(this.eyeGroup);
        }
        this.eyeGroup.setVisible(true);

        this.initActiveAnimations();
        this.playRandomAnimation();
    }

    deactivate() {
        this.isOccupied = false;
        this.cardSprite.setFrame('Back Red 1.png');

        if (this.nameTxt) this.nameTxt.setVisible(false);
        if (this.eyeGroup) this.eyeGroup.setVisible(false);

        this.startSleepingParticles();
        this.resetPose();
    }

    createExpressiveEyes() {
        const leftWhite = this.scene.add.ellipse(-22, 0, 28, 38, 0xffffff);
        const rightWhite = this.scene.add.ellipse(22, 0, 28, 38, 0xffffff);
        this.leftPupil = this.scene.add.circle(-22, 0, 7, 0x000000);
        this.rightPupil = this.scene.add.circle(22, 0, 7, 0x000000);
        this.eyeGroup.add([leftWhite, rightWhite, this.leftPupil, this.rightPupil]);
    }

    startSleepingParticles() {
        if (this.sleepEvent) return;
        this.sleepEvent = this.scene.time.addEvent({
            delay: 1500,
            callback: () => {
                if (this.isOccupied) return;
                const zText = this.scene.add.text(10, -20, 'z', { fontSize: '15px', fill: '#ffffff' });
                this.add(zText);
                this.scene.tweens.add({
                    targets: zText, x: '+=20', y: '-=60', alpha: 0, scale: 2, duration: 2000,
                    onComplete: () => zText.destroy()
                });
            },
            loop: true
        });
    }

    initActiveAnimations() {
        // Animation pupilles
        this.scene.tweens.add({
            targets: [this.leftPupil, this.rightPupil],
            x: (target) => target.x + (Math.random() > 0.5 ? 3 : -3),
            duration: 2000, yoyo: true, repeat: -1
        });
    }

    playRandomAnimation() {
        if (!this.isOccupied) return;
        const anims = ['shuffle', 'wave', 'bossPose', 'tapFoot'];
        const choice = Phaser.Utils.Array.GetRandom(anims);
        if (this[choice]) this[choice]();
        this.scene.time.delayedCall(Phaser.Math.Between(5000, 8000), () => this.playRandomAnimation());
    }

    // --- LOGIQUE DE DESSIN (Même que précédemment) ---
    drawMascot() {
        this.backLimbs.clear();
        this.frontLimbs.clear();
        this.eyeGraphic.clear();
        this.mouthGraphic.clear();

        [this.backLimbs, this.frontLimbs].forEach(g => {
            g.lineStyle(6, 0xffffff, 1);
            g.fillStyle(0xffffff, 1);
        });

        // Jambes
        this.drawCurve(this.backLimbs, -25, 65, this.points.footL.x - 5, 85, this.points.footL.x, this.points.footL.y);
        this.drawCurve(this.backLimbs, 25, 65, this.points.footR.x + 5, 85, this.points.footR.x, this.points.footR.y);
        this.backLimbs.fillEllipse(this.points.footL.x - 5, this.points.footL.y + 5, 22, 14);
        this.backLimbs.fillEllipse(this.points.footR.x + 5, this.points.footR.y + 5, 22, 14);

        if (this.isOccupied) {
            // Bras actifs
            this.drawCurve(this.frontLimbs, -50, 10, this.points.handL.x - 10, this.points.handL.y - 20, this.points.handL.x, this.points.handL.y);
            this.drawCurve(this.frontLimbs, 50, 10, this.points.handR.x + 10, this.points.handR.y - 20, this.points.handR.x, this.points.handR.y);
            this.frontLimbs.fillCircle(this.points.handL.x, this.points.handL.y, 12);
            this.frontLimbs.fillCircle(this.points.handR.x, this.points.handR.y, 12);

            // --- LA CORRECTION EST ICI ---
            this.mouthGraphic.lineStyle(3, 0x000000).strokeEllipse(0, 25, 20, 10);
        } else {
            // Bras endormis
            this.drawCurve(this.frontLimbs, -50, 10, -60, 40, -50, 65);
            this.drawCurve(this.frontLimbs, 50, 10, 60, 40, 50, 65);
            this.frontLimbs.fillCircle(-50, 70, 9);
            this.frontLimbs.fillCircle(50, 70, 9);
            // Yeux fermés (arcs)
            this.eyeGraphic.lineStyle(4, 0x000000, 0.7);
            this.drawCurve(this.eyeGraphic, -35, -25, -22, -15, -10, -25);
            this.drawCurve(this.eyeGraphic, 10, -25, 22, -15, 35, -25);
            // Bouche "o" de sommeil
            this.mouthGraphic.lineStyle(2, 0x000000).strokeCircle(0, 25, 3);
        }
    }

    drawCurve(graphics, x1, y1, cx, cy, x2, y2) {
        const curve = new Phaser.Curves.QuadraticBezier(
            new Phaser.Math.Vector2(x1, y1), new Phaser.Math.Vector2(cx, cy), new Phaser.Math.Vector2(x2, y2)
        );
        curve.draw(graphics);
    }

    resetPose() {
        this.scene.tweens.add({ targets: this.points.handL, x: -65, y: 50, duration: 500 });
        this.scene.tweens.add({ targets: this.points.handR, x: 65, y: 50, duration: 500 });
        this.scene.tweens.add({ targets: [this.points.footL, this.points.footR], y: 110, duration: 500 });
    }

    // --- ANIMATIONS (Mêmes que précédemment : shuffle, wave, bossPose, tapFoot) ---
    shuffle() { this.scene.tweens.add({ targets: [this.points.handL, this.points.handR], y: '+=10', duration: 100, yoyo: true, repeat: 5 }); }
    wave() { this.scene.tweens.add({ targets: this.points.handL, x: -80, y: -40, duration: 400, yoyo: true, repeat: 1, onComplete: () => this.resetPose() }); }
    bossPose() { this.scene.tweens.add({ targets: [this.points.handL, this.points.handR], x: 0, y: 40, duration: 500 }); }
    tapFoot() { this.scene.tweens.add({ targets: this.points.footR, y: 100, duration: 150, yoyo: true, repeat: 3 }); }
}
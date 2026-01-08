const API_URL = "http://localhost:3000/api/auth";

export class LoginScene extends Phaser.Scene {
    constructor() {
        super('LoginScene');
        this.isLoginMode = true; // État par défaut
    }

    preload() {
        this.load.image('bg_menu', 'assets/menu/background_dark.jpg');
        this.load.image('icon_google', 'assets/menu/google_icon.png');
        this.load.image('icon_email', 'assets/menu/email_icon.png');
    }

    async create() {
        // 1. GESTION DU RETOUR GOOGLE (Priorité haute : on vient juste de cliquer)
        const urlParams = new URLSearchParams(window.location.search);

        // --- NOUVEAU : GESTION DU SUCCÈS DE VÉRIFICATION EMAIL ---
        if (urlParams.get('verified') === 'success') {
            // On nettoie l'URL pour éviter que le message reste si on rafraîchit
            window.history.replaceState({}, document.title, "/");

            // Afficher un message de succès stylé
            const msgBg = this.add.rectangle(600, 50, 400, 40, 0x28a745).setAlpha(0);
            const msgTxt = this.add.text(600, 50, "✅ Compte activé ! Vous pouvez vous connecter.", {
                fontSize: '16px',
                fill: '#ffffff',
                fontStyle: 'bold'
            }).setOrigin(0.5).setAlpha(0);

            // Animation d'apparition/disparition (Fade In/Out)
            this.tweens.add({
                targets: [msgBg, msgTxt],
                alpha: 1,
                y: 80,
                duration: 500,
                ease: 'Power2',
                onComplete: () => {
                    this.time.delayedCall(4000, () => { // Disparaît après 4 secondes
                        this.tweens.add({ targets: [msgBg, msgTxt], alpha: 0, duration: 500 });
                    });
                }
            });
        }
        const urlToken = urlParams.get('token');

      if (urlToken) {
            const userData = {
                id: urlParams.get('id'), // <--- AJOUTEZ CECI
                username: urlParams.get('username'),
                avatar: urlParams.get('avatar'),
                level: urlParams.get('level') || 1,
                selectedCardSkin: urlParams.get('skin') || 'Back Blue 1.png' // 'skin' correspond au paramètre URL du backend
            };
            this.saveAndStart(urlToken, userData);
            return;
        }

        // 2. AUTO-LOGIN : Vérifier si un token existe déjà dans le navigateur
        const savedToken = localStorage.getItem('token');
        if (savedToken) {
            // On affiche un petit texte de chargement temporaire
            const loadingText = this.add.text(600, 400, 'Connexion automatique...', { fontSize: '20px', fill: '#ffffff' }).setOrigin(0.5);

            const user = await this.checkTokenValidity(savedToken);

            if (user) {
                this.scene.start('MenuScene', { user: user });
                return; // On saute l'affichage des cartes !
            }
            loadingText.destroy(); // Si le token est mort, on enlève le texte et on continue
        }

        // 3. VISUELS DE FOND (Si aucun token ou erreur, on affiche le menu normal)
        this.add.image(600, 400, 'bg_menu').setDisplaySize(1200, 800).setAlpha(0.5);

        // 4. CONTENEURS
        this.googleCardContainer = this.add.container(450, 400);
        this.emailCardContainer = this.add.container(750, 400);

        this.createBackButton();
        this.initCards();
    }
    // Vérifie auprès de votre serveur Node.js si le token est encore valide
    async checkTokenValidity(token) {
        try {
            const response = await fetch(`${API_URL}/me`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                return data.user; // Renvoie les infos utilisateur (username, avatar)
            } else {
                localStorage.removeItem('token'); // Token expiré, on le supprime
                return null;
            }
        } catch (err) {
            console.error("Serveur injoignable pour l'auto-login");
            return null;
        }
    }

    // Pour éviter de répéter le code de sauvegarde
    saveAndStart(token, user) {
        localStorage.setItem('token', token);
        // Nettoie l'URL (enlève les paramètres Google)
        window.history.replaceState({}, document.title, "/");
        // On envoie l'objet user complet (qui contient maintenant skin, stats, level, etc.)
        this.scene.start('MenuScene', { user: user });
    }

    createBackButton() {
        this.backBtn = this.add.container(60, 60).setVisible(false);
        const circle = this.add.circle(0, 0, 30, 0x333333).setInteractive({ useHandCursor: true });
        const arrow = this.add.text(-10, -15, '<', { fontSize: '30px', fill: '#ffffff', fontStyle: 'bold' });

        this.backBtn.add([circle, arrow]);
        circle.on('pointerdown', () => this.resetLoginView());
    }

    initCards() {
        this.isLoginMode = true; // Reset de l'état
        this.googleCardContainer.setScale(1).setAlpha(1).setX(450).removeAll(true);
        this.emailCardContainer.setScale(1).setAlpha(1).setX(750).removeAll(true);

        // Carte Google
        this.createAuthCard(this.googleCardContainer, "GOOGLE", 0x4285F4, 'icon_google', () => {
            window.location.href = `${API_URL}/google`;
        });

        // Carte Email
        this.createAuthCard(this.emailCardContainer, "EMAIL", 0xffffff, 'icon_email', () => {
            this.showEmailForm();
        });
    }

    createAuthCard(container, title, color, iconKey, callback) {
        const bg = this.add.graphics();
        bg.fillStyle(0x1a1a1a, 1);
        bg.fillRoundedRect(-140, -180, 280, 360, 20);
        bg.lineStyle(3, color, 1);
        bg.strokeRoundedRect(-140, -180, 280, 360, 20);

        const txt = this.add.text(0, 100, title, { fontSize: '22px', fill: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
        const iconImage = this.add.image(0, -30, iconKey).setDisplaySize(80, 80);

        container.add([bg, iconImage, txt]);
        const zone = this.add.zone(0, 0, 280, 360).setInteractive({ useHandCursor: true });
        container.add(zone);

        zone.on('pointerdown', callback);
    }

    showEmailForm() {
        this.tweens.add({ targets: this.googleCardContainer, x: -300, alpha: 0, duration: 400 });
        this.backBtn.setVisible(true).setAlpha(0);
        this.tweens.add({ targets: this.backBtn, alpha: 1, duration: 400 });

        this.tweens.add({
            targets: this.emailCardContainer,
            x: 600,
            scaleX: 0,
            duration: 300,
            onComplete: () => {
                this.buildEmailForm();
                this.tweens.add({ targets: this.emailCardContainer, scaleX: 1, duration: 300 });
            }
        });
    }

    buildEmailForm() {
        this.emailCardContainer.removeAll(true);
        const bg = this.add.graphics();
        bg.fillStyle(0x1a1a1a, 1);
        bg.fillRoundedRect(-200, -250, 400, 500, 20);
        bg.lineStyle(4, 0xffffff, 1);
        bg.strokeRoundedRect(-200, -250, 400, 500, 20);

        const formHTML = `
        <div id="auth-container" style="color: white; font-family: 'Arial'; text-align: center; width: 250px;">
            <div id="form-content">
                <h2 id="auth-title" style="margin-bottom: 20px;">CONNEXION</h2>
                <input type="text" id="username" placeholder="Pseudo" style="display: none; margin-bottom: 10px; padding: 10px; width: 100%; border-radius: 5px; border: none;">
                <input type="email" id="email" placeholder="Email" style="margin-bottom: 10px; padding: 10px; width: 100%; border-radius: 5px; border: none;">
                <input type="password" id="pw" placeholder="Mot de passe" style="margin-bottom: 20px; padding: 10px; width: 100%; border-radius: 5px; border: none;">
                <button id="mainBtn" style="padding: 12px; cursor: pointer; background: #28a745; color: white; border: none; border-radius: 5px; width: 100%; font-weight: bold;">SE CONNECTER</button>
                <p id="toggleMode" style="margin-top: 20px; font-size: 14px; cursor: pointer; text-decoration: underline; color: #ffcc00;">Pas de compte ? S'inscrire</p>
            </div>
        </div>
    `;

        const dom = this.add.dom(0, 0).createFromHTML(formHTML);
        this.emailCardContainer.add([bg, dom]);

        const toggleText = dom.getChildByID('toggleMode');
        const usernameField = dom.getChildByID('username');
        const title = dom.getChildByID('auth-title');
        const mainBtn = dom.getChildByID('mainBtn');
        const formContent = dom.getChildByID('form-content');

        // GESTION DU TOGGLE
        toggleText.addEventListener('click', () => {
            this.isLoginMode = !this.isLoginMode;
            title.innerText = this.isLoginMode ? "CONNEXION" : "INSCRIPTION";
            mainBtn.innerText = this.isLoginMode ? "SE CONNECTER" : "CRÉER MON COMPTE";
            toggleText.innerText = this.isLoginMode ? "Pas de compte ? S'inscrire" : "Déjà un compte ? Connexion";
            usernameField.style.display = this.isLoginMode ? "none" : "block";
        });

        // ACTION DU BOUTON
        // ACTION DU BOUTON
        mainBtn.addEventListener('click', async () => {
            // 1. Désactiver le bouton pour éviter le double-clic
            mainBtn.disabled = true;
            const originalText = mainBtn.innerText;
            mainBtn.innerText = "PATIENTEZ...";
            mainBtn.style.background = "#555"; // Couleur grise pendant le chargement
            mainBtn.style.cursor = "not-allowed";

            const email = dom.getChildByID('email').value;
            const password = dom.getChildByID('pw').value;
            const username = usernameField.value;
            const endpoint = this.isLoginMode ? '/login' : '/register';

            const bodyData = { email, password };
            if (!this.isLoginMode) bodyData.username = username;

            try {
                const response = await fetch(`${API_URL}${endpoint}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(bodyData)
                });

                const data = await response.json();

                if (response.ok) {
                    if (this.isLoginMode) {
                        localStorage.setItem('token', data.token);
                        this.scene.start('MenuScene', { user: data.user });
                    } else {
                        // Affichage du message de succès (comme avant)
                        formContent.innerHTML = `
                    <h3 style="color: #ffcc00; margin-bottom: 15px;">📧 Email envoyé !</h3>
                    <p style="font-size: 14px; line-height: 1.4;">Un lien de validation a été envoyé à :<br><b>${email}</b></p>
                    <button id="backBtnAfterReg" style="margin-top: 20px; padding: 10px; cursor: pointer; background: #444; color: white; border: none; border-radius: 5px; width: 100%;">RETOUR</button>
                `;
                        dom.getChildByID('backBtnAfterReg').addEventListener('click', () => this.resetLoginView());
                    }
                } else {
                    alert(data.msg || "Une erreur est survenue");
                    // Réactiver le bouton en cas d'erreur
                    mainBtn.disabled = false;
                    mainBtn.innerText = originalText;
                    mainBtn.style.background = "#28a745";
                    mainBtn.style.cursor = "pointer";
                }
            } catch (err) {
                alert("Erreur réseau. Vérifiez votre connexion.");
                // Réactiver le bouton
                mainBtn.disabled = false;
                mainBtn.innerText = originalText;
                mainBtn.style.background = "#28a745";
                mainBtn.style.cursor = "pointer";
            }
        });
    }

    resetLoginView() {
        this.backBtn.setVisible(false);
        this.tweens.add({
            targets: [this.googleCardContainer, this.emailCardContainer],
            scaleX: 0,
            duration: 200,
            onComplete: () => {
                this.initCards();
                this.tweens.add({ targets: this.googleCardContainer, x: 450, alpha: 1, scaleX: 1, duration: 400 });
                this.tweens.add({ targets: this.emailCardContainer, x: 750, alpha: 1, scaleX: 1, duration: 400 });
            }
        });
    }
}
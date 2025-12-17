# Rummy-Tunisien
Rami Tunisien : Développement du célèbre jeu de cartes "Rummy" en respectant fidèlement les règles et les variantes traditionnelles tunisiennes. 
# Roadmap
Voici la feuille de route (Roadmap) logique pour ton Rummy tunisien, de l'idée jusqu'à Steam :

Étape 1 : Le "Moteur de Logique" (Pur JavaScript)
Avant même de voir une carte à l'écran, tu dois créer le cerveau du jeu. C'est du code qui pourrait tourner dans une console noire.

Création du Deck : Générer 104 cartes avec leurs propriétés.

Algorithme de Mélange (Shuffle) : Mélanger les cartes aléatoirement.

Logique de Validation : Écrire les fonctions qui vérifient si une suite ou un brelan est valide (la partie la plus difficile mathématiquement).

Calcul des scores : Une fonction qui calcule le total des points d'une main (pour le fameux "51").

Étape 2 : Le Serveur de Jeu (Node.js + Socket.io)
C'est ici que tu rends le jeu "vivant".

Gestion des Rooms : Pouvoir créer une table de jeu et laisser des joueurs la rejoindre via un ID.

Le cycle de tour : Gérer qui doit jouer, et passer au suivant quand une carte est jetée.

Sécurité : S'assurer que le serveur distribue les cartes mais ne montre à chaque joueur que ses propres cartes.

Étape 3 : Le Prototype Visuel (Phaser.js)
Maintenant, on ajoute l'image.

Affichage statique : Afficher le tapis, la pioche, et les cartes dans la main du joueur.

Le Drag & Drop : Permettre au joueur de déplacer physiquement ses cartes pour les organiser ou les jeter.

Lien avec le serveur : Connecter les clics de souris aux messages Socket.io (ex: cliquer sur la pioche envoie DRAW_CARD au serveur).

Étape 4 : L'Interface Utilisateur (UI) et Feedback
Un jeu, c'est aussi des menus et des sensations.

Menus : Écran d'accueil, création de pseudo, choix de la table.

Animations : Voir la carte glisser de la pioche vers la main (très important pour le plaisir de jeu).

Indicateurs : Afficher clairement "C'est votre tour" ou "Points actuels : 42/51".

Étape 5 : Polissage et Règles Spéciales
On affine le jeu pour qu'il soit vraiment "Tunisien".

Gestion du Joker : Comment le placer et quelle valeur il prend.

Le "Rami" : Gérer le cas où un joueur pose tout d'un coup.

Fin de partie : Calcul des scores finaux et gestion des perdants.

Étape 6 : Préparation Steam (Electron.js)
Une fois que le jeu fonctionne parfaitement dans ton navigateur.

Encapsulation : Mettre le jeu dans Electron.

Optimisation Desktop : Ajouter le mode plein écran, quitter le jeu avec Échap, etc.

Steamworks : Intégrer les succès (Achievements) et le système d'amis Steam.

import Phaser from 'phaser';
import { LoginScene } from './LoginScene.js'; // La nouvelle scène de connexion
import { MenuScene } from './MenuScene.js';   // La scène avec les 3 cartes
import { GameScene } from './scene.js';       // Votre scène de jeu rami actuelle

const config = {
    type: Phaser.AUTO,
    parent: 'game-container',
    width: 1200,
    height: 800,
    backgroundColor: '#1a1a1a', // Un fond plus sombre pour le menu
    
    // 1. AJOUT DU DOM : Indispensable pour les inputs HTML du formulaire
    dom: {
        createContainer: true
    },

    // 2. ORDRE DES SCÈNES : La première de la liste est celle qui se lance au démarrage
    scene: [LoginScene, MenuScene, GameScene], 
    physics: {
        default: 'arcade',
        arcade: { debug: false }
    }
};

new Phaser.Game(config);
import Phaser from 'phaser';
import { GameScene } from './scene.js';

const config = {
    type: Phaser.AUTO,
    parent: 'game-container',
    width: 1200,
    height: 800,
    backgroundColor: '#2d572c', // Vert tapis de cartes
    scene: [GameScene],
    physics: {
        default: 'arcade',
        arcade: { debug: false }
    }
};

new Phaser.Game(config);
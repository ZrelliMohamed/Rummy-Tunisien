const express = require('express');
const router = express.Router();
const User = require('../models/User');
const mongoose = require('mongoose');

// --- 1. ENVOYER UNE DEMANDE D'AMI ---
router.post('/request', async (req, res) => {
    const { fromId, toId } = req.body;
    
    try {
        if (!mongoose.Types.ObjectId.isValid(toId)) return res.status(400).json({ msg: "ID invalide" });

        const targetUser = await User.findById(toId);
        const fromUser = await User.findById(fromId).select('username');

        if (!targetUser) return res.status(404).json({ msg: "Cible non trouvée" });

        // Vérifier si une demande existe déjà
        const alreadyRequested = targetUser.friendRequests.some(req => req.from.toString() === fromId);
        if (alreadyRequested) return res.status(400).json({ msg: "Demande déjà en cours" });

        // On ajoute la demande
        targetUser.friendRequests.push({ from: fromId });
        await targetUser.save();

        // Envoi Socket Temps Réel
        const io = req.app.get('socketio');
        if (io) {
            console.log(`📡 Socket: Notification de demande d'ami envoyée à ${toId}`);
            io.to(toId.toString()).emit('new_friend_request', {
                fromId: fromId,
                fromName: fromUser.username
            });
        }
        res.json({ msg: "Demande envoyée !" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: "Erreur serveur" });
    }
});

// --- 2. ACCEPTER UNE DEMANDE ---
router.post('/accept', async (req, res) => {
    const { userId, friendId } = req.body;
    try {
        // Ajouter chacun dans la liste d'amis + Retirer la requête (Atomic update)
        const userUpdate = await User.findByIdAndUpdate(userId, { 
            $addToSet: { friends: friendId },
            $pull: { friendRequests: { from: friendId } } 
        }, { new: true });

        const friendUpdate = await User.findByIdAndUpdate(friendId, { 
            $addToSet: { friends: userId } 
        }, { new: true });

        // Signal Socket : Prévenir les DEUX joueurs
        const io = req.app.get('socketio');
        if (io) {
            io.to(userId.toString()).emit('friend_request_accepted');
            io.to(friendId.toString()).emit('friend_request_accepted');
        }

        res.json({ msg: "Ami ajouté !" });
    } catch (err) {
        res.status(500).json({ msg: "Erreur lors de l'acceptation" });
    }
});

// --- 3. DÉCLINER UNE DEMANDE ---
router.post('/decline', async (req, res) => {
    const { userId, friendId } = req.body;
    try {
        await User.findByIdAndUpdate(userId, { 
            $pull: { friendRequests: { from: friendId } } 
        });
        res.json({ msg: "Demande refusée" });
    } catch (err) {
        res.status(500).json({ msg: "Erreur lors du refus" });
    }
});

// --- 4. RÉCUPÉRER LA LISTE D'AMIS ---
router.get('/friends/:userId', async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.userId)) return res.status(400).json({ msg: "ID invalide" });

        const user = await User.findById(req.params.userId).populate('friends', 'username isOnline');
        if (!user) return res.status(404).json({ msg: "Utilisateur non trouvé" });
        
        res.json({ friends: user.friends || [] });
    } catch (e) {
        res.status(500).json({ msg: "Erreur liste" });
    }
});

// --- 5. RECHERCHER DES UTILISATEURS ---
router.get('/search/:query', async (req, res) => {
    try {
        const query = req.params.query;
        if (!query || query.length < 2) return res.json([]);

        const users = await User.find({ 
            username: { $regex: query, $options: 'i' } 
        }).limit(8).select('username isOnline');
        
        res.json(users);
    } catch (e) {
        res.status(500).send({ msg: "Erreur recherche" });
    }
});

module.exports = router;
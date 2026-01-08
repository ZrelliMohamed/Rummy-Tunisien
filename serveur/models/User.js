const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String },
    googleId: { type: String },
    avatar: { type: String, default: 'default_avatar.png' },

    // --- COSMÉTIQUES & LOBBY ---
    selectedCardSkin: { type: String, default: 'Back Blue 1.png' }, 
    level: { type: Number, default: 1 },
    tokens: { type: Number, default: 1000 },

    // --- STATISTIQUES ---
    stats: {
        gamesPlayed: { type: Number, default: 0 },
        wins: { type: Number, default: 0 },
        rank: { type: String, default: 'Débutant' }
    },

    // --- SYSTÈME SOCIAL ---
    friends: [{ 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User' 
    }],
    friendRequests: [{
        from: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        status: { type: String, enum: ['pending', 'ignored'], default: 'pending' },
        at: { type: Date, default: Date.now }
    }],

    // --- ÉTAT TEMPS RÉEL ---
    isOnline: { type: Boolean, default: false },
    socketId: { type: String, default: null }, // Très important pour les invitations directes
    currentLobbyId: { type: String, default: null }, 
    lastSeen: { type: Date, default: Date.now },      
      
    // --- VÉRIFICATION EMAIL ---

    isVerified: { type: Boolean, default: false },
    verificationToken: { type: String, default: null }
});

module.exports = mongoose.model('User', UserSchema);
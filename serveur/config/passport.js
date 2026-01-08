const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User'); // Import du modèle présent dans ton dossier models

module.exports = function(passport) {
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID, // Ton ID client
        clientSecret: process.env.GOOGLE_CLIENT_SECRET, // Ton Code secret
        callbackURL: "/api/auth/google/callback"
    },
    async (accessToken, refreshToken, profile, done) => {
        try {
            // Recherche dans MongoDB via le modèle User.js
            let user = await User.findOne({ googleId: profile.id });

            if (user) {
                return done(null, user);
            } else {
                // Création d'un nouvel utilisateur si c'est sa première connexion
                user = new User({
                    googleId: profile.id,
                    username: profile.displayName,
                    email: profile.emails[0].value,
                    avatar: profile.photos[0].value // Récupère la photo pour le menu
                });
                await user.save();
                return done(null, user);
            }
        } catch (err) {
            return done(err, null);
        }
    }));
};
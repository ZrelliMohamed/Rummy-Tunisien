const express = require('express');
const router = express.Router();
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

// --- CONFIGURATION EMAIL ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// --- DTO (Data Transfer Object) ---
// Ajout de l'ID, de isOnline et de la liste d'amis pour le Lobby
const formatUserResponse = (user) => {
    return {
        id: user._id, 
        username: user.username,
        avatar: user.avatar || 'default_avatar.png',
        level: user.level || 1,
        selectedCardSkin: user.selectedCardSkin || 'Back Blue 1.png',
        stats: {
            gamesPlayed: user.stats?.gamesPlayed || 0,
            wins: user.stats?.wins || 0,
            rank: user.stats?.rank || 'Débutant'
        },
        tokens: user.tokens || 0,
        isOnline: user.isOnline || false,
        friends: user.friends || []
    };
};

// --- FONCTION UTILITAIRE JWT ---
const generateToken = (user) => {
    const payload = {
        user: { id: user.id, username: user.username }
    };
    return jwt.sign(
        payload,
        process.env.JWT_SECRET || 'MonSecretMegaSecure',
        { expiresIn: '30d' }
    );
};

// ------------------------------------------
// 1. INSCRIPTION
// ------------------------------------------
router.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        let user = await User.findOne({ email });
        if (user) return res.status(400).json({ msg: "Cet email est déjà utilisé." });

        const verificationToken = crypto.randomBytes(32).toString('hex');
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        user = new User({
            username,
            email,
            password: hashedPassword,
            verificationToken,
            isVerified: false
        });

        await user.save();

        const url = `${process.env.SERVER_URL || 'http://localhost:3000'}/api/auth/verify/${verificationToken}`;

        await transporter.sendMail({
            from: `"Rummy Tunisien" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: "Activez votre compte Rummy",
            html: `
                <div style="font-family: Arial, sans-serif; text-align: center; border: 1px solid #ddd; padding: 20px;">
                    <h1>Bienvenue sur Rummy Tunisien !</h1>
                    <p>Cliquez sur le bouton pour confirmer votre email :</p>
                    <a href="${url}" style="background-color: #28a745; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; display: inline-block;">Confirmer mon compte</a>
                </div>
            `
        });

        res.json({ msg: "Inscription réussie ! Vérifiez votre boîte mail." });

    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: "Erreur serveur lors de l'inscription." });
    }
});

// ------------------------------------------
// 2. VÉRIFICATION EMAIL
// ------------------------------------------
// ------------------------------------------
// 2. VÉRIFICATION EMAIL
// ------------------------------------------
router.get('/verify/:token', async (req, res) => {
    try {
        // On cherche l'utilisateur qui possède ce token unique
        const user = await User.findOne({ verificationToken: req.params.token });
        
        const redirectTarget = process.env.CLIENT_URL || 'http://localhost:5173';

        // Si le token n'existe plus (déjà vérifié ou mauvais token)
        if (!user) {
            console.log("⚠️ Tentative de vérification avec un token invalide ou déjà utilisé.");
            // On le renvoie vers le login, peut-être est-il déjà vérifié ?
            return res.redirect(`${redirectTarget}?error=link_invalid_or_expired`);
        }

        // MISE À JOUR : On valide le compte
        user.isVerified = true;
        user.verificationToken = undefined; // On supprime le token pour qu'il ne serve plus
        await user.save();

        console.log(`✅ Compte activé avec succès : ${user.username}`);

        // Redirection vers ton frontend avec un paramètre de succès
        res.redirect(`${redirectTarget}?verified=success`);
        
    } catch (err) {
        console.error("❌ Erreur lors de la vérification :", err);
        res.status(500).send("Erreur interne du serveur lors de la validation.");
    }
});

// ------------------------------------------
// 3. CONNEXION EMAIL
// ------------------------------------------
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        let user = await User.findOne({ email });
        if (!user) return res.status(400).json({ msg: 'Identifiants invalides' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ msg: 'Identifiants invalides' });

        if (!user.isVerified) {
            return res.status(401).json({ msg: "Veuillez vérifier votre email." });
        }

        // Mise à jour du statut en ligne
        user.isOnline = true;
        user.lastSeen = Date.now();
        await user.save();

        res.json({
            token: generateToken(user),
            user: formatUserResponse(user)
        });
    } catch (err) {
        res.status(500).json({ msg: 'Erreur Serveur' });
    }
});

// ------------------------------------------
// 4. GOOGLE AUTH (Callback mis à jour pour isOnline)
// ------------------------------------------
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback', (req, res, next) => {
    passport.authenticate('google', { session: false }, async (err, user) => {
        if (err || !user) {
            const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
            return res.redirect(`${clientUrl}?error=auth_cancelled`);
        }

        // Mise à jour statut en ligne pour Google
        user.isOnline = true;
        user.lastSeen = Date.now();
        await user.save();

        const token = generateToken(user);
        const u = formatUserResponse(user);

        const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
        
        const params = new URLSearchParams({
            token: token,
            id: u.id,
            username: u.username,
            avatar: u.avatar,
            level: u.level,
            skin: u.selectedCardSkin
        });

        res.redirect(`${clientUrl}?${params.toString()}`);
    })(req, res, next);
});

// ------------------------------------------
// 5. AUTO-LOGIN (ME)
// ------------------------------------------
router.get('/me', async (req, res) => {
    const authHeader = req.header('Authorization');
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ msg: 'Accès refusé' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'MonSecretMegaSecure');
        const user = await User.findById(decoded.user.id);

        if (!user) return res.status(404).json({ msg: 'Utilisateur non trouvé' });

        // On rafraîchit le statut en ligne au passage
        if (!user.isOnline) {
            user.isOnline = true;
            await user.save();
        }

        res.json({ user: formatUserResponse(user) });
    } catch (err) {
        res.status(401).json({ msg: 'Token invalide' });
    }
});

// ------------------------------------------
// 6. DÉCONNEXION (Nouveau)
// ------------------------------------------
router.post('/logout', async (req, res) => {
    try {
        const { userId } = req.body;
        if (userId) {
            await User.findByIdAndUpdate(userId, { 
                isOnline: false, 
                lastSeen: Date.now(),
                socketId: null 
            });
        }
        res.json({ msg: "Déconnexion réussie" });
    } catch (err) {
        res.status(500).json({ msg: "Erreur lors de la déconnexion" });
    }
});

module.exports = router;
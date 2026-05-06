const express = require('express');
const crypto = require('crypto');
const { CONFIG } = require('../utils/config');

const router = express.Router();

const SERVER_SALT = crypto.randomBytes(16).toString('hex');

const hashPassword = (password, salt) => {
    return crypto.scryptSync(password, salt, 64);
};

const CORRECT_HASH_BUFFER = hashPassword(CONFIG.API_PASSWORD, SERVER_SALT);

router.post('/login', (req, res) => {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: "Mot de passe manquant." });

    try {
        const userHashBuffer = hashPassword(password, SERVER_SALT);
        const passwordMatch = crypto.timingSafeEqual(CORRECT_HASH_BUFFER, userHashBuffer);
        if (passwordMatch) {
            req.session.isLoggedIn = true;
            console.log(`[Auth] Connexion réussie pour ${req.ip}`);
            res.json({ success: true });
        } else {
            setTimeout(() => {
                console.warn(`[Auth] Tentative échouée pour ${req.ip}`);
                res.status(401).json({ error: "Mot de passe API invalide." });
            }, 500);
        }
    } catch (e) {
        res.status(500).json({ error: "Erreur interne du serveur." });
    }
});

router.get('/check-session', (req, res) => {
    res.json({ isLoggedIn: req.session.isLoggedIn || false });
});

router.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) return res.status(500).json({ error: "Échec de la déconnexion." });
        res.clearCookie('connect.sid');
        res.json({ success: true });
    });
});

module.exports = router;

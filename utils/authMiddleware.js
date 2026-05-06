const authMiddleware = (req, res, next) => {
    if (req.session.isLoggedIn) {
        next();
    } else {
        res.status(401).json({ error: "Session expirée ou invalide. Veuillez vous reconnecter." });
    }
};

module.exports = authMiddleware;

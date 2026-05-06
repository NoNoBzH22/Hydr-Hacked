const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 100,
    message: { error: 'Trop de requêtes, veuillez réessayer plus tard.' },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next, options) => {
        console.warn(`[Securite] Rate Limit dépassé pour IP: ${req.ip}`);
        res.status(options.statusCode).send(options.message);
    }
});

module.exports = apiLimiter;
